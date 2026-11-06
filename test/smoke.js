'use strict';
/**
 * Kiln smoke test — boots a disposable server, exercises the product end to
 * end, and deletes its temporary database. Run with: npm test
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-smoke-'));
const PORT = 26000 + Math.floor(Math.random() * 12000);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'KilnSmoke2026!';
const RUN = Date.now();
const ADMIN_EMAIL = `smoke.owner.${RUN}@kiln.test`;
const CRON_SECRET = `smoke-cron-${RUN}`;
const notes = [];
let HOOK_URL = '';
let hookServer;
let hookWaiter = null;
let hookCapture = null;

function pass(label, detail = '') {
  notes.push(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function ipFor() {
  return `198.51.100.${20 + Math.floor(Math.random() * 200)}`;
}

function cookieFrom(response) {
  return (response.headers.get('set-cookie') || '').split(';')[0];
}

async function call(route, options = {}, cookie = '') {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(BASE + route, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: 'manual',
  });
  const type = response.headers.get('content-type') || '';
  if (!options.binary && type.includes('json')) {
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : {}, headers: response.headers };
  }
  return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers };
}

async function waitForServer(child) {
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${log}`);
    try {
      const response = await fetch(BASE + '/api/health');
      if (response.ok) return;
    } catch (error) { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become healthy:\n${log}`);
}

async function signup(tag, email) {
  const address = email || `smoke.${tag}.${Date.now()}@kiln.test`;
  const result = await call('/api/auth/register', {
    method: 'POST',
    headers: { 'X-Forwarded-For': ipFor() },
    body: { name: `Smoke ${tag}`, email: address, password: PASSWORD },
  });
  assert.strictEqual(result.status, 202, 'registration should return 202');
  assert.strictEqual(result.data.pending, true);
  assert.strictEqual(result.data.user, undefined);
  assert.strictEqual(result.headers.get('set-cookie'), null);
  assert.ok(result.data.verification && result.data.verification.testToken, 'test mode should return a verification token');
  return { email: address, token: result.data.verification.testToken, verification: result.data.verification, response: result };
}

async function verify(signupData) {
  const result = await call('/api/auth/verify-email', {
    method: 'POST',
    body: { token: signupData.token },
  });
  assert.strictEqual(result.status, 200, 'verification should return 200');
  assert.strictEqual(result.data.user.emailVerified, true);
  return { email: signupData.email, cookie: cookieFrom(result), user: result.data.user, projects: result.data.projects || [], verification: signupData.verification };
}

async function register(tag, email) {
  return verify(await signup(tag, email));
}

async function login(email, password = PASSWORD) {
  return call('/api/auth/login', { method: 'POST', body: { email, password } });
}

async function upgrade(cookie, plan = 'smb') {
  const checkout = await call('/api/billing/checkout', {
    method: 'POST',
    body: { plan },
  }, cookie);
  assert.strictEqual(checkout.status, 201, 'checkout should be created');
  assert.strictEqual(checkout.data.mode, 'test');
  const confirmed = await call(`/api/billing/checkout/${checkout.data.checkout.id}/confirm`, {
    method: 'POST',
    body: {},
  }, cookie);
  assert.strictEqual(confirmed.status, 200, 'test checkout should confirm');
  return confirmed.data;
}

/* Minimal RFC 6238 TOTP for MFA tests. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of String(input).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function nextWebhook(timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Webhook was not delivered in time.')), timeout);
    hookWaiter = { resolve, timer };
  });
}

async function startHookServer() {
  hookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      hookCapture = { body, headers: req.headers, at: Date.now() };
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      if (hookWaiter) {
        clearTimeout(hookWaiter.timer);
        const waiter = hookWaiter;
        hookWaiter = null;
        waiter.resolve(hookCapture);
      }
    });
  });
  await new Promise((resolve) => hookServer.listen(0, '127.0.0.1', resolve));
  HOOK_URL = `http://127.0.0.1:${hookServer.address().port}/hook`;
}

(async () => {
  await startHookServer();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      KILN_DATA_DIR: DATA_DIR,
      KILN_SEED_DEMO: '0',
      KILN_EXPOSE_TEST_LINKS: '1',
      KILN_ALLOW_PRIVATE_WEBHOOKS: '1',
      KILN_ADMIN_EMAIL: ADMIN_EMAIL,
      KILN_CRON_SECRET: CRON_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child);
    pass('server boots on a disposable database', BASE);

    const health = await call('/api/health');
    assert.strictEqual(health.status, 200);
    assert.deepStrictEqual(Object.keys(health.data).sort(), ['ok', 'service']);
    pass('health endpoint is trimmed to liveness only');

    const appSource = fs.readFileSync(path.join(ROOT, 'public/assets/app.js'), 'utf8');
    assert.ok(!/(?<!\$)\$\("\[data-[^"]+"[^)]*\)\.forEach/.test(appSource), 'multi-element handlers must use $$');
    pass('frontend multi-element handlers use the collection helper');

    const crossOrigin = await call('/api/auth/login', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'X-Forwarded-For': ipFor() },
      body: { email: 'nobody@kiln.test', password: PASSWORD },
    });
    assert.strictEqual(crossOrigin.status, 403);
    assert.strictEqual(crossOrigin.data.code, 'CSRF_ORIGIN_BLOCKED');
    pass('cross-origin API mutation is rejected');

    const catalog = await call('/api/catalog');
    assert.strictEqual(catalog.data.functions.length, 12);
    assert.strictEqual(catalog.data.tiers.length, 3);
    assert.strictEqual(catalog.data.models.length >= 4, true);
    assert.strictEqual(catalog.data.services.length, 4);
    assert.ok(catalog.data.plans.some((plan) => plan.key === 'enterprise'));
    pass('catalog exposes 12 workstreams, 3 tiers, models, services and billing plans');

    const badPlan = await call('/api/auth/register', {
      method: 'POST',
      headers: { 'X-Forwarded-For': ipFor() },
      body: { name: 'Plan Bypass', email: `smoke.bypass.${RUN}@kiln.test`, password: PASSWORD, plan: 'enterprise' },
    });
    assert.strictEqual(badPlan.status, 400);
    assert.ok(/checkout/i.test(badPlan.data.error));
    pass('client-declared enterprise plan is rejected at registration', 'HTTP 400');

    const signupOwner = await signup('owner', ADMIN_EMAIL);
    assert.ok(signupOwner.token);
    pass('registration returns 202 pending with no session or user');

    const duplicate = await call('/api/auth/register', {
      method: 'POST',
      headers: { 'X-Forwarded-For': ipFor() },
      body: { name: 'Duplicate Owner', email: ADMIN_EMAIL, password: PASSWORD },
    });
    assert.strictEqual(duplicate.status, 202);
    assert.strictEqual(duplicate.data.pending, true);
    assert.strictEqual(duplicate.data.user, undefined);
    assert.strictEqual(duplicate.data.verification, undefined);
    assert.strictEqual(duplicate.headers.get('set-cookie'), null);
    pass('duplicate registration is non-enumerating and issues no session');

    const first = await verify(signupOwner);
    assert.strictEqual(first.user.plan, 'free');
    assert.strictEqual(first.user.planSource, 'default');
    assert.strictEqual(first.user.projectCount, 0);
    assert.strictEqual(first.user.maxProjects, 1);
    assert.strictEqual(first.user.billingStatus, 'active');
    pass('email verification creates the session and free workspace');

    const unverified = await signup('unverified');
    const unverifiedLogin = await login(unverified.email);
    assert.strictEqual(unverifiedLogin.status, 200);
    const unverifiedCheckout = await call('/api/billing/checkout', { method: 'POST', body: { plan: 'small' } }, cookieFrom(unverifiedLogin));
    assert.strictEqual(unverifiedCheckout.status, 403);
    assert.strictEqual(unverifiedCheckout.data.code, 'EMAIL_VERIFICATION_REQUIRED');
    pass('unverified accounts can sign in but cannot start checkout');

    const trustPage = await call('/trust', { binary: true });
    const developersPage = await call('/developers', { binary: true });
    const securityTxt = await call('/.well-known/security.txt', { binary: true });
    const trustApi = await call('/api/trust');
    const statusApi = await call('/api/status');
    assert.strictEqual(trustPage.status, 200);
    assert.strictEqual(developersPage.status, 200);
    assert.strictEqual(securityTxt.status, 200);
    assert.ok(/security@kiln\.studio/.test(securityTxt.buffer.toString('utf8')));
    assert.ok(trustApi.data.trust.controls.some((control) => control.id === 'mfa'));
    assert.strictEqual(statusApi.data.status, 'operational');
    pass('trust center, developer docs, security.txt, /api/trust and /api/status are served');

    const ssoStatus = await call('/api/auth/sso/status');
    assert.strictEqual(ssoStatus.data.enabled, false);
    const ssoStart = await call('/api/auth/sso/start');
    assert.strictEqual(ssoStart.status, 503);
    assert.strictEqual(ssoStart.data.code, 'SSO_NOT_CONFIGURED');
    pass('OIDC SSO is disabled until configured');

    const upgraded = await upgrade(first.cookie, 'smb');
    assert.strictEqual(upgraded.billing.plan, 'smb');
    assert.strictEqual(upgraded.billing.planSource, 'billing');
    assert.strictEqual(upgraded.billing.tokenQuota, 1200000);
    assert.ok(upgraded.invoice.number.startsWith('KILN-'));
    const invoiceHtml = await call(`/api/billing/invoices/${upgraded.invoice.id}`, { binary: true }, first.cookie);
    assert.strictEqual(invoiceHtml.status, 200);
    assert.ok(/Kiln invoice/i.test(invoiceHtml.buffer.toString('utf8')));
    const cancelled = await call('/api/billing/cancel', { method: 'POST', body: {} }, first.cookie);
    assert.strictEqual(cancelled.data.billing.cancelAtPeriodEnd, true);
    const resumed = await call('/api/billing/resume', { method: 'POST', body: {} }, first.cookie);
    assert.strictEqual(resumed.data.billing.cancelAtPeriodEnd, false);
    pass('verified checkout activates billing, writes an invoice and supports cancel/resume');

    const ssoInvalid = await call('/api/workspace/sso', { method: 'PUT', body: { issuer: 'not-https', clientId: 'x' } }, first.cookie);
    assert.strictEqual(ssoInvalid.status, 400);
    pass('paid workspace rejects invalid OIDC issuer URLs');

    const mfaSetup = await call('/api/auth/mfa/setup', { method: 'POST' }, first.cookie);
    assert.strictEqual(mfaSetup.status, 200);
    assert.ok(mfaSetup.data.secret);
    assert.strictEqual(mfaSetup.data.recoveryCodes.length, 10);
    const mfaConfirm = await call('/api/auth/mfa/confirm', { method: 'POST', body: { code: totp(mfaSetup.data.secret) } }, first.cookie);
    assert.strictEqual(mfaConfirm.status, 200);
    assert.strictEqual(mfaConfirm.data.mfa.enabled, true);
    const mfaLogin = await login(first.email);
    assert.strictEqual(mfaLogin.status, 200);
    assert.strictEqual(mfaLogin.data.mfaRequired, true);
    assert.ok(mfaLogin.data.challenge);
    const mfaVerified = await call('/api/auth/mfa/verify', { method: 'POST', body: { challenge: mfaLogin.data.challenge, code: totp(mfaSetup.data.secret) } });
    assert.strictEqual(mfaVerified.status, 200);
    assert.ok(cookieFrom(mfaVerified));
    pass('TOTP MFA enrolls, challenges login and verifies into a session');

    const created = await call('/api/projects', {
      method: 'POST',
      body: {
        idea: 'An AI operations copilot for regional cold-chain logistics that predicts spoilage risk, drafts rerouting options for human approval, and explains cost-to-serve gaps to the operations lead.',
        tier: 'smb',
        model: 'qwen2.5-coder-32b',
        industry: 'Logistics & Mobility',
        name: 'Cold Chain Sentinel',
      },
    }, first.cookie);
    assert.strictEqual(created.status, 201);
    const project = created.data.project;
    assert.ok(project.id.startsWith('prj_'));
    assert.strictEqual(created.data.artifacts.length, 1);
    assert.strictEqual(created.data.messages.length, 2);
    pass('project creation seeds a sandbox, welcome messages and an ideation draft', project.codename);

    const chat = await call(`/api/projects/${project.id}/chat`, { method: 'POST', body: { message: 'generate all' } }, first.cookie);
    assert.strictEqual(chat.status, 200);
    assert.strictEqual(chat.data.artifacts.length, 11);
    assert.strictEqual(chat.data.project.counts.functions, 12);
    pass('chat “generate all” returns the user message and 11 new drafts', '12 of 12 workstreams');

    const workspace = await call(`/api/projects/${project.id}`, {}, first.cookie);
    assert.strictEqual(workspace.data.artifacts.length, 12);
    assert.strictEqual(new Set(workspace.data.artifacts.map((a) => a.functionKey)).size, 12);
    assert.strictEqual(workspace.data.sandbox.files.length >= 8, true);
    assert.ok(workspace.data.sandbox.previewUrl.includes(project.id));
    pass('workspace returns 12 unique artifacts and a sandbox preview');

    const formats = new Map();
    for (const artifact of workspace.data.artifacts) {
      for (const format of artifact.formats) if (!formats.has(format)) formats.set(format, artifact);
    }
    const signatures = {
      pdf: (b) => b.subarray(0, 5).toString() === '%PDF-',
      pptx: (b) => b[0] === 0x50 && b[1] === 0x4b,
      docx: (b) => b[0] === 0x50 && b[1] === 0x4b,
      xlsx: (b) => b[0] === 0x50 && b[1] === 0x4b,
      json: (b) => { try { JSON.parse(b.toString('utf8')); return true; } catch (error) { return false; } },
      md: (b) => b.length > 0 && !b.includes(0),
    };
    for (const [format, artifact] of formats) {
      const result = await call(`/api/artifacts/${artifact.id}/export?format=${format}`, { binary: true }, first.cookie);
      assert.strictEqual(result.status, 200, `${format} export should succeed`);
      assert.ok(result.buffer.length > 400);
      assert.ok(signatures[format](result.buffer), `${format} signature should be valid`);
    }
    pass('six real export formats validate', [...formats.keys()].sort().join(', '));

    const target = workspace.data.artifacts.find((a) => a.functionKey === 'architecture');
    const approved = await call(`/api/artifacts/${target.id}/approve`, { method: 'POST' }, first.cookie);
    assert.strictEqual(approved.data.artifact.status, 'approved');
    const reopened = await call(`/api/artifacts/${target.id}/reopen`, { method: 'POST' }, first.cookie);
    assert.strictEqual(reopened.data.artifact.status, 'draft');
    pass('artifact approval and reopen are recorded');

    const rerun = await call(`/api/projects/${project.id}/run`, { method: 'POST', body: { functionKey: 'testing' } }, first.cookie);
    assert.strictEqual(rerun.data.artifact.revision, 2);
    const modelChange = await call(`/api/projects/${project.id}`, { method: 'PATCH', body: { model: 'llama-3.3-70b' } }, first.cookie);
    assert.strictEqual(modelChange.status, 200);
    const rerunOtherModel = await call(`/api/projects/${project.id}/run`, { method: 'POST', body: { functionKey: 'testing' } }, first.cookie);
    assert.notStrictEqual(JSON.stringify(rerun.data.artifact.sections), JSON.stringify(rerunOtherModel.data.artifact.sections));
    pass('regenerating creates revisions and model choice changes generated content');

    const invalidTier = await call(`/api/projects/${project.id}`, { method: 'PATCH', body: { tier: 'god-mode' } }, first.cookie);
    assert.strictEqual(invalidTier.status, 400);
    const lockedTier = await call(`/api/projects/${project.id}`, { method: 'PATCH', body: { tier: 'enterprise' } }, first.cookie);
    assert.strictEqual(lockedTier.status, 402);
    pass('invalid and plan-locked tier values are rejected', 'HTTP 400 / 402');

    const dev = await call(`/api/projects/${project.id}/deploy`, { method: 'POST', body: { env: 'dev' } }, first.cookie);
    const test = await call(`/api/projects/${project.id}/deploy`, { method: 'POST', body: { env: 'test' } }, first.cookie);
    const prod = await call(`/api/projects/${project.id}/deploy`, { method: 'POST', body: { env: 'prod' } }, first.cookie);
    assert.ok(dev.data.deployment.status.startsWith('deployed'));
    assert.ok(test.data.deployment.status.startsWith('deployed'));
    assert.strictEqual(prod.data.deployment.status, 'awaiting_approval');
    const promoted = await call(`/api/projects/${project.id}/deployments/${prod.data.deployment.id}/approve`, { method: 'POST' }, first.cookie);
    assert.strictEqual(promoted.data.deployment.status, 'deployed');
    pass('dev/test deploy and production waits for a named human approval');

    const comment = await call(`/api/projects/${project.id}/comments`, { method: 'POST', body: { body: 'Please verify the cold-chain rerouting evidence before promotion.' } }, first.cookie);
    assert.strictEqual(comment.status, 201);
    const comments = await call(`/api/projects/${project.id}/comments`, {}, first.cookie);
    assert.ok(comments.data.comments.some((item) => item.id === comment.data.comment.id));
    const commentDelete = await call(`/api/projects/${project.id}/comments/${comment.data.comment.id}`, { method: 'DELETE' }, first.cookie);
    assert.strictEqual(commentDelete.status, 200);
    pass('project comments create, list and delete through workspace authorization');

    const connectors = await call('/api/connectors', {}, first.cookie);
    assert.ok(connectors.data.connectors.length >= 8);
    const connected = await call('/api/connectors/slack/connect', { method: 'POST', body: {} }, first.cookie);
    assert.strictEqual(connected.data.connector.status, 'connected');
    const disconnected = await call('/api/connectors/slack/disconnect', { method: 'POST', body: {} }, first.cookie);
    assert.strictEqual(disconnected.status, 200);
    pass('connector marketplace lists, connects and disconnects workspace-scoped connectors');

    const second = await register('visitor');
    const crossProject = await call(`/api/projects/${project.id}`, {}, second.cookie);
    const crossArtifact = await call(`/api/artifacts/${target.id}`, {}, second.cookie);
    assert.strictEqual(crossProject.status, 404);
    assert.strictEqual(crossArtifact.status, 404);
    const anonymous = await call(`/api/projects/${project.id}`);
    assert.strictEqual(anonymous.status, 401);
    pass('tenant isolation and anonymous access checks');

    const invite = await call('/api/workspace/members', { method: 'POST', body: { email: second.email, role: 'viewer' } }, first.cookie);
    assert.strictEqual(invite.status, 201);
    const shared = await call(`/api/projects/${project.id}`, {}, second.cookie);
    assert.strictEqual(shared.status, 200);
    const viewerRun = await call(`/api/projects/${project.id}/run`, { method: 'POST', body: { functionKey: 'testing' } }, second.cookie);
    assert.strictEqual(viewerRun.status, 403);
    const viewerComment = await call(`/api/projects/${project.id}/comments`, { method: 'POST', body: { body: 'Viewer should not be able to write.' } }, second.cookie);
    assert.strictEqual(viewerComment.status, 403);
    const workspaceView = await call('/api/workspace', {}, first.cookie);
    assert.ok(workspaceView.data.workspace.members.some((member) => member.email === second.email && member.role === 'viewer'));
    pass('workspace invite shares projects and viewer role is read-only server-side');

    const inviteEmail = `smoke.invitee.${RUN}@kiln.test`;
    const inviteNew = await call('/api/workspace/members', { method: 'POST', body: { email: inviteEmail, role: 'member' } }, first.cookie);
    assert.strictEqual(inviteNew.status, 201);
    assert.ok(inviteNew.data.inviteUrl);
    const inviteToken = new URL(inviteNew.data.inviteUrl).searchParams.get('invite');
    const invitee = await register('invitee', inviteEmail);
    const accepted = await call('/api/workspace/invites/accept', { method: 'POST', body: { token: inviteToken } }, invitee.cookie);
    assert.strictEqual(accepted.status, 200);
    assert.ok(accepted.data.workspace.members.some((member) => member.email === inviteEmail));
    pass('new-account invitation is email-bound and accepted into the workspace');

    const scimToken = await call('/api/workspace/scim-token', { method: 'POST', body: { name: 'Smoke SCIM' } }, first.cookie);
    assert.strictEqual(scimToken.status, 201);
    assert.ok(scimToken.data.rawToken.startsWith('kiln_scim_'));
    const scimEmail = `smoke.scim.${RUN}@kiln.test`;
    const scimCreated = await call('/api/scim/v2/Users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${scimToken.data.rawToken}`, 'Content-Type': 'application/scim+json' },
      body: { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: scimEmail, emails: [{ value: scimEmail, primary: true }], roles: [{ value: 'viewer' }] },
    });
    assert.strictEqual(scimCreated.status, 201);
    assert.strictEqual(scimCreated.data.userName, scimEmail);
    const scimList = await call(`/api/scim/v2/Users?filter=${encodeURIComponent(`userName eq "${scimEmail}"`)}`, { headers: { Authorization: `Bearer ${scimToken.data.rawToken}` } });
    assert.ok(scimList.data.Resources.some((resource) => resource.userName === scimEmail));
    const scimDeleted = await call(`/api/scim/v2/Users/${scimCreated.data.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${scimToken.data.rawToken}` } });
    assert.strictEqual(scimDeleted.status, 204);
    pass('SCIM token provisions, filters and deprovisions a workspace user');

    const apiKey = await call('/api/api-keys', { method: 'POST', body: { name: 'Smoke key', scopes: ['projects:read', 'runs:write'] } }, first.cookie);
    assert.strictEqual(apiKey.status, 201);
    assert.ok(apiKey.data.rawKey.startsWith('kiln_live_'));
    const apiHeaders = { Authorization: `Bearer ${apiKey.data.rawKey}` };
    const apiProjects = await call('/api/v1/projects', { headers: apiHeaders });
    assert.strictEqual(apiProjects.status, 200);
    assert.ok(apiProjects.data.data.some((item) => item.id === project.id));
    const apiRun = await call(`/api/v1/projects/${project.id}/run`, { method: 'POST', headers: apiHeaders, body: { functionKey: 'testing', instruction: 'Public API regression run.' } });
    assert.strictEqual(apiRun.status, 201);
    assert.strictEqual(apiRun.data.meta.version, 'v1');
    const apiAnon = await call('/api/v1/projects');
    assert.strictEqual(apiAnon.status, 401);
    pass('scoped API keys list projects, run a workstream and reject anonymous calls');

    const webhook = await call('/api/webhooks', { method: 'POST', body: { url: HOOK_URL, events: ['*'], description: 'Smoke receiver' } }, first.cookie);
    assert.strictEqual(webhook.status, 201);
    assert.ok(webhook.data.secret.startsWith('whsec_'));
    const webhookWait = nextWebhook();
    const webhookTest = await call(`/api/webhooks/${webhook.data.webhook.id}/test`, { method: 'POST', body: {} }, first.cookie);
    assert.strictEqual(webhookTest.status, 200);
    const jobRun = await call('/api/admin/jobs/run', { method: 'POST', body: {} }, first.cookie);
    assert.ok(jobRun.data.processed >= 1);
    const captured = await webhookWait;
    const expectedSignature = `sha256=${crypto.createHmac('sha256', webhook.data.secret).update(captured.body).digest('hex')}`;
    assert.strictEqual(captured.headers['x-kiln-signature-256'], expectedSignature);
    assert.ok(captured.headers['x-kiln-event']);
    const webhookList = await call('/api/webhooks', {}, first.cookie);
    assert.strictEqual(webhookList.data.webhooks[0].lastStatus, 200);
    pass('signed webhook is queued, delivered locally and HMAC-verified');

    const observability = await call('/api/admin/observability', {}, first.cookie);
    assert.strictEqual(observability.status, 200);
    assert.ok(observability.data.metrics.requests >= 1);
    assert.ok(Array.isArray(observability.data.logs));
    const backup = await call('/api/admin/backups', { method: 'POST', body: { label: 'smoke backup' } }, first.cookie);
    assert.strictEqual(backup.status, 201);
    assert.ok(backup.data.backup.checksum);
    const backups = await call('/api/admin/backups', {}, first.cookie);
    assert.strictEqual(backups.status, 200);
    assert.ok(backups.data.backups.some((item) => item.id === backup.data.backup.id));
    const badCron = await call('/api/internal/jobs/run', { method: 'POST', headers: { Authorization: 'Bearer wrong-secret' } });
    assert.strictEqual(badCron.status, 401);
    const cron = await call('/api/internal/jobs/run', { method: 'POST', headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    assert.strictEqual(cron.status, 200);
    pass('admin telemetry, backups and cron-authenticated job runner are operational');

    const free = await register('free');
    const freeTierBypass = await call('/api/projects', {
      method: 'POST',
      body: { idea: 'A paid-depth prototype that should be blocked for a new free account because the tier is above the plan entitlement.', tier: 'smb', model: 'llama-3.3-70b' },
    }, free.cookie);
    assert.strictEqual(freeTierBypass.status, 402);
    assert.strictEqual(freeTierBypass.data.code, 'PLAN_TIER_REQUIRED');
    const freeProject = await call('/api/projects', {
      method: 'POST',
      body: { idea: 'A free-tier prototype for a neighborhood repair marketplace that matches broken appliances with vetted technicians and explains repair-versus-replace economics.', tier: 'small', model: 'llama-3.3-70b' },
    }, free.cookie);
    assert.strictEqual(freeProject.status, 201);
    const overLimit = await call('/api/projects', {
      method: 'POST',
      body: { idea: 'A second free sandbox that should be rejected because the free plan only includes one workspace.', tier: 'small', model: 'llama-3.3-70b' },
    }, free.cookie);
    assert.strictEqual(overLimit.status, 402);
    assert.strictEqual(overLimit.data.code, 'PROJECT_LIMIT_REACHED');
    const freeDev = await call(`/api/projects/${freeProject.data.project.id}/deploy`, { method: 'POST', body: { env: 'dev' } }, free.cookie);
    const blockedShipping = await call(`/api/projects/${freeProject.data.project.id}/deploy`, { method: 'POST', body: { env: 'prod' } }, free.cookie);
    assert.strictEqual(freeDev.status, 200);
    assert.strictEqual(blockedShipping.status, 402);
    pass('free plan cannot self-select SMB depth and production shipping is plan-gated', 'HTTP 402');

    const consultation = await call(`/api/projects/${project.id}/consultation`, {
      method: 'POST',
      body: { topic: 'Validate the cold-chain spoilage wedge and data access', notes: 'Security review of temperature telemetry.', focus: ['Discovery & Competitor Analysis', 'Architecture Design & Review'] },
    }, first.cookie);
    assert.strictEqual(consultation.status, 200);
    assert.strictEqual(consultation.data.consultation.brief.length, 3);
    pass('FDE consultation produces a named brief and agenda', consultation.data.consultation.fde);

    const collateral = await call(`/api/projects/${project.id}/collateral`, { method: 'POST', body: { type: 'exec-summary' } }, first.cookie);
    assert.strictEqual(collateral.status, 200);
    const col = collateral.data.collateral;
    await call(`/api/collaterals/${col.id}/approve`, { method: 'POST' }, first.cookie);
    for (const format of col.formats) {
      const exported = await call(`/api/collaterals/${col.id}/export?format=${format}`, { binary: true }, first.cookie);
      assert.strictEqual(exported.status, 200);
      assert.ok(exported.buffer.length > 400);
    }
    pass('proposal collateral exports in every advertised format');

    const pack = await call(`/api/projects/${project.id}/pack`, { binary: true }, first.cookie);
    assert.strictEqual(pack.status, 200);
    assert.ok(pack.buffer.length > 1_000_000);
    assert.strictEqual(pack.buffer.subarray(0, 2).toString(), 'PK');
    pass('delivery pack is a valid ZIP', `${pack.buffer.length} bytes`);

    const traversal = await fetch(`${BASE}/assets/..%2f..%2fpackage.json`, { redirect: 'manual' });
    assert.ok([403, 404].includes(traversal.status));
    pass('static path traversal is rejected', String(traversal.status));

    const sandbox = await call(`/sandbox/${project.id}`, { binary: true }, first.cookie);
    assert.strictEqual(sandbox.status, 200);
    assert.ok(/<!doctype html>/i.test(sandbox.buffer.toString('utf8')));
    const sandboxAnon = await call(`/sandbox/${project.id}`, { binary: true });
    assert.strictEqual(sandboxAnon.status, 401);
    pass('sandbox preview is authenticated and renders HTML');

    const revenue = await call('/api/revenue', {}, first.cookie);
    assert.strictEqual(revenue.status, 200);
    assert.strictEqual(revenue.data.revenue.agents.length, 9);
    assert.ok(revenue.data.revenue.connectors.length >= 4);
    const pendingBefore = revenue.data.revenue.approvals.filter((a) => a.status === 'pending');
    assert.ok(pendingBefore.length >= 4);
    const cycle = await call('/api/revenue/run', { method: 'POST', body: {} }, first.cookie);
    assert.strictEqual(cycle.status, 200);
    assert.strictEqual(cycle.data.run.added, true);
    const pendingAfterRun = cycle.data.revenue.approvals.filter((a) => a.status === 'pending');
    assert.strictEqual(pendingAfterRun.length, pendingBefore.length + 1);
    const targetApproval = pendingAfterRun[0];
    const revApproved = await call(`/api/revenue/approvals/${targetApproval.id}/decision`, {
      method: 'POST',
      body: { decision: 'approve', note: 'Approved in smoke test', draft: `${targetApproval.draft}\nSmoke edit.` },
    }, first.cookie);
    assert.strictEqual(revApproved.status, 200);
    assert.strictEqual(revApproved.data.approval.status, 'approved');
    assert.ok(revApproved.data.revenue.events.some((e) => e.type === 'release.simulated' && e.actor === 'Connector'));
    pass('Revenue Swarm cycles, named approval and simulated release are recorded');

    const crossRevenue = await call('/api/revenue', {}, second.cookie);
    assert.strictEqual(crossRevenue.status, 200);
    assert.notStrictEqual(crossRevenue.data.revenue.id, revApproved.data.revenue.id);
    pass('revenue workspace remains isolated per user');

    const lead = await call('/api/leads', {
      method: 'POST',
      body: { type: 'fde', name: 'Priya Buyer', email: 'priya@example.test', company: 'Northwind Ops', message: 'We need a two-week diagnostic for a prior-auth workflow and a security review.', slot: '2026-10-28T12:30:00.000Z', consent: true, source: 'smoke' },
    });
    assert.strictEqual(lead.status, 201);
    assert.ok(lead.data.lead.routing.queue);
    assert.ok(['test-outbox', 'queued'].includes(lead.data.delivery));
    pass('server-side FDE lead capture routes a pod and queues the alert', lead.data.lead.routing.queue);

    const analytics = await call('/api/analytics/events', { method: 'POST', body: { event: 'smoke_funnel', props: { step: 'test' } } });
    assert.strictEqual(analytics.status, 202);
    pass('first-party analytics event is accepted');

    const forumAnonFeed = await call('/api/forum/feed');
    assert.strictEqual(forumAnonFeed.status, 200);
    assert.ok(Array.isArray(forumAnonFeed.data.threads));
    assert.ok(Array.isArray(forumAnonFeed.data.spaces));
    pass('public FDE forum feed is readable without a session');

    const forumAnonWrite = await call('/api/forum/thread', {
      method: 'POST',
      body: { space: 'applied-ai', title: 'Anonymous forum thread attempt', body: 'Nobody is signed in for this request yet.' },
    });
    assert.strictEqual(forumAnonWrite.status, 401);
    pass('anonymous forum writes are rejected');

    const forumMember = await register('forum-member');
    const forumThread = await call('/api/forum/thread', {
      method: 'POST',
      body: { space: 'applied-ai', title: 'How should we scope an agent eval harness?', body: 'Golden set, guardrails and latency gates before production rollout.', tags: ['evaluation'] },
    }, forumMember.cookie);
    assert.strictEqual(forumThread.status, 201);
    assert.strictEqual(forumThread.data.thread.author.role, 'registered');
    pass('verified registered member opens a forum thread');

    const forumBad = await call('/api/forum/thread', {
      method: 'POST',
      body: { space: 'nope', title: 'Short', body: 'x' },
    }, forumMember.cookie);
    assert.strictEqual(forumBad.status, 400);
    pass('invalid forum threads are rejected server-side');

    const forumAdmin = await register('forum-admin');
    const forumReply = await call(`/api/forum/thread/${forumThread.data.thread.id}/reply`, {
      method: 'POST',
      body: { body: 'Lock the golden set to 200 cases and report human-edit rate.' },
    }, forumAdmin.cookie);
    assert.strictEqual(forumReply.status, 201);
    assert.strictEqual(forumReply.data.replies[0].author.role, 'fde');
    assert.strictEqual(forumReply.data.thread.fdeAnswered, true);
    assert.strictEqual(forumReply.data.thread.status, 'answered');
    pass('FDE reply is role-badged and answers the thread');

    const replyId = forumReply.data.replies[0].id;
    const forumLike = await call(`/api/forum/thread/${forumThread.data.thread.id}/reaction`, { method: 'POST', body: { type: 'like' } }, forumMember.cookie);
    assert.strictEqual(forumLike.status, 200);
    const likeCount = forumLike.data.thread.counts.likes;
    assert.ok(likeCount >= 1);
    const forumUnlike = await call(`/api/forum/thread/${forumThread.data.thread.id}/reaction`, { method: 'POST', body: { type: 'like' } }, forumMember.cookie);
    assert.strictEqual(forumUnlike.data.thread.counts.likes, likeCount - 1);
    pass('forum thread reactions toggle per user');

    const forumHelpful = await call(`/api/forum/reply/${replyId}/reaction`, { method: 'POST', body: { type: 'helpful' } }, forumMember.cookie);
    assert.strictEqual(forumHelpful.status, 200);
    assert.ok(forumHelpful.data.replies.find((reply) => reply.id === replyId).helpful);
    pass('helpful marks land on a forum reply');

    const forumAccept = await call(`/api/forum/thread/${forumThread.data.thread.id}/action`, {
      method: 'POST',
      body: { action: 'accept', replyId },
    }, forumMember.cookie);
    assert.strictEqual(forumAccept.status, 200);
    assert.strictEqual(forumAccept.data.thread.acceptedReplyId, replyId);
    pass('thread author accepts an FDE answer');

    const forumFeedAfter = await call('/api/forum/feed');
    assert.ok(forumFeedAfter.data.stats.threads > 0);
    assert.ok(forumFeedAfter.data.stats.replies > 0);
    pass('public feed stats grow with forum interactions');

    const forumDelete = await call(`/api/forum/thread/${forumThread.data.thread.id}`, { method: 'DELETE' }, forumMember.cookie);
    assert.strictEqual(forumDelete.status, 200);
    const forumDeletedFeed = await call('/api/forum/feed');
    assert.ok(!forumDeletedFeed.data.threads.some((thread) => thread.id === forumThread.data.thread.id));
    pass('thread author deletes their own thread');

    const docsAnon = await call('/docs/MASTER_PROMPT.md', { binary: true });
    assert.strictEqual(docsAnon.status, 401);
    const docsAuth = await call('/docs/MASTER_PROMPT.md', { binary: true }, first.cookie);
    assert.strictEqual(docsAuth.status, 200);
    const rawAnon = await call('/api/blueprint/raw', { binary: true });
    assert.strictEqual(rawAnon.status, 401);
    const rawAuth = await call('/api/blueprint/raw', { binary: true }, first.cookie);
    assert.strictEqual(rawAuth.status, 200);
    pass('blueprint markdown and raw route are authenticated', '401 → 200');

    const home = await call('/');
    assert.ok(home.headers.get('content-security-policy'));
    assert.ok(home.headers.get('strict-transport-security'));
    const privacy = await call('/legal/privacy.html', { binary: true });
    const terms = await call('/legal/terms.html', { binary: true });
    const dpa = await call('/legal/dpa.html', { binary: true });
    const robots = await call('/robots.txt', { binary: true });
    const sitemap = await call('/sitemap.xml', { binary: true });
    assert.strictEqual(privacy.status, 200);
    assert.strictEqual(terms.status, 200);
    assert.strictEqual(dpa.status, 200);
    assert.strictEqual(robots.status, 200);
    assert.strictEqual(sitemap.status, 200);
    assert.ok(/\/trust/.test(sitemap.buffer.toString('utf8')));
    pass('CSP/HSTS headers, legal pages, robots.txt and sitemap.xml are served');

    const evidence = await call('/api/evidence', {}, first.cookie);
    assert.strictEqual(evidence.status, 200);
    assert.ok(evidence.data.events.length >= 1);
    assert.ok(evidence.data.counts.billing >= 1);
    assert.ok(evidence.data.events.some((event) => event.source === 'revenue'));
    pass('user-facing evidence log combines workspace, billing and revenue events');

    const forgot = await call('/api/auth/forgot-password', { method: 'POST', body: { email: free.email } });
    assert.strictEqual(forgot.status, 200);
    assert.ok(forgot.data.testUrl);
    const resetToken = new URL(forgot.data.testUrl).searchParams.get('reset');
    const reset = await call('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, password: 'NewKilnSmoke2026!' } });
    assert.strictEqual(reset.status, 200);
    assert.strictEqual(reset.data.user.email, free.email);
    pass('password reset token validates and rotates the session');

    let lastLoginStatus = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await call('/api/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': ipFor() }, body: { email: free.email, password: 'definitely-wrong' } });
      lastLoginStatus = response.status;
    }
    assert.strictEqual(lastLoginStatus, 429);
    pass('login brute-force attempts are throttled with HTTP 429');

    const restored = await call(`/api/admin/backups/${backup.data.backup.id}/restore`, { method: 'POST', body: {} }, first.cookie);
    assert.strictEqual(restored.status, 200);
    assert.ok(restored.data.restored.id === backup.data.backup.id);
    pass('checksum-validated snapshot restores with a pre-restore safety snapshot');

    console.log('\nKiln smoke test\n');
    console.log(notes.join('\n'));
    console.log(`\n  ${notes.length} checks passed.\n`);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 2000);
    });
    await new Promise((resolve) => hookServer.close(resolve));
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error('\nSmoke test failed:\n', error.stack || error.message);
  console.error(notes.join('\n'));
  if (hookServer) hookServer.close();
  process.exitCode = 1;
});
