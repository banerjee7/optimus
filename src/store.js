'use strict';
/**
 * Tiny JSON persistence layer. Atomic local writes, optional Vercel Blob
 * persistence for serverless deployments, no external dependencies.
 *
 * Vercel Functions have an ephemeral filesystem. When BLOB_READ_WRITE_TOKEN is
 * present we hydrate the database from a private Blob and write it back before
 * the response is flushed. Local files remain a cache/fallback for development.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = process.env.KILN_DATA_DIR
  ? path.resolve(process.env.KILN_DATA_DIR)
  : process.env.VERCEL
    ? path.join(os.tmpdir(), 'kiln-data')
    : path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const BLOB_TOKEN = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
const BLOB_PATH = process.env.KILN_BLOB_PATH || 'kiln/db.json';
const BLOB_ENABLED = Boolean(BLOB_TOKEN);
const BLOB_TIMEOUT_MS = Number(process.env.KILN_BLOB_TIMEOUT_MS || 4500);

const EMPTY = () => ({
  meta: { version: 1, createdAt: new Date().toISOString() },
  users: [],
  sessions: {},
  projects: [],
  artifacts: [],
  messages: [],
  deployments: [],
  consultations: [],
  collaterals: [],
  events: [],
  revenue: [],
  leads: [],
  leadEvents: [],
  billingCheckouts: [],
  invoices: [],
  emailOutbox: [],
  analytics: [],
  rateLimits: {},
  requestLogs: [],
  jobs: [],
  backups: [],
  apiKeys: [],
  webhooks: [],
  webhookDeliveries: [],
  comments: [],
  workspaceMembers: [],
  workspaceInvites: [],
  scimTokens: [],
  ssoStates: {},
  ssoConfigs: {},
  mfaChallenges: {},
  signupFlows: {},
  connectors: [],
  forumThreads: [],
  forumReplies: [],
  forumMembers: [],
  forumSpaces: [],
  forumEvents: [],
});

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) return EMPTY();
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return { ...EMPTY(), ...parsed };
  } catch (error) {
    console.error('Could not read database, starting empty:', error.message);
    return EMPTY();
  }
}

const db = load();
let timer = null;
let dirty = false;
let revision = 0;
let flushPromise = null;
let refreshPromise = null;
let lastEtag = '';
let lastRefreshAt = 0;

function bareStoreId() {
  const configured = String(process.env.BLOB_STORE_ID || '').trim();
  if (configured) return configured.replace(/^store_/, '');
  // vercel_blob_rw_<storeId>_<secret>
  const parts = BLOB_TOKEN.split('_');
  return parts.length >= 4 ? String(parts[3] || '').replace(/^store_/, '') : '';
}

const STORE_ID = bareStoreId();

function writeLocal() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_PATH);
  } catch (error) {
    console.error('Database write failed:', error.message);
  }
}

function save() {
  dirty = true;
  revision += 1;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    writeLocal();
  }, 40);
}

function flush() {
  if (!dirty && !timer) return Promise.resolve();
  if (!flushPromise) {
    flushPromise = doFlush().finally(() => { flushPromise = null; });
  }
  return flushPromise;
}

async function doFlush() {
  if (timer) { clearTimeout(timer); timer = null; }
  writeLocal();
  if (!BLOB_ENABLED || !STORE_ID) { dirty = false; return; }
  if (!dirty) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!dirty) return;
    const rev = revision;
    const body = JSON.stringify(db);
    const result = await putBlob(body);
    if (result.conflict) {
      const remote = await fetchRemote();
      if (remote.parsed) {
        const merged = mergeDb(db, remote.parsed);
        applyRemote(merged);
        loadedRemote = remote.parsed;
        if (remote.etag) lastEtag = remote.etag;
      }
      dirty = true;
      continue;
    }
    if (revision === rev) dirty = false;
  }
  // Last attempt: write unconditionally so the latest state is not stranded.
  if (dirty) {
    const rev = revision;
    const body = JSON.stringify(db);
    const result = await putBlob(body, { unconditional: true });
    if (result.ok && revision === rev) dirty = false;
  }
}

function blobHeaders(extra = {}) {
  return {
    authorization: `Bearer ${BLOB_TOKEN}`,
    'x-vercel-blob-store-id': STORE_ID,
    'x-api-version': '13',
    ...extra,
  };
}

async function putBlob(body, options = {}) {
  const url = `https://vercel.com/api/blob/?pathname=${encodeURIComponent(BLOB_PATH)}`;
  const headers = blobHeaders({
    'x-vercel-blob-access': 'private',
    'x-add-random-suffix': '0',
    'x-allow-overwrite': '1',
    'x-content-type': 'application/json',
    'x-cache-control-max-age': '60',
  });
  if (!options.unconditional && lastEtag) headers['x-if-match'] = lastEtag;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body,
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    if (res.status === 409 || res.status === 412) return { conflict: true };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Blob write failed:', res.status, text.slice(0, 300));
      return { ok: false };
    }
    const data = await res.json().catch(() => ({}));
    lastEtag = String(data.etag || res.headers.get('etag') || lastEtag || '').replace(/^W\//, '');
    return { ok: true };
  } catch (error) {
    console.error('Blob write failed:', error.message);
    return { ok: false };
  }
}

let loadedRemote = null;

async function fetchRemote() {
  const url = `https://${STORE_ID}.private.blob.vercel-storage.com/${BLOB_PATH}?cache=0`;
  try {
    const res = await fetch(url, {
      headers: blobHeaders({ 'cache-control': 'no-cache' }),
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    lastRefreshAt = Date.now();
    if (res.status === 404) return { notFound: true };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Blob read failed:', res.status, text.slice(0, 300));
      return { error: true };
    }
    return {
      parsed: JSON.parse(await res.text()),
      etag: String(res.headers.get('etag') || '').replace(/^W\//, ''),
    };
  } catch (error) {
    console.error('Blob read failed:', error.message);
    return { error: true };
  }
}

async function refreshFromBlob(force = false) {
  if (!BLOB_ENABLED || !STORE_ID) return;
  if (!force && Date.now() - lastRefreshAt < 120) return;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    if (dirty) await flush();
    const remote = await fetchRemote();
    if (!remote.parsed) return;
    if (!force && remote.etag && remote.etag === lastEtag) return;
    loadedRemote = remote.parsed;
    applyRemote(remote.parsed);
    lastEtag = remote.etag || lastEtag;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function applyRemote(remote) {
  const merged = { ...EMPTY(), ...remote };
  for (const key of Object.keys(db)) delete db[key];
  Object.assign(db, merged);
}

/* Merge two database snapshots after optimistic-write conflict.
   Local wins for duplicate ids; remote-only records are preserved. */
function mergeDb(local, remote) {
  if (!remote || typeof remote !== 'object') return local;
  const merged = { ...EMPTY(), ...remote };
  for (const key of Object.keys(local)) {
    if (key === 'meta') continue;
    const localValue = local[key];
    const remoteValue = remote[key];
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      const byId = new Map();
      for (const item of remoteValue) {
        const id = item && (item.id || item.key);
        if (id) byId.set(id, item);
      }
      for (const item of localValue) {
        const id = item && (item.id || item.key);
        if (id) byId.set(id, item);
        else byId.set(Symbol('local'), item);
      }
      merged[key] = Array.from(byId.values());
    } else if (localValue && typeof localValue === 'object' && !Array.isArray(localValue)) {
      merged[key] = { ...(remoteValue || {}), ...localValue };
    } else {
      merged[key] = localValue;
    }
  }
  merged.meta = { ...(remote.meta || {}), ...(local.meta || {}) };
  return merged;
}

async function ready() {
  if (!BLOB_ENABLED) return;
  await refreshFromBlob(true);
}

async function sync() {
  if (!BLOB_ENABLED) return;
  if (dirty) await flush();
  await refreshFromBlob(false);
}

/* Generic private-object storage used for backups and exports. */
async function putObject(pathname, body, contentType = 'application/json') {
  if (BLOB_ENABLED && STORE_ID) {
    const url = `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: blobHeaders({
        'x-vercel-blob-access': 'private',
        'x-add-random-suffix': '0',
        'x-allow-overwrite': '0',
        'x-content-type': contentType,
        'x-cache-control-max-age': '60',
      }),
      body,
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Object write failed (${res.status}).`);
    return { provider: 'blob', pathname };
  }
  const target = path.join(DATA_DIR, pathname.replace(/^kiln\//, ''));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return { provider: 'local', pathname: target };
}

async function getObject(pathname) {
  if (BLOB_ENABLED && STORE_ID) {
    const url = `https://${STORE_ID}.private.blob.vercel-storage.com/${pathname}?cache=0`;
    const res = await fetch(url, {
      headers: blobHeaders({ 'cache-control': 'no-cache' }),
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Object read failed (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }
  const target = path.join(DATA_DIR, pathname.replace(/^kiln\//, ''));
  return fs.existsSync(target) ? fs.readFileSync(target) : null;
}

async function deleteObject(pathname) {
  if (BLOB_ENABLED && STORE_ID) {
    const url = `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`;
    const res = await fetch(url, { method: 'DELETE', headers: blobHeaders(), signal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });
    return res.ok || res.status === 404;
  }
  const target = path.join(DATA_DIR, pathname.replace(/^kiln\//, ''));
  try { fs.unlinkSync(target); } catch (_) { /* missing is fine */ }
  return true;
}

function snapshot() {
  return JSON.parse(JSON.stringify(db));
}

function replaceDb(next) {
  const merged = { ...EMPTY(), ...(next || {}) };
  for (const key of Object.keys(db)) delete db[key];
  Object.assign(db, merged);
  save();
}

function storageMode() {
  return BLOB_ENABLED ? (STORE_ID ? 'vercel-blob' : 'local-cache') : 'local-json';
}

module.exports = {
  db, save, flush, ready, sync, DB_PATH, BLOB_ENABLED, BLOB_PATH,
  putObject, getObject, deleteObject, snapshot, replaceDb, storageMode,
};
