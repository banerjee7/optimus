'use strict';
/**
 * Kiln server — zero-dependency HTTP API + static site.
 * Run: node src/server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { db, save, flush, ready, sync } = require('./store');
const { hashPassword, verifyPassword, createSession, sessionCookie, clearCookie, currentUser, publicUser, issueToken, consumeToken } = require('./auth');
const billing = require('./billing');
const identity = require('./identity');
const platform = require('./platform');
const forum = require('./forum');
const observability = require('./observability');
const { cleanText, cleanLabel, cleanEmail, clientIp, rateLimit, clearRate, hashIp, securityHeaders, assertSameOrigin } = require('./security');
const { sendEmail, testMode: emailTestMode } = require('./email');
const { FUNCTIONS, MODELS, SERVICES, PRICING } = require('./engine/catalog');
const { TIERS, projectContext, buildCodename, Rng, money, num } = require('./engine/core');
const { generateArtifact } = require('./engine/generators');
const { respond, artifactReply } = require('./engine/chat');
const { buildSandbox, prototypeHTML, deployment } = require('./engine/sandbox');
const { exportArtifact, deliveryPack, markdown } = require('./engine/exports');

/* Keep stored artifacts aligned with the current workstream capability inventory. */
for (const artifact of db.artifacts || []) {
  const fn = FUNCTIONS.find((f) => f.key === artifact.functionKey);
  if (fn) {
    artifact.capabilities = fn.capabilities;
    artifact.guardrails = fn.guardrails;
  }
}

const PORT = Number(process.env.PORT || 4517);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

/* ------------------------------------------------------------------ helpers */
function send(res, code, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  const payload = isBuffer ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': isBuffer ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...headers,
  });
  res.end(payload);
}

function fail(res, code, message, extra = {}) { send(res, code, { error: message, ...extra }); }
function ok(res, body, code = 200) { send(res, code, body); }

function requireVerified(req, res, action) {
  if (req.user.emailVerified) return true;
  fail(res, 403, `Verify your email before ${action}.`, {
    code: 'EMAIL_VERIFICATION_REQUIRED',
    verifyUrl: '/app',
  });
  return false;
}

function isAdminUser(user) {
  if (!user) return false;
  const adminEmail = (process.env.KILN_ADMIN_EMAIL || 'bidyut.banerjee@gmail.com').toLowerCase();
  return String(user.email || '').toLowerCase() === adminEmail;
}

function forumRoleFor(user) {
  if (!user) return 'registered';
  return forum.createMarkerRole(user);
}

function requirePaidWorkspace(req, res, feature) {
  if (billing.effectivePlan(req.user) !== 'free') return true;
  fail(res, 402, `${feature} requires a paid workspace.`, {
    code: 'PAID_PLAN_REQUIRED',
    upgradeUrl: '/app?view=billing',
  });
  return false;
}

function requireAdmin(req, res) {
  if (isAdminUser(req.user)) return true;
  fail(res, 403, 'Owner access required.');
  return false;
}

function exposeTestLink() {
  return process.env.KILN_EXPOSE_TEST_LINKS === '1' && emailTestMode();
}

function sessionPayload(req, user) {
  return {
    user: publicUser(user),
    projects: db.projects.filter((project) => identity.canAccessProject(user, project)).map(projectSummary),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) reject(Object.assign(new Error('Payload too large'), { status: 413 }));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) reject(Object.assign(new Error('Payload too large'), { status: 413 }));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function uid(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function siteUrl() {
  return (process.env.KILN_SITE_URL || 'https://kiln-kohl.vercel.app').replace(/\/+$/, '');
}

function requestBase(req) {
  if (process.env.KILN_SITE_URL) return siteUrl();
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : siteUrl();
}

function recordEvent(type, detail, meta = {}) {
  const event = { id: uid('evt'), type, detail, at: now(), ...meta };
  db.events.push(event);
  if (db.events.length > 3000) db.events = db.events.slice(-3000);
  return event;
}

function recordAnalytics(req, event, props = {}) {
  const name = cleanLabel(event, 80);
  if (!name) return null;
  const entry = {
    id: uid('ana'),
    event: name,
    props: props && typeof props === 'object' ? props : {},
    path: cleanLabel(props.path || req.headers.referer || '', 300),
    referrer: cleanLabel(req.headers.referer || '', 500),
    attribution: props.attribution && typeof props.attribution === 'object' ? props.attribution : null,
    ipHash: hashIp(req),
    at: now(),
  };
  if (!Array.isArray(db.analytics)) db.analytics = [];
  db.analytics.push(entry);
  if (db.analytics.length > 5000) db.analytics = db.analytics.slice(-5000);
  save();
  return entry;
}

function createLead(req, body, type) {
  const lead = {
    id: uid('lead'),
    type,
    name: cleanLabel(body.name, 120),
    email: cleanEmail(body.email),
    company: cleanLabel(body.company, 160),
    phone: cleanLabel(body.phone, 40),
    message: cleanText(body.message, 3000),
    role: cleanLabel(body.role, 120),
    focus: Array.isArray(body.focus) ? body.focus.slice(0, 6).map((item) => cleanLabel(item, 80)) : [],
    preferredSlot: cleanLabel(body.preferredSlot || body.slot, 80),
    source: cleanLabel(body.source || 'website', 80),
    attribution: {
      utmSource: cleanLabel(body.utmSource || body.utm_source, 80),
      utmMedium: cleanLabel(body.utmMedium || body.utm_medium, 80),
      utmCampaign: cleanLabel(body.utmCampaign || body.utm_campaign, 120),
      ref: cleanLabel(body.ref, 40),
      referrer: cleanLabel(body.referrer || req.headers.referer, 500),
      landingPath: cleanLabel(body.landingPath, 300),
    },
    status: 'new',
    ipHash: hashIp(req),
    createdAt: now(),
  };
  if (type === 'fde') {
    lead.routing = {
      pod: lead.focus.includes('Security') ? 'Secure delivery pod' : lead.focus.includes('Data') ? 'Data platform pod' : 'Applied AI pod',
      owner: 'FDE intake',
      slaHours: 4,
      queue: 'consultations',
    };
  } else if (type === 'enterprise') {
    lead.routing = { pod: 'Enterprise pod', owner: 'Account FDE', slaHours: 2, queue: 'enterprise' };
  } else {
    lead.routing = { pod: 'Growth pod', owner: 'Founder inbox', slaHours: 24, queue: 'inbound' };
  }
  db.leads.unshift(lead);
  if (db.leads.length > 2000) db.leads.length = 2000;
  db.leadEvents.unshift({ id: uid('lev'), leadId: lead.id, type: 'lead.captured', at: now(), detail: `${lead.type} lead from ${lead.source}` });
  save();
  return lead;
}

async function routeLead(lead) {
  const alertTo = process.env.KILN_LEAD_EMAIL || 'bidyut.banerjee@gmail.com';
  const text = [
    `New ${lead.type} lead: ${lead.name} <${lead.email}>`,
    lead.company ? `Company: ${lead.company}` : '',
    lead.role ? `Role: ${lead.role}` : '',
    lead.message ? `Message: ${lead.message}` : '',
    lead.preferredSlot ? `Preferred slot: ${lead.preferredSlot}` : '',
    `Routing: ${lead.routing.pod} · ${lead.routing.owner} · ${lead.routing.slaHours}h SLA`,
    `Source: ${lead.source} · ${lead.attribution.utmSource || 'direct'}`,
    `Lead ID: ${lead.id}`,
  ].filter(Boolean).join('\n');
  await sendEmail({ to: alertTo, subject: `[Kiln] ${lead.type} lead — ${lead.name}`, text, tag: 'lead.alert', userId: null, meta: { leadId: lead.id } });

  const webhook = process.env.KILN_CRM_WEBHOOK || process.env.CRM_WEBHOOK_URL;
  let crm = { mode: 'outbox', status: 'queued' };
  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'kiln', lead }),
        signal: AbortSignal.timeout(5000),
      });
      crm = { mode: 'webhook', status: response.ok ? 'synced' : 'failed', providerStatus: response.status };
    } catch (error) {
      crm = { mode: 'webhook', status: 'failed', error: String(error.message || error).slice(0, 200) };
    }
  }
  lead.crm = crm;
  lead.alertedAt = now();
  db.leadEvents.unshift({ id: uid('lev'), leadId: lead.id, type: 'lead.routed', at: now(), detail: `${crm.status} via ${crm.mode}; alerted ${alertTo}` });
  save();
  return crm;
}

function queueLifecycle(user, tag, subject, text) {
  sendEmail({ to: user.email, userId: user.id, tag, subject, text })
    .catch((error) => console.error('Lifecycle email failed:', error.message));
}


function projectFor(user, id) {
  const project = db.projects.find((candidate) => candidate.id === id);
  return project && identity.canAccessProject(user, project) ? project : null;
}

function artifactFor(user, id) {
  const artifact = db.artifacts.find((candidate) => candidate.id === id);
  if (!artifact) return null;
  const project = projectFor(user, artifact.projectId);
  return project ? artifact : null;
}

function nextRevision(projectId, functionKey) {
  return db.artifacts.filter((a) => a.projectId === projectId && a.functionKey === functionKey).length + 1;
}

function createArtifact(project, functionKey, instruction = '', revisionOverride) {
  const revision = revisionOverride || nextRevision(project.id, functionKey);
  const artifact = generateArtifact(project, functionKey, {
    revision,
    instruction,
    id: uid('art'),
  });
  db.artifacts.push(artifact);
  db.events.push({ id: uid('evt'), type: 'artifact.generated', projectId: project.id, userId: project.userId, at: now(), detail: `${artifact.functionName} r${revision}` });
  platform.emitEvent(project.userId, 'artifact.generated', { id: artifact.id, projectId: project.id, functionKey, functionName: artifact.functionName, revision });
  save();
  return artifact;
}

function addMessage(project, role, text, meta = {}) {
  const message = { id: uid('msg'), projectId: project.id, role, text, at: now(), ...meta };
  db.messages.push(message);
  if (db.messages.filter((m) => m.projectId === project.id).length > 240) {
    const extra = db.messages.filter((m) => m.projectId === project.id).slice(0, 40).map((m) => m.id);
    db.messages = db.messages.filter((m) => !extra.includes(m.id));
  }
  return message;
}

function projectSummary(project) {
  const artifacts = db.artifacts.filter((a) => a.projectId === project.id);
  return {
    id: project.id,
    name: project.name,
    codename: project.codename,
    idea: project.idea,
    tier: project.tier,
    tierLabel: TIERS[project.tier] ? TIERS[project.tier].label : project.tier,
    model: project.model,
    modelName: project.modelName,
    industry: project.industry,
    envs: project.envs || {},
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    counts: {
      artifacts: artifacts.length,
      approved: artifacts.filter((a) => a.status === 'approved').length,
      functions: new Set(artifacts.map((a) => a.functionKey)).size,
      deployments: db.deployments.filter((d) => d.projectId === project.id).length,
    },
  };
}

function workspace(project) {
  const artifacts = db.artifacts.filter((a) => a.projectId === project.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const deployments = db.deployments.filter((d) => d.projectId === project.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const messages = db.messages.filter((m) => m.projectId === project.id).sort((a, b) => new Date(a.at) - new Date(b.at));
  const consultations = db.consultations.filter((c) => c.projectId === project.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const collaterals = db.collaterals.filter((c) => c.projectId === project.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return {
    project: projectSummary(project),
    artifacts,
    messages,
    deployments,
    consultations,
    collaterals,
    comments: platform.listComments(project.id),
    sandbox: sandboxMeta(project),
  };
}

function sandboxMeta(project) {
  const sandbox = buildSandbox(project);
  return {
    codename: sandbox.codename,
    previewUrl: sandbox.previewUrl,
    features: sandbox.features,
    entities: sandbox.entities,
    metrics: sandbox.metrics,
    files: sandbox.files.map((f) => ({ path: f.path, lang: f.lang, bytes: Buffer.byteLength(f.content) })),
  };
}

/* ------------------------------------------------------------------ collateral */
function buildCollateral(project, type) {
  const ctx = projectContext(project);
  const rng = new Rng(`${ctx.seed}:collateral:${type}:${Date.now()}`);
  const model = MODELS.find((m) => m.id === project.model) || MODELS[0];
  const base = {
    id: uid('col'), projectId: project.id, type, status: 'draft', revision: 1, createdAt: now(),
    functionName: 'Collateral',
    formats: ['pdf', 'docx', 'pptx', 'md'],
    model: model.id, modelName: model.name,
    project: {
      name: project.name, codename: ctx.codename, tier: project.tier, tierLabel: ctx.tier.label, idea: project.idea,
      industry: ctx.industry, modelName: model.name, ownerName: project.ownerName, uptime: ctx.tier.uptime,
    },
  };
  const meta = [
    { label: 'Tier', value: ctx.tier.label },
    { label: 'Industry', value: ctx.industry },
    { label: 'Build model', value: `${ctx.team} pod · ${ctx.weeks} weeks` },
    { label: 'Investment', value: money(ctx.budget) },
    { label: 'Model', value: model.name },
    { label: 'Status', value: 'Draft — FDE review required' },
  ];
  if (type === 'one-pager') {
    return {
      ...base,
      title: `${ctx.codename} — one pager`,
      subtitle: `${ctx.industry} · ${ctx.tier.label} · ${ctx.features[0].name}`,
      summary: `A one-page articulation of the problem, the wedge, the build approach and the commercial shape for ${project.name}.`,
      sections: [
        { type: 'kpis', items: meta.slice(0, 4).map((m) => ({ label: m.label, value: m.value })) },
        { type: 'prose', title: 'The problem', text: `${ctx.domain.personas[0][0]}s in ${ctx.domain.label.toLowerCase()} lose time and trust to ${rng.pick(['manual triage', 'fragmented tools', 'rework and reconciliation', 'slow, opaque decisions'])}. ${project.idea}` },
        { type: 'bullets', title: 'What we build', items: ctx.features.slice(0, 5).map((f) => `${f.name} — ${f.desc}`) },
        { type: 'table', title: 'Commercial shape', columns: ['Line', 'Detail'], rows: [['Discovery', '2 weeks'], ['Build', `${ctx.weeks} weeks`], ['Investment', money(ctx.budget)], ['Run', `${money(ctx.tier.infra + 1800)} / mo`], ['Pod', `${ctx.team} people`]] },
        { type: 'callout', title: 'Next step', tone: 'default', text: 'A 45-minute working session to validate the wedge, data access and decision rights. No commitment required.' },
      ],
    };
  }
  if (type === 'battlecard') {
    return {
      ...base,
      title: `${ctx.codename} — competitive battlecard`,
      subtitle: `Positioning against ${ctx.domain.competitors.slice(0, 3).map((c) => c[0]).join(', ')}`,
      summary: `Where we win, where we do not, and the proof needed in front of a buyer.`,
      sections: [
        { type: 'table', title: 'Head to head', columns: ['Competitor', 'They win on', 'We win on', 'Landmine to avoid'], rows: ctx.domain.competitors.map((c) => [c[0], c[3], rng.pick(['speed to evidence', 'human-in-the-loop trust', 'integration honesty', 'total cost of ownership']), c[4]]) },
        { type: 'bullets', title: 'Three proof points', items: [`${ctx.features[0].name} working in ${rng.int(4, 8)} weeks`, `Evidence pack for every recommendation`, `${ctx.tier.compliance} posture from day one`] },
        { type: 'callout', title: 'Do not overclaim', tone: 'warn', text: 'Do not claim parity with incumbent depth. Win on time-to-evidence and governance, then expand.' },
      ],
    };
  }
  if (type === 'case-study') {
    return {
      ...base,
      title: `${ctx.codename} — illustrative case study`,
      subtitle: `${ctx.industry} · ${ctx.tier.label} profile`,
      summary: `An illustrative outcome story based on the ${ctx.tier.label} pattern. Figures are modelled and must be replaced with client evidence before external use.`,
      sections: [
        { type: 'kpis', items: [ { label: 'Cycle time', value: `−${rng.int(22, 54)}%` }, { label: 'Annual value', value: money(ctx.budget * 2.1) }, { label: 'Time to first value', value: `${Math.round(ctx.weeks * 0.5)} weeks` }, { label: 'Adoption', value: `${rng.int(62, 92)}%` } ] },
        { type: 'prose', title: 'Context', text: `A ${ctx.tier.label.toLowerCase()} organisation needed ${ctx.features[0].name.toLowerCase()} without adding headcount or another system of record.` },
        { type: 'prose', title: 'Approach', text: `A ${ctx.team}-person pod ran a two-week discovery, shipped one workflow in the sandbox, then moved to production through staged human approvals.` },
        { type: 'table', title: 'Outcomes', columns: ['Measure', 'Before', 'After'], rows: ctx.domain.metrics.slice(0, 4).map((m) => [m, `${rng.int(40, 90)}`, `${rng.int(10, 38)}`]) },
        { type: 'callout', title: 'Evidence status', tone: 'warn', text: 'Illustrative only. Do not cite externally without verified client data and written permission.' },
      ],
    };
  }
  if (type === 'architecture-brief') {
    return {
      ...base,
      title: `${ctx.codename} — architecture brief`,
      subtitle: `Design intent, boundaries and guardrails`,
      summary: `A two-page architecture brief for technical stakeholders: system shape, data ownership, model boundary and the controls that make autonomy safe.`,
      sections: [
        { type: 'bullets', title: 'Design principles', items: ['One writer per bounded context', 'No raw PII in model context', 'Every external action has a human gate', 'Evidence is append-only', 'Cost per action is observable'] },
        { type: 'table', title: 'Contexts', columns: ['Context', 'Owns', 'Interface'], rows: ctx.domain.entities.slice(0, 5).map((e, i) => [e, e, i === 0 ? 'REST + events' : 'REST']) },
        { type: 'table', title: 'Key decisions', columns: ['Decision', 'Choice', 'Trade-off'], rows: [['System shape', ctx.tier.key === 'small' ? 'Modular monolith' : 'Domain-aligned services', 'Speed vs independent scaling'], ['Model access', 'Private gateway', 'Control vs extra hop'], ['Approvals', 'Per-action', 'Safety vs throughput']] },
        { type: 'callout', title: 'Review gate', tone: 'default', text: 'Requires architect sign-off and security review before build.' },
      ],
    };
  }
  if (type === 'exec-summary') {
    return {
      ...base,
      title: `${ctx.codename} — executive summary`,
      subtitle: `Decision paper for the ${ctx.tier.label} investment`,
      summary: `${project.name} can reach first evidence in ${Math.round(ctx.weeks * 0.5)} weeks for ${money(ctx.budget * 0.4)}. The full ${ctx.weeks}-week programme is ${money(ctx.budget)} with gated tranches.`,
      sections: [
        { type: 'bullets', title: 'The decision', items: [`Approve a ${money(ctx.budget * 0.14)} discovery`, `Reserve ${money(ctx.budget)} for a gated build`, `Name a product owner and a data owner`, 'Accept the guardrail that no external action is automated without human approval'] },
        { type: 'table', title: 'Why now', columns: ['Signal', 'Evidence'], rows: [['Demand', `${ctx.domain.personas.length} personas with recurring pain`], ['Whitespace', `${ctx.features[1].name} is underserved`], ['Feasibility', `${ctx.domain.integrations[0]} integration is viable`], ['Risk', `${ctx.domain.risks[0]}`]] },
        { type: 'callout', title: 'Guardrail', tone: 'warn', text: 'Figures are modelled from the brief and tier profile. They are not a guarantee.' },
      ],
    };
  }
  return {
    ...base,
    title: `${ctx.codename} — stakeholder FAQ`,
    subtitle: 'Answers for security, finance, operations and delivery',
    summary: 'The questions that decide a build, answered plainly and tied to evidence.',
    sections: [
      { type: 'keyvalue', title: 'FAQ', items: [
        { label: 'How long to something real?', value: `${Math.round(ctx.weeks * 0.45)} weeks to a working slice in the sandbox.` },
        { label: 'What does it cost?', value: `${money(ctx.budget)} build, ${money(ctx.tier.infra + 1800)}/mo run.` },
        { label: 'Where does our data go?', value: 'Private model gateway; redaction at the edge; no training on client data.' },
        { label: 'Who is accountable?', value: `${ctx.owner} as account FDE, with named client product and data owners.` },
        { label: 'What if it fails?', value: 'Tranche gates, kill criteria and rollback are agreed before build.' },
        { label: 'Can it run in our cloud?', value: ctx.tier.key === 'enterprise' ? 'Yes — VPC deployment with residency options.' : 'Managed deployment by default; VPC available on SMB+.' },
      ] },
      { type: 'checklist', title: 'Before we start', items: ['Data access owner named', 'Security review scheduled', 'Success metric baselined', 'Product owner has decision authority'] },
    ],
  };
}

/* ------------------------------------------------------------------ seed demo */
function demoBilling() {
  const record = billing.defaultBilling('smb');
  record.status = 'active';
  record.planSource = 'admin';
  record.provider = 'seed';
  record.currentPeriodStart = now();
  record.currentPeriodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  record.tokenQuota = billing.quotaForPlan('smb');
  record.lastRenewedAt = record.currentPeriodStart;
  return record;
}

function seedDemo() {
  const existing = db.users.find((u) => u.email === 'demo@kiln.studio');
  if (existing) {
    if (!existing.billing) {
      existing.billing = demoBilling();
      existing.emailVerified = true;
      existing.referralCode = billing.referralCodeFor(existing);
      save();
    }
    return;
  }
  const user = {
    id: uid('usr'), name: 'Demo Operator', email: 'demo@kiln.studio',
    password: hashPassword('KilnDemo2026!'), createdAt: now(), plan: 'smb',
    billing: demoBilling(), emailVerified: true,
  };
  user.referralCode = billing.referralCodeFor(user);
  db.users.push(user);
  billing.pushInvoice({
    userId: user.id,
    plan: 'smb',
    amount: billing.PLANS.smb.price * 100,
    status: 'paid',
    provider: 'seed',
    description: 'Revenue Swarm plan — seeded demo subscription',
  });
  const project = {
    id: uid('prj'), userId: user.id,
    name: 'Lumen Pharmacy Ops',
    idea: 'An AI copilot for independent pharmacies that forecasts stockouts, drafts supplier reorders for human approval, and explains reimbursement gaps in plain language for the pharmacist.',
    tier: 'smb', model: 'qwen2.5-coder-32b', modelName: 'Qwen2.5 Coder 32B',
    ownerName: user.name, createdAt: now(), updatedAt: now(), revision: 1, envs: {},
  };
  project.codename = buildCodename(project);
  project.industry = 'Health & Life Sciences';
  db.projects.push(project);

  ['ideation', 'discovery', 'fde-consult', 'architecture', 'proposal', 'capacity'].forEach((key) => {
    const a = generateArtifact(project, key, { revision: 1, id: uid('art') });
    if (key === 'ideation') { a.status = 'approved'; a.approvedBy = user.name; a.approvedAt = now(); }
    db.artifacts.push(a);
  });
  addMessage(project, 'assistant', `Welcome to **Lumen Pharmacy Ops** — a ${TIERS.smb.label} sandbox. I have already generated the first six workstreams from your brief: ideation (approved), discovery, FDE consultation, architecture, proposal and capacity.\n\nTry the sandbox preview, ask me for a deployment pipeline, or say **"generate all"** to complete the remaining six workstreams.\n\n_Every artifact stays a draft until you approve it. Production promotion always needs a named human._`);
  [['dev', true], ['test', true], ['prod', false]].forEach(([env]) => {
    const dep = deployment(project, env, db.deployments.filter((d) => d.projectId === project.id).length);
    dep.projectId = project.id;
    if (env === 'prod') { dep.status = 'awaiting_approval'; } else { project.envs[env] = { version: dep.version, at: now(), status: dep.status }; }
    db.deployments.push(dep);
  });
  const consultation = {
    id: uid('con'), projectId: project.id, topic: 'Validate the pharmacy stockout wedge and scope a 12-week production slice',
    notes: 'Needs a technical landscape review of the pharmacy management system and a security view on PHI handling.',
    status: 'scheduled', createdAt: now(), fde: 'Priya Raman', pod: ['Solution architect', 'Data engineer', 'Security lead'],
    focus: ['Ideation to Prototype', 'Architecture Design & Review', 'AI DLC & Deployment'],
    scheduledFor: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    brief: [
      { title: 'Objectives', items: ['Pressure-test the stockout wedge with real dispensing data', 'Confirm integration access and PHI boundary', 'Agree pilot success thresholds'] },
      { title: 'Preparation', items: ['Share pharmacy management system API docs', 'Name a data owner and a security reviewer', 'Provide 90 days of anonymised SKU history'] },
      { title: 'Outputs', items: ['FDE assessment', 'Integration risk register', 'Pilot scope and estimate'] },
    ],
  };
  db.consultations.push(consultation);
  const demoCollateral = buildCollateral(project, 'one-pager');
  db.collaterals.push(demoCollateral);
  save();
  console.log('Seeded demo account: demo@kiln.studio / KilnDemo2026!');
}

/* ------------------------------------------------------------------ static files */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function serveFile(res, filePath, cache = 'no-cache') {
  fs.readFile(filePath, (error, data) => {
    if (error) { fail(res, 404, 'Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': cache,
      ...securityHeaders(),
    });
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/app' || rel === '/app/' || rel === '/mobile' || rel === '/mobile/') rel = '/app.html';
  if (rel === '/trust' || rel === '/trust/') rel = '/trust.html';
  if (rel === '/developers' || rel === '/developers/') rel = '/developers.html';
  if (rel === '/fde-forum' || rel === '/fde-forum/') rel = '/fde-forum.html';
  if (rel === '/blueprint') rel = '/app.html';
  const base = PUBLIC;
  const resolved = path.resolve(base, '.' + rel);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return fail(res, 403, 'Forbidden');
  fs.stat(resolved, (error, stat) => {
    if (error || !stat.isFile()) return fail(res, 404, 'Not found');
    const cache = /\.(css|js|svg)$/.test(resolved) ? 'no-cache' : /\.(png|jpg|webp|woff2)$/.test(resolved) ? 'public, max-age=3600' : 'no-cache';
    serveFile(res, resolved, cache);
  });
}

/* ------------------------------------------------------------------ routes */
let bootstrapped = false;
function ensureBootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  if (process.env.KILN_SEED_DEMO !== '0') {
    seedDemo();
    save();
  }
  forum.ensureSeed();
}

/* ------------------------------------------------------------------ revenue swarm */
function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

const REVENUE_AGENTS = [
  { id: 'icp', name: 'ICP & Demand', glyph: '◎', autonomy: 'Research', role: 'Maintains the ICP and ranks target accounts against the closed-won wedge.', guardrail: 'Heavy enrichment spend needs review.' },
  { id: 'prospecting', name: 'Prospecting', glyph: '◈', autonomy: 'Research', role: 'Finds the economic buyer and champion, with provenance on every contact.', guardrail: 'No email or bulk spend without a human gate.' },
  { id: 'outreach', name: 'Outreach', glyph: '↗', autonomy: 'Gated send', role: 'Drafts tier-aware sequences for the $9.5k diagnostic wedge.', guardrail: 'Audience and copy both need approval.' },
  { id: 'inbound', name: 'Inbound Qualifier', glyph: '⌁', autonomy: 'Route only', role: 'Scores readiness tests, sandbox signups, artifacts and deploy gates in minutes.', guardrail: 'Routing only; auto-replies need Outreach approval.' },
  { id: 'sdr', name: 'SDR Chat', glyph: '◌', autonomy: 'Answer only', role: 'Answers approved product and pricing questions and books diagnostics.', guardrail: 'No custom pricing, dates or security claims.' },
  { id: 'proposal', name: 'Proposal & Pricing', glyph: '▤', autonomy: 'Draft only', role: 'Turns discovery evidence into a consistent SOW, proposal and price.', guardrail: 'Price, proposal and SOW need commercial approval.' },
  { id: 'activation', name: 'Activation & Expansion', glyph: '⇡', autonomy: 'Draft only', role: 'Watches usage, limits and artifact velocity for expansion signals.', guardrail: 'No plan, charge or entitlement change.' },
  { id: 'revops', name: 'RevOps & Forecast', glyph: '◫', autonomy: 'Forecast only', role: 'Keeps pipeline hygiene, forecast, capacity and hiring triggers current.', guardrail: 'No hiring or commercial commitments.' },
  { id: 'guardrail', name: 'Guardrail & Approvals', glyph: '⚖', autonomy: 'Human gate', role: 'Presents every commitment artifact to a named human and records the decision.', guardrail: 'Cannot approve anything itself.' },
];

const REVENUE_AGENT_STATE = {
  icp: { status: 'active', lastAction: 'Scored 42 accounts against the closed-won wedge.', metric: '42 accounts' },
  prospecting: { status: 'active', lastAction: 'Enriched 18 contacts; found 6 buyer and champion pairs.', metric: '18 contacts' },
  outreach: { status: 'waiting', lastAction: 'Two sequences are waiting on audience and copy approval.', metric: '2 drafts' },
  inbound: { status: 'active', lastAction: 'Qualified 7 signals in under 5 minutes.', metric: '7 signals' },
  sdr: { status: 'active', lastAction: 'Booked 2 diagnostics; escalated one security question.', metric: '2 booked' },
  proposal: { status: 'waiting', lastAction: 'Northstar Clinics SOW is ready for commercial approval.', metric: '1 SOW' },
  activation: { status: 'waiting', lastAction: 'Expansion play for Lumen Pharmacy Ops is ready.', metric: '1 play' },
  revops: { status: 'active', lastAction: 'Forecast moved to $186k; two capacity gaps flagged.', metric: '$186k' },
  guardrail: { status: 'active', lastAction: 'Four commitment artifacts are waiting on named humans.', metric: '4 waiting' },
};

const REVENUE_APPROVAL_POOL = [
  {
    key: 'outreach-health', agentId: 'outreach', kind: 'Outbound sequence',
    title: 'Diagnostic outreach · 24 SMB pharmacy operators',
    target: 'Harbour Reef + 23 matched accounts',
    summary: 'A four-touch, tier-aware sequence for operators with a validated stockout wedge. The audience and the copy are both gated.',
    draft: 'Subject: A 2-week stockout diagnostic for Harbour Reef\n\nHi {{first_name}},\n\nYou already have the data. The gap is turning it into a forecast your team can act on.\n\nWe run a 2-week diagnostic that ships one working stockout and reimbursement-gap slice in your sandbox. Fixed fee: $9,500.\n\nWorth a 20-minute look?\n\nBidyut',
    evidence: [{ label: 'ICP fit', value: '0.86' }, { label: 'Source', value: 'Apollo + closed-won pattern' }, { label: 'Suppression', value: 'checked · 0 matches' }],
    confidence: 0.86, release: 'email.simulated',
    guardrails: ['Initial audience needs approval', 'Sequence copy needs approval'],
  },
  {
    key: 'proposal-northstar', agentId: 'proposal', kind: 'Proposal + SOW',
    title: 'Northstar Clinics · $9,500 diagnostic SOW',
    target: 'Northstar Clinics · scaling tier',
    summary: 'Discovery notes show a prior-auth bottleneck. The proposal includes a 2-week diagnostic, one shipped workflow and a production decision gate.',
    draft: 'SOW DRAFT · Northstar Clinics\n\nScope: 2-week diagnostic; one prior-auth workflow shipped in the sandbox; production decision gate.\nFee: $9,500 fixed fee.\nTimeline: 10 business days from access.\nOut of scope: production migration and integrations not listed.\n\nApproval required before send.',
    evidence: [{ label: 'Discovery', value: '4 interviews · prior-auth bottleneck' }, { label: 'Tier', value: 'Scaling' }, { label: 'Margin check', value: 'pass' }],
    confidence: 0.91, release: 'crm.proposal.simulated',
    guardrails: ['Price and SOW need named commercial approval', 'No auto-send'],
  },
  {
    key: 'billing-lumen', agentId: 'activation', kind: 'Plan change',
    title: 'Lumen Pharmacy Ops · scaling plan change',
    target: 'Lumen Pharmacy Ops · SMB to Scaling',
    summary: 'Usage crossed 3 sandboxes and 7 artifacts in 30 days. The expansion play recommends a plan change, but billing stays untouched until approval.',
    draft: 'PLAN CHANGE DRAFT · Lumen Pharmacy Ops\nFrom: SMB · $1,900/mo\nTo: Scaling · $3,400/mo\nReason: 3 sandboxes, 7 artifacts, 2 deploy gates in 30 days.\nEffective: next billing cycle, pending human approval.\n\nNo charge has been made.',
    evidence: [{ label: 'Usage', value: '3 sandboxes · 7 artifacts' }, { label: 'Limit', value: '2 sandboxes on SMB' }, { label: 'Expansion score', value: '0.78' }],
    confidence: 0.78, release: 'stripe.plan-change.simulated',
    guardrails: ['No charge until human approval', 'Billing system is simulated'],
  },
  {
    key: 'sdr-security', agentId: 'sdr', kind: 'External reply',
    title: 'Security questionnaire reply · Meridian Freight',
    target: 'Meridian Freight · security review',
    summary: 'SDR Chat drafted a response to a SOC 2 and data-residency question. Specific claims require human confirmation.',
    draft: 'Hi Meridian team,\n\nWe can share our security posture document and answer the data-residency questions on a call. We do not claim SOC 2 Type II today, and we will not imply it.\n\nWould Tuesday or Thursday work for a 20-minute review?\n\nBidyut',
    evidence: [{ label: 'Question', value: 'SOC 2 + data residency' }, { label: 'KB source', value: 'security posture v2' }, { label: 'Confidence', value: '0.72' }],
    confidence: 0.72, release: 'email.simulated',
    guardrails: ['Security claims require human review', 'No commitments on dates or custom terms'],
  },
  {
    key: 'outreach-manufacturing', agentId: 'outreach', kind: 'New segment',
    title: 'New segment · 18 manufacturing operators',
    target: '18 manufacturing accounts · new audience',
    summary: 'The ICP agent found a manufacturing pattern in closed-won data. A new segment needs fresh audience approval before any send.',
    draft: 'AUDIENCE DRAFT · Manufacturing operators\n18 accounts · 20–500 staff · named operations owner · recent automation or ERP event.\n\nNo sequence is enrolled until a human approves this audience.',
    evidence: [{ label: 'Pattern', value: '3 closed-won manufacturing deals' }, { label: 'Accounts', value: '18 deduped' }, { label: 'Fit', value: '0.81' }],
    confidence: 0.81, release: 'email.simulated',
    guardrails: ['New segment needs fresh approval', 'No send before audience approval'],
  },
  {
    key: 'proposal-logistics', agentId: 'proposal', kind: 'Proposal + SOW',
    title: 'Keel Logistics · $18,000 pilot proposal',
    target: 'Keel Logistics · enterprise pilot',
    summary: 'A qualified logistics opportunity needs a pilot proposal and a delivery-capacity check before it can be sent.',
    draft: 'PROPOSAL DRAFT · Keel Logistics\n\nPilot: 4-week dispatch-exception copilot.\nFee: $18,000 fixed fee.\nTeam: 1 FDE lead, 1 data engineer, 1 designer.\nDecision gate: production scope after week 4.\n\nCommercial approval required before send.',
    evidence: [{ label: 'Discovery', value: 'dispatch exceptions · 6 interviews' }, { label: 'Capacity', value: '1 pod available in 3 weeks' }, { label: 'Confidence', value: '0.83' }],
    confidence: 0.83, release: 'crm.proposal.simulated',
    guardrails: ['Price and SOW need named approval', 'Capacity claim must be confirmed'],
  },
  {
    key: 'content-case-study', agentId: 'guardrail', kind: 'Public content',
    title: 'Case study · From one sentence to a shipped pharmacy copilot',
    target: 'Public site · resources',
    summary: 'A case study draft is ready. Publishing requires human approval and a final evidence check.',
    draft: 'CASE STUDY DRAFT\n\nHarbour Reef started with a stockout brief. In 9 weeks the team had a working forecast, a reimbursement-gap explainer and a human approval record for every production gate.\n\nNo customer quote or metric is included until the customer approves it.',
    evidence: [{ label: 'Customer approval', value: 'pending' }, { label: 'Metrics', value: 'sandbox only' }, { label: 'Confidence', value: '0.88' }],
    confidence: 0.88, release: 'cms.publish.simulated',
    guardrails: ['Customer quote needs approval', 'No public claim without evidence'],
  },
  {
    key: 'config-rules', agentId: 'guardrail', kind: 'Standing rules',
    title: 'Outbound send window + suppression rules',
    target: 'Revenue swarm settings',
    summary: 'A proposed standing rule changes send windows and suppression behavior. Standing rules are a commitment boundary.',
    draft: 'STANDING RULES DRAFT\n- Send window: Tue–Thu, 09:00–11:00 local.\n- Suppression: unsubscribe, open support ticket, human-flagged lead.\n- Re-check suppression before every send.\n- No change to these rules without a named human.',
    evidence: [{ label: 'Current rule', value: 'Mon–Fri · 08:00–16:00' }, { label: 'Suppression', value: '3 sources' }, { label: 'Risk', value: 'medium' }],
    confidence: 0.9, release: 'config.simulated',
    guardrails: ['Standing rules need human approval', 'No silent config change'],
  },
];

function recalcRevenue(revenue) {
  if (!Array.isArray(revenue.approvals)) revenue.approvals = [];
  if (!Array.isArray(revenue.agents)) revenue.agents = [];
  if (!Array.isArray(revenue.metrics)) revenue.metrics = [];
  const pending = revenue.approvals.filter((a) => a.status === 'pending').length;
  const gate = revenue.metrics.find((m) => m.key === 'gates');
  if (gate) gate.value = String(pending);
  const guard = revenue.agents.find((a) => a.id === 'guardrail');
  if (guard) {
    guard.metric = String(pending) + ' waiting';
    guard.status = pending ? 'active' : 'idle';
    guard.lastAction = pending
      ? String(pending) + ' commitment artifacts are waiting on named humans.'
      : 'Queue clear. No commitment artifact is waiting.';
  }
  revenue.updatedAt = now();
  return revenue;
}

function createRevenue(user) {
  const at = now();
  const revenue = {
    id: uid('rev'),
    userId: user.id,
    plan: user.plan || 'smb',
    createdAt: at,
    updatedAt: at,
    orchestrator: {
      status: 'ready',
      stage: 'Qualify',
      cycle: 3,
      lastRunAt: minutesAgo(18),
      lastSummary: 'Four commitment artifacts are waiting on a named human. No external message, price, charge or config change has been released.',
    },
    metrics: [
      { key: 'pipeline', label: 'Pipeline influenced', value: '$248k', delta: '+18% this month' },
      { key: 'opps', label: 'Qualified opportunities', value: '14', delta: '+3 this week' },
      { key: 'gates', label: 'Pending human gates', value: '4', delta: 'median 38m' },
      { key: 'booked', label: 'Diagnostic bookings', value: '3', delta: '$28.5k potential' },
    ],
    agents: REVENUE_AGENTS.map((agent) => ({ ...agent, ...(REVENUE_AGENT_STATE[agent.id] || {}) })),
    approvals: [],
    connectors: [
      { id: 'crm', name: 'CRM', detail: '128 leads · 14 opportunities', lastSync: '2m ago' },
      { id: 'email', name: 'Transactional email', detail: '0 sent · 2 drafts gated', lastSync: '4m ago' },
      { id: 'stripe', name: 'Stripe billing', detail: '$0 charged · 1 plan change gated', lastSync: '12m ago' },
      { id: 'calendar', name: 'FDE calendar', detail: '3 diagnostics booked', lastSync: '2m ago' },
      { id: 'apollo', name: 'Apollo enrichment', detail: '18 contacts · 62 credits estimated', lastSync: '9m ago' },
      { id: 'scheduler', name: 'Scheduler', detail: 'Next cycle 09:00 · human queue first', lastSync: 'just now' },
    ],
    events: [],
  };

  REVENUE_APPROVAL_POOL.slice(0, 4).forEach((approval, index) => {
    revenue.approvals.push({ ...approval, id: uid('apr'), status: 'pending', createdAt: minutesAgo(20 + index * 7) });
  });
  revenue.approvals.push({
    id: uid('apr'), key: 'historical-harbour-sow', agentId: 'proposal', kind: 'SOW',
    title: 'Harbour Reef · diagnostic SOW', target: 'Harbour Reef',
    summary: 'Approved after a revised start date. The release was simulated.',
    draft: 'SOW · Harbour Reef\n2-week stockout diagnostic. Fixed fee: $9,500.',
    evidence: [{ label: 'Decision', value: 'Bidyut Banerjee' }, { label: 'Revision', value: 'start date moved 3 weeks' }],
    confidence: 0.84, release: 'crm.proposal.simulated',
    guardrails: ['Commercial approval', 'No auto-send'],
    status: 'approved', createdAt: minutesAgo(240), decidedBy: 'Bidyut Banerjee',
    decidedAt: minutesAgo(180), note: 'Approved with a 3-week start date.', releasedAt: minutesAgo(179),
  });

  revenue.events = [
    { id: uid('evt'), at: minutesAgo(2), actor: 'Guardrail & Approvals', agentId: 'guardrail', type: 'approval.created', summary: 'Four commitment artifacts are waiting on a named human.', evidence: 'Queue: outreach, proposal, billing, security reply', decision: 'pending' },
    { id: uid('evt'), at: minutesAgo(7), actor: 'Inbound Qualifier', agentId: 'inbound', type: 'signal.scored', summary: 'Harbour Reef readiness test scored 16/18 and routed to FDE-now.', evidence: 'Readiness test · 16/18', decision: 'routed' },
    { id: uid('evt'), at: minutesAgo(18), actor: 'ICP & Demand', agentId: 'icp', type: 'account.ranked', summary: '42 accounts scored; 24 passed the ICP threshold.', evidence: 'Closed-won pattern · 6 deals', decision: 'research' },
    { id: uid('evt'), at: minutesAgo(26), actor: 'Prospecting', agentId: 'prospecting', type: 'contacts.enriched', summary: '18 contacts enriched; 6 economic-buyer and champion pairs found.', evidence: 'Apollo + CRM · 62 credits estimated', decision: 'research' },
    { id: uid('evt'), at: minutesAgo(35), actor: 'RevOps & Forecast', agentId: 'revops', type: 'forecast.updated', summary: 'Next-30-day forecast moved to $186k; two delivery-capacity gaps flagged.', evidence: 'Pipeline + DPR/RLS model', decision: 'forecast' },
    { id: uid('evt'), at: minutesAgo(180), actor: 'Bidyut Banerjee', agentId: 'proposal', type: 'approval.approved', summary: 'Harbour Reef diagnostic SOW approved for simulated release.', evidence: 'Decision by Bidyut Banerjee', decision: 'approved' },
    { id: uid('evt'), at: minutesAgo(179), actor: 'Connector', agentId: 'proposal', type: 'release.simulated', summary: 'crm.proposal.simulated executed in simulation only.', evidence: 'No external system was contacted.', decision: 'simulated' },
  ];
  revenue.events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  recalcRevenue(revenue);
  return revenue;
}

function ensureRevenue(user) {
  if (!Array.isArray(db.revenue)) db.revenue = [];
  let revenue = db.revenue.find((r) => r.userId === user.id);
  if (!revenue) {
    revenue = createRevenue(user);
    db.revenue.push(revenue);
    save();
  }
  return revenue;
}

function runRevenueCycle(revenue) {
  if (!revenue.orchestrator) revenue.orchestrator = { status: 'ready', stage: 'Qualify', cycle: 0, lastSummary: '' };
  if (!Array.isArray(revenue.approvals)) revenue.approvals = [];
  if (!Array.isArray(revenue.events)) revenue.events = [];
  revenue.orchestrator.cycle = Number(revenue.orchestrator.cycle || 0) + 1;
  revenue.orchestrator.lastRunAt = now();
  const stages = ['Attract', 'Capture', 'Qualify', 'Land', 'Expand', 'Retain'];
  revenue.orchestrator.stage = stages[revenue.orchestrator.cycle % stages.length];
  const next = REVENUE_APPROVAL_POOL.find((a) => !revenue.approvals.some((x) => x.key === a.key));
  let summary;
  if (next) {
    const approval = { ...next, id: uid('apr'), status: 'pending', createdAt: now() };
    revenue.approvals.unshift(approval);
    const agent = revenue.agents.find((a) => a.id === next.agentId);
    if (agent) {
      agent.status = 'waiting';
      agent.lastAction = 'Prepared ' + next.kind.toLowerCase() + ': ' + next.title + '.';
      agent.metric = '1 draft';
    }
    revenue.events.unshift({
      id: uid('evt'), at: approval.createdAt, actor: 'Swarm', agentId: next.agentId,
      type: 'approval.created', summary: approval.title + ' routed to Guardrail & Approvals.',
      evidence: 'Confidence ' + Math.round(approval.confidence * 100) + '% · named human required', decision: 'pending',
    });
    summary = 'Cycle ' + revenue.orchestrator.cycle + ': ' + approval.title + ' is waiting on a named human.';
  } else {
    summary = 'Cycle ' + revenue.orchestrator.cycle + ': no new commitment artifacts. The human queue is the constraint.';
    revenue.events.unshift({
      id: uid('evt'), at: now(), actor: 'Swarm', agentId: 'guardrail', type: 'orchestrator.idle',
      summary, evidence: 'All playbook items already created.', decision: 'none',
    });
  }
  revenue.orchestrator.lastSummary = summary;
  recalcRevenue(revenue);
  save();
  return { summary, added: !!next, approvalKey: next ? next.key : null };
}

function installPersistence(res) {
  const originalEnd = res.end;
  let pending = false;
  res.end = function endWithPersistence(chunk, encoding, callback) {
    if (typeof chunk === 'function') { callback = chunk; chunk = undefined; encoding = undefined; }
    if (pending) return res;
    pending = true;
    flush()
      .catch((error) => console.error('Database persistence failed:', error.message))
      .finally(() => {
        try { originalEnd.call(res, chunk, encoding, callback); }
        catch (error) { console.error('Response end failed:', error.message); }
      });
    return res;
  };
}

async function handleRequest(req, res) {
  installPersistence(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;
  const telemetry = observability.startRequest(req);
  res.on('finish', () => {
    try { observability.finishRequest(telemetry, req, res, req.user); } catch (error) { console.error('Telemetry failed:', error.message); }
  });

  try {
    if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      assertSameOrigin(req);
    }
    await ready();
    if (pathname.startsWith('/api/') || pathname.startsWith('/docs/')) {
      await sync();
      ensureBootstrap();
    }

    if (method === 'GET' && pathname === '/docs/MASTER_PROMPT.md') {
      const auth = currentUser(req);
      if (!auth) return fail(res, 401, 'Sign in to view the build blueprint.');
      return serveFile(res, path.join(ROOT, 'docs', 'MASTER_PROMPT.md'), 'private, no-store');
    }
    if (method === 'GET' && pathname.startsWith('/docs/')) return fail(res, 404, 'Document not found.');

    if (method === 'GET' && (pathname === '/' || pathname === '/app' || pathname === '/app/' || pathname === '/mobile' || pathname === '/mobile/' || pathname === '/trust' || pathname === '/trust/' || pathname === '/developers' || pathname === '/developers/' || pathname === '/fde-forum' || pathname === '/fde-forum/' || pathname === '/.well-known/security.txt' || pathname === '/app.html' || pathname === '/index.html' || pathname === '/manifest.webmanifest' || pathname === '/sw.js' || pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname.startsWith('/assets/') || pathname.startsWith('/legal/') || pathname === '/favicon.ico' || pathname === '/favicon.svg')) {
      return serveStatic(req, res, pathname);
    }

    /* ------------------------ public lead capture + analytics */
    if (pathname === '/api/forum/lead' && method === 'POST') {
      rateLimit(req, 'forum-lead', { limit: 6, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
      const body = await readBody(req);
      const name = cleanLabel(body.name, 120);
      const email = cleanEmail(body.email);
      const message = cleanText(body.message, 3000);
      if (name.length < 2) return fail(res, 400, 'Please provide your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Provide a valid work email.');
      if (message.length < 8) return fail(res, 400, 'Tell us a little about the blocker.');
      if (Array.isArray(body.focus)) body.focus = body.focus.slice(0, 3);
      body.source = cleanLabel(body.source || 'fde-forum', 60);
      const lead = createLead(req, body, 'fde');
      recordAnalytics(req, 'forum_fde_lead', { type: 'fde', focus: lead.focus, path: body.path || '/fde-forum', attribution: lead.attribution });
      // Alert the founder inbox via the existing lead alert path so the FDE forum mail is centralised.
      await routeLead({ ...lead, routing: { pod: 'Applied AI pod', owner: 'FDE intake', slaHours: 24, queue: 'fde-forum' } });
      return send(res, 201, {
        ok: true,
        lead: { id: lead.id, type: lead.type, status: lead.status, routing: lead.routing },
        delivery: emailTestMode() ? 'test-outbox' : 'queued',
      });
    }

    if (pathname === '/api/leads' && method === 'POST') {
      rateLimit(req, 'lead-submit', { limit: 8, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
      const body = await readBody(req);
      const type = ['contact', 'fde', 'enterprise'].includes(String(body.type || '').toLowerCase()) ? String(body.type).toLowerCase() : 'contact';
      const name = cleanLabel(body.name, 120);
      const email = cleanEmail(body.email);
      const message = cleanText(body.message, 3000);
      if (name.length < 2) return fail(res, 400, 'Please provide your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Please provide a valid email.');
      if (message.length < 8) return fail(res, 400, 'Tell us a little about what you need.');
      const lead = createLead(req, body, type);
      recordAnalytics(req, 'lead_submit', { type, source: lead.source, attribution: lead.attribution, path: body.path });
      const crm = await routeLead(lead);
      return send(res, 201, {
        ok: true,
        lead: { id: lead.id, type: lead.type, status: lead.status, routing: lead.routing },
        delivery: emailTestMode() ? 'test-outbox' : 'queued',
        crm,
      });
    }

    if (pathname === '/api/analytics/events' && method === 'POST') {
      rateLimit(req, 'analytics', { limit: 120, windowMs: 60 * 1000, blockMs: 60 * 1000 });
      const body = await readBody(req);
      const event = cleanLabel(body.event || (body.events && body.events[0] && body.events[0].event), 80);
      if (!event) return fail(res, 400, 'Event name required.');
      const entry = recordAnalytics(req, event, body.props || body);
      return send(res, 202, { ok: true, id: entry.id });
    }

    if (pathname === '/api/availability' && method === 'GET') {
      const slots = [2, 3, 4].map((days) => {
        const date = new Date(Date.now() + days * 86400000);
        date.setUTCHours(9 + days, 30, 0, 0);
        return { id: date.toISOString(), label: date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC', pod: days === 4 ? 'Secure delivery pod' : days === 3 ? 'Data platform pod' : 'Applied AI pod' };
      });
      return ok(res, { slots, timezone: 'UTC', durationMinutes: 45 });
    }

    if (pathname === '/api/billing/webhook' && method === 'POST') {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return fail(res, 503, 'Stripe webhooks are not configured.');
      const raw = await readRawBody(req);
      const result = await billing.handleStripeWebhook(raw, req.headers['stripe-signature'], secret);
      return ok(res, result);
    }

    /* ------------------------ auth */
    if (pathname === '/api/auth/register' && method === 'POST') {
      rateLimit(req, 'register', { limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
      const body = await readBody(req);
      const name = cleanLabel(body.name, 120);
      const email = cleanEmail(body.email);
      const password = String(body.password || '');
      if (name.length < 2) return fail(res, 400, 'Please provide your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Please provide a valid email.');
      if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      if (body.plan !== undefined && body.plan !== '' && body.plan !== 'free') {
        return fail(res, 400, 'Paid plans require checkout after sign-up. Create your free account, then choose a plan in Billing.');
      }
      const existing = db.users.find((user) => user.email === email);
      let verifyUrl;
      let verifyToken;
      let delivery = 'suppressed';
      if (!existing) {
        const user = {
          id: uid('usr'), name, email, password: hashPassword(password), createdAt: now(),
          plan: 'free', emailVerified: false, referralCode: null,
        };
        user.billing = billing.defaultBilling('free');
        user.referralCode = billing.referralCodeFor(user);
        db.users.push(user);
        billing.applyReferral(user, body.ref || body.referralCode);
        verifyToken = issueToken(user, 'verification', 24 * 60 * 60 * 1000);
        verifyUrl = `${requestBase(req)}/app?verify=${encodeURIComponent(verifyToken)}`;
        const emailRecord = await sendEmail({
          to: email,
          userId: user.id,
          tag: 'auth.verify',
          subject: 'Verify your Kiln email',
          text: `Welcome to Kiln, ${name}.\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
          meta: { kind: 'verification' },
        });
        delivery = emailRecord.provider;
        recordEvent('auth.registered', 'Free account created; verification pending', { userId: user.id, email, plan: 'free' });
        save();
      } else {
        // Existing accounts receive a security notice, never a session or a
        // distinguishable response. This keeps registration non-enumerating.
        const notice = await sendEmail({
          to: email,
          userId: existing.id,
          tag: 'auth.signup_notice',
          subject: 'A sign-up attempt used your Kiln email',
          text: `Someone tried to create a Kiln account with this email. If this was you, sign in or reset your password.\n\n${requestBase(req)}/app\n\nIf this was not you, no action is needed.`,
          meta: { kind: 'signup_notice' },
        });
        delivery = notice.provider;
        recordEvent('auth.signup_attempt_existing', 'Sign-up attempt for an existing account', { userId: existing.id });
        save();
      }
      const test = exposeTestLink() && !existing;
      return send(res, 202, {
        ok: true,
        pending: true,
        message: 'If this email can be used, check your inbox to continue.',
        ...(test ? { verification: { required: true, delivery, testToken: verifyToken, testUrl: verifyUrl } } : {}),
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readBody(req);
      const email = cleanEmail(body.email);
      const password = String(body.password || '');
      const accountIdentity = email || 'unknown';
      const ipIdentity = clientIp(req);
      rateLimit(req, 'login-account', { identity: accountIdentity, limit: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 });
      rateLimit(req, 'login-ip', { identity: ipIdentity, limit: 20, windowMs: 60 * 1000, blockMs: 60 * 1000 });
      const user = db.users.find((u) => u.email === email);
      if (!user || !user.password || !verifyPassword(password, user.password)) return fail(res, 401, 'Email or password is incorrect.');
      clearRate(req, 'login-account', accountIdentity);
      clearRate(req, 'login-ip', ipIdentity);
      if (user.mfa && user.mfa.enabled) {
        const challenge = identity.issueMfaChallenge(user.id);
        recordEvent('auth.mfa.challenge', 'Password accepted; authenticator challenge issued', { userId: user.id });
        save();
        return ok(res, { mfaRequired: true, challenge, message: 'Enter a six-digit authenticator code or a recovery code.' });
      }
      user.lastLoginAt = now();
      billing.ensureBilling(user);
      const token = createSession(user.id);
      const projects = db.projects.filter((p) => identity.canAccessProject(user, p)).map(projectSummary);
      recordEvent('auth.login', 'Signed in', { userId: user.id, email });
      save();
      return send(res, 200, { user: publicUser(user), projects }, { 'Set-Cookie': sessionCookie(token) });
    }

    if (pathname === '/api/auth/mfa/verify' && method === 'POST') {
      rateLimit(req, 'mfa-verify', { limit: 10, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 });
      const body = await readBody(req);
      const user = identity.consumeMfaChallenge(String(body.challenge || ''), String(body.code || ''));
      if (!user) return fail(res, 401, 'That authenticator or recovery code is not valid.');
      user.lastLoginAt = now();
      billing.ensureBilling(user);
      const token = createSession(user.id);
      recordEvent('auth.mfa.success', 'Signed in with MFA', { userId: user.id });
      save();
      return send(res, 200, sessionPayload(req, user), { 'Set-Cookie': sessionCookie(token) });
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      rateLimit(req, 'forgot-password', { limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
      const body = await readBody(req);
      const email = cleanEmail(body.email);
      const user = db.users.find((u) => u.email === email);
      let testUrl;
      if (user) {
        const raw = issueToken(user, 'reset', 60 * 60 * 1000);
        testUrl = `${requestBase(req)}/app?reset=${encodeURIComponent(raw)}`;
        await sendEmail({
          to: email,
          userId: user.id,
          tag: 'auth.reset',
          subject: 'Reset your Kiln password',
          text: `Use this link to reset your Kiln password. It expires in one hour.\n\n${testUrl}\n\nIf you did not request this, ignore this email.`,
          meta: { kind: 'reset' },
        });
        recordEvent('auth.password_reset_requested', 'Password reset requested', { userId: user.id });
        save();
      }
      return ok(res, { ok: true, delivery: emailTestMode() ? 'test-outbox' : 'queued', testUrl: emailTestMode() ? testUrl : undefined });
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      rateLimit(req, 'reset-password', { limit: 10, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
      const body = await readBody(req);
      const password = String(body.password || '');
      if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      const user = consumeToken(db.users, 'reset', String(body.token || ''));
      if (!user) return fail(res, 400, 'This reset link is invalid or has expired.');
      user.password = hashPassword(password);
      user.passwordChangedAt = now();
      for (const [token, session] of Object.entries(db.sessions)) {
        if (session.userId === user.id) delete db.sessions[token];
      }
      const session = createSession(user.id);
      recordEvent('auth.password_reset', 'Password reset completed', { userId: user.id });
      save();
      return send(res, 200, { user: publicUser(user), projects: db.projects.filter((p) => p.userId === user.id).map(projectSummary) }, { 'Set-Cookie': sessionCookie(session) });
    }

    if (pathname === '/api/auth/verify-email' && method === 'POST') {
      rateLimit(req, 'verify-email', { limit: 20, windowMs: 60 * 60 * 1000 });
      const body = await readBody(req);
      const user = consumeToken(db.users, 'verification', String(body.token || ''));
      if (!user) return fail(res, 400, 'This verification link is invalid or has expired.');
      user.emailVerified = true;
      user.emailVerifiedAt = now();
      queueLifecycle(user, 'lifecycle.welcome', 'Your Kiln workspace is ready', `Hi ${user.name},\n\nYour free Kiln workspace is ready. Start a brief, generate your first 12 workstreams, and upgrade only when you need production shipping or Revenue Swarm.\n\nOpen the console: ${requestBase(req)}/app`);
      recordEvent('auth.email_verified', 'Email verified', { userId: user.id });
      const token = createSession(user.id);
      save();
      return send(res, 200, sessionPayload(req, user), { 'Set-Cookie': sessionCookie(token) });
    }

    if (pathname === '/api/auth/resend-verification' && method === 'POST') {
      const auth = currentUser(req);
      if (!auth) return fail(res, 401, 'Not signed in.');
      rateLimit(req, 'resend-verification', { identity: auth.user.id, limit: 3, windowMs: 60 * 60 * 1000 });
      if (auth.user.emailVerified) return ok(res, { ok: true, alreadyVerified: true });
      const raw = issueToken(auth.user, 'verification', 24 * 60 * 60 * 1000);
      const url = `${requestBase(req)}/app?verify=${encodeURIComponent(raw)}`;
      const record = await sendEmail({
        to: auth.user.email,
        userId: auth.user.id,
        tag: 'auth.verify',
        subject: 'Verify your Kiln email',
        text: `Verify your Kiln email: ${url}\n\nThis link expires in 24 hours.`,
        meta: { kind: 'verification' },
      });
      return ok(res, { ok: true, delivery: record.provider, testUrl: emailTestMode() ? url : undefined });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const auth = currentUser(req);
      if (auth) delete db.sessions[auth.token];
      save();
      return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
    }

    if (pathname === '/api/me' && method === 'GET') {
      const auth = currentUser(req);
      if (!auth) return fail(res, 401, 'Not signed in.');
      return ok(res, { user: publicUser(auth.user), projects: db.projects.filter((p) => identity.canAccessProject(auth.user, p)).map(projectSummary), workspace: identity.workspaceView(auth.user) });
    }

    if (pathname === '/api/health' && method === 'GET') return ok(res, { ok: true, service: 'kiln' });

    if (pathname === '/api/catalog' && method === 'GET') {
      return ok(res, {
        tiers: PRICING.map((p) => ({ ...p, ...TIERS[p.key] })),
        functions: FUNCTIONS,
        models: MODELS.map(({ code, ...m }) => ({ ...m, code })).map((m) => ({ ...m })),
        services: SERVICES,
        pricing: PRICING,
        plans: Object.values(billing.PLANS),
        billingMode: billing.stripeEnabled() ? 'stripe' : 'test',
        emailMode: emailTestMode() ? 'test-outbox' : 'live',
        blueprintVersion: '1.1',
      });
    }

    /* ------------------------ public trust, status and SSO discovery */
    if (pathname === '/api/trust' && method === 'GET') return ok(res, { trust: platform.trustView() });
    if (pathname === '/api/status' && method === 'GET') return ok(res, platform.statusView());
    if (pathname === '/api/auth/sso/status' && method === 'GET') {
      return ok(res, { enabled: identity.ssoEnabled(), provider: 'OIDC' });
    }

    if (pathname === '/api/auth/sso/start' && method === 'GET') {
      rateLimit(req, 'sso-start', { limit: 20, windowMs: 10 * 60 * 1000 });
      let ownerId = null;
      const org = cleanLabel(url.searchParams.get('org'), 160);
      if (org) {
        const owner = db.users.find((candidate) => candidate.id === org || candidate.email === cleanEmail(org));
        if (owner) ownerId = owner.id;
      }
      try {
        const result = await identity.beginSso(req, { ownerId, baseUrl: requestBase(req) });
        res.writeHead(302, { Location: result.url, 'Cache-Control': 'no-store', ...securityHeaders() });
        return res.end();
      } catch (error) {
        return fail(res, error.status || 502, error.message, { code: error.code || 'SSO_START_FAILED' });
      }
    }

    if (pathname === '/api/auth/sso/callback' && method === 'GET') {
      const state = String(url.searchParams.get('state') || '');
      const code = String(url.searchParams.get('code') || '');
      const providerError = String(url.searchParams.get('error') || '');
      try {
        if (providerError) throw new Error(`Identity provider returned ${providerError}.`);
        if (!state || !code) throw new Error('Missing SSO state or authorization code.');
        const result = await identity.finishSso(state, code);
        const token = createSession(result.user.id);
        recordEvent('auth.sso.login', `Signed in with enterprise SSO${result.created ? ' (new account)' : ''}`, { userId: result.user.id, email: result.user.email });
        save();
        res.writeHead(302, {
          Location: '/app',
          'Set-Cookie': sessionCookie(token),
          'Cache-Control': 'no-store',
          ...securityHeaders(),
        });
        return res.end();
      } catch (error) {
        recordEvent('auth.sso.failed', cleanLabel(error.message, 240));
        save();
        res.writeHead(302, {
          Location: `/app?sso_error=${encodeURIComponent(cleanLabel(error.message, 180))}`,
          'Cache-Control': 'no-store',
          ...securityHeaders(),
        });
        return res.end();
      }
    }

    /* ------------------------ SCIM 2.0 provisioning */
    const scimMatch = pathname.match(/^\/api\/scim\/v2\/(Users|Groups|ServiceProviderConfig)(?:\/([^/]+))?$/);
    if (scimMatch) {
      const scimAuth = identity.resolveScimToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      if (!scimAuth) {
        res.setHeader('WWW-Authenticate', 'Bearer realm="kiln-scim"');
        return fail(res, 401, 'A valid SCIM bearer token is required.');
      }
      const [, resource, resourceId] = scimMatch;
      const owner = scimAuth.owner;
      const members = [{ id: owner.id, userId: owner.id, email: owner.email, name: owner.name, role: 'owner', status: 'active' }]
        .concat((db.workspaceMembers || []).filter((member) => member.ownerId === owner.id).map((member) => {
          const user = db.users.find((candidate) => candidate.id === member.userId);
          return { ...member, name: user ? user.name : member.email };
        }));
      const toScim = (member) => ({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: member.id,
        userName: member.email,
        name: { formatted: member.name || member.email },
        emails: [{ value: member.email, primary: true }],
        active: member.status === 'active',
        roles: [{ value: member.role, primary: true }],
        meta: { resourceType: 'User', created: member.joinedAt || member.invitedAt || now(), lastModified: member.updatedAt || member.joinedAt || now() },
      });

      if (resource === 'ServiceProviderConfig' && method === 'GET') {
        return ok(res, {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
          patch: { supported: true }, bulk: { supported: false, maxOperations: 0 },
          filter: { supported: true, maxResults: 200 }, changePassword: { supported: false },
          sort: { supported: false }, etag: { supported: false },
          authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', primary: true }],
        });
      }

      if (resource === 'Groups' && method === 'GET') {
        const groups = Object.entries(identity.ROLES).filter(([role]) => role !== 'owner').map(([role, definition]) => ({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
          id: role,
          displayName: definition.label,
          members: members.filter((member) => member.role === role).map((member) => ({ value: member.id, display: member.email })),
        }));
        return ok(res, { schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: groups.length, Resources: groups });
      }

      if (resource === 'Users' && !resourceId && method === 'GET') {
        let list = members;
        const filter = String(url.searchParams.get('filter') || '');
        const match = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
        if (match) list = list.filter((member) => member.email === cleanEmail(match[1]));
        return ok(res, { schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: list.length, Resources: list.map(toScim) });
      }

      if (resource === 'Users' && !resourceId && method === 'POST') {
        const body = await readBody(req);
        const email = cleanEmail((body.emails && body.emails[0] && body.emails[0].value) || body.userName);
        const role = (body.roles && body.roles[0] && body.roles[0].value) || 'member';
        try {
          const result = identity.inviteMember(owner, email, role);
          platform.emitEvent(owner.id, 'member.invited', { id: result.member.id, email, role: result.member.role });
          recordEvent('workspace.member.scim_created', `${email} provisioned via SCIM`, { userId: owner.id });
          save();
          return send(res, 201, toScim({ ...result.member, name: body.name && body.name.formatted ? body.name.formatted : email }), { 'Content-Type': 'application/scim+json' });
        } catch (error) {
          return fail(res, error.status || 400, error.message, { schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'] });
        }
      }

      if (resource === 'Users' && resourceId) {
        const member = members.find((candidate) => candidate.id === resourceId || candidate.userId === resourceId);
        if (!member) return fail(res, 404, 'SCIM user not found.');
        if (member.role === 'owner' && method !== 'GET') return fail(res, 409, 'The workspace owner cannot be modified through SCIM.');
        if (method === 'GET') return ok(res, toScim(member));
        if (method === 'PATCH' || method === 'PUT') {
          const body = await readBody(req);
          const operations = Array.isArray(body.Operations) ? body.Operations : [];
          let changed = false;
          for (const operation of operations) {
            const pathValue = String(operation.path || '').toLowerCase();
            const value = operation.value;
            if (pathValue === 'active' && value === false) {
              identity.removeMember(owner, member.id);
              changed = true;
            } else if ((pathValue === 'roles' || pathValue === 'role') && value) {
              const role = Array.isArray(value) ? value[0] && value[0].value : value;
              if (identity.ROLES[role] && role !== 'owner') { identity.updateMember(owner, member.id, role); changed = true; }
            } else if (pathValue === 'name.formatted' && value) {
              const user = db.users.find((candidate) => candidate.id === member.userId);
              if (user) { user.name = cleanLabel(value, 120); changed = true; }
            }
          }
          if (!changed && body.active === false) { identity.removeMember(owner, member.id); changed = true; }
          if (!changed) return fail(res, 400, 'No supported SCIM patch operation was supplied.');
          save();
          const updated = members.find((candidate) => candidate.id === member.id) || member;
          return ok(res, toScim(updated));
        }
        if (method === 'DELETE') {
          identity.removeMember(owner, member.id);
          recordEvent('workspace.member.scim_deleted', `${member.email} deprovisioned via SCIM`, { userId: owner.id });
          save();
          return send(res, 204, {});
        }
      }
      return fail(res, 405, 'SCIM method not supported.');
    }

    /* ------------------------ public API v1 (Bearer API key) */
    const publicApiMatch = pathname.match(/^\/api\/v1\/(projects|catalog)(?:\/(prj_[a-f0-9-]+))?(?:\/(run|artifacts))?$/);
    if (publicApiMatch) {
      const auth = identity.resolveApiKey(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      if (!auth) return fail(res, 401, 'A valid API key is required.');
      req.user = auth.user;
      req.apiKey = auth.key;
      const [, resource, projectId, action] = publicApiMatch;
      if (resource === 'catalog' && method === 'GET') {
        return ok(res, { data: { functions: FUNCTIONS.length, models: MODELS.map((model) => model.id), tiers: Object.keys(TIERS) }, meta: { version: 'v1' } });
      }
      if (resource === 'projects' && !projectId && method === 'GET') {
        if (!auth.key.scopes.includes('projects:read')) return fail(res, 403, 'API key lacks projects:read.');
        const projects = db.projects.filter((project) => identity.canAccessProject(auth.user, project)).map(projectSummary);
        return ok(res, { data: projects, meta: { count: projects.length, version: 'v1' } });
      }
      if (resource === 'projects' && projectId) {
        const project = projectFor(auth.user, projectId);
        if (!project) return fail(res, 404, 'Project not found.');
        if (!auth.key.scopes.includes('projects:read')) return fail(res, 403, 'API key lacks projects:read.');
        if (action === 'artifacts' && method === 'GET') {
          return ok(res, { data: db.artifacts.filter((artifact) => artifact.projectId === project.id), meta: { version: 'v1' } });
        }
        if (action === 'run' && method === 'POST') {
          if (!auth.key.scopes.includes('runs:write')) return fail(res, 403, 'API key lacks runs:write.');
          if (!identity.hasPermission(auth.user, 'generate', project.userId)) return fail(res, 403, 'Workspace role cannot generate.');
          billing.assertTierAllowed(auth.user, project.tier);
          const body = await readBody(req);
          const functionKey = String(body.functionKey || 'ideation');
          if (!FUNCTIONS.some((fn) => fn.key === functionKey)) return fail(res, 400, 'Unknown workstream.');
          const quota = billing.assertQuota(auth.user, 900 + billing.estimateTokens(body.instruction || ''), 'public API generation');
          const artifact = createArtifact(project, functionKey, String(body.instruction || 'Public API run'));
          billing.recordUsage(auth.user, quota.requested, 'api.workstream', { projectId: project.id, functionKey });
          save();
          return send(res, 201, { data: artifact, meta: { version: 'v1', usage: { used: auth.user.billing.tokensUsed, quota: auth.user.billing.tokenQuota } } });
        }
        if (!action && method === 'GET') return ok(res, { data: workspace(project), meta: { version: 'v1' } });
      }
      return fail(res, 405, 'Public API method not supported.');
    }

    /* ------------------------ cron / job runner */
    if (pathname === '/api/internal/jobs/run' && method === 'POST') {
      const secret = process.env.KILN_CRON_SECRET;
      if (!secret) return fail(res, 503, 'Scheduled jobs are not configured.');
      const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!supplied || supplied.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) {
        return fail(res, 401, 'Invalid scheduler secret.');
      }
      const result = await observability.runJobs(25);
      return ok(res, result);
    }

    /* ------------------------ sandbox preview (HTML) */
    const previewMatch = pathname.match(/^\/sandbox\/(prj_[a-f0-9-]+)\/?$/);
    if (method === 'GET' && previewMatch) {
      const auth = currentUser(req);
      if (!auth) return fail(res, 401, 'Sign in to view this sandbox.');
      const project = projectFor(auth.user, previewMatch[1]);
      if (!project) return fail(res, 404, 'Sandbox not found.');
      const html = prototypeHTML(project, projectContext(project));
      return send(res, 200, Buffer.from(html, 'utf8'), {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'",
      });
    }

    /* ------------------------ public FDE forum feed */
    if (pathname === '/api/forum/feed' && method === 'GET') {
      return ok(res, forum.feed({
        q: url.searchParams.get('q'),
        space: url.searchParams.get('space'),
        tag: url.searchParams.get('tag'),
        status: url.searchParams.get('status'),
        sort: url.searchParams.get('sort'),
      }));
    }
    const forumThreadMatch = pathname.match(/^\/api\/forum\/thread\/(thr_[a-f0-9-]+)$/);
    if (forumThreadMatch && method === 'GET') {
      const data = forum.threadView(forumThreadMatch[1]);
      if (!data) return fail(res, 404, 'Thread not found.');
      return ok(res, data);
    }

    /* ------------------------ API auth gate */
    if (pathname.startsWith('/api/')) {
      const auth = currentUser(req);
      if (!auth && pathname !== '/api/catalog') return fail(res, 401, 'Not signed in.');
      req.user = auth ? auth.user : null;
    }

    /* ------------------------ interactive forum (FDE, SDE and registered users) */
    if (pathname === '/api/forum/thread' && method === 'POST') {
      if (!requireVerified(req, res, 'posting a question')) return;
      const body = await readBody(req);
      const created = forum.createThread(req.user, body);
      if (!created.ok) return fail(res, 400, created.error);
      recordEvent('forum.thread_created', `${req.user.name} opened a forum thread`, { userId: req.user.id, threadId: created.thread.id, role: created.thread.author.role });
      save();
      return send(res, 201, created.view);
    }

    const replyMatch = pathname.match(/^\/api\/forum\/thread\/(thr_[a-f0-9-]+)\/reply$/);
    if (replyMatch && method === 'POST') {
      if (!requireVerified(req, res, 'posting a reply')) return;
      const body = await readBody(req);
      const result = forum.createReply(req.user, replyMatch[1], body);
      if (!result.ok) return fail(res, 400, result.error);
      recordEvent('forum.reply', `${req.user.name} replied to a forum thread`, { userId: req.user.id, threadId: replyMatch[1], role: forumRoleFor(req.user) });
      return send(res, 201, result.view);
    }

    const replyActionMatch = pathname.match(/^\/api\/forum\/reply\/(rpl_[a-f0-9-]+)\/reaction$/);
    if (replyActionMatch && method === 'POST') {
      const body = await readBody(req);
      const result = forum.replyReaction(req.user, replyActionMatch[1], body);
      if (!result.ok) return fail(res, 400, result.error);
      return ok(res, result.view);
    }

    const threadActionMatch = pathname.match(/^\/api\/forum\/thread\/(thr_[a-f0-9-]+)\/(action|reaction)$/);
    if (threadActionMatch && (method === 'POST' || method === 'PATCH')) {
      const body = await readBody(req);
      const target = threadActionMatch[2] === 'reaction' ? 'reaction' : 'action';
      const result = target === 'reaction'
        ? forum.reactionToggle(req.user, threadActionMatch[1], body)
        : forum.threadAction(req.user, threadActionMatch[1], body);
      if (!result.ok) return fail(res, result.status || 400, result.error);
      recordEvent('forum.thread_' + target, `${req.user.name} ${target === 'reaction' ? 'reacted to' : target + 'ed'} a thread`, { userId: req.user.id, threadId: threadActionMatch[1], role: forumRoleFor(req.user) });
      save();
      return ok(res, result.view);
    }

    const threadDeleteMatch = pathname.match(/^\/api\/forum\/thread\/(thr_[a-f0-9-]+)$/);
    if (threadDeleteMatch && method === 'DELETE') {
      const result = forum.deleteThread(req.user, threadDeleteMatch[1]);
      if (!result.ok) return fail(res, 400, result.error);
      save();
      return ok(res, result);
    }

    /* ------------------------ workspace identity, RBAC and MFA */
    if (pathname === '/api/workspace' && method === 'GET') {
      return ok(res, { workspace: identity.workspaceView(req.user) });
    }

    if (pathname === '/api/auth/mfa' && method === 'GET') {
      return ok(res, { mfa: identity.mfaView(req.user) });
    }

    if (pathname === '/api/auth/mfa/setup' && method === 'POST') {
      if (!requireVerified(req, res, 'enabling MFA')) return;
      const setup = identity.beginMfaSetup(req.user);
      recordEvent('auth.mfa.setup_started', 'Authenticator setup started', { userId: req.user.id });
      save();
      return ok(res, setup);
    }

    if (pathname === '/api/auth/mfa/confirm' && method === 'POST') {
      const body = await readBody(req);
      const result = identity.confirmMfa(req.user, String(body.code || ''));
      if (!result.ok) return fail(res, 400, result.error);
      recordEvent('auth.mfa.enabled', 'MFA enabled', { userId: req.user.id });
      save();
      return ok(res, result);
    }

    if (pathname === '/api/auth/mfa/disable' && method === 'POST') {
      const body = await readBody(req);
      if (!req.user.password || !verifyPassword(String(body.password || ''), req.user.password)) return fail(res, 403, 'Password confirmation failed.');
      const result = identity.disableMfa(req.user, String(body.code || ''));
      if (!result.ok) return fail(res, 400, result.error);
      recordEvent('auth.mfa.disabled', 'MFA disabled', { userId: req.user.id });
      save();
      return ok(res, result);
    }

    if (pathname === '/api/workspace/members' && method === 'POST') {
      identity.assertPermission(req.user, 'members', identity.ownerIdFor(req.user));
      const body = await readBody(req);
      const result = identity.inviteMember(req.user, body.email, String(body.role || 'member'));
      let inviteUrl;
      if (result.invite) {
        inviteUrl = `${requestBase(req)}/app?invite=${encodeURIComponent(result.invite.rawToken)}`;
        await sendEmail({
          to: result.invite.email,
          userId: req.user.id,
          tag: 'workspace.invite',
          subject: 'You have been invited to a Kiln workspace',
          text: `You have been invited to ${req.user.name}'s Kiln workspace as ${result.member.role}.\n\nAccept the invitation: ${inviteUrl}\n\nThis link expires in 7 days.`,
          meta: { kind: 'workspace_invite' },
        });
      }
      platform.emitEvent(req.user.id, 'member.invited', { id: result.member.id, email: result.member.email, role: result.member.role });
      recordEvent('workspace.member.invited', `${result.member.email} invited as ${result.member.role}`, { userId: req.user.id });
      save();
      return send(res, 201, {
        member: result.member,
        invite: result.invite ? { id: result.invite.id, email: result.invite.email, expires: result.invite.expires } : null,
        inviteUrl: exposeTestLink() ? inviteUrl : undefined,
      });
    }

    const memberMatch = pathname.match(/^\/api\/workspace\/members\/(wsm_[a-f0-9-]+)$/);
    if (memberMatch && (method === 'PATCH' || method === 'DELETE')) {
      identity.assertPermission(req.user, 'members', identity.ownerIdFor(req.user));
      if (method === 'PATCH') {
        const body = await readBody(req);
        const member = identity.updateMember(req.user, memberMatch[1], String(body.role || 'member'));
        if (!member) return fail(res, 404, 'Workspace member not found.');
        recordEvent('workspace.member.role_changed', `${member.email} is now ${member.role}`, { userId: req.user.id });
        save();
        return ok(res, { member });
      }
      const removed = identity.removeMember(req.user, memberMatch[1]);
      if (!removed) return fail(res, 404, 'Workspace member not found.');
      recordEvent('workspace.member.removed', `${removed.email} removed from workspace`, { userId: req.user.id });
      save();
      return ok(res, { removed: true });
    }

    if (pathname === '/api/workspace/invites/accept' && method === 'POST') {
      const body = await readBody(req);
      const member = identity.acceptInvite(req.user, String(body.token || ''));
      if (!member) return fail(res, 400, 'This invitation is invalid or has expired.');
      recordEvent('workspace.invite.accepted', 'Workspace invitation accepted', { userId: req.user.id });
      save();
      return ok(res, { workspace: identity.workspaceView(req.user), projects: db.projects.filter((project) => identity.canAccessProject(req.user, project)).map(projectSummary) });
    }

    if (pathname === '/api/workspace/sso' && method === 'GET') {
      identity.assertPermission(req.user, 'admin', identity.ownerIdFor(req.user));
      const ownerId = identity.ownerIdFor(req.user);
      const config = identity.ssoConfigFor(ownerId);
      return ok(res, { sso: config ? { enabled: true, issuer: config.issuer, clientId: config.clientId, redirectUri: config.redirectUri, hasSecret: !!config.clientSecret, scopes: config.scopes || 'openid email profile' } : { enabled: false } });
    }

    if (pathname === '/api/workspace/sso' && method === 'PUT') {
      identity.assertPermission(req.user, 'admin', identity.ownerIdFor(req.user));
      if (!requirePaidWorkspace(req, res, 'Enterprise SSO')) return;
      const body = await readBody(req);
      const issuer = String(body.issuer || '').replace(/\/+$/, '');
      const clientId = cleanLabel(body.clientId, 200);
      if (!/^https:\/\//.test(issuer) || !clientId) return fail(res, 400, 'An HTTPS issuer and client ID are required.');
      const ownerId = identity.ownerIdFor(req.user);
      if (!db.ssoConfigs) db.ssoConfigs = {};
      const existing = db.ssoConfigs[ownerId] || {};
      db.ssoConfigs[ownerId] = {
        issuer,
        clientId,
        clientSecret: body.clientSecret === undefined ? existing.clientSecret : cleanText(body.clientSecret, 300, false),
        redirectUri: String(body.redirectUri || `${requestBase(req)}/api/auth/sso/callback`),
        scopes: cleanLabel(body.scopes, 120) || 'openid email profile',
        updatedAt: now(),
      };
      recordEvent('workspace.sso.configured', `OIDC SSO configured for ${issuer}`, { userId: req.user.id });
      save();
      return ok(res, { sso: { enabled: true, issuer, clientId, hasSecret: !!db.ssoConfigs[ownerId].clientSecret } });
    }

    if (pathname === '/api/workspace/scim-token' && method === 'GET') {
      identity.assertPermission(req.user, 'admin', identity.ownerIdFor(req.user));
      const ownerId = identity.ownerIdFor(req.user);
      return ok(res, { tokens: (db.scimTokens || []).filter((token) => token.ownerId === ownerId && !token.revokedAt).map((token) => ({ id: token.id, name: token.name, prefix: token.prefix, createdAt: token.createdAt, lastUsedAt: token.lastUsedAt })) });
    }

    if (pathname === '/api/workspace/scim-token' && method === 'POST') {
      identity.assertPermission(req.user, 'admin', identity.ownerIdFor(req.user));
      if (!requirePaidWorkspace(req, res, 'SCIM provisioning')) return;
      const body = await readBody(req);
      const issued = identity.createScimToken(req.user, body.name);
      recordEvent('workspace.scim_token.created', 'SCIM provisioning token created', { userId: req.user.id });
      save();
      return send(res, 201, { token: { id: issued.token.id, name: issued.token.name, prefix: issued.token.prefix, createdAt: issued.token.createdAt }, rawToken: issued.raw, endpoint: `${requestBase(req)}/api/scim/v2` });
    }

    const scimTokenMatch = pathname.match(/^\/api\/workspace\/scim-token\/(sct_[a-f0-9-]+)$/);
    if (scimTokenMatch && method === 'DELETE') {
      identity.assertPermission(req.user, 'admin', identity.ownerIdFor(req.user));
      const token = (db.scimTokens || []).find((candidate) => candidate.id === scimTokenMatch[1] && candidate.ownerId === identity.ownerIdFor(req.user));
      if (!token) return fail(res, 404, 'SCIM token not found.');
      token.revokedAt = now();
      save();
      return ok(res, { revoked: true });
    }

    /* ------------------------ public API keys, webhooks, connectors */
    if (pathname === '/api/api-keys' && method === 'GET') {
      identity.assertPermission(req.user, 'keys', identity.ownerIdFor(req.user));
      return ok(res, { keys: (db.apiKeys || []).filter((key) => key.userId === req.user.id && !key.revokedAt).map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, scopes: key.scopes, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt })) });
    }

    if (pathname === '/api/api-keys' && method === 'POST') {
      identity.assertPermission(req.user, 'keys', identity.ownerIdFor(req.user));
      if (!requirePaidWorkspace(req, res, 'Public API access')) return;
      const body = await readBody(req);
      const issued = identity.createApiKey(req.user, body.name, body.scopes);
      recordEvent('developer.api_key.created', 'Public API key created', { userId: req.user.id });
      save();
      return send(res, 201, { key: { id: issued.key.id, name: issued.key.name, prefix: issued.key.prefix, scopes: issued.key.scopes, createdAt: issued.key.createdAt }, rawKey: issued.raw, docs: '/developers' });
    }

    const apiKeyMatch = pathname.match(/^\/api\/api-keys\/(key_[a-f0-9-]+)$/);
    if (apiKeyMatch && method === 'DELETE') {
      identity.assertPermission(req.user, 'keys', identity.ownerIdFor(req.user));
      const key = (db.apiKeys || []).find((candidate) => candidate.id === apiKeyMatch[1] && candidate.userId === req.user.id);
      if (!key) return fail(res, 404, 'API key not found.');
      key.revokedAt = now();
      save();
      return ok(res, { revoked: true });
    }

    if (pathname === '/api/webhooks' && method === 'GET') {
      identity.assertPermission(req.user, 'keys', identity.ownerIdFor(req.user));
      return ok(res, { webhooks: platform.listWebhooks(req.user), events: platform.WEBHOOK_EVENTS, deliveries: (db.webhookDeliveries || []).filter((delivery) => platform.listWebhooks(req.user).some((webhook) => webhook.id === delivery.webhookId)).slice(0, 20) });
    }

    if (pathname === '/api/webhooks' && method === 'POST') {
      identity.assertPermission(req.user, 'keys', identity.ownerIdFor(req.user));
      if (!requirePaidWorkspace(req, res, 'Webhooks')) return;
      const body = await readBody(req);
      const result = platform.createWebhook(req.user, body);
      recordEvent('developer.webhook.created', `Webhook created for ${result.webhook.events.join(', ')}`, { userId: req.user.id });
      save();
      return send(res, 201, { webhook: platform.webhookView(result.webhook), secret: result.secret });
    }

    const webhookMatch = pathname.match(/^\/api\/webhooks\/(whk_[a-f0-9-]+)(\/test)?$/);
    if (webhookMatch) {
      identity.assertPermission(req.user, 'keys', identity.ownerIdFor(req.user));
      if (method === 'DELETE') {
        const removed = platform.deleteWebhook(req.user, webhookMatch[1]);
        if (!removed) return fail(res, 404, 'Webhook not found.');
        return ok(res, { removed: true });
      }
      if (webhookMatch[2] === '/test' && method === 'POST') {
        const webhook = (db.webhooks || []).find((candidate) => candidate.id === webhookMatch[1] && candidate.userId === req.user.id);
        if (!webhook) return fail(res, 404, 'Webhook not found.');
        const job = observability.enqueue('webhook.deliver', { webhookId: webhook.id, ownerId: req.user.id, event: 'webhook.test', payload: { message: 'Kiln webhook test', at: now() } }, { idempotencyKey: `webhook-test:${webhook.id}:${Date.now()}` });
        return ok(res, { queued: true, job: job.id });
      }
    }

    if (pathname === '/api/connectors' && method === 'GET') {
      return ok(res, { connectors: platform.connectorView(req.user) });
    }

    const connectorMatch = pathname.match(/^\/api\/connectors\/([a-z0-9-]+)\/(connect|disconnect)$/);
    if (connectorMatch && method === 'POST') {
      identity.assertPermission(req.user, 'write', identity.ownerIdFor(req.user));
      if (!requirePaidWorkspace(req, res, 'Connector marketplace')) return;
      const connector = connectorMatch[2] === 'connect' ? platform.connectConnector(req.user, connectorMatch[1]) : platform.disconnectConnector(req.user, connectorMatch[1]);
      if (!connector) return fail(res, 404, 'Connector not found.');
      recordEvent(`connector.${connectorMatch[2]}`, `${connector.name} ${connectorMatch[2] === 'connect' ? 'connected' : 'disconnected'}`, { userId: req.user.id });
      save();
      return ok(res, { connector });
    }

    /* ------------------------ operations / observability / DR */
    if (pathname === '/api/admin/observability' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return ok(res, {
        metrics: observability.metrics(),
        logs: (db.requestLogs || []).slice(-100).reverse(),
        jobs: (db.jobs || []).slice(-50).reverse(),
        backups: observability.backupStatus(),
      });
    }

    if (pathname === '/api/admin/jobs' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return ok(res, { jobs: (db.jobs || []).slice(-100).reverse() });
    }

    if (pathname === '/api/admin/jobs/run' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      return ok(res, await observability.runJobs(25));
    }

    if (pathname === '/api/admin/backups' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return ok(res, { backups: await observability.listBackups(), status: observability.backupStatus() });
    }

    if (pathname === '/api/admin/backups' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const backup = await observability.createBackup(body.label || 'manual', req.user.email);
      platform.emitEvent(req.user.id, 'backup.created', { id: backup.id, bytes: backup.bytes, createdAt: backup.createdAt });
      recordEvent('system.backup.created', `Backup ${backup.id} created`, { userId: req.user.id });
      save();
      return send(res, 201, { backup });
    }

    const restoreMatch = pathname.match(/^\/api\/admin\/backups\/(bkp_[a-zA-Z0-9_-]+)\/restore$/);
    if (restoreMatch && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const result = await observability.restoreBackup(restoreMatch[1], req.user.email);
      return ok(res, result);
    }

    /* ------------------------ billing */
    if (pathname === '/api/billing' && method === 'GET') {
      return ok(res, { billing: billing.billingView(req.user) });
    }

    if (pathname === '/api/billing/checkout' && method === 'POST') {
      rateLimit(req, 'billing-checkout', { identity: req.user.id, limit: 10, windowMs: 60 * 60 * 1000 });
      if (!requireVerified(req, res, 'starting a paid subscription')) return;
      const body = await readBody(req);
      const checkout = billing.createCheckout(req.user, String(body.plan || ''), req.headers.origin || siteUrl());
      if (checkout.provider === 'stripe') {
        const result = await billing.stripeCheckout(req.user, checkout);
        return send(res, 201, { checkout: result.checkout, url: result.url, mode: result.mode, billing: billing.billingView(req.user) });
      }
      return send(res, 201, {
        checkout,
        mode: 'test',
        message: 'Test checkout created. Complete it to activate the plan; no card is charged.',
        billing: billing.billingView(req.user),
      });
    }

    const checkoutMatch = pathname.match(/^\/api\/billing\/checkout\/(chk_[a-f0-9-]+)\/confirm$/);
    if (checkoutMatch && method === 'POST') {
      rateLimit(req, 'billing-confirm', { identity: req.user.id, limit: 20, windowMs: 60 * 60 * 1000 });
      const result = await billing.confirmCheckout(req.user, checkoutMatch[1]);
      recordEvent('billing.plan.activated', `Plan ${req.user.billing.plan} activated in ${req.user.billing.provider} mode`, {
        userId: req.user.id,
        plan: req.user.billing.plan,
        invoiceId: result.invoice ? result.invoice.id : null,
      });
      platform.emitEvent(req.user.id, 'billing.plan.activated', { plan: req.user.billing.plan, invoiceId: result.invoice ? result.invoice.id : null });
      save();
      return ok(res, { checkout: result.checkout, invoice: result.invoice, billing: billing.billingView(req.user) });
    }

    if (pathname === '/api/billing/cancel' && method === 'POST') {
      const view = billing.cancelSubscription(req.user);
      recordEvent('billing.subscription.cancel_scheduled', 'Subscription will end at the current period', { userId: req.user.id, plan: view.plan });
      save();
      return ok(res, { billing: view });
    }

    if (pathname === '/api/billing/resume' && method === 'POST') {
      const view = billing.resumeSubscription(req.user);
      recordEvent('billing.subscription.resumed', 'Scheduled cancellation removed', { userId: req.user.id, plan: view.plan });
      save();
      return ok(res, { billing: view });
    }

    if (pathname === '/api/billing/portal' && method === 'POST') {
      const portal = await billing.createPortal(req.user, req.headers.origin || siteUrl());
      return ok(res, portal);
    }

    const invoiceMatch = pathname.match(/^\/api\/billing\/invoices\/(inv_[a-f0-9-]+)$/);
    if (invoiceMatch && method === 'GET') {
      const html = billing.invoiceHtml(req.user, invoiceMatch[1]);
      return send(res, 200, Buffer.from(html, 'utf8'), {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${invoiceMatch[1]}.html"`,
      });
    }

    if (pathname === '/api/referral' && method === 'GET') {
      return ok(res, { referral: billing.referralView(req.user) });
    }

    /* ------------------------ evidence log */
    if (pathname === '/api/evidence' && method === 'GET') {
      const projectIds = new Set(db.projects.filter((project) => project.userId === req.user.id).map((project) => project.id));
      const events = [];
      for (const event of db.events || []) {
        if (event.userId === req.user.id || (event.projectId && projectIds.has(event.projectId))) {
          events.push({ ...event, source: 'workspace' });
        }
      }
      for (const invoice of db.invoices || []) {
        if (invoice.userId === req.user.id) {
          events.push({
            id: invoice.id, type: 'billing.invoice.paid', at: invoice.createdAt, source: 'billing',
            detail: `${invoice.number} · $${(invoice.amount / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`,
            userId: req.user.id, invoiceId: invoice.id,
          });
        }
      }
      const revenue = ensureRevenue(req.user);
      for (const event of revenue.events || []) {
        events.push({ ...event, source: 'revenue', userId: req.user.id });
      }
      events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      return ok(res, {
        events: events.slice(0, 200),
        total: events.length,
        counts: events.reduce((acc, event) => { acc[event.source] = (acc[event.source] || 0) + 1; return acc; }, {}),
      });
    }

    /* ------------------------ admin operations (owner only) */
    const adminEmail = (process.env.KILN_ADMIN_EMAIL || 'bidyut.banerjee@gmail.com').toLowerCase();
    const isAdmin = req.user.email === adminEmail;
    if (pathname === '/api/leads' && method === 'GET') {
      if (!isAdmin) return fail(res, 403, 'Owner access required.');
      return ok(res, { leads: (db.leads || []).slice(0, 200), total: (db.leads || []).length });
    }
    if (pathname === '/api/analytics/summary' && method === 'GET') {
      if (!isAdmin) return fail(res, 403, 'Owner access required.');
      const counts = {};
      for (const event of db.analytics || []) counts[event.event] = (counts[event.event] || 0) + 1;
      return ok(res, { counts, leads: (db.leads || []).length, recent: (db.analytics || []).slice(-50).reverse() });
    }


    if (pathname === '/api/revenue' && method === 'GET') {
      const revenue = ensureRevenue(req.user);
      return ok(res, { revenue });
    }

    if (pathname === '/api/revenue/run' && method === 'POST') {
      const revenue = ensureRevenue(req.user);
      const run = runRevenueCycle(revenue);
      return ok(res, { revenue, run });
    }

    const revenueApprovalMatch = pathname.match(/^\/api\/revenue\/approvals\/([^/]+)\/decision$/);
    if (revenueApprovalMatch && method === 'POST') {
      const revenue = ensureRevenue(req.user);
      const approval = (revenue.approvals || []).find((a) => a.id === revenueApprovalMatch[1]);
      if (!approval) return fail(res, 404, 'Approval not found.');
      if (approval.status !== 'pending') return fail(res, 409, 'This approval has already been decided.');
      const body = await readBody(req);
      const decision = String(body.decision || '').toLowerCase();
      if (decision !== 'approve' && decision !== 'reject') return fail(res, 400, 'Decision must be approve or reject.');
      if (typeof body.draft === 'string') approval.draft = cleanText(body.draft, 6000);
      approval.decidedBy = req.user.name;
      approval.decidedById = req.user.id;
      approval.decidedAt = now();
      approval.note = cleanText(body.note, 1000);
      approval.status = decision === 'approve' ? 'approved' : 'rejected';
      const evidenceLine = Array.isArray(approval.evidence) && approval.evidence.length
        ? approval.evidence.map((e) => `${e.label}: ${e.value}`).join(' · ')
        : 'Evidence attached to approval.';
      revenue.events.unshift({
        id: uid('evt'), at: approval.decidedAt, actor: req.user.name, agentId: approval.agentId,
        type: decision === 'approve' ? 'approval.approved' : 'approval.rejected',
        summary: approval.title + (decision === 'approve' ? ' approved for simulated release.' : ' rejected by a named human.'),
        evidence: evidenceLine, decision,
      });
      if (decision === 'approve') {
        approval.releasedAt = now();
        revenue.events.unshift({
          id: uid('evt'), at: approval.releasedAt, actor: 'Connector', agentId: approval.agentId,
          type: 'release.simulated', summary: approval.release + ' released in simulation only.',
          evidence: 'No external system was contacted.', decision: 'simulated',
        });
      }
      recalcRevenue(revenue);
      save();
      return ok(res, { revenue, approval });
    }

    /* ------------------------ projects */
    if (pathname === '/api/projects' && method === 'POST') {
      rateLimit(req, 'project-create', { identity: req.user.id, limit: 30, windowMs: 60 * 60 * 1000 });
      identity.assertPermission(req.user, 'write', identity.ownerIdFor(req.user));
      billing.assertProjectLimit(req.user);
      const body = await readBody(req);
      const idea = cleanText(body.idea, 2500);
      const tier = body.tier === undefined || body.tier === '' ? 'small' : String(body.tier);
      const model = MODELS.find((m) => m.id === body.model) || MODELS[0];
      if (idea.length < 24) return fail(res, 400, 'Give the idea a little more shape — at least 24 characters.');
      if (idea.length > 2500) return fail(res, 400, 'Please keep the brief under 2,500 characters.');
      billing.assertTierAllowed(req.user, tier);
      const cost = 1200 + billing.estimateTokens(idea);
      const quota = billing.assertQuota(req.user, cost, 'project generation');
      const project = {
        id: uid('prj'), userId: req.user.id,
        name: cleanLabel(body.name, 80) || '',
        idea, tier, model: model.id, modelName: model.name,
        ownerName: req.user.name, createdAt: now(), updatedAt: now(), revision: 1,
        envs: {}, industry: cleanLabel(body.industry, 80),
      };
      project.codename = buildCodename(project);
      if (!project.name) project.name = `${project.codename} ${project.tier === 'small' ? 'Build' : 'Programme'}`;
      db.projects.push(project);
      addMessage(project, 'assistant', `Sandbox ready. I am ${project.codename}, a **${TIERS[tier].label}** workspace running **${model.name}**.\n\nI have captured your brief and inferred ${projectContext(project).features.length} candidate capabilities in ${projectContext(project).domain.label.toLowerCase()}.\n\nI will start with an **ideation artifact** so we have a wedge, a market view and kill criteria. Then ask me for discovery, architecture, testing, proposals or say **"generate all"**.`);
      const artifact = createArtifact(project, 'ideation', `Initial brief: ${idea}`, 1);
      addMessage(project, 'assistant', artifactReply(artifact, project), { artifactId: artifact.id, functionKey: 'ideation' });
      db.events.push({ id: uid('evt'), type: 'project.created', projectId: project.id, userId: req.user.id, at: now(), detail: project.name });
      billing.recordUsage(req.user, quota.requested, 'project.ideation', { projectId: project.id });
      platform.emitEvent(project.userId, 'project.created', { id: project.id, name: project.name, tier: project.tier, model: project.model });
      save();
      return send(res, 201, workspace(project), { 'Cache-Control': 'no-store', 'X-Token-Quota': `${req.user.billing.tokensUsed}/${req.user.billing.tokenQuota}` });
    }

    if (pathname === '/api/projects' && method === 'GET') {
      return ok(res, { projects: db.projects.filter((p) => identity.canAccessProject(req.user, p)).map(projectSummary) });
    }

    const projectMatch = pathname.match(/^\/api\/projects\/(prj_[a-f0-9-]+)(\/[a-z-]+)?(\/[a-z0-9_-]+)?$/);
    if (projectMatch) {
      const [, projectId, action, sub] = projectMatch;
      const project = projectFor(req.user, projectId);
      if (!project) return fail(res, 404, 'Project not found.');

      if (action === '/comments' && method === 'GET') {
        return ok(res, { comments: platform.listComments(project.id), role: identity.roleFor(req.user, project.userId) });
      }

      if (action === '/comments' && method === 'POST') {
        identity.assertPermission(req.user, 'write', project.userId);
        const body = await readBody(req);
        const comment = platform.addComment(project, req.user, body.body || body.comment || '');
        recordEvent('collaboration.comment.created', 'Comment added to workspace', { userId: req.user.id, projectId: project.id });
        save();
        return send(res, 201, { comment });
      }

      if (action === '/comments' && sub && method === 'DELETE') {
        const removed = platform.deleteComment(project, req.user, sub.slice(1));
        if (!removed) return fail(res, 404, 'Comment not found.');
        return ok(res, { removed: true });
      }

      if (!action && method === 'GET') return ok(res, { ...workspace(project), role: identity.roleFor(req.user, project.userId) });

      if (!action && method === 'PATCH') {
        identity.assertPermission(req.user, 'write', project.userId);
        const body = await readBody(req);
        if (body.name !== undefined) project.name = cleanLabel(body.name, 80);
        if (body.tier !== undefined) {
          const tier = String(body.tier);
          if (!TIERS[tier]) return fail(res, 400, 'Choose a valid project tier: small, smb, or enterprise.');
          billing.assertTierAllowed(req.user, tier);
          project.tier = tier;
        }
        if (body.model !== undefined) {
          const model = MODELS.find((m) => m.id === body.model);
          if (!model) return fail(res, 400, 'Choose a valid model.');
          project.model = model.id;
          project.modelName = model.name;
        }
        if (body.idea !== undefined) {
          const idea = cleanText(body.idea, 2500);
          if (idea.length < 24) return fail(res, 400, 'Give the idea a little more shape — at least 24 characters.');
          project.idea = idea;
        }
        project.updatedAt = now();
        db.artifacts.filter((a) => a.projectId === project.id).forEach((a) => { a.project.tierLabel = TIERS[project.tier].label; a.project.modelName = project.modelName; });
        save();
        return ok(res, workspace(project));
      }

      if (action === '/sandbox' && method === 'GET') {
        const sandbox = buildSandbox(project);
        return ok(res, sandbox);
      }

      if (action === '/chat' && method === 'POST') {
        rateLimit(req, 'chat', { identity: req.user.id, limit: 40, windowMs: 60 * 1000, blockMs: 60 * 1000 });
        identity.assertPermission(req.user, 'generate', project.userId);
        billing.assertTierAllowed(req.user, project.tier);
        const body = await readBody(req);
        const text = cleanText(body.message, 4000);
        if (!text) return fail(res, 400, 'Message is empty.');
        if (text.length > 4000) return fail(res, 400, 'Message too long.');
        const artifacts = db.artifacts.filter((a) => a.projectId === project.id);
        const result = respond(project, text, artifacts);
        const missingCount = result.runAll
          ? FUNCTIONS.filter((fn) => !db.artifacts.some((a) => a.projectId === project.id && a.functionKey === fn.key)).length
          : result.functionKey ? 1 : 0;
        const cost = 500 + billing.estimateTokens(text) + missingCount * 900;
        const quota = billing.assertQuota(req.user, cost, 'chat generation');
        const userMessage = addMessage(project, 'user', text);
        let reply = result.reply;
        let artifact = null;
        let generated = [];

        if (result.runAll) {
          FUNCTIONS.forEach((fn) => {
            const exists = db.artifacts.some((a) => a.projectId === project.id && a.functionKey === fn.key);
            if (!exists) generated.push(createArtifact(project, fn.key, text));
          });
          reply = generated.length
            ? `Completed **${generated.length}** workstreams: ${generated.map((a) => `${a.functionName} (r${a.revision})`).join(', ')}.\n\nAll were seeded with your brief and the ${TIERS[project.tier].label} profile. Every output is a draft until approved.`
            : 'All twelve workstreams already exist. Open any card in **Workstreams** to regenerate at a new revision, or click **Download delivery pack** to get every export.';
        } else if (result.functionKey) {
          artifact = createArtifact(project, result.functionKey, text);
          reply = `${reply}\n\n${artifactReply(artifact, project)}`;
        }

        const assistant = addMessage(project, 'assistant', reply, artifact ? { artifactId: artifact.id, functionKey: artifact.functionKey } : {});
        project.updatedAt = now();
        billing.recordUsage(req.user, quota.requested, missingCount ? 'chat.workstreams' : 'chat', { projectId: project.id, artifacts: generated.length || (artifact ? 1 : 0) });
        save();
        return ok(res, { messages: [userMessage, assistant], artifacts: generated.length ? generated : artifact ? [artifact] : [], project: projectSummary(project), usage: { used: req.user.billing.tokensUsed, quota: req.user.billing.tokenQuota } });
      }

      if (action === '/run' && method === 'POST') {
        rateLimit(req, 'workstream-run', { identity: req.user.id, limit: 60, windowMs: 60 * 1000 });
        identity.assertPermission(req.user, 'generate', project.userId);
        billing.assertTierAllowed(req.user, project.tier);
        const body = await readBody(req);
        const functionKey = String(body.functionKey || '');
        if (!FUNCTIONS.some((f) => f.key === functionKey)) return fail(res, 400, 'Unknown workstream.');
        const instruction = cleanText(body.instruction, 2000);
        const quota = billing.assertQuota(req.user, 900 + billing.estimateTokens(instruction), 'workstream generation');
        const artifact = createArtifact(project, functionKey, instruction);
        addMessage(project, 'assistant', `Generated **${artifact.functionName}** (r${artifact.revision}) for ${project.name}. ${artifact.formats.map((f) => f.toUpperCase()).join(' / ')} available. It is a draft pending human approval.`, { artifactId: artifact.id, functionKey });
        project.updatedAt = now();
        billing.recordUsage(req.user, quota.requested, 'workstream', { projectId: project.id, functionKey });
        save();
        return ok(res, { artifact, project: projectSummary(project), usage: { used: req.user.billing.tokensUsed, quota: req.user.billing.tokenQuota } });
      }

      if (action === '/run-all' && method === 'POST') {
        rateLimit(req, 'workstream-run-all', { identity: req.user.id, limit: 10, windowMs: 60 * 1000 });
        identity.assertPermission(req.user, 'generate', project.userId);
        billing.assertTierAllowed(req.user, project.tier);
        const missing = FUNCTIONS.filter((fn) => !db.artifacts.some((a) => a.projectId === project.id && a.functionKey === fn.key));
        const quota = billing.assertQuota(req.user, 500 + missing.length * 900, 'full workstream generation');
        const generated = [];
        missing.forEach((fn) => {
          generated.push(createArtifact(project, fn.key, 'Full workstream sweep'));
        });
        project.updatedAt = now();
        addMessage(project, 'assistant', generated.length
          ? `Generated ${generated.length} missing workstreams: ${generated.map((a) => a.functionName).join(', ')}. All are drafts and require review.`
          : 'All twelve workstreams already exist. Regenerate individual cards to create a new revision.');
        billing.recordUsage(req.user, quota.requested, 'workstream.sweep', { projectId: project.id, count: generated.length });
        save();
        return ok(res, { generated, project: projectSummary(project), usage: { used: req.user.billing.tokensUsed, quota: req.user.billing.tokenQuota } });
      }

      if (action === '/deploy' && method === 'POST') {
        rateLimit(req, 'deployment', { identity: req.user.id, limit: 30, windowMs: 60 * 1000 });
        identity.assertPermission(req.user, 'deploy', project.userId);
        billing.assertTierAllowed(req.user, project.tier);
        const body = await readBody(req);
        if (!['dev', 'test', 'prod'].includes(body.env)) return fail(res, 400, 'Environment must be dev, test, or prod.');
        const env = body.env;
        if (env === 'prod') {
          if (!billing.canShipProduction(req.user)) {
            return fail(res, 402, 'Production shipping requires an active paid plan from a verified billing record. Prototype and test for free, then upgrade when you are ready to ship.', {
              code: 'PAID_PLAN_REQUIRED', upgradeUrl: '/app?view=billing',
            });
          }
          if (!requireVerified(req, res, 'shipping to production')) return;
        }
        const index = db.deployments.filter((d) => d.projectId === project.id).length;
        const dep = deployment(project, env, index);
        dep.projectId = project.id;
        if (env === 'prod') {
          dep.status = 'awaiting_approval';
        } else {
          project.envs = project.envs || {};
          project.envs[env] = { version: dep.version, at: now(), status: dep.status };
        }
        db.deployments.push(dep);
        addMessage(project, 'assistant', `Deployment **${dep.version}** to **${env.toUpperCase()}** ${env === 'prod' ? 'is waiting for your approval. Review the generated tests and gates, then approve promotion.' : `completed with ${dep.testsPassed}/${dep.testsTotal} generated tests passing.`}`, { deploymentId: dep.id });
        db.events.push({ id: uid('evt'), type: 'deployment.created', projectId: project.id, userId: req.user.id, at: now(), detail: `${env} ${dep.version}` });
        platform.emitEvent(project.userId, 'deployment.created', { id: dep.id, projectId: project.id, env, version: dep.version, status: dep.status });
        project.updatedAt = now();
        save();
        return ok(res, { deployment: dep, project: projectSummary(project) });
      }

      if (action === '/consultation' && method === 'POST') {
        rateLimit(req, 'consultation', { identity: req.user.id, limit: 6, windowMs: 60 * 60 * 1000 });
        identity.assertPermission(req.user, 'write', project.userId);
        const body = await readBody(req);
        const topic = cleanText(body.topic, 240);
        if (topic.length < 8) return fail(res, 400, 'Describe what you want the FDE to focus on.');
        const ctx = projectContext(project);
        const rng = new Rng(`${ctx.seed}:consult:${Date.now()}`);
        const fde = `${rng.pick(['Priya', 'Jonas', 'Elena', 'Marcus', 'Nadia'])} ${rng.pick(['Raman', 'Berg', 'Okafor', 'Lindqvist', 'Haddad'])}`;
        const podRoles = rng.picks(['Solution architect', 'Data engineer', 'Security lead', 'Delivery manager', 'QA lead'], 3);
        const pod = rng.pick(['Applied AI pod', 'Data platform pod', 'Secure delivery pod']);
        const consultation = {
          id: uid('con'), projectId: project.id, topic, notes: cleanText(body.notes, 2000),
          focus: Array.isArray(body.focus) ? body.focus.slice(0, 6).map((item) => cleanLabel(item, 80)) : [],
          preferredSlot: cleanLabel(body.preferredSlot || body.slot, 80),
          status: 'scheduled', createdAt: now(), fde, pod: podRoles,
          routing: { pod, owner: fde, queue: 'fde-consultations', slaHours: 4 },
          scheduledFor: new Date(Date.now() + rng.int(2, 6) * 86400000).toISOString().slice(0, 10),
          brief: [
            { title: 'Objectives', items: [`Validate the ${ctx.features[0].name.toLowerCase()} wedge with a named FDE`, `Assess ${ctx.domain.integrations[0]} integration readiness`, `Agree pilot success thresholds and guardrails`] },
            { title: 'Preparation', items: ['Share architecture and access constraints', 'Name a product owner and data owner', 'Bring one real workflow sample (redacted)'] },
            { title: 'Expected outputs', items: ['FDE assessment with confidence levels', 'Risk register and open questions', 'Scoped delivery options and estimate'] },
          ],
        };
        db.consultations.push(consultation);
        recordEvent('consultation.scheduled', `${consultation.scheduledFor} with ${fde}`, { userId: req.user.id, projectId: project.id, pod });
        addMessage(project, 'assistant', `FDE consultation booked for **${consultation.scheduledFor}** with **${consultation.fde}** (${consultation.pod.join(', ')}). Routed to the ${pod} with a 4-hour SLA. A brief has been added to the FDE section. Nothing is committed until you confirm the session.`);
        save();
        return ok(res, { consultation });
      }

      if (action === '/collateral' && method === 'POST') {
        identity.assertPermission(req.user, 'write', project.userId);
        const body = await readBody(req);
        const type = ['one-pager', 'battlecard', 'case-study', 'architecture-brief', 'exec-summary', 'faq'].includes(body.type) ? body.type : 'one-pager';
        const collateral = buildCollateral(project, type);
        db.collaterals.push(collateral);
        save();
        return ok(res, { collateral });
      }

      if (action === '/pack' && method === 'GET') {
        const artifacts = db.artifacts.filter((a) => a.projectId === project.id);
        if (!artifacts.length) return fail(res, 400, 'Generate at least one workstream first.');
        const sandbox = buildSandbox(project);
        const pack = deliveryPack(project, artifacts, sandbox);
        return send(res, 200, pack.buffer, {
          'Content-Type': pack.mime,
          'Content-Disposition': `attachment; filename="${pack.filename}"`,
          'Content-Length': pack.buffer.length,
        });
      }
    }

    /* ------------------------ deployments */
    const depMatch = pathname.match(/^\/api\/projects\/(prj_[a-f0-9-]+)\/deployments\/(dep_[a-f0-9-]+)\/(approve|reject)$/);
    if (depMatch && method === 'POST') {
      const [, projectId, depId, decision] = depMatch;
      const project = projectFor(req.user, projectId);
      if (!project) return fail(res, 404, 'Project not found.');
      identity.assertPermission(req.user, 'deploy', project.userId);
      const dep = db.deployments.find((d) => d.id === depId && d.projectId === project.id);
      if (!dep) return fail(res, 404, 'Deployment not found.');
      if (dep.status !== 'awaiting_approval') return fail(res, 409, 'This deployment is not awaiting approval.');
      if (decision === 'approve') {
        dep.status = 'deployed';
        dep.approvedBy = req.user.name;
        dep.approvedAt = now();
        dep.stages = dep.stages.map((s) => s.name === 'Production approval' ? { ...s, status: 'pass', detail: `Approved by ${req.user.name}` } : s);
        project.envs = project.envs || {};
        project.envs.prod = { version: dep.version, at: now(), status: 'deployed', approvedBy: req.user.name };
        addMessage(project, 'assistant', `Production promotion **${dep.version}** approved by **${req.user.name}**. Evidence record written. ${dep.testsTotal - dep.testsPassed ? 'Note: unresolved generated test failures remain in the record.' : 'All generated tests passed.'}`);
      } else {
        dep.status = 'rejected';
        dep.rejectedBy = req.user.name;
        dep.rejectedAt = now();
        addMessage(project, 'assistant', `Production promotion **${dep.version}** was rejected by **${req.user.name}**. The stable revision remains live and the evidence record is preserved.`);
      }
      project.updatedAt = now();
      platform.emitEvent(project.userId, 'deployment.approved', { id: dep.id, projectId: project.id, status: dep.status, approvedBy: dep.approvedBy || null, rejectedBy: dep.rejectedBy || null });
      save();
      return ok(res, { deployment: dep, project: projectSummary(project) });
    }

    /* ------------------------ artifacts */
    const artMatch = pathname.match(/^\/api\/artifacts\/(art_[a-f0-9-]+)(\/approve|\/reopen|\/export)?$/);
    if (artMatch) {
      const [, artifactId, action] = artMatch;
      const artifact = artifactFor(req.user, artifactId);
      if (!artifact) return fail(res, 404, 'Artifact not found.');
      const project = db.projects.find((p) => p.id === artifact.projectId);

      if (!action && method === 'GET') return ok(res, { artifact, history: db.artifacts.filter((a) => a.projectId === artifact.projectId && a.functionKey === artifact.functionKey).sort((a, b) => b.revision - a.revision) });

      if (action === '/approve' && method === 'POST') {
        identity.assertPermission(req.user, 'write', project.userId);
        artifact.status = 'approved';
        artifact.approvedBy = req.user.name;
        artifact.approvedAt = now();
        db.events.push({ id: uid('evt'), type: 'artifact.approved', projectId: project.id, userId: req.user.id, at: now(), detail: `${artifact.functionName} r${artifact.revision}` });
        save();
        return ok(res, { artifact });
      }

      if (action === '/reopen' && method === 'POST') {
        identity.assertPermission(req.user, 'write', project.userId);
        artifact.status = 'draft';
        artifact.approvedBy = null;
        artifact.approvedAt = null;
        save();
        return ok(res, { artifact });
      }

      if (action === '/export' && method === 'GET') {
        const format = String(url.searchParams.get('format') || 'pdf').toLowerCase();
        if (!artifact.formats.includes(format)) return fail(res, 400, `Format ${format} is not available for this artifact.`);
        const out = exportArtifact(artifact, format);
        return send(res, 200, out.buffer, {
          'Content-Type': out.mime,
          'Content-Disposition': `attachment; filename="${out.filename}"`,
          'Content-Length': out.buffer.length,
        });
      }
    }

    /* ------------------------ collaterals */
    const colMatch = pathname.match(/^\/api\/collaterals\/(col_[a-f0-9-]+)(\/approve|\/export)?$/);
    if (colMatch) {
      const [, colId, action] = colMatch;
      const collateral = db.collaterals.find((c) => c.id === colId);
      if (!collateral) return fail(res, 404, 'Collateral not found.');
      const project = projectFor(req.user, collateral.projectId);
      if (!project) return fail(res, 404, 'Collateral not found.');
      if (!action) return ok(res, { collateral });
      if (action === '/approve' && method === 'POST') {
        identity.assertPermission(req.user, 'write', project.userId);
        collateral.status = 'approved';
        collateral.approvedBy = req.user.name;
        collateral.approvedAt = now();
        save();
        return ok(res, { collateral });
      }
      if (action === '/export' && method === 'GET') {
        const format = String(url.searchParams.get('format') || 'pdf').toLowerCase();
        const out = exportArtifact(collateral, format);
        return send(res, 200, out.buffer, { 'Content-Type': out.mime, 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Content-Length': out.buffer.length });
      }
    }

    /* ------------------------ blueprint */
    if (pathname === '/api/blueprint' && method === 'GET') {
      const file = path.join(ROOT, 'docs', 'MASTER_PROMPT.md');
      if (!fs.existsSync(file)) return fail(res, 404, 'Blueprint not found.');
      return ok(res, { markdown: fs.readFileSync(file, 'utf8') });
    }

    if (pathname === '/api/blueprint/raw' && method === 'GET') {
      const file = path.join(ROOT, 'docs', 'MASTER_PROMPT.md');
      if (!fs.existsSync(file)) return fail(res, 404, 'Blueprint not found.');
      const markdown = fs.readFileSync(file, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Length': Buffer.byteLength(markdown),
        'Cache-Control': 'private, no-store',
        ...securityHeaders(),
      });
      return res.end(markdown);
    }

    if (pathname === '/api/health') return ok(res, { ok: true, service: 'kiln' });

    return fail(res, 404, 'Not found');
  } catch (error) {
    console.error(`${method} ${pathname}`, error);
    if (!res.headersSent) {
      const extra = {};
      for (const key of ['code', 'upgradeUrl', 'requiredPlan', 'usage']) {
        if (error[key] !== undefined) extra[key] = error[key];
      }
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      fail(res, error.status || 500, error.status ? error.message : 'Something went wrong on our side.', extra);
    }
  }
}

/* Serialize mutating API traffic per instance. Vercel may run several
   instances, but a single instance must never apply a stale Blob snapshot over
   a request it is still writing. Cross-instance writes use Blob ETags. */
let requestQueue = Promise.resolve();

async function handler(req, res) {
  let pathname = '';
  try { pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname; } catch (_) { /* fall through */ }
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/docs/')) return handleRequest(req, res);

  const previous = requestQueue;
  let release;
  requestQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await handleRequest(req, res);
  } finally {
    try { await flush(); } catch (error) { console.error('Final persistence failed:', error.message); }
    release();
  }
}

const server = http.createServer(handler);

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`\n  Kiln is running → http://${HOST}:${PORT}`);
    console.log(`  Console         → http://${HOST}:${PORT}/app`);
    console.log(`  Mobile app      → http://${HOST}:${PORT}/mobile`);
    console.log(`  Demo login      → demo@kiln.studio / KilnDemo2026!\n`);
  });

  process.on('SIGINT', () => { flush(); server.close(() => process.exit(0)); });
  process.on('SIGTERM', () => { flush(); server.close(() => process.exit(0)); });
  process.on('uncaughtException', (error) => { console.error('Uncaught:', error); flush(); });
}

module.exports = handler;
module.exports.handler = handler;
module.exports.server = server;
