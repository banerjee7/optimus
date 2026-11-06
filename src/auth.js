'use strict';
/** Password hashing, sessions and request authentication. */

const crypto = require('crypto');
const { db, save } = require('./store');
const { ensureBilling, effectivePlan, PLANS, referralCodeFor, projectLimitFor } = require('./billing');
const identity = require('./identity');

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'kiln_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch (error) {
    return false;
  }
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId, expires: Date.now() + SESSION_TTL };
  save();
  return token;
}

function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const session = db.sessions[token];
  if (!session) return null;
  if (session.expires < Date.now()) { delete db.sessions[token]; save(); return null; }
  const user = db.users.find((u) => u.id === session.userId);
  return user ? { user, token } : null;
}

function publicUser(user) {
  const billing = ensureBilling(user);
  const plan = effectivePlan(user);
  const workspaceRole = identity.roleFor(user, identity.ownerIdFor(user));
  const isAdmin = String(user.email || '').toLowerCase() === String(process.env.KILN_ADMIN_EMAIL || 'bidyut.banerjee@gmail.com').toLowerCase();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    plan,
    planName: PLANS[plan].name,
    planSource: billing.planSource,
    tier: PLANS[plan].tier,
    seats: PLANS[plan].seats,
    maxProjects: projectLimitFor(plan),
    projectCount: db.projects.filter((project) => project.userId === user.id).length,
    billingStatus: billing.status,
    billingProvider: billing.provider,
    tokenQuota: billing.tokenQuota,
    tokensUsed: Number(billing.tokensUsed) || 0,
    bonusTokens: Number(billing.bonusTokens) || 0,
    emailVerified: !!user.emailVerified,
    referralCode: billing.referralCode || user.referralCode || referralCodeFor(user),
    workspaceRole,
    forumRole: user.forumRole || (isAdmin ? 'fde' : (workspaceRole === 'owner' || workspaceRole === 'admin' ? (db.workspaceMembers || []).some((m) => m.ownerId === identity.ownerIdFor(user) && m.status === 'active' && m.userId !== user.id) ? 'sde' : 'registered' : 'registered')),
    mfaEnabled: !!(user.mfa && user.mfa.enabled),
    sso: !!user.sso,
    admin: isAdmin,
  };
}

/** One-time email verification / password-reset token. Only the hash is stored. */
function issueToken(user, kind, ttlMs = 60 * 60 * 1000) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  user[`${kind}Token`] = hashed;
  user[`${kind}Expires`] = Date.now() + ttlMs;
  save();
  return raw;
}

function consumeToken(users, kind, raw) {
  const hashed = crypto.createHash('sha256').update(String(raw || '')).digest('hex');
  const user = (users || []).find((candidate) => candidate[`${kind}Token`] && candidate[`${kind}Expires`] > Date.now() && candidate[`${kind}Token`] === hashed);
  if (!user) return null;
  delete user[`${kind}Token`];
  delete user[`${kind}Expires`];
  save();
  return user;
}

module.exports = { hashPassword, verifyPassword, createSession, sessionCookie, clearCookie, currentUser, publicUser, issueToken, consumeToken, COOKIE };
