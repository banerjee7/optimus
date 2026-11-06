'use strict';
/**
 * Static preparation for the Vercel deployment.
 *
 * The master blueprint is intentionally NOT copied into public/. It is served
 * only by the authenticated API (and the authenticated /docs route), with
 * docs/** included in the serverless function bundle via vercel.json.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDocs = path.join(root, 'public', 'docs');

fs.rmSync(publicDocs, { recursive: true, force: true });
if (!fs.existsSync(path.join(root, 'docs', 'MASTER_PROMPT.md'))) {
  throw new Error('docs/MASTER_PROMPT.md is missing.');
}

console.log('Vercel build: static assets ready; master blueprint remains auth-gated.');
