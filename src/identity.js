'use strict';
/**
 * Enterprise identity primitives: TOTP MFA, workspace RBAC, SCIM tokens and
 * OIDC single sign-on. Zero external dependencies.
 */

const crypto = require('crypto');
const { db, save } = require('./store');
const { cleanEmail, cleanLabel } = require('./security');

const MFA_STEP_SECONDS = 30;
const MFA_DIGITS = 6;
const MFA_WINDOW = 1;
const CHALLENGE_TTL = 5 * 60 * 1000;
const SSO_STATE_TTL = 10 * 60 * 1000;
const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;

const ROLES = {
  owner: { label: 'Owner', rank: 4, permissions: ['read', 'write', 'generate', 'deploy', 'billing', 'admin', 'members', 'keys'] },
  admin: { label: 'Admin', rank: 3, permissions: ['read', 'write', 'generate', 'deploy', 'members', 'keys'] },
  member: { label: 'Member', rank: 2, permissions: ['read', 'write', 'generate', 'deploy'] },
  viewer: { label: 'Viewer', rank: 1, permissions: ['read'] },
};

/* ------------------------------------------------------------------ base32 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = B32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* ------------------------------------------------------------------ TOTP */
function generateMfaSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totp(secret, counter) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** MFA_DIGITS)).padStart(MFA_DIGITS, '0');
}

function verifyTotp(secret, token, window = MFA_WINDOW) {
  const code = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / MFA_STEP_SECONDS);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = totp(secret, counter + offset);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

function otpauthUrl(user, secret) {
  const issuer = encodeURIComponent('Kiln');
  const label = encodeURIComponent(`Kiln:${user.email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${MFA_DIGITS}&period=${MFA_STEP_SECONDS}`;
}

function hashRecovery(code) {
  return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

function makeRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `KILN-${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

function mfaView(user) {
  const mfa = user.mfa || {};
  return {
    enabled: !!mfa.enabled,
    enabledAt: mfa.enabledAt || null,
    recoveryCodesRemaining: Array.isArray(mfa.recoveryCodes) ? mfa.recoveryCodes.length : 0,
  };
}

function beginMfaSetup(user) {
  if (!user.mfa) user.mfa = {};
  const secret = generateMfaSecret();
  const codes = makeRecoveryCodes();
  user.mfa.pendingSecret = secret;
  user.mfa.pendingCreatedAt = new Date().toISOString();
  user.mfa.recoveryCodes = codes.map(hashRecovery);
  save();
  return { secret, otpauth: otpauthUrl(user, secret), recoveryCodes: codes };
}

function confirmMfa(user, code) {
  const pending = user.mfa && user.mfa.pendingSecret;
  if (!pending) return { ok: false, error: 'Start MFA setup first.' };
  if (!verifyTotp(pending, code)) return { ok: false, error: 'That authenticator code is not valid.' };
  user.mfa.secret = pending;
  delete user.mfa.pendingSecret;
  delete user.mfa.pendingCreatedAt;
  user.mfa.enabled = true;
  user.mfa.enabledAt = new Date().toISOString();
  save();
  return { ok: true, mfa: mfaView(user) };
}

function disableMfa(user, code) {
  if (!user.mfa || !user.mfa.enabled) return { ok: false, error: 'MFA is not enabled.' };
  if (!verifyTotp(user.mfa.secret, code) && !consumeRecovery(user, code)) {
    return { ok: false, error: 'A valid authenticator or recovery code is required.' };
  }
  user.mfa = { enabled: false };
  save();
  return { ok: true, mfa: mfaView(user) };
}

function consumeRecovery(user, code) {
  const hashed = hashRecovery(code);
  const codes = (user.mfa && user.mfa.recoveryCodes) || [];
  const index = codes.indexOf(hashed);
  if (index < 0) return false;
  codes.splice(index, 1);
  save();
  return true;
}

function issueMfaChallenge(userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  if (!db.mfaChallenges) db.mfaChallenges = {};
  db.mfaChallenges[hashed] = { userId, expires: Date.now() + CHALLENGE_TTL, attempts: 0 };
  save();
  return raw;
}

function consumeMfaChallenge(token, code) {
  const hashed = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const challenge = (db.mfaChallenges || {})[hashed];
  if (!challenge || challenge.expires < Date.now()) return null;
  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    delete db.mfaChallenges[hashed];
    save();
    return null;
  }
  const user = db.users.find((candidate) => candidate.id === challenge.userId);
  if (!user || !user.mfa || !user.mfa.enabled) return null;
  if (!verifyTotp(user.mfa.secret, code) && !consumeRecovery(user, code)) {
    save();
    return null;
  }
  delete db.mfaChallenges[hashed];
  save();
  return user;
}

/* ------------------------------------------------------------------ RBAC */
function membershipsFor(user) {
  return (db.workspaceMembers || []).filter((member) => member.userId === user.id && member.status === 'active');
}

function ownerIdFor(user) {
  const membership = membershipsFor(user)[0];
  return membership ? membership.ownerId : user.id;
}

function accessibleOwnerIds(user) {
  return Array.from(new Set([user.id, ...membershipsFor(user).map((member) => member.ownerId)]));
}

function roleFor(user, ownerId) {
  if (user.id === ownerId) return 'owner';
  const membership = membershipsFor(user).find((member) => member.ownerId === ownerId);
  return membership ? membership.role : null;
}

function canAccessProject(user, project) {
  return accessibleOwnerIds(user).includes(project.userId);
}

function hasPermission(user, permission, ownerId) {
  const role = roleFor(user, ownerId || ownerIdFor(user));
  if (!role) return false;
  const definition = ROLES[role];
  return !!definition && definition.permissions.includes(permission);
}

function assertPermission(user, permission, ownerId) {
  if (hasPermission(user, permission, ownerId)) return true;
  throw Object.assign(new Error(`Your workspace role cannot ${permission}.`), {
    status: 403,
    code: 'RBAC_FORBIDDEN',
    permission,
  });
}

function workspaceView(user) {
  const ownerId = ownerIdFor(user);
  const owner = db.users.find((candidate) => candidate.id === ownerId) || user;
  const members = [{ id: owner.id, userId: owner.id, email: owner.email, name: owner.name, role: 'owner', status: 'active', joinedAt: owner.createdAt }]
    .concat((db.workspaceMembers || [])
      .filter((member) => member.ownerId === ownerId)
      .map((member) => {
        const memberUser = db.users.find((candidate) => candidate.id === member.userId);
        return {
          id: member.id,
          userId: member.userId,
          email: member.email,
          name: memberUser ? memberUser.name : member.email,
          role: member.role,
          status: member.status,
          joinedAt: member.joinedAt || member.invitedAt,
        };
      }));
  return {
    ownerId,
    role: roleFor(user, ownerId),
    permissions: ROLES[roleFor(user, ownerId) || 'viewer'].permissions,
    members,
    invites: (db.workspaceInvites || []).filter((invite) => invite.ownerId === ownerId && !invite.acceptedAt && invite.expires > Date.now()).length,
  };
}

function inviteMember(owner, email, role) {
  const normalized = cleanEmail(email);
  const desiredRole = ROLES[role] && role !== 'owner' ? role : 'member';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw Object.assign(new Error('A valid email is required.'), { status: 400 });
  if (normalized === owner.email) throw Object.assign(new Error('You are already the workspace owner.'), { status: 409 });
  if (!db.workspaceMembers) db.workspaceMembers = [];
  const existingMember = db.workspaceMembers.find((member) => member.ownerId === owner.id && member.email === normalized);
  if (existingMember) throw Object.assign(new Error('That person is already in this workspace.'), { status: 409 });
  const existingUser = db.users.find((user) => user.email === normalized);
  const member = {
    id: `wsm_${crypto.randomUUID()}`,
    ownerId: owner.id,
    userId: existingUser ? existingUser.id : null,
    email: normalized,
    role: desiredRole,
    status: existingUser ? 'active' : 'invited',
    invitedAt: new Date().toISOString(),
    joinedAt: existingUser ? new Date().toISOString() : null,
    invitedBy: owner.id,
  };
  db.workspaceMembers.push(member);
  let invite = null;
  if (!existingUser) {
    const raw = crypto.randomBytes(32).toString('hex');
    invite = {
      id: `win_${crypto.randomUUID()}`,
      ownerId: owner.id,
      email: normalized,
      role: desiredRole,
      tokenHash: crypto.createHash('sha256').update(raw).digest('hex'),
      createdAt: new Date().toISOString(),
      expires: Date.now() + INVITE_TTL,
      acceptedAt: null,
    };
    if (!db.workspaceInvites) db.workspaceInvites = [];
    db.workspaceInvites.push(invite);
    invite.rawToken = raw;
  }
  save();
  return { member, invite };
}

function acceptInvite(user, rawToken) {
  const hashed = crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
  const invite = (db.workspaceInvites || []).find((candidate) => candidate.tokenHash === hashed && !candidate.acceptedAt && candidate.expires > Date.now());
  if (!invite) return null;
  if (invite.email !== user.email) return null;
  const member = (db.workspaceMembers || []).find((candidate) => candidate.ownerId === invite.ownerId && candidate.email === user.email);
  if (!member) return null;
  member.userId = user.id;
  member.status = 'active';
  member.joinedAt = new Date().toISOString();
  invite.acceptedAt = new Date().toISOString();
  delete invite.tokenHash;
  save();
  return member;
}

function updateMember(owner, memberId, role) {
  if (!ROLES[role] || role === 'owner') throw Object.assign(new Error('Choose member, admin, or viewer.'), { status: 400 });
  const member = (db.workspaceMembers || []).find((candidate) => candidate.id === memberId && candidate.ownerId === owner.id);
  if (!member) return null;
  member.role = role;
  member.updatedAt = new Date().toISOString();
  save();
  return member;
}

function removeMember(owner, memberId) {
  const index = (db.workspaceMembers || []).findIndex((candidate) => candidate.id === memberId && candidate.ownerId === owner.id);
  if (index < 0) return null;
  const [member] = db.workspaceMembers.splice(index, 1);
  save();
  return member;
}

/* ------------------------------------------------------------------ SCIM / API tokens */
function createScimToken(owner, name) {
  const raw = `kiln_scim_${crypto.randomBytes(28).toString('hex')}`;
  const token = {
    id: `sct_${crypto.randomUUID()}`,
    ownerId: owner.id,
    name: cleanLabel(name, 80) || 'SCIM provisioning',
    prefix: raw.slice(0, 18),
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  if (!db.scimTokens) db.scimTokens = [];
  db.scimTokens.push(token);
  save();
  return { token, raw };
}

function resolveScimToken(raw) {
  if (!raw) return null;
  const hash = crypto.createHash('sha256').update(String(raw)).digest('hex');
  const token = (db.scimTokens || []).find((candidate) => candidate.hash === hash && !candidate.revokedAt);
  if (!token) return null;
  token.lastUsedAt = new Date().toISOString();
  save();
  const owner = db.users.find((user) => user.id === token.ownerId);
  return owner ? { token, owner } : null;
}

function createApiKey(user, name, scopes) {
  const raw = `kiln_live_${crypto.randomBytes(28).toString('hex')}`;
  const allowed = ['projects:read', 'projects:write', 'runs:write', 'webhooks:read'];
  const selected = Array.isArray(scopes) ? scopes.filter((scope) => allowed.includes(scope)) : ['projects:read'];
  const key = {
    id: `key_${crypto.randomUUID()}`,
    userId: user.id,
    name: cleanLabel(name, 80) || 'Public API key',
    prefix: raw.slice(0, 18),
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    scopes: selected.length ? selected : ['projects:read'],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  if (!db.apiKeys) db.apiKeys = [];
  db.apiKeys.push(key);
  save();
  return { key, raw };
}

function resolveApiKey(raw) {
  if (!raw) return null;
  const hash = crypto.createHash('sha256').update(String(raw)).digest('hex');
  const key = (db.apiKeys || []).find((candidate) => candidate.hash === hash && !candidate.revokedAt);
  if (!key) return null;
  key.lastUsedAt = new Date().toISOString();
  save();
  const user = db.users.find((candidate) => candidate.id === key.userId);
  return user ? { key, user } : null;
}

/* ------------------------------------------------------------------ OIDC SSO */
const discoveryCache = new Map();
const jwksCache = new Map();

function ssoConfigFor(ownerId) {
  const configured = ownerId && (db.ssoConfigs || {})[ownerId];
  if (configured && configured.issuer && configured.clientId) return configured;
  if (process.env.KILN_OIDC_ISSUER && process.env.KILN_OIDC_CLIENT_ID) {
    return {
      issuer: String(process.env.KILN_OIDC_ISSUER).replace(/\/+$/, ''),
      clientId: process.env.KILN_OIDC_CLIENT_ID,
      clientSecret: process.env.KILN_OIDC_CLIENT_SECRET || '',
      scopes: process.env.KILN_OIDC_SCOPES || 'openid email profile',
      redirectUri: process.env.KILN_OIDC_REDIRECT_URI || '',
    };
  }
  return null;
}

function ssoEnabled(ownerId) {
  const config = ssoConfigFor(ownerId);
  return !!config && !!config.issuer && !!config.clientId;
}

async function discover(issuer) {
  if (discoveryCache.has(issuer)) return discoveryCache.get(issuer);
  const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('OIDC discovery failed.');
  const metadata = await response.json();
  discoveryCache.set(issuer, metadata);
  return metadata;
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function decodePart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function fetchJwks(uri, force = false) {
  if (!force && jwksCache.has(uri)) return jwksCache.get(uri);
  const response = await fetch(uri, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Could not fetch OIDC signing keys.');
  const body = await response.json();
  jwksCache.set(uri, body);
  return body;
}

async function verifyIdToken(idToken, options) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token.');
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (header.alg !== 'RS256' && header.alg !== 'RS384' && header.alg !== 'RS512') throw new Error('Unsupported ID token algorithm.');
  const jwks = await fetchJwks(options.jwksUri);
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid) || (jwks.keys || [])[0];
  if (!jwk) throw new Error('No OIDC signing key found.');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const algorithm = header.alg === 'RS256' ? 'RSA-SHA256' : header.alg === 'RS384' ? 'RSA-SHA384' : 'RSA-SHA512';
  const valid = crypto.verify(algorithm, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw new Error('Invalid ID token signature.');
  if (options.issuer && payload.iss !== options.issuer) throw new Error('Unexpected OIDC issuer.');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (options.clientId && !audiences.includes(options.clientId)) throw new Error('Unexpected OIDC audience.');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('OIDC token has expired.');
  if (options.nonce && payload.nonce !== options.nonce) throw new Error('OIDC nonce mismatch.');
  return payload;
}

async function beginSso(req, options = {}) {
  const config = ssoConfigFor(options.ownerId);
  if (!config) throw Object.assign(new Error('Enterprise SSO is not configured for this workspace.'), { status: 503, code: 'SSO_NOT_CONFIGURED' });
  const metadata = await discover(config.issuer);
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = config.redirectUri || `${options.baseUrl || ''}/api/auth/sso/callback`;
  if (!db.ssoStates) db.ssoStates = {};
  db.ssoStates[state] = {
    nonce, verifier, redirectUri, ownerId: options.ownerId || null,
    createdAt: Date.now(), expires: Date.now() + SSO_STATE_TTL,
  };
  save();
  const authorize = new URL(metadata.authorization_endpoint);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', config.scopes || 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('nonce', nonce);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  return { url: authorize.toString(), state };
}

async function finishSso(state, code) {
  const record = (db.ssoStates || {})[state];
  if (!record || record.expires < Date.now()) throw Object.assign(new Error('This SSO request has expired.'), { status: 400 });
  delete db.ssoStates[state];
  save();
  const config = ssoConfigFor(record.ownerId);
  if (!config) throw new Error('SSO configuration disappeared.');
  const metadata = await discover(config.issuer);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: record.redirectUri,
    client_id: config.clientId,
    code_verifier: record.verifier,
  });
  if (config.clientSecret) body.set('client_secret', config.clientSecret);
  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`OIDC token exchange failed (${response.status}).`);
  const tokens = await response.json();
  const profile = await verifyIdToken(tokens.id_token, {
    issuer: config.issuer,
    clientId: config.clientId,
    nonce: record.nonce,
    jwksUri: metadata.jwks_uri,
  });
  const email = cleanEmail(profile.email);
  if (!email || profile.email_verified === false) throw new Error('The identity provider did not return a verified email.');
  let user = db.users.find((candidate) => candidate.email === email);
  let created = false;
  if (!user) {
    user = {
      id: `usr_${crypto.randomUUID()}`,
      name: cleanLabel(profile.name || profile.preferred_username || email.split('@')[0], 120),
      email,
      password: null,
      createdAt: new Date().toISOString(),
      plan: 'free',
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
      sso: { issuer: config.issuer, subject: profile.sub },
    };
    const billing = require('./billing');
    user.billing = billing.defaultBilling('free');
    user.referralCode = billing.referralCodeFor(user);
    db.users.push(user);
    created = true;
  } else {
    user.emailVerified = true;
    user.sso = { issuer: config.issuer, subject: profile.sub };
  }
  if (record.ownerId && record.ownerId !== user.id) {
    if (!db.workspaceMembers) db.workspaceMembers = [];
    if (!db.workspaceMembers.some((member) => member.ownerId === record.ownerId && member.userId === user.id)) {
      db.workspaceMembers.push({
        id: `wsm_${crypto.randomUUID()}`, ownerId: record.ownerId, userId: user.id,
        email: user.email, role: 'member', status: 'active',
        invitedAt: new Date().toISOString(), joinedAt: new Date().toISOString(),
      });
    }
  }
  save();
  return { user, created };
}

module.exports = {
  ROLES,
  base32Encode,
  base32Decode,
  generateMfaSecret,
  totp,
  verifyTotp,
  otpauthUrl,
  mfaView,
  beginMfaSetup,
  confirmMfa,
  disableMfa,
  issueMfaChallenge,
  consumeMfaChallenge,
  membershipsFor,
  ownerIdFor,
  accessibleOwnerIds,
  roleFor,
  canAccessProject,
  hasPermission,
  assertPermission,
  workspaceView,
  inviteMember,
  acceptInvite,
  updateMember,
  removeMember,
  createScimToken,
  resolveScimToken,
  createApiKey,
  resolveApiKey,
  ssoEnabled,
  ssoConfigFor,
  beginSso,
  finishSso,
};
