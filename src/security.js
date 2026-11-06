'use strict';
/** Input sanitisation, rate limiting and production security headers. */

const crypto = require('crypto');
const { db, save } = require('./store');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self' mailto:",
  "object-src 'none'",
  process.env.NODE_ENV === 'production' ? 'upgrade-insecure-requests' : '',
].filter(Boolean).join('; ');

function securityHeaders() {
  return {
    'Content-Security-Policy': CSP,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

function stripControl(value, preserveNewlines) {
  const pattern = preserveNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  return String(value == null ? '' : value).normalize('NFKC').replace(pattern, '');
}

function cleanText(value, max = 4000, preserveNewlines = true) {
  return stripControl(value, preserveNewlines)
    .replace(/[<>]/g, '')
    .replace(preserveNewlines ? /[ \t]+/g : /\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function cleanLabel(value, max = 120) {
  return cleanText(value, max, false);
}

function cleanEmail(value) {
  return String(value == null ? '' : value).normalize('NFKC').toLowerCase().replace(/\s+/g, '').slice(0, 254);
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Strict same-origin guard for cookie-authenticated API mutations.
 *
 * Browsers send Origin on cross-origin writes; a request without Origin and
 * without a cross-site Sec-Fetch-Site value is treated as a non-browser client
 * (CLI, Stripe webhook, smoke test) and is allowed through. This complements
 * SameSite=Lax rather than replacing it.
 */
function isSameOriginRequest(req) {
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const origin = req.headers.origin;
  if (!origin) return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
  let parsed;
  try { parsed = new URL(String(origin)); } catch (_) { return false; }
  const allowed = new Set();
  if (process.env.KILN_SITE_URL) {
    try { allowed.add(new URL(process.env.KILN_SITE_URL).origin); } catch (_) { /* ignore bad env */ }
  }
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) allowed.add(`${proto}://${host}`);
  return allowed.has(parsed.origin);
}

function assertSameOrigin(req) {
  if (!isSameOriginRequest(req)) {
    throw Object.assign(new Error('Cross-origin request blocked.'), {
      status: 403,
      code: 'CSRF_ORIGIN_BLOCKED',
    });
  }
}

function rateError(message, retryAfter) {
  return Object.assign(new Error(message), { status: 429, retryAfter: Math.max(1, Math.ceil(retryAfter / 1000)) });
}

/**
 * Persistent sliding counter. Keyed by bucket + identity so it survives within a
 * serverless instance and is shared by all requests using the same data file.
 */
function rateLimit(req, bucket, options = {}) {
  const limit = Number(options.limit || 10);
  const windowMs = Number(options.windowMs || 60000);
  const blockMs = Number(options.blockMs || windowMs);
  const identity = String(options.identity || clientIp(req)).slice(0, 240);
  const key = `${bucket}:${identity}`;
  if (!db.rateLimits || typeof db.rateLimits !== 'object') db.rateLimits = {};
  const nowMs = Date.now();
  let record = db.rateLimits[key];
  if (!record || typeof record !== 'object') {
    record = { count: 0, resetAt: nowMs + windowMs, blockedUntil: 0 };
  }
  if (record.blockedUntil && record.blockedUntil > nowMs) {
    throw rateError('Too many requests. Try again shortly.', record.blockedUntil - nowMs);
  }
  if (!record.resetAt || record.resetAt <= nowMs) {
    record.count = 0;
    record.resetAt = nowMs + windowMs;
    record.blockedUntil = 0;
  }
  record.count += 1;
  if (record.count > limit) {
    record.blockedUntil = nowMs + blockMs;
    db.rateLimits[key] = record;
    save();
    throw rateError('Too many requests. Try again shortly.', blockMs);
  }
  db.rateLimits[key] = record;
  save();
  return record;
}

function clearRate(req, bucket, identity) {
  if (!db.rateLimits) return;
  const key = `${bucket}:${String(identity || clientIp(req)).slice(0, 240)}`;
  delete db.rateLimits[key];
  save();
}

function hashIp(req) {
  const salt = process.env.KILN_IP_SALT || 'kiln-local';
  return crypto.createHash('sha256').update(`${salt}:${clientIp(req)}`).digest('hex').slice(0, 24);
}

module.exports = {
  CSP,
  securityHeaders,
  cleanText,
  cleanLabel,
  cleanEmail,
  clientIp,
  isSameOriginRequest,
  assertSameOrigin,
  rateLimit,
  clearRate,
  hashIp,
  stripControl,
};
