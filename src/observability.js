'use strict';
/** Request telemetry, durable jobs, backups and disaster-recovery helpers. */

const crypto = require('crypto');
const { db, save, snapshot, replaceDb, putObject, getObject, deleteObject, storageMode, flush } = require('./store');
const { cleanLabel } = require('./security');

const handlers = new Map();
const MAX_LOGS = 5000;
const MAX_BACKUPS = 20;

function registerJobHandler(type, handler) {
  handlers.set(type, handler);
}

function startRequest(req) {
  return {
    id: `req_${crypto.randomUUID()}`,
    method: req.method,
    path: String(req.url || '').split('?')[0],
    startedAt: process.hrtime.bigint(),
    at: new Date().toISOString(),
  };
}

function finishRequest(context, req, res, user) {
  if (!context || !context.path.startsWith('/api/')) return;
  const ms = Number(process.hrtime.bigint() - context.startedAt) / 1e6;
  const entry = {
    id: context.id,
    method: context.method,
    path: context.path,
    status: res.statusCode || 0,
    ms: Math.round(ms * 10) / 10,
    userId: user ? user.id : null,
    at: context.at,
    storage: storageMode(),
  };
  if (!db.requestLogs) db.requestLogs = [];
  db.requestLogs.push(entry);
  if (db.requestLogs.length > MAX_LOGS) db.requestLogs = db.requestLogs.slice(-MAX_LOGS);
  save();
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

function metrics() {
  const logs = db.requestLogs || [];
  const recent = logs.slice(-500);
  const durations = recent.map((entry) => Number(entry.ms) || 0);
  const errors = recent.filter((entry) => Number(entry.status) >= 500);
  const byStatus = {};
  for (const entry of recent) {
    const bucket = `${Math.floor(Number(entry.status) / 100)}xx`;
    byStatus[bucket] = (byStatus[bucket] || 0) + 1;
  }
  const routeCounts = {};
  for (const entry of recent) {
    const key = `${entry.method} ${entry.path}`;
    routeCounts[key] = (routeCounts[key] || 0) + 1;
  }
  const jobs = db.jobs || [];
  return {
    window: recent.length,
    requests: logs.length,
    errorRate: recent.length ? Math.round((errors.length / recent.length) * 10000) / 100 : 0,
    latencyMs: { p50: percentile(durations, 50), p95: percentile(durations, 95), p99: percentile(durations, 99) },
    byStatus,
    topRoutes: Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([route, count]) => ({ route, count })),
    jobs: {
      pending: jobs.filter((job) => job.status === 'pending').length,
      running: jobs.filter((job) => job.status === 'running').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      completed: jobs.filter((job) => job.status === 'done').length,
    },
    storage: storageMode(),
    lastBackupAt: (db.backups || [])[0] ? db.backups[0].createdAt : null,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

/* ------------------------------------------------------------------ queue */
function enqueue(type, payload = {}, options = {}) {
  if (!db.jobs) db.jobs = [];
  const idempotencyKey = cleanLabel(options.idempotencyKey, 180);
  if (idempotencyKey) {
    const existing = db.jobs.find((job) => job.idempotencyKey === idempotencyKey && job.status !== 'failed');
    if (existing) return existing;
  }
  const job = {
    id: `job_${crypto.randomUUID()}`,
    type: cleanLabel(type, 60),
    payload,
    status: 'pending',
    attempts: 0,
    maxAttempts: Number(options.maxAttempts || 5),
    runAt: Number(options.runAt || Date.now()),
    idempotencyKey: idempotencyKey || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastError: null,
  };
  db.jobs.push(job);
  if (db.jobs.length > 2000) db.jobs = db.jobs.filter((item) => item.status === 'pending' || item.status === 'running').concat(db.jobs.filter((item) => item.status === 'done').slice(-500));
  save();
  return job;
}

async function runJobs(limit = 10) {
  if (!db.jobs) db.jobs = [];
  const due = db.jobs
    .filter((job) => job.status === 'pending' && job.runAt <= Date.now())
    .sort((a, b) => a.runAt - b.runAt)
    .slice(0, limit);
  const results = [];
  for (const job of due) {
    job.status = 'running';
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();
    save();
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler for ${job.type}.`);
      const result = await handler(job.payload, job);
      job.status = 'done';
      job.result = result == null ? null : result;
      job.completedAt = new Date().toISOString();
      results.push({ id: job.id, type: job.type, status: 'done' });
    } catch (error) {
      job.lastError = cleanLabel(error.message, 500);
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
      } else {
        job.status = 'pending';
        job.runAt = Date.now() + Math.min(3600000, 2 ** job.attempts * 5000);
      }
      results.push({ id: job.id, type: job.type, status: job.status, error: job.lastError });
    }
    job.updatedAt = new Date().toISOString();
    save();
  }
  return { processed: results.length, results, metrics: metrics().jobs };
}

/* ------------------------------------------------------------------ backups */
function backupPath(id) {
  return `kiln/backups/${id}.json`;
}

async function createBackup(label = 'manual', actor = 'system') {
  const id = `bkp_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(3).toString('hex')}`;
  const body = JSON.stringify(snapshot(), null, 2);
  const checksum = crypto.createHash('sha256').update(body).digest('hex');
  const stored = await putObject(backupPath(id), body, 'application/json');
  const record = {
    id,
    label: cleanLabel(label, 100) || 'manual',
    actor: cleanLabel(actor, 120),
    bytes: Buffer.byteLength(body),
    checksum,
    provider: stored.provider,
    pathname: backupPath(id),
    createdAt: new Date().toISOString(),
  };
  if (!db.backups) db.backups = [];
  db.backups.unshift(record);
  const removed = db.backups.splice(MAX_BACKUPS);
  for (const old of removed) {
    try { await deleteObject(old.pathname || backupPath(old.id)); } catch (_) { /* best effort */ }
  }
  save();
  return record;
}

async function listBackups() {
  return (db.backups || []).slice(0, MAX_BACKUPS);
}

async function restoreBackup(id, actor = 'system') {
  const record = (db.backups || []).find((backup) => backup.id === id);
  if (!record) throw Object.assign(new Error('Backup not found.'), { status: 404 });
  const body = await getObject(record.pathname || backupPath(id));
  if (!body) throw Object.assign(new Error('Backup object is missing.'), { status: 404 });
  const checksum = crypto.createHash('sha256').update(body).digest('hex');
  if (record.checksum && checksum !== record.checksum) throw Object.assign(new Error('Backup checksum does not match.'), { status: 409, code: 'BACKUP_CORRUPT' });
  let parsed;
  try { parsed = JSON.parse(body.toString('utf8')); } catch (_) { throw Object.assign(new Error('Backup is not valid JSON.'), { status: 422 }); }
  if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.projects)) throw Object.assign(new Error('Backup does not look like a Kiln database.'), { status: 422 });
  const safety = await createBackup('pre-restore safety snapshot', actor);
  const currentBackups = db.backups;
  replaceDb(parsed);
  db.backups = currentBackups;
  db.events.push({ id: `evt_${crypto.randomUUID()}`, type: 'system.backup.restored', detail: `Restored ${id}`, actor, at: new Date().toISOString() });
  save();
  await flush();
  return { restored: record, safety };
}

function backupStatus() {
  return {
    count: (db.backups || []).length,
    latest: (db.backups || [])[0] || null,
    retention: MAX_BACKUPS,
    storage: storageMode(),
  };
}

registerJobHandler('backup.create', async (payload) => createBackup(payload.label || 'scheduled', payload.actor || 'scheduler'));

module.exports = {
  startRequest,
  finishRequest,
  metrics,
  enqueue,
  runJobs,
  registerJobHandler,
  createBackup,
  listBackups,
  restoreBackup,
  backupStatus,
};
