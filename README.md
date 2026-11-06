<<<<<<< HEAD
# optimus
=======
# Kiln

**From a sentence to shipped software — with evidence and a human at every gate.**

Kiln is a working, zero-dependency web product for agentic software delivery. A visitor can explore the marketing site, run the readiness test, register, describe a business in chat, choose an open-source model, and generate twelve tiers-aware workstreams inside an isolated sandbox. Every workstream produces a real artifact, renders in a document studio, exports to PDF / Word / PowerPoint / Excel / Markdown / JSON, and stops at a named human approval before anything is treated as final.

The app intentionally ships without npm packages. Node's standard library handles HTTP, sessions, persistence, ZIP, PDF, OOXML and the generated prototype.

## Live deployment

| Surface | URL |
| --- | --- |
| Marketing site | <https://kiln-kohl.vercel.app> |
| Console | <https://kiln-kohl.vercel.app/app> |
| Mobile app (installable PWA) | <https://kiln-kohl.vercel.app/mobile> |
| Trust center | <https://kiln-kohl.vercel.app/trust> |
| Developer docs | <https://kiln-kohl.vercel.app/developers> |
| Security contact | <https://kiln-kohl.vercel.app/.well-known/security.txt> |

The site, console and mobile app are deployed from this repository to Vercel. The same Node server serves the API, static site and `/mobile` app shell, so there is no second backend to configure.

**Contact:** Bidyut Banerjee · <bidyut.banerjee@gmail.com> · +91-8297140808

## Run it

```bash
cd kiln
npm start
```

Open <http://127.0.0.1:4517>.

No install step, no build step. Node 18+ is enough.

**Demo account**

- Email: `demo@kiln.studio`
- Password: `KilnDemo2026!`
- Workspace: Lumen Pharmacy Ops — six seeded artifacts, deployments, an FDE consultation and a proposal.
- Revenue swarm: nine agents, a seeded human approval queue, audit trail and simulated connectors. It is created per user the first time the Revenue swarm view is opened.

A fresh database is seeded automatically on first run. The demo password and data are for local evaluation only.

## What is in the product

### Marketing site — `/`
- Three business categories — Small Scale, SMB, Enterprise — each visibly carrying all twelve workstreams.
- Combined **Product & platform** section.
- **Delivery Assurance & Evidence** section for delivery, proof and insights.
- Separate **Pricing** section and four service offers: FDE consultation, FDE deployment, FDE training and support.
- The **“You are the creator of your business”** readiness test: 6 questions, a 0–18 score and three bands. The idea field and result carry into registration.
- Responsive editorial design, keyboard navigation, reduced-motion support.

### Console — `/app`
- Register or sign in; demo autofill; free prototype plan or paid plans.
- Live chat intake with intent routing, quick prompts and a generated-artifact drawer.
- Project switcher and isolated per-user sandboxes.
- **Twelve workstreams**, each with a catalog card, latest revision, draft/approved state, confidence, guardrails and agent trace:
  1. Ideation to Prototype
  2. Discovery & Competitor Analysis
  3. FDE Consultation
  4. Architecture Design & Review
  5. Legacy to Microservices
  6. Reverse Engineering with REA
  7. AI DLC & Deployment
  8. Testing with AI
  9. AI FDE as a Service
  10. Proposal Design
  11. Capacity Planning: DPR & RLS
  12. Managed Services & GCC Setup
- **Artifact studio** with typed sections, KPIs, tables, timelines, bars, checklists, callouts, exports, approval/reopen and revision history.
- **Sandbox** with a working server-generated prototype, scaffold files, features, entities and dev/test/prod environments.
- **Deployments** with generated tests, policy stages, readiness, SBOM, rollback and a blocked production gate that requires a named human approval.
- **Proposals** (collateral): executive summaries, one-pagers, battlecards, case studies, architecture briefs and FAQs, with exports and approval.
- **FDE consultations**: named FDE and pod, focus areas, preparation, objectives and expected outputs.
- **Delivery & exports**: latest artifact per workstream, export matrix and a real delivery ZIP containing artifacts, sandbox scaffold and a manifest.
- **Blueprint**: the full product and agentic master prompt rendered inside the console.
- **Revenue swarm**: nine specialist agents — ICP & Demand, Prospecting, Outreach, Inbound Qualifier, SDR Chat, Proposal & Pricing, Activation & Expansion, RevOps & Forecast, and Guardrail & Approvals — coordinated by a master orchestrator. The console shows the agent roster, pipeline signals, an approval queue, a recently-decided history and an append-only audit log. Every external message, price, SOW, charge, plan change, public claim or standing-rule change waits for a named human; approving or rejecting records the decision and the simulated connector release. Connectors are explicitly simulated: no CRM, email, Stripe or calendar call is made.
- Free prototype plan can generate and deploy to dev/test; production shipping requires a paid plan.

### Enterprise identity and collaboration

- **Registration is verification-first and non-enumerating.** Every valid sign-up request returns the same `202 pending` response, creates no session and reveals no account existence. New accounts receive a verification email; existing accounts receive a security notice. The session is issued only after the verification link is opened.
- **TOTP MFA** with authenticator setup, one-time recovery codes, a short-lived login challenge and authenticated disable flow.
- **Workspace RBAC** with owner, admin, member and viewer roles. Project reads, generation, deployment, billing, keys, member management and comments are checked server-side.
- **Team invitations** for existing or new accounts, role changes, removal and invite acceptance; shared projects become visible after joining.
- **SCIM 2.0** users, groups and service-provider configuration with hashed bearer tokens and deprovisioning.
- **OIDC enterprise SSO** with discovery, PKCE, state/nonce, JWKS signature verification and issuer/audience/expiry validation. Configure it per workspace in Security or with environment variables.
- **Project comments** and shared workspace evidence for human review.

### Developer platform and operations

- **Scoped public API keys** (`projects:read`, `projects:write`, `runs:write`, `webhooks:read`) with hashed storage, last-used tracking and revocation. Versioned endpoints live under `/api/v1`.
- **Signed webhooks** with HMAC-SHA256 signatures, event subscriptions, delivery history, retries through the durable queue and SSRF protections.
- **Connector marketplace** for Slack, Jira, GitHub, HubSpot, Salesforce, Snowflake, PostgreSQL and Google Drive. Connectors are explicitly simulated until real OAuth credentials are configured.
- **Observability**: structured request telemetry, error rate, p50/p95/p99 latency, status buckets, top routes, queue depth and storage mode for the workspace admin.
- **Durable jobs** with attempts, exponential backoff, idempotency keys and a cron endpoint protected by `KILN_CRON_SECRET`.
- **Backups and disaster recovery**: private Blob snapshots with SHA-256 checksums, 20-snapshot retention, pre-restore safety snapshots and checksum-validated restore. The runbook is in `docs/DR.md`.
- **Trust center** at `/trust` with honest control status. SOC 2 Type II is marked in progress, not certified; ISO 27001 is not certified.

### Mobile app — `/mobile`
- Installable PWA built from the same console, API and session model.
- Bottom navigation for Chat, Workstreams, Sandbox, Proposals and More; the More drawer exposes deployments, FDE consultations, delivery and blueprint.
- Safe-area padding, touch-sized controls, phone-first layout and no horizontal overflow at 390×844.
- Web app manifest with 192/512/maskable icons, standalone display, shortcuts and a service worker app-shell cache.
- Install prompt on supported browsers; an iOS-specific Share → Add to Home Screen hint.
- Offline navigation falls back to the cached app shell; API responses are never cached.

**Install it**

- **iPhone/iPad:** open the mobile URL in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the mobile URL in Chrome, tap the install prompt or **Install app** in the top bar.
- **Desktop:** use the install icon in the address bar, or **Install app** when the browser offers it.

This is a real installable mobile web app, not an App Store/Play Store binary. Vercel hosts the PWA and API; wrapping it with Capacitor or Expo/EAS would be the next step for native store listings.

## The twelve generators are real, not static copy

`src/engine` builds a deterministic-but-seeded project context from the brief:

- 12 domain packs (health, logistics, finance, retail, manufacturing, public sector, and more), inferred capabilities, personas, entities, metrics, integrations and competitors.
- Tier profiles for team shape, duration, budget, scale, uptime, security ceremony and infrastructure cost.
- A stable project codename and seed per project.
- Every generator emits structured sections with numbers, tables, phases, checklists and guardrails derived from that context.

There are no live model calls. Model selection is product metadata that shapes copy and positioning; generation itself is local and seeded so demos are reproducible. This is stated in the UI and in the blueprint.

## Exports

Implemented in `src/lib` against the file formats directly:

| Format | Implementation |
| --- | --- |
| PDF 1.4 | `src/lib/pdf.js` — pagination, styled tables, brand typography, page numbers |
| DOCX | `src/lib/docx.js` — real OOXML package, styles, headings, tables, checklists |
| PPTX | `src/lib/pptx.js` — 16:9 deck, title/section/content/table slides, guardrail notice |
| XLSX | `src/lib/xlsx.js` — styled sheets, widths, live formulas in capacity models |
| Markdown / JSON | `src/engine/exports.js` |
| Delivery ZIP | `src/lib/zip.js` — stored ZIP + CRC32; latest artifact per function, sandbox scaffold, manifest |

The capacity workbook includes formulas for DPR, RLS and forecast rows rather than static values. The PPTX, DOCX and XLSX files unzip and XML-validate as real OOXML packages.

## Human-in-the-loop by design

- Every artifact is `draft` on creation and needs a named approval to become `approved`.
- Reopening an approved artifact records the change of state.
- Production promotion is blocked until a named user approves it.
- That approval is written to the deployment, the project environment record and the event log.
- Artifacts show confidence, assumptions, guardrails and an agent trace with a pending human step.
- Generated tests can fail; deployments surface warnings rather than silently pretending everything passed.

## Security and isolation

- Passwords hashed with scrypt; timing-safe verification.
- Random 256-bit session tokens in an HttpOnly, SameSite cookie; `Secure` when `NODE_ENV=production`.
- Registration is verification-first and non-enumerating: identical `202 pending` responses, no session, no account-existence signal.
- TOTP MFA, recovery codes and short-lived MFA challenges.
- Workspace RBAC plus server-side authorization on every project, artifact, deployment, consultation, collateral, export, comment, connector and revenue workspace.
- OIDC SSO with PKCE, discovery, JWKS validation, state/nonce and strict issuer/audience/expiry checks.
- SCIM 2.0 provisioning with hashed bearer tokens.
- Scoped API keys and signed webhooks with HMAC-SHA256, hashed storage, revocation and SSRF restrictions.
- Static file serving rejects path traversal.
- The sandbox prototype is served only to authorized workspace members and framed with a restrictive CSP.
- Request bodies are size-limited; all user text is escaped at render time.
- JSON persistence uses atomic local writes; on Vercel it snapshots to a private Blob store with ETag conflict handling.
- Login, registration, generation, lead and sensitive-action rate limits are persistent and enforced server-side.
- Email verification, password reset, CSP/HSTS and server-side lead capture are built in.
- Request telemetry, durable jobs, checksummed backups, pre-restore safety snapshots and a tested restore path.

This is a high-quality product demo with production-oriented controls, not a certified multi-tenant SaaS. Before regulated deployment you would still add an independent penetration test, a managed database sized beyond the single-document store, an external model gateway and formal incident-response exercises. SOC 2 Type II is in progress; ISO 27001 is not certified.

## API surface

```
POST   /api/auth/register            POST /api/auth/login       POST /api/auth/logout
POST   /api/auth/verify-email        POST /api/auth/forgot-password
POST   /api/auth/reset-password      POST /api/auth/mfa/verify
GET    /api/auth/mfa                 POST /api/auth/mfa/setup
POST   /api/auth/mfa/confirm         POST /api/auth/mfa/disable
GET    /api/auth/sso/status          GET  /api/auth/sso/start
GET    /api/auth/sso/callback
GET    /api/me                       GET  /api/catalog          GET  /api/health
GET    /api/workspace                POST /api/workspace/members
PATCH  /api/workspace/members/:id    DELETE /api/workspace/members/:id
POST   /api/workspace/invites/accept
GET    /api/workspace/sso            PUT  /api/workspace/sso
GET    /api/workspace/scim-token     POST /api/workspace/scim-token
GET    /api/projects                 POST /api/projects
GET    /api/projects/:id             PATCH /api/projects/:id
POST   /api/projects/:id/chat        POST /api/projects/:id/run
POST   /api/projects/:id/run-all     GET  /api/projects/:id/sandbox
POST   /api/projects/:id/deploy      POST /api/projects/:id/consultation
POST   /api/projects/:id/collateral  GET  /api/projects/:id/pack
GET    /api/projects/:id/comments    POST /api/projects/:id/comments
DELETE /api/projects/:id/comments/:commentId
POST   /api/projects/:id/deployments/:depId/approve
POST   /api/projects/:id/deployments/:depId/reject
GET    /api/artifacts/:id            POST /api/artifacts/:id/approve
POST   /api/artifacts/:id/reopen     GET  /api/artifacts/:id/export?format=pdf|docx|pptx|xlsx|md|json
POST   /api/collaterals/:id/approve  GET  /api/collaterals/:id/export?format=
GET    /api/blueprint                GET  /sandbox/:projectId
GET    /api/revenue                  POST /api/revenue/run
POST   /api/revenue/approvals/:id/decision
GET    /api/connectors               POST /api/connectors/:id/connect
POST   /api/connectors/:id/disconnect
GET    /api/api-keys                 POST /api/api-keys         DELETE /api/api-keys/:id
GET    /api/webhooks                 POST /api/webhooks         DELETE /api/webhooks/:id
POST   /api/webhooks/:id/test
GET    /api/v1/catalog               GET  /api/v1/projects
GET    /api/v1/projects/:id          GET  /api/v1/projects/:id/artifacts
POST   /api/v1/projects/:id/run
GET    /api/trust                    GET  /api/status
GET    /api/admin/observability      GET  /api/admin/jobs
POST   /api/admin/jobs/run           GET  /api/admin/backups
POST   /api/admin/backups            POST /api/admin/backups/:id/restore
POST   /api/internal/jobs/run
GET    /api/scim/v2/ServiceProviderConfig
GET    /api/scim/v2/Users            POST /api/scim/v2/Users
GET    /api/scim/v2/Users/:id        PATCH /api/scim/v2/Users/:id
DELETE /api/scim/v2/Users/:id        GET  /api/scim/v2/Groups
```

## Test

```bash
npm test
```

`test/smoke.js` boots a disposable server on a temporary database with `KILN_EXPOSE_TEST_LINKS=1`, `KILN_ALLOW_PRIVATE_WEBHOOKS=1` and a local admin email. It verifies health, CSP and static surfaces, non-enumerating registration, duplicate sign-up, email verification, login and MFA, the 12-workstream catalog, project creation, chat generate-all, all six export formats and signatures, approvals, revisioning, dev/test/prod gates, named production approval, FDE consultation, collateral exports, the delivery ZIP, tenant isolation, anonymous access, traversal, the sandbox renderer, workspace invites/RBAC, SCIM provisioning, comments, connectors, scoped API keys, signed webhooks delivered through the durable queue, trust/status pages, admin observability, jobs, backup and restore, cron authentication, the revenue swarm, orchestrator cycles, named-human approval and rejection, simulated releases and per-user revenue isolation. It deletes its temporary data on exit and does not touch `data/db.json`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4517` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `KILN_DATA_DIR` | `./data` | Local JSON cache directory; `/tmp/kiln-data` when `VERCEL` is set |
| `KILN_BLOB_PATH` | `kiln/db.json` | Blob object path; override for isolated QA runs |
| `BLOB_READ_WRITE_TOKEN` | unset | Private Vercel Blob token; enables durable serverless persistence |
| `BLOB_STORE_ID` | derived | Vercel Blob store id used with the read/write token |
| `KILN_SEED_DEMO` | `1` | Set to `0` to skip the demo workspace |
| `KILN_ADMIN_EMAIL` | `bidyut.banerjee@gmail.com` | Owner of `/api/admin/*` operations and the Operations console view |
| `KILN_OIDC_ISSUER` | unset | OIDC issuer URL for enterprise SSO; workspace-level config can override it |
| `KILN_OIDC_CLIENT_ID` | unset | OIDC client ID |
| `KILN_OIDC_CLIENT_SECRET` | unset | OIDC client secret for confidential clients |
| `KILN_OIDC_REDIRECT_URI` | derived | OIDC callback, e.g. `https://example.com/api/auth/sso/callback` |
| `KILN_OIDC_SCOPES` | `openid email profile` | OIDC scopes |
| `KILN_CRON_SECRET` | unset | Bearer secret for `POST /api/internal/jobs/run`; scheduling is disabled without it |
| `KILN_ALLOW_PRIVATE_WEBHOOKS` | unset | Test-only override allowing localhost/private webhook receivers |
| `KILN_EXPOSE_TEST_LINKS` | unset | Test-only; exposes verification links when email is also in test-outbox mode |
| `NODE_ENV` | unset | Set to `production` for Secure cookies |
| `VERCEL` | unset | Set automatically by Vercel; switches the local cache to `/tmp/kiln-data` |

## Deploy to Vercel

```bash
npx --yes vercel@latest deploy --prod --yes
```

`vercel.json` builds the static site from `public/`, runs `scripts/vercel-build.js` to keep the master blueprint out of `public/`, and uses `src/server.js` as the serverless request handler. The server exports its handler as the default export (and as `.handler` / `.server`) so Vercel can invoke it.

**Persistence.** Vercel Functions have an ephemeral, per-instance filesystem. When `BLOB_READ_WRITE_TOKEN` and `BLOB_STORE_ID` are configured, Kiln hydrates `kiln/db.json` from a private Vercel Blob store before serving API traffic and writes changes back before the response finishes. Writes use ETags and merge on conflict, so users, sessions, billing, invoices and evidence survive cold starts and instance changes. Without those variables the store falls back to the local JSON file (and `/tmp/kiln-data` on Vercel), which remains suitable only for local development and disposable tests.

## Project map

```
src/server.js            HTTP API, authorization, routes, demo seed
src/store.js             local JSON cache + private Vercel Blob snapshot
src/auth.js              scrypt, sessions, cookies, public user shape
src/identity.js          TOTP MFA, RBAC, invitations, SCIM tokens, OIDC SSO
src/observability.js     request telemetry, durable jobs, backups and restore
src/platform.js          signed webhooks, comments, connectors, trust/status
src/engine/catalog.js    workstreams, models, services, pricing
src/engine/core.js       tiers, domain packs, inference, project context
src/engine/generators.js the twelve artifact generators
src/engine/chat.js       intent routing and chat replies
src/engine/sandbox.js    prototype HTML, scaffold, deployment simulation
src/engine/exports.js    export dispatcher and delivery pack
src/lib/                 PDF, DOCX, PPTX, XLSX and ZIP writers
public/index.html        marketing site
public/app.html          console shell, also served at /mobile
public/trust.html        public trust center and security posture
public/developers.html   public API, webhook and SCIM documentation
public/manifest.webmanifest  PWA identity, icons and shortcuts
public/sw.js             app-shell service worker (API is never cached)
public/assets/           design system, client logic and PWA icons
api/                     Vercel function adapters for the same handler
vercel.json              static output, rewrites, headers and function config
scripts/vercel-build.js  copies the blueprint into the static output
docs/MASTER_PROMPT.md    Phase 0–3 blueprint and agent specification
docs/DR.md               backup, restore and disaster-recovery runbook
test/smoke.js            disposable end-to-end smoke test
```

## Honest boundaries

- Generation is seeded locally, not a live LLM call. The model selector is a product surface.
- Deployments are simulated delivery evidence; they do not push to a cloud account.
- Billing, transactional email and CRM remain in explicitly labelled test mode until real Stripe, email-provider and CRM credentials are configured. No card is charged and no CRM or email message leaves the system in test mode.
- Enterprise SSO is implemented as OIDC (authorization code + PKCE). SAML is not claimed or implemented.
- Connectors in the marketplace are simulated connection records; they do not call Slack, GitHub, HubSpot, Salesforce or a database until provider credentials and an adapter are added.
- SCIM 2.0 covers users, groups mapped to workspace roles and ServiceProviderConfig; bulk operations are not implemented.
- The sandbox prototype is a generated interactive shell over synthetic data.
- Artifacts are drafts and proposals are not sent to anyone until a human approves and exports them.
- Revenue Swarm connectors are simulated. Approving an outbound message, SOW, plan change, publish action or standing-rule change records a simulated release in the audit log; it does not contact a real CRM, email provider, Stripe account or calendar.
- Revenue Swarm data is seeded demo data, not a live pipeline. Agent evidence, confidence, model/timestamp and audit entries are illustrative unless a live integration is added.
>>>>>>> 9e67eab (Kiln: Interactive FDE Forum + production deployment)
