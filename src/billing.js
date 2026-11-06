'use strict';
/**
 * Billing and entitlement engine.
 *
 * The browser may *request* a plan, but the effective plan always comes from a
 * server-side billing record. Stripe is used when STRIPE_SECRET_KEY exists;
 * otherwise checkout runs in an explicit, clearly-labelled test mode so the full
 * lifecycle can be exercised without pretending a real card was charged.
 */

const crypto = require('crypto');
const { db, save } = require('./store');
const { sendEmail } = require('./email');

const PLANS = {
  free: {
    key: 'free', name: 'Free prototype', price: 0, priceLabel: '$0',
    cadence: 'forever', tier: 'small', seats: 1, maxProjects: 1, tokenQuota: 60000,
    description: 'One prototype workspace, dev/test shipping, and 60k generation tokens.',
  },
  small: {
    key: 'small', name: 'Small team', price: 490, priceLabel: '$490/mo',
    cadence: 'month', tier: 'small', seats: 3, maxProjects: 3, tokenQuota: 150000,
    description: 'Three seats, three sandboxes, production shipping, and 150k tokens/mo.',
  },
  smb: {
    key: 'smb', name: 'Revenue Swarm', price: 2400, priceLabel: '$2,400/mo',
    cadence: 'month', tier: 'smb', seats: 15, maxProjects: 15, tokenQuota: 1200000,
    description: 'Fifteen seats, Revenue Swarm, SOC 2 track, and 1.2m tokens/mo.',
  },
  enterprise: {
    key: 'enterprise', name: 'Enterprise', price: null, priceLabel: 'Custom',
    cadence: 'annual', tier: 'enterprise', seats: 60, maxProjects: 40, tokenQuota: 5000000,
    description: 'Pooled token commitment, 40 sandboxes, pod routing, and custom terms.',
  },
};

const TIER_RANK = ['small', 'smb', 'enterprise'];
const PAID_PLANS = ['small', 'smb'];
const ALL_PLANS = Object.keys(PLANS);

function envNumber(name) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function quotaForPlan(planKey) {
  const plan = PLANS[planKey] || PLANS.free;
  if (planKey === 'free') {
    return envNumber('KILN_FREE_TOKEN_QUOTA') || plan.tokenQuota;
  }
  return plan.tokenQuota;
}

function defaultBilling(plan = 'free') {
  const now = new Date().toISOString();
  return {
    plan,
    planSource: 'default',
    status: plan === 'free' ? 'active' : 'inactive',
    provider: 'none',
    customerId: null,
    subscriptionId: null,
    checkoutId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    tokensUsed: 0,
    tokenQuota: quotaForPlan(plan),
    updatedAt: now,
  };
}

function isEntitled(billing) {
  if (!billing) return false;
  if (billing.status === 'active' || billing.status === 'trialing') return true;
  return false;
}

function effectivePlan(user) {
  const billing = ensureBilling(user);
  if (billing.plan === 'free') return 'free';
  return isEntitled(billing) ? billing.plan : 'free';
}

function ensureBilling(user) {
  if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  let billing = user.billing;
  if (!billing || typeof billing !== 'object' || !PLANS[billing.plan]) {
    // Never trust the legacy user.plan field. Existing accounts start free unless
    // they already carry a verified billing record.
    billing = defaultBilling('free');
  }
  for (const [key, value] of Object.entries(defaultBilling(billing.plan))) {
    if (billing[key] === undefined) billing[key] = value;
  }
  // Legacy paid records predate planSource. Treat them as admin-granted so the
  // production gate keeps working, while never inventing a checkout event.
  if (billing.plan !== 'free' && (!billing.planSource || billing.planSource === 'default')) {
    billing.planSource = 'admin';
  }
  if (billing.plan === 'free') billing.planSource = 'default';
  billing.tokenQuota = quotaForPlan(billing.plan) + Number(billing.bonusTokens || 0);

  if (billing.plan !== 'free' && (billing.status === 'active' || billing.status === 'trialing')) {
    const end = billing.currentPeriodEnd ? Date.parse(billing.currentPeriodEnd) : 0;
    if (end && end <= Date.now()) {
      if (billing.cancelAtPeriodEnd) {
        billing.previousPlan = billing.plan;
        billing.plan = 'free';
        billing.planSource = 'default';
        billing.status = 'active';
        billing.provider = 'none';
        billing.customerId = null;
        billing.subscriptionId = null;
        billing.currentPeriodStart = null;
        billing.currentPeriodEnd = null;
        billing.cancelAtPeriodEnd = false;
        billing.tokenQuota = quotaForPlan('free') + Number(billing.bonusTokens || 0);
        billing.updatedAt = new Date().toISOString();
      } else {
        // Renew the period. Usage resets when the new period begins.
        billing.currentPeriodStart = new Date().toISOString();
        billing.currentPeriodEnd = addDays(30);
        billing.tokensUsed = 0;
        billing.lastRenewedAt = billing.currentPeriodStart;
        billing.updatedAt = billing.currentPeriodStart;
        billing.tokenQuota = quotaForPlan(billing.plan) + Number(billing.bonusTokens || 0);
      }
    }
  }
  user.billing = billing;
  if (!user.referralCode) user.referralCode = referralCodeFor(user);
  return billing;
}

function allowedTier(user) {
  return PLANS[effectivePlan(user)].tier;
}

function projectLimitFor(planKey) {
  return (PLANS[planKey] || PLANS.free).maxProjects;
}

function projectUsage(user) {
  const plan = effectivePlan(user);
  const used = (db.projects || []).filter((project) => project.userId === user.id).length;
  return { used, max: projectLimitFor(plan), plan };
}

function assertProjectLimit(user) {
  const usage = projectUsage(user);
  if (usage.used >= usage.max) {
    const nextPlan = usage.plan === 'free' ? 'small' : usage.plan === 'small' ? 'smb' : 'enterprise';
    throw Object.assign(new Error(`Your ${usage.plan} plan includes ${usage.max} sandbox${usage.max === 1 ? '' : 'es'}. Upgrade to create another workspace.`), {
      status: 402,
      code: 'PROJECT_LIMIT_REACHED',
      requiredPlan: nextPlan,
      upgradeUrl: '/app?view=billing',
      usage,
    });
  }
  return usage;
}

/**
 * Production shipping is bound to verified server-side billing state. A free
 * plan, an expired subscription or a legacy self-declared tier cannot pass.
 */
function canShipProduction(user) {
  const billing = ensureBilling(user);
  const plan = effectivePlan(user);
  return plan !== 'free'
    && isEntitled(billing)
    && (billing.planSource === 'billing' || billing.planSource === 'admin');
}

function assertTierAllowed(user, tier, options = {}) {
  if (!TIER_RANK.includes(tier)) {
    throw Object.assign(new Error('Choose a valid project tier: small, smb, or enterprise.'), { status: 400 });
  }
  const max = allowedTier(user);
  if (TIER_RANK.indexOf(tier) > TIER_RANK.indexOf(max)) {
    const plan = effectivePlan(user);
    throw Object.assign(new Error(`The ${tier} tier requires a higher plan. Your ${plan} plan includes ${max}-depth artifacts.`), {
      status: 402,
      code: 'PLAN_TIER_REQUIRED',
      requiredPlan: tier === 'enterprise' ? 'enterprise' : 'smb',
      upgradeUrl: '/app?view=billing',
    });
  }
  if (options.project && options.project.tier !== tier && isEntitled(ensureBilling(user))) {
    options.project.tier = tier;
    options.project.tierLabel = (require('./engine/core').TIERS[tier] || {}).label || tier;
  }
}

function assertQuota(user, cost, label = 'generation') {
  const billing = ensureBilling(user);
  const used = Number(billing.tokensUsed) || 0;
  const quota = Number(billing.tokenQuota) || quotaForPlan('free');
  const amount = Math.max(1, Math.ceil(Number(cost) || 0));
  if (used + amount > quota) {
    throw Object.assign(new Error(`The ${label} would exceed your plan's token quota (${used.toLocaleString()} / ${quota.toLocaleString()} used). Upgrade for more capacity.`), {
      status: 402,
      code: 'TOKEN_QUOTA_EXCEEDED',
      upgradeUrl: '/app?view=billing',
      usage: { used, quota, requested: amount },
    });
  }
  return { used, quota, requested: amount };
}

function recordUsage(user, cost, label = 'generation', meta = {}) {
  const billing = ensureBilling(user);
  const amount = Math.max(0, Math.ceil(Number(cost) || 0));
  billing.tokensUsed = Number(billing.tokensUsed || 0) + amount;
  billing.updatedAt = new Date().toISOString();
  if (!Array.isArray(billing.usage)) billing.usage = [];
  billing.usage.push({
    at: billing.updatedAt,
    tokens: amount,
    label: String(label).slice(0, 80),
    meta: meta && typeof meta === 'object' ? meta : {},
  });
  if (billing.usage.length > 100) billing.usage = billing.usage.slice(-100);
  save();
  return billing;
}

function estimateTokens(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(80, Math.ceil(words * 1.7) + 120);
}

function billingView(user) {
  const billing = ensureBilling(user);
  const plan = PLANS[effectivePlan(user)];
  const invoices = (db.invoices || [])
    .filter((invoice) => invoice.userId === user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((invoice) => ({ ...invoice }));
  const usage = billing.usage || [];
  return {
    plan: plan.key,
    planName: plan.name,
    planSource: billing.planSource,
    status: billing.status,
    entitled: plan.key !== 'free' ? isEntitled(billing) : true,
    provider: billing.provider,
    mode: stripeEnabled() && billing.provider === 'stripe' ? 'live' : 'test',
    testMode: !stripeEnabled() || billing.provider !== 'stripe',
    billingStatus: billing.status,
    tokenQuota: billing.tokenQuota,
    tokensUsed: Number(billing.tokensUsed) || 0,
    bonusTokens: Number(billing.bonusTokens) || 0,
    seats: plan.seats,
    maxProjects: plan.maxProjects,
    projectCount: (db.projects || []).filter((project) => project.userId === user.id).length,
    tier: plan.tier,
    currentPeriodStart: billing.currentPeriodStart,
    currentPeriodEnd: billing.currentPeriodEnd,
    cancelAtPeriodEnd: !!billing.cancelAtPeriodEnd,
    customerId: billing.customerId || null,
    subscriptionId: billing.subscriptionId || null,
    usage: usage.slice(-25).reverse(),
    invoices,
    referral: referralView(user),
    plans: Object.values(PLANS).map((item) => ({
      ...item,
      tokenQuota: quotaForPlan(item.key),
      selfServe: item.key !== 'enterprise',
      current: item.key === plan.key,
    })),
    stripeConfigured: stripeEnabled(),
  };
}

function referralCodeFor(user) {
  const seed = `${user.id}:${user.email}:kiln-referral`;
  return 'K' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8).toUpperCase();
}

function referralView(user) {
  const base = (process.env.KILN_SITE_URL || 'https://kiln-kohl.vercel.app').replace(/\/+$/, '');
  const code = user.referralCode || referralCodeFor(user);
  return {
    code,
    link: `${base}/?ref=${encodeURIComponent(code)}#pricing`,
    referredCount: Number(user.referralCount) || 0,
    bonusTokens: Number(user.referralBonusTokens) || 0,
    credit: Number(user.referralCredit) || 0,
  };
}

function applyReferral(newUser, code) {
  const ref = String(code || '').trim().toUpperCase().slice(0, 40);
  if (!ref) return null;
  const referrer = (db.users || []).find((candidate) => candidate.id !== newUser.id && referralCodeFor(candidate) === ref);
  if (!referrer) return null;
  const referrerBilling = ensureBilling(referrer);
  const newBilling = ensureBilling(newUser);
  const bonus = 5000;
  referrer.referralCount = Number(referrer.referralCount || 0) + 1;
  referrer.referralBonusTokens = Number(referrer.referralBonusTokens || 0) + bonus;
  referrerBilling.bonusTokens = Number(referrerBilling.bonusTokens || 0) + bonus;
  referrerBilling.tokenQuota = quotaForPlan(referrerBilling.plan) + referrerBilling.bonusTokens;
  newUser.referredBy = referrer.id;
  newBilling.bonusTokens = Number(newBilling.bonusTokens || 0) + bonus;
  newBilling.tokenQuota = quotaForPlan(newBilling.plan) + newBilling.bonusTokens;
  save();
  return { referrerId: referrer.id, bonusTokens: bonus };
}

function stripeEnabled() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function addDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function nextInvoiceNumber() {
  const year = new Date().getUTCFullYear();
  const count = (db.invoices || []).length + 1;
  return `KILN-${year}-${String(count).padStart(4, '0')}`;
}

function pushInvoice({ userId, plan, amount, currency = 'usd', status = 'paid', provider = 'simulated', providerInvoiceId = null, description = null }) {
  if (!Array.isArray(db.invoices)) db.invoices = [];
  const invoice = {
    id: `inv_${crypto.randomUUID()}`,
    number: nextInvoiceNumber(),
    userId,
    plan,
    amount,
    currency,
    status,
    provider,
    providerInvoiceId,
    description: description || `${PLANS[plan] ? PLANS[plan].name : plan} subscription`,
    createdAt: new Date().toISOString(),
    paidAt: status === 'paid' ? new Date().toISOString() : null,
  };
  db.invoices.unshift(invoice);
  if (db.invoices.length > 1000) db.invoices.length = 1000;
  save();
  return invoice;
}

function activatePlan(user, planKey, options = {}) {
  const plan = PLANS[planKey];
  if (!plan) throw Object.assign(new Error('Unknown plan.'), { status: 400 });
  if (!PAID_PLANS.includes(planKey) && planKey !== 'enterprise') {
    throw Object.assign(new Error('Enterprise plans are custom. Book an FDE consultation for a quote.'), { status: 400 });
  }
  const billing = ensureBilling(user);
  const isRenewal = billing.plan === planKey && billing.status === 'active' && !options.forceNewPeriod;
  billing.plan = planKey;
  billing.planSource = options.planSource || 'billing';
  billing.status = 'active';
  billing.provider = options.provider || (stripeEnabled() ? 'stripe' : 'simulated');
  billing.customerId = options.customerId || billing.customerId || null;
  billing.subscriptionId = options.subscriptionId || billing.subscriptionId || null;
  billing.checkoutId = options.checkoutId || billing.checkoutId || null;
  billing.cancelAtPeriodEnd = false;
  billing.currentPeriodStart = new Date().toISOString();
  billing.currentPeriodEnd = addDays(30);
  billing.updatedAt = billing.currentPeriodStart;
  billing.tokenQuota = quotaForPlan(planKey) + Number(billing.bonusTokens || 0);
  if (!isRenewal) billing.tokensUsed = 0;
  user.plan = planKey;
  const invoice = pushInvoice({
    userId: user.id,
    plan: planKey,
    // Invoice amounts are stored in cents everywhere. Plan catalogue prices are
    // in whole dollars, while Stripe webhooks already report cents.
    amount: options.amount !== undefined ? options.amount : (plan.price || 0) * 100,
    currency: options.currency || 'usd',
    status: 'paid',
    provider: billing.provider,
    providerInvoiceId: options.providerInvoiceId || null,
  });
  save();
  queueBillingEmail(user, planKey, invoice);
  return { billing, invoice };
}

function queueBillingEmail(user, planKey, invoice) {
  sendEmail({
    to: user.email,
    userId: user.id,
    tag: 'billing.receipt',
    subject: `Kiln receipt ${invoice.number}`,
    text: `Thanks for subscribing to the ${PLANS[planKey].name} plan.\n\nInvoice ${invoice.number}\nAmount: $${(invoice.amount / 100).toFixed(2)} USD\nStatus: paid\n\nManage billing: ${(process.env.KILN_SITE_URL || 'https://kiln-kohl.vercel.app').replace(/\/+$/, '')}/app?view=billing`,
    meta: { invoiceId: invoice.id, plan: planKey },
  }).catch((error) => console.error('Billing email failed:', error.message));
}

function createCheckout(user, planKey, origin) {
  if (!PAID_PLANS.includes(planKey)) {
    if (planKey === 'enterprise') {
      throw Object.assign(new Error('Enterprise plans are custom. Book an FDE consultation for a scoped quote.'), { status: 400, code: 'ENTERPRISE_CONSULT' });
    }
    throw Object.assign(new Error('Choose a paid self-serve plan: small or smb.'), { status: 400 });
  }
  const plan = PLANS[planKey];
  const checkout = {
    id: `chk_${crypto.randomUUID()}`,
    userId: user.id,
    plan: planKey,
    status: 'pending',
    provider: stripeEnabled() ? 'stripe' : 'simulated',
    amount: plan.price,
    currency: 'usd',
    origin: String(origin || '').slice(0, 300),
    createdAt: new Date().toISOString(),
  };
  if (!Array.isArray(db.billingCheckouts)) db.billingCheckouts = [];
  db.billingCheckouts.unshift(checkout);
  if (db.billingCheckouts.length > 500) db.billingCheckouts.length = 500;
  save();
  return checkout;
}

async function stripeCheckout(user, checkout) {
  const origin = checkout.origin || process.env.KILN_SITE_URL || 'https://kiln-kohl.vercel.app';
  const plan = PLANS[checkout.plan];
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('success_url', `${origin.replace(/\/+$/, '')}/app?billing=success&checkout=${checkout.id}`);
  params.set('cancel_url', `${origin.replace(/\/+$/, '')}/app?view=billing&billing=cancelled`);
  params.set('client_reference_id', checkout.id);
  params.set('customer_email', user.email);
  params.set('metadata[userId]', user.id);
  params.set('metadata[plan]', checkout.plan);
  params.set('metadata[checkoutId]', checkout.id);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(plan.price * 100));
  params.set('line_items[0][price_data][recurring][interval]', 'month');
  params.set('line_items[0][price_data][product_data][name]', `Kiln ${plan.name}`);
  params.set('line_items[0][price_data][product_data][description]', plan.description);
  params.set('subscription_data[metadata][userId]', user.id);
  params.set('subscription_data[metadata][plan]', checkout.plan);
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.error && body.error.message ? body.error.message : 'Stripe checkout could not be created.'), { status: 502 });
  }
  checkout.providerSessionId = body.id;
  checkout.url = body.url;
  checkout.status = 'awaiting_payment';
  save();
  return { checkout, url: body.url, mode: 'live' };
}

async function confirmCheckout(user, checkoutId, options = {}) {
  const checkout = (db.billingCheckouts || []).find((item) => item.id === checkoutId && item.userId === user.id);
  if (!checkout) throw Object.assign(new Error('Checkout session not found.'), { status: 404 });
  if (checkout.status === 'complete') {
    return { checkout, invoice: (db.invoices || []).find((invoice) => invoice.providerCheckoutId === checkout.id) || null };
  }
  if (checkout.provider === 'stripe' && !options.stripeVerified) {
    throw Object.assign(new Error('Stripe checkout is completed by the payment provider.'), { status: 409 });
  }
  if (Date.now() - Date.parse(checkout.createdAt) > 30 * 60000) {
    checkout.status = 'expired';
    save();
    throw Object.assign(new Error('Checkout session expired. Start a new checkout.'), { status: 410 });
  }
  const { invoice } = activatePlan(user, checkout.plan, {
    provider: checkout.provider,
    checkoutId: checkout.id,
    customerId: options.customerId,
    subscriptionId: options.subscriptionId,
  });
  invoice.providerCheckoutId = checkout.id;
  checkout.status = 'complete';
  checkout.completedAt = new Date().toISOString();
  save();
  return { checkout, invoice };
}

function cancelSubscription(user) {
  const billing = ensureBilling(user);
  if (billing.plan === 'free') throw Object.assign(new Error('There is no paid subscription to cancel.'), { status: 400 });
  billing.cancelAtPeriodEnd = true;
  billing.updatedAt = new Date().toISOString();
  save();
  return billingView(user);
}

function resumeSubscription(user) {
  const billing = ensureBilling(user);
  if (billing.plan === 'free') throw Object.assign(new Error('There is no paid subscription to resume.'), { status: 400 });
  billing.cancelAtPeriodEnd = false;
  billing.updatedAt = new Date().toISOString();
  save();
  return billingView(user);
}

async function createPortal(user, origin) {
  const billing = ensureBilling(user);
  if (billing.provider === 'stripe' && billing.customerId && stripeEnabled()) {
    const params = new URLSearchParams();
    params.set('customer', billing.customerId);
    params.set('return_url', `${String(origin || process.env.KILN_SITE_URL || 'https://kiln-kohl.vercel.app').replace(/\/+$/, '')}/app?view=billing`);
    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error && body.error.message ? body.error.message : 'Billing portal unavailable.'), { status: 502 });
    return { url: body.url, mode: 'live' };
  }
  return { url: null, mode: 'test', message: 'Test-mode subscriptions are managed with Cancel and Resume in this console.' };
}

function invoiceHtml(user, invoiceId) {
  const invoice = (db.invoices || []).find((item) => item.id === invoiceId && item.userId === user.id);
  if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
  const plan = PLANS[invoice.plan] || { name: invoice.plan };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(invoice.number)}</title>
<style>body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:720px;margin:48px auto;padding:0 24px;color:#1e1a17}h1{font-size:28px}table{width:100%;border-collapse:collapse;margin:28px 0}td,th{text-align:left;padding:12px 0;border-bottom:1px solid #e7dfd6}small{color:#6d635b}</style></head>
<body><h1>Kiln invoice</h1><p><b>${esc(invoice.number)}</b><br>${esc(new Date(invoice.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
<p>${esc(user.name)}<br>${esc(user.email)}</p><table><tr><th>Description</th><th>Amount</th></tr>
<tr><td>${esc(plan.name)} subscription</td><td>$${(invoice.amount / 100).toFixed(2)} ${esc(invoice.currency.toUpperCase())}</td></tr>
<tr><td><b>Status</b></td><td><b>${esc(invoice.status)}</b></td></tr></table>
<p><small>Kiln · bidyut.banerjee@gmail.com · +91-8297140808</small></p></body></html>`;
}

function verifyStripeSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const parts = String(signature).split(',').reduce((acc, item) => {
    const [key, value] = item.split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {});
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(parts.v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleStripeWebhook(rawBody, signature, secret) {
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    throw Object.assign(new Error('Invalid Stripe signature.'), { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    throw Object.assign(new Error('Invalid webhook JSON.'), { status: 400 });
  }
  const object = event.data && event.data.object ? event.data.object : {};
  if (event.type === 'checkout.session.completed') {
    const userId = (object.metadata && object.metadata.userId) || null;
    const plan = object.metadata && object.metadata.plan;
    const checkoutId = object.client_reference_id || (object.metadata && object.metadata.checkoutId);
    const user = (db.users || []).find((item) => item.id === userId);
    if (user && plan && PAID_PLANS.includes(plan)) {
      activatePlan(user, plan, {
        provider: 'stripe',
        checkoutId,
        customerId: object.customer,
        subscriptionId: object.subscription,
        amount: object.amount_total !== undefined ? object.amount_total : undefined,
        currency: object.currency,
        providerInvoiceId: object.invoice,
      });
      const checkout = (db.billingCheckouts || []).find((item) => item.id === checkoutId);
      if (checkout) {
        checkout.status = 'complete';
        checkout.completedAt = new Date().toISOString();
        save();
      }
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const user = (db.users || []).find((item) => item.billing && (item.billing.subscriptionId === object.id || item.billing.customerId === object.customer));
    if (user) {
      const billing = ensureBilling(user);
      billing.cancelAtPeriodEnd = !!object.cancel_at_period_end;
      if (event.type === 'customer.subscription.deleted' || object.status === 'canceled') {
        billing.status = 'canceled';
        billing.plan = 'free';
        billing.planSource = 'default';
        billing.provider = 'none';
        billing.currentPeriodEnd = null;
        billing.tokenQuota = quotaForPlan('free') + Number(billing.bonusTokens || 0);
      } else if (object.status === 'past_due') {
        billing.status = 'past_due';
      } else if (object.status === 'active' || object.status === 'trialing') {
        billing.status = object.status;
      }
      billing.updatedAt = new Date().toISOString();
      save();
    }
  } else if (event.type === 'invoice.paid') {
    const user = (db.users || []).find((item) => item.billing && (item.billing.subscriptionId === object.subscription || item.billing.customerId === object.customer));
    if (user && object.amount_paid) {
      const existing = (db.invoices || []).find((invoice) => invoice.providerInvoiceId === object.id);
      if (!existing) {
        pushInvoice({
          userId: user.id,
          plan: effectivePlan(user),
          amount: object.amount_paid,
          currency: object.currency || 'usd',
          status: 'paid',
          provider: 'stripe',
          providerInvoiceId: object.id,
          description: object.description || 'Stripe subscription invoice',
        });
      }
    }
  }
  save();
  return { received: true, type: event.type };
}

module.exports = {
  PLANS,
  PAID_PLANS,
  ALL_PLANS,
  TIER_RANK,
  defaultBilling,
  ensureBilling,
  effectivePlan,
  isEntitled,
  allowedTier,
  projectLimitFor,
  projectUsage,
  assertProjectLimit,
  canShipProduction,
  assertTierAllowed,
  assertQuota,
  recordUsage,
  estimateTokens,
  billingView,
  referralCodeFor,
  referralView,
  applyReferral,
  createCheckout,
  stripeCheckout,
  confirmCheckout,
  cancelSubscription,
  resumeSubscription,
  createPortal,
  activatePlan,
  pushInvoice,
  invoiceHtml,
  stripeEnabled,
  verifyStripeSignature,
  handleStripeWebhook,
  quotaForPlan,
};
