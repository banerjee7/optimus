'use strict';
/**
 * Transactional email adapter.
 * Uses Resend or a generic webhook when credentials exist; otherwise writes a
 * clearly-labelled simulated message to the persistent outbox.
 */

const { db, save } = require('./store');

function emailUid() {
  return `eml_${require('crypto').randomUUID()}`;
}

function deliveryMode() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.KILN_EMAIL_WEBHOOK) return 'webhook';
  return 'test-outbox';
}

async function sendEmail({ to, subject, text, html, tag = 'transactional', userId = null, meta = {} }) {
  const record = {
    id: emailUid(),
    to: String(to || '').slice(0, 254),
    subject: String(subject || '').slice(0, 200),
    text: String(text || '').slice(0, 20000),
    html: html ? String(html).slice(0, 60000) : null,
    tag: String(tag).slice(0, 80),
    userId,
    meta,
    provider: deliveryMode(),
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  if (!Array.isArray(db.emailOutbox)) db.emailOutbox = [];
  db.emailOutbox.unshift(record);
  if (db.emailOutbox.length > 500) db.emailOutbox.length = 500;
  save();

  if (record.provider === 'resend') {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.KILN_EMAIL_FROM || 'Kiln <onboarding@resend.dev>',
          to: [record.to],
          subject: record.subject,
          text: record.text,
          ...(record.html ? { html: record.html } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      });
      record.status = response.ok ? 'sent' : 'failed';
      record.providerStatus = response.status;
    } catch (error) {
      record.status = 'failed';
      record.error = String(error.message || error).slice(0, 240);
    }
  } else if (record.provider === 'webhook') {
    try {
      const response = await fetch(process.env.KILN_EMAIL_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        signal: AbortSignal.timeout(5000),
      });
      record.status = response.ok ? 'sent' : 'failed';
      record.providerStatus = response.status;
    } catch (error) {
      record.status = 'failed';
      record.error = String(error.message || error).slice(0, 240);
    }
  } else {
    record.status = 'simulated';
    record.note = 'No email provider configured. Message retained in the server outbox.';
  }
  save();
  return record;
}

function testMode() {
  return deliveryMode() === 'test-outbox';
}

module.exports = { sendEmail, deliveryMode, testMode };
