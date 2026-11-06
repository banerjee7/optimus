'use strict';
/** Public API keys, signed webhooks, collaboration comments, connectors and trust center. */

const crypto = require('crypto');
const { db, save } = require('./store');
const { cleanText, cleanLabel } = require('./security');
const { enqueue, registerJobHandler } = require('./observability');

const WEBHOOK_EVENTS = [
  'project.created',
  'artifact.generated',
  'deployment.created',
  'deployment.approved',
  'billing.plan.activated',
  'comment.created',
  'member.invited',
  'backup.created',
];

const CONNECTORS = [
  { id: 'slack', name: 'Slack', category: 'Communication', description: 'Post delivery approvals and incident notes to a channel.', scopes: ['chat:write'], auth: 'OAuth 2.0' },
  { id: 'jira', name: 'Jira', category: 'Delivery', description: 'Create implementation tickets from approved architecture artifacts.', scopes: ['issues:write'], auth: 'OAuth 2.0' },
  { id: 'github', name: 'GitHub', category: 'Engineering', description: 'Open pull requests for generated scaffolds and track review evidence.', scopes: ['repo'], auth: 'GitHub App' },
  { id: 'hubspot', name: 'HubSpot', category: 'Revenue', description: 'Sync qualified leads and Revenue Swarm commitments into CRM.', scopes: ['crm.objects.contacts.write'], auth: 'OAuth 2.0' },
  { id: 'salesforce', name: 'Salesforce', category: 'Revenue', description: 'Push opportunity stages and approval evidence to Salesforce.', scopes: ['api'], auth: 'OAuth 2.0' },
  { id: 'snowflake', name: 'Snowflake', category: 'Data', description: 'Read governed datasets with a scoped service role.', scopes: ['SELECT'], auth: 'Key pair' },
  { id: 'postgres', name: 'PostgreSQL', category: 'Data', description: 'Connect a read replica for discovery and data-quality checks.', scopes: ['read-only'], auth: 'TLS + secret' },
  { id: 'gdrive', name: 'Google Drive', category: 'Knowledge', description: 'Attach source documents to discovery and proposal workstreams.', scopes: ['drive.readonly'], auth: 'OAuth 2.0' },
];

function webhookUrlAllowed(value) {
  let url;
  try { url = new URL(String(value)); } catch (_) { return false; }
  const allowPrivate = process.env.KILN_ALLOW_PRIVATE_WEBHOOKS === '1';
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) return false;
  if (!url.hostname || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const privateHost = host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host === '0.0.0.0'
    || host === '::1'
    || host === '[::1]'
    || host === '169.254.169.254'
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host);
  const private172 = /^172\.(\d+)\./.exec(host);
  const isPrivate = privateHost || (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  return !isPrivate || allowPrivate;
}

function webhookView(webhook) {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    active: webhook.active,
    description: webhook.description,
    secretPrefix: webhook.secretPrefix,
    createdAt: webhook.createdAt,
    lastDeliveryAt: webhook.lastDeliveryAt || null,
    lastStatus: webhook.lastStatus || null,
    failureCount: Number(webhook.failureCount) || 0,
  };
}

function createWebhook(user, input = {}) {
  const url = String(input.url || '').trim();
  if (!webhookUrlAllowed(url)) throw Object.assign(new Error('Webhook URLs must be HTTPS and cannot target private or local addresses.'), { status: 400 });
  const requested = Array.isArray(input.events) ? input.events : ['*'];
  const events = requested.includes('*') ? ['*'] : requested.filter((event) => WEBHOOK_EVENTS.includes(event));
  if (!events.length) throw Object.assign(new Error('Choose at least one webhook event.'), { status: 400 });
  const rawSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  const webhook = {
    id: `whk_${crypto.randomUUID()}`,
    userId: user.id,
    url,
    description: cleanLabel(input.description, 160),
    events: events.length ? events : ['*'],
    secretHash: crypto.createHash('sha256').update(rawSecret).digest('hex'),
    secretPrefix: rawSecret.slice(0, 12),
    secret: rawSecret,
    active: true,
    createdAt: new Date().toISOString(),
    lastDeliveryAt: null,
    lastStatus: null,
    failureCount: 0,
  };
  if (!db.webhooks) db.webhooks = [];
  db.webhooks.push(webhook);
  save();
  return { webhook, secret: rawSecret };
}

function listWebhooks(user) {
  return (db.webhooks || []).filter((webhook) => webhook.userId === user.id).map(webhookView);
}

function deleteWebhook(user, id) {
  const index = (db.webhooks || []).findIndex((webhook) => webhook.id === id && webhook.userId === user.id);
  if (index < 0) return null;
  const [webhook] = db.webhooks.splice(index, 1);
  save();
  return webhook;
}

function emitEvent(ownerId, event, payload = {}) {
  const hooks = (db.webhooks || []).filter((webhook) => webhook.userId === ownerId && webhook.active && (webhook.events.includes('*') || webhook.events.includes(event)));
  const jobs = hooks.map((webhook) => enqueue('webhook.deliver', {
    webhookId: webhook.id,
    ownerId,
    event,
    payload,
  }, {
    idempotencyKey: `webhook:${webhook.id}:${event}:${payload.id || crypto.randomUUID()}`,
    maxAttempts: 5,
  }));
  return { queued: jobs.length, jobs: jobs.map((job) => job.id) };
}

async function deliverWebhook(payload) {
  const webhook = (db.webhooks || []).find((candidate) => candidate.id === payload.webhookId && candidate.active);
  if (!webhook) throw new Error('Webhook is no longer active.');
  const body = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    type: payload.event,
    createdAt: new Date().toISOString(),
    data: payload.payload || {},
  });
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Kiln-Webhooks/1.0',
      'x-kiln-event': String(payload.event),
      'x-kiln-signature-256': `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const delivery = {
    id: `whd_${crypto.randomUUID()}`,
    webhookId: webhook.id,
    event: payload.event,
    status: response.status,
    ok: response.ok,
    at: new Date().toISOString(),
  };
  if (!db.webhookDeliveries) db.webhookDeliveries = [];
  db.webhookDeliveries.unshift(delivery);
  if (db.webhookDeliveries.length > 1000) db.webhookDeliveries.length = 1000;
  webhook.lastDeliveryAt = delivery.at;
  webhook.lastStatus = response.status;
  webhook.failureCount = response.ok ? 0 : (webhook.failureCount || 0) + 1;
  if (!response.ok) {
    save();
    throw new Error(`Webhook returned HTTP ${response.status}.`);
  }
  save();
  return { status: response.status };
}

registerJobHandler('webhook.deliver', async (payload) => deliverWebhook(payload));

/* ------------------------------------------------------------------ comments */
function listComments(projectId) {
  return (db.comments || []).filter((comment) => comment.projectId === projectId).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function addComment(project, user, body) {
  const text = cleanText(body, 2000);
  if (!text) throw Object.assign(new Error('Comment cannot be empty.'), { status: 400 });
  const comment = {
    id: `cmt_${crypto.randomUUID()}`,
    projectId: project.id,
    userId: user.id,
    name: user.name,
    body: text,
    at: new Date().toISOString(),
  };
  if (!db.comments) db.comments = [];
  db.comments.push(comment);
  if (db.comments.length > 5000) db.comments = db.comments.slice(-4000);
  save();
  emitEvent(project.userId, 'comment.created', { id: comment.id, projectId: project.id, body: text, author: user.name });
  return comment;
}

function deleteComment(project, user, id) {
  const index = (db.comments || []).findIndex((comment) => comment.id === id && comment.projectId === project.id);
  if (index < 0) return null;
  const comment = db.comments[index];
  if (comment.userId !== user.id && project.userId !== user.id) return null;
  db.comments.splice(index, 1);
  save();
  return comment;
}

/* ------------------------------------------------------------------ connectors */
function connectorView(user) {
  const ownerId = user.id;
  return CONNECTORS.map((connector) => {
    const state = (db.connectors || []).find((entry) => entry.userId === ownerId && entry.connectorId === connector.id);
    return {
      ...connector,
      status: state ? state.status : 'available',
      connectedAt: state ? state.connectedAt : null,
      simulated: state ? state.simulated : true,
    };
  });
}

function connectConnector(user, id) {
  const connector = CONNECTORS.find((candidate) => candidate.id === id);
  if (!connector) return null;
  if (!db.connectors) db.connectors = [];
  const existing = db.connectors.find((entry) => entry.userId === user.id && entry.connectorId === id);
  if (existing) {
    existing.status = 'connected';
    existing.connectedAt = new Date().toISOString();
    save();
    return connectorView(user).find((entry) => entry.id === id);
  }
  db.connectors.push({
    id: `con_${crypto.randomUUID()}`,
    userId: user.id,
    connectorId: id,
    status: 'connected',
    connectedAt: new Date().toISOString(),
    simulated: true,
  });
  save();
  return connectorView(user).find((entry) => entry.id === id);
}

function disconnectConnector(user, id) {
  const index = (db.connectors || []).findIndex((entry) => entry.userId === user.id && entry.connectorId === id);
  if (index < 0) return null;
  db.connectors.splice(index, 1);
  save();
  return CONNECTORS.find((connector) => connector.id === id);
}

/* ------------------------------------------------------------------ trust / status */
function trustView() {
  return {
    product: 'Kiln',
    securityContact: 'security@kiln.studio',
    disclosure: '/.well-known/security.txt',
    dpa: '/legal/dpa.html',
    status: '/api/status',
    lastReviewed: '2026-10-24',
    controls: [
      { id: 'access', name: 'Least-privilege access', status: 'implemented', detail: 'Server-owned sessions, workspace RBAC, scoped API keys and SCIM provisioning.' },
      { id: 'mfa', name: 'Phishing-resistant sign-in options', status: 'implemented', detail: 'TOTP MFA with recovery codes and OIDC enterprise SSO.' },
      { id: 'isolation', name: 'Tenant isolation', status: 'implemented', detail: 'Every project, artifact, export and sandbox is authorized against workspace membership.' },
      { id: 'evidence', name: 'Audit evidence', status: 'implemented', detail: 'Append-only workspace, billing and Revenue Swarm evidence with named human approvals.' },
      { id: 'resilience', name: 'Backups and recovery', status: 'implemented', detail: 'Private Blob snapshots with checksum verification, retention and restore runbook.' },
      { id: 'soc2', name: 'SOC 2 Type II', status: 'in-progress', detail: 'Readiness controls are documented; an independent report is not yet available.' },
      { id: 'iso', name: 'ISO 27001', status: 'not-certified', detail: 'No certificate is claimed.' },
    ],
    subprocessors: [
      { name: 'Vercel', purpose: 'Application hosting, functions and private Blob storage', location: 'United States', dpa: true },
      { name: 'Stripe', purpose: 'Payments and subscription billing (when configured)', location: 'United States', dpa: true },
      { name: 'Resend', purpose: 'Transactional email (when configured)', location: 'United States', dpa: true },
    ],
    dataResidency: 'US by default; enterprise VPC and residency options are quoted per engagement.',
    retention: 'Workspace JSON is retained until deletion; backups rotate over the latest 20 snapshots.',
    uptimeTarget: '99.9% monthly target for paid workspaces.',
    vulnerabilityDisclosure: 'Report security issues to security@kiln.studio. We acknowledge within 2 business days.',
  };
}

function statusView() {
  return {
    status: 'operational',
    checkedAt: new Date().toISOString(),
    components: [
      { name: 'Console', status: 'operational' },
      { name: 'API', status: 'operational' },
      { name: 'Durable persistence', status: require('./store').storageMode() === 'local-json' ? 'degraded' : 'operational' },
      { name: 'Email delivery', status: process.env.RESEND_API_KEY || process.env.KILN_EMAIL_WEBHOOK ? 'operational' : 'simulated' },
      { name: 'Billing', status: process.env.STRIPE_SECRET_KEY ? 'operational' : 'test-mode' },
    ],
  };
}

module.exports = {
  WEBHOOK_EVENTS,
  CONNECTORS,
  webhookUrlAllowed,
  webhookView,
  createWebhook,
  listWebhooks,
  deleteWebhook,
  emitEvent,
  deliverWebhook,
  listComments,
  addComment,
  deleteComment,
  connectorView,
  connectConnector,
  disconnectConnector,
  trustView,
  statusView,
};
