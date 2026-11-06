# Kiln — Master Build Prompt & Platform Blueprint

> **How to use this document.** This is the authoritative prompt pack for building, extending or evaluating Kiln. It contains the product definition (Phase 0), the workstream catalogue (Phase 1), the end-to-end agentic specification with human-in-the-loop guardrails (Phase 2), and the "You are the creator of your business" validation and delivery model (Phase 3). Hand it to a product or engineering agent as the source of truth.

---

## 0. One-line proposition

**Kiln turns a sentence into shipped software — with evidence, exports and a named human at every gate.**

Kiln is an agentic delivery platform for three customer tiers (Small Scale, SMB, Enterprise). A user registers, describes an idea in a live chat interface, selects an open-source model for prototyping, and receives twelve executable workstreams — from ideation and competitor analysis to architecture, modernization, testing, proposals, capacity planning and GCC setup. Each workstream produces a real artifact with PDF, Word, PowerPoint, Excel, Markdown and JSON exports, inside an isolated per-user sandbox with a working prototype and staged deployments.

**Non-negotiables**
1. Every generated artifact is a **draft** until a named human approves it.
2. No client commitment, price, legal position or production promotion is ever made autonomously.
3. Every recommendation carries evidence, confidence and disclosed assumptions.
4. Generated data must be specific to the user's brief and tier — never generic lorem ipsum.
5. Exports must be genuine files that open in Word, PowerPoint, Excel and a PDF reader.

---

## 1. Phase 0 — Home page information architecture

Create a distinct marketing home page (the product console is a separate route, `/app`).

### 1.1 Sections, in order

1. **Hero** — proposition, proof metrics, primary CTA to open the console, secondary CTA to explore workstreams.
2. **Business categories** — three cards: Small Scale, SMB, Enterprise. Each states who it is for, price floor, delivery shape, compliance posture and support. Under each category, expose the twelve workstream functions with a one-line outcome. Tabs may reveal the full list, but all three categories must visibly carry all twelve.
3. **Product & Platform (combined)** — one section with two halves: *Product* (console, chat, artifact studio, sandbox, proposal studio) and *Platform* (generation engine, model gateway, connector marketplace, evaluation, evidence log, policy gates). Do not split into two separate sections.
4. **Delivery Assurance & Evidence** — a single section combining **delivery**, **proof** and **insights**. Use exactly this name. Content: stage gates, SBOM and signed artifacts, immutable evidence log, release readiness, adoption/value telemetry, monthly value review.
5. **Pricing (separate)** — three plans with subscription, seats, sandboxes, AI credits, compliance, support and CTA. Pricing must not be nested inside the category section.
6. **Services** — four offers: **FDE Consultation**, **FDE Deployment**, **FDE Training**, **Support**. Each with price, unit, inclusions, best-fit and CTA.
7. **"You are the creator of your business"** — an interactive readiness test (see Phase 3), scored in the browser, with an idea field that carries into registration.
8. **Footer** — product, platform, trust, legal, contact.

### 1.2 Business category definitions

| Tier | Who | Subscription | Build from | Default pod | Sandboxes | Availability | Compliance |
|---|---|---|---|---|---|---|---|
| Small Scale | Founders, lean product teams | $490 / mo, 3 seats | $12k | 3–5 | 3 | 99.5% | OWASP + GDPR-aware |
| SMB | Scaling companies, 20–500 staff | $2,400 / mo, 15 seats | $90k | 8–14 | 10 | 99.9% | SOC 2 track, DPA, SSO |
| Enterprise | Regulated enterprises, GCC programmes | Custom annual | $450k | 25–45 | 40 | 99.95% | SOC 2 II, ISO 27001, HIPAA/residency |

Tier must change **content**, not just labels: scale of market model, pod shape, timeline, compliance controls, number of services, release gates, capacity model and proposal commercial terms.

---

## 2. Phase 1 — Twelve workstreams under every category

All twelve exist under **each** tier. Tier changes depth, scale and guardrail ceremony.

1. **Ideation to Prototype** — NLP intake, validation, market cap and value, solution visualisation, security needs, scalability.
2. **Discovery & Competitor Analysis** — connector marketplace, competitor analytics with confidence, RAG training, predictability scoring, top use cases, PDF report.
3. **FDE Consultation** — intake, interview synthesis, landscape assessment, risk/RAID, ADRs, blueprint, estimation, workshop support, reporting.
4. **Architecture Design & Review** — linting, DDD boundaries, ADRs, STRIDE, NFR trade-offs, pattern fit, diagram-as-code, drift, cost model, ARB pack.
5. **Legacy → Microservices** — portfolio scoring, dependency graphs, domainification, boundaries, strangler waves, refactor scaffolds, DB decomposition, equivalence tests, debt, runbook, rollback.
6. **Reverse Engineering with REA** — artifact triage, backend orchestration, behavioural questions, call graphs, evidence synthesis, parity checklist, API surface, business rules, confidence disclosure. Reference: <https://dev.to/arshtechpro/rea-let-your-ai-agent-reverse-engineer-the-app-features-you-wish-you-had-3en7>
7. **AI DLC & Deployment** — agentic code/PR review, SmartBuild, predictive test selection, IaC drift, environments, canary, readiness scoring, self-healing, SBOM, audit trail.
8. **Testing with AI** — diff-aware generation per deployment, story→scenario, self-healing, synthetic data, risk prioritisation, E2E/API/perf/security, flake quarantine, triage, equivalence, quality gates.
9. **AI FDE as a Service** — qualification, knowledge retrieval, options, SOW, pricing, staffing, stakeholder Q&A, knowledge capture, escalation triggers.
10. **Proposal Design** — CRM ingestion, tier templates, content blocks, architecture/roadmap slides, pricing, PPT/PDF/Word, consistency checks, competitive positioning, versioning, personalisation.
11. **Capacity Planning: DPR & RLS** — demand forecast, daily projection, resource loading, skill gaps, scenarios, dependency constraints, anomalies, Excel with formulas, thresholds.
12. **Managed Services & GCC Setup** — service catalog/SLAs, operating model, org design, site scoring, compliance, tooling, PPT, roadmap, investment, risk, transition.

### 2.1 Capability inventory (authoritative)

Every capability below must be present in the function's catalog entry, visible in the workstream UI, referenced in the generated artifact where relevant, and governed by the stated human guardrails.

**1. Ideation to Prototype**
- NLP-based chat interface for idea intake and clarification
- Ideation validation against market competitors
- Market cap and business value it delivers
- Solution visualization with a clickable prototype
- Security needs and data-handling posture
- Scalability for large-scale processing
- Value levers, success metrics and experiment plan
- Guardrails: founder confirms the problem statement; assumptions disclosed with confidence; security review before real user data.

**2. Discovery & Competitor Analysis**
- Connector marketplace for pick-and-choose evidence sources
- Competitor analytics and confidence scoring
- Machine learning for training RAG for agents
- Predictability scoring for prototype-to-production success
- Top use cases for the prototype
- PDF report with sources, assumptions and whitespace map
- Guardrails: source provenance on every claim; no confidential competitor data; FDE reviews scoring weights.

**3. FDE Consultation**
- Discovery intake and artifact ingestion agent (questionnaires, transcripts, docs)
- Stakeholder interview synthesis and requirement extraction
- Technical landscape assessment agent (repos, CI/CD, cloud configs, dependency and licensing inventory)
- Delivery risk scoring and RAID log generation
- ADR drafting agent (options, trade-offs, recommendation)
- Solution blueprint co-authoring (C4 diagrams, integration topology)
- Estimation and cost model generator (story points, T-shirt sizing, resource mix)
- Workshop facilitation support (agenda, live capture, action items)
- Engagement reporting and status narrative
- Guardrails: FDE sign-off on recommendations; customer validation; pricing approval.

**4. Architecture Design & Review**
- Automated architecture linting (dependency direction, coupling, cyclic dependencies)
- Bounded context and domain decomposition proposal
- ADR generation and traceability
- Threat modeling (STRIDE) and security review
- NFR / quality attribute scenario generation and trade-off analysis
- Reference architecture pattern retrieval and fit scoring
- Diagram-as-code generation (C4, sequence, deployment)
- Architecture drift detection (design vs as-built)
- Cost and performance modeling per design option
- Review board pack assembly and decision log
- Guardrails: ARB approval; architect sign-off; exceptions register.

**5. Legacy → Microservices**
- Portfolio scan and modernization candidate scoring
- Code and data dependency graph construction
- Bounded context discovery via domainification (DDD + AI clustering)
- Service boundary and data ownership proposal
- Strangler-fig migration plan and sequencing (wave planning)
- Automated refactoring: service skeleton, API contract (OpenAPI), containerization, IaC
- Database decomposition plan and data migration scripts with reconciliation
- Behavioral equivalence test generation against legacy baseline
- Technical debt and dead-code identification
- Migration runbook and rollback plan generation
- Guardrails: architect approval of boundaries; parallel-run validation; production cutover human go/no-go.

**6. Reverse Engineering with REA**
- Artifact triage and format identification (native, APK, .NET, JS/Electron, firmware, WASM, web)
- Analysis backend selection and orchestration (Ghidra, IDA, JADX, Hopper)
- Behavioral question formulation and evidence-backed answering
- Call-graph, module and function inventory extraction
- Pseudocode and assembly evidence synthesis into behavior specs
- Feature parity checklist generation from evidence
- Protocol and API surface reconstruction
- Undocumented business rule extraction for domainification
- Confidence scoring and limitation disclosure
- Guardrails: licensed tool compliance (IDA); legal/IP review before use; human verification of high-impact behavior claims; no source-code claim.

**7. AI DLC & Deployment**
- Agentic code generation and PR review
- SmartBuild: build failure prediction and optimization
- Predictive test selection per change
- IaC generation and drift remediation
- Environment provisioning and configuration management
- Canary analysis and progressive delivery automation
- Release readiness scoring and deployment gate evaluation
- Self-healing and auto-rollback
- Change audit trail and SBOM generation
- Guardrails: production promotion human approval; policy-as-code gates; two-person rule for infrastructure changes.

**8. Testing with AI**
- Diff-aware test generation per deployment
- Requirement/story to test scenario derivation
- Self-healing test maintenance
- Test data generation and masking/synthetic data
- Risk-based test prioritization and coverage gap analysis
- E2E, API, performance and security test generation
- Flaky test detection and quarantine
- Defect triage, dedup and root-cause suggestion
- Behavioral-equivalence regression for migrations
- Test reporting and quality gate decisioning
- Guardrails: test oracle approval for critical paths; sign-off on waivers; human review of AI-authored critical test cases.

**9. AI FDE as a Service**
- Intake and qualification agent (scope, fit, tier)
- Knowledge retrieval (patterns, accelerators, past engagements, RAG)
- Solution option generation with trade-off analysis
- SOW/scope drafting
- Effort, cost and pricing recommendation
- Delivery plan and staffing proposal
- Q&A assistant for client stakeholders
- Engagement knowledge capture and reuse
- Escalation to human FDE triggers
- Guardrails: FDE validates all client-facing outputs; pricing approval; no autonomous commitments.

**10. Proposal Design**
- CRM/discovery data ingestion and proposal assembly
- Tier-specific template selection (Small/SMB/Enterprise)
- Content block generation and reuse library management
- Architecture and roadmap slide generation
- Pricing and commercial model computation per tier
- Multi-format export (PPT/PDF/Word) with branding
- Consistency checks: scope–price–timeline alignment
- Competitive positioning insertion
- Version control and approval workflow
- Personalization per stakeholder role
- Guardrails: technical accuracy review by FDE; commercial approval; brand/legal review; no auto-send.

**11. Capacity Planning: DPR & RLS**
- Demand forecasting from pipeline and backlog
- DPR generation (daily projection, constraint alerts, scenario comparison)
- RLS generation (role/skill allocation, bench visibility, utilization)
- Skill-gap and hiring trigger detection
- Scenario simulation (what-if investment vs outage risk)
- Dependency-constrained capacity logic (not just seat counting)
- Anomaly detection on utilization/overrun
- Excel workbook generation with formulas/dashboards
- Escalation and threshold alerting
- Guardrails: delivery-lead approval of allocations; HR/finance sign-off on hiring triggers; monthly capacity review.

**12. Managed Services & GCC Setup**
- Service catalog and SLA definition generation
- Operating model design (build–operate–transfer)
- Org design, role taxonomy and staffing model
- Location/talent market analysis and site selection scoring
- Compliance/regulatory readiness assessment
- Tooling/platform stack blueprint
- PPT deck generation (per workstream)
- Phasing roadmap and investment model
- Risk register and mitigation planning
- Transition/expansion plan (scale, transfer-to-client)
- Guardrails: steering committee approval; legal/entity setup human-owned; compliance sign-off.

### 2.2 Tier behaviour examples

- **Ideation:** founder-led wedge (Small) → multi-persona pilot with integration proof (SMB) → portfolio view and investment committee pack (Enterprise).
- **Architecture:** modular monolith (Small) → service-oriented core (SMB) → domain-aligned services, multi-region, ARB (Enterprise).
- **Proposal:** 8–10 slide fixed-scope (Small) → phased commercial with options (SMB) → board pack with multi-lot pricing and compliance appendices (Enterprise).

---

## 3. Phase 2 — Master prompt: expand each workstream into an agentic system

> **MASTER PROMPT.** You are the principal architect of an agentic delivery platform. For each of the twelve workstreams below, design and implement an end-to-end agentic system with autonomous execution inside explicit human-in-the-loop guardrails. Each system must ingest the customer brief, retrieve approved knowledge, plan, act through tools, self-check, produce a structured artifact, export it in the required formats, and stop at every commitment boundary for named human approval. Output must be evidence-backed, tier-aware and reproducible from a seed. Where a capability is illustrative, label it. Never fabricate a source, a customer, a legal position or a production result.

### 3.1 Common agent contract

Every workstream agent must implement:

- **Intake** — structured brief, tier, constraints, named owners, data classification.
- **Plan** — decompose into steps with tool selection, expected artifacts and stop conditions.
- **Retrieve** — approved corpus only; record source, freshness and confidence.
- **Act** — tools are allow-listed per workstream; all writes are scoped and idempotent.
- **Self-check** — schema validation, tier alignment, scope–price–timeline consistency, guardrail evaluation.
- **Artifact** — typed sections (kpis, prose, bullets, table, timeline, bars, callout, checklist, keyvalue) rendered to UI, PDF, DOCX, PPTX, XLSX, Markdown, CSV, JSON.
- **Approval** — draft → in review → approved/rejected, with approver identity, timestamp, revision and evidence.
- **Audit** — append-only event: who, what, when, model, prompt version, evidence IDs, decision.
- **Failure** — explicit low-confidence output, abstain where evidence is insufficient, escalate to a human FDE.

### 3.2 Workstream agent specifications

#### 1. Ideation to Prototype
Agents: intake/clarifier, market validator, value modeller, prototype composer, security assessor, scale planner.
Capabilities: NLP chat intake; competitor validation; TAM/SAM/SOM and value levers; clickable prototype; security needs; scalability posture; kill criteria.
Guardrails: founder confirms problem and persona; assumptions disclosed with confidence; security review before real user data; no market-size claim without provenance.

#### 2. Discovery & Competitor Analysis
Agents: connector broker, evidence collector, competitor analyst, RAG curator, predictability scorer, report composer.
Capabilities: choose connectors; competitor matrix and confidence; RAG corpus and eval design; prototype→production predictability; ranked use cases; PDF.
Guardrails: source provenance per claim; no confidential competitor data; FDE reviews scoring weights; hypotheses explicitly labelled.

#### 3. FDE Consultation
Agents: intake ingestion, interview synthesis, landscape scanner, risk/RAID, ADR drafter, blueprint co-author, estimator, workshop facilitator, status narrator.
Capabilities: parse questionnaires/transcripts/docs; extract requirements; scan repos/CI/CD/cloud/licences; risk score; options and trade-offs; C4 topology; points/cost/resource mix; live capture; engagement narrative.
Guardrails: FDE signs recommendations; customer validates; pricing approved; no autonomous client commitments.

#### 4. Architecture Design & Review
Agents: lint, domain decomposition, ADR, threat model, NFR analyst, pattern retriever, diagram generator, drift detector, cost modeller, ARB packager.
Capabilities: dependency/coupling/cycle lint; bounded contexts; STRIDE; quality attribute scenarios; pattern fit; C4/sequence/deployment as code; design-vs-as-built drift; option cost/perf; decision log.
Guardrails: ARB approval; architect sign-off; exceptions register; no production change from this agent.

#### 5. Legacy → Microservices
Agents: portfolio scanner, dependency graph, domainification, boundary proposer, wave planner, refactor agent, data migration planner, equivalence tester, debt analyst, runbook author.
Capabilities: candidate scoring; code/data graph; DDD + clustering; service and data ownership; strangler sequencing; service skeleton/OpenAPI/container/IaC; DB decomposition and reconciliation; behavioural equivalence; dead code; rollback.
Guardrails: architect approves boundaries; parallel-run validation; production cutover human go/no-go; no autonomous schema drop.

#### 6. Reverse Engineering with REA
Agents: triage, backend orchestrator, question formulator, inventory, evidence synthesiser, parity analyst, protocol reconstructor, business-rule extractor, confidence assessor.
Capabilities: identify native/APK/.NET/JS-Electron/firmware/WASM/web; orchestrate Ghidra/IDA/JADX/Hopper; answer behavioural questions from pseudocode + dynamic evidence; module/function inventory; behaviour specs; parity checklist; API surface; undocumented rules.
Guardrails: licensed tool compliance (IDA seats); legal/IP review before use; human verification of high-impact claims; never claim original source code; disclose limitations.

#### 7. AI DLC & Deployment
Agents: code/PR reviewer, build optimiser, test selector, IaC agent, environment agent, canary analyst, release gate, remediation agent, audit/SBOM.
Capabilities: generation + review; build failure prediction; predictive test selection; IaC drift; provisioning; progressive delivery; readiness scoring; auto-rollback; audit and SBOM.
Guardrails: production promotion requires named human; policy-as-code gates; two-person rule for infrastructure; no silent self-healing on regulated paths.

#### 8. Testing with AI
Agents: diff analyst, scenario generator, oracle manager, data generator, risk prioritizer, suite generator, flake detector, defect triager, equivalence tester, quality gate.
Capabilities: new tests every deployment; story→scenario; self-healing; synthetic/masked data; risk coverage; E2E/API/perf/security; quarantine; dedupe and RCA; migration regression; gate decision.
Guardrails: human-approved oracles for critical paths; waivers named and expiring; human review of AI-authored critical/security tests; passing tests are evidence, not proof.

#### 9. AI FDE as a Service
Agents: qualifier, knowledge retriever, option generator, SOW drafter, pricing/effort, staffing, stakeholder Q&A, knowledge capture, escalation.
Capabilities: intake fit and tier; patterns/accelerators/past work via RAG; options with trade-offs; SOW; effort/cost/pricing; plan and staffing; Q&A; reuse; escalation.
Guardrails: human FDE validates all client-facing output; pricing approval; no autonomous commitments.

#### 10. Proposal Design
Agents: data ingestion, template selector, content composer, slide generator, pricing engine, exporter, consistency checker, positioning, version/approval, personaliser.
Capabilities: CRM/discovery ingestion; tier templates; reusable blocks; architecture/roadmap slides; commercial model; PPT/PDF/Word; scope–price–timeline checks; competitive positioning; versioning; persona variants.
Guardrails: FDE technical review; commercial approval; brand/legal review; no auto-send.

#### 11. Capacity Planning: DPR & RLS
Agents: demand forecaster, DPR generator, RLS generator, skill-gap analyst, scenario simulator, anomaly detector, workbook builder, alerting.
Capabilities: pipeline/backlog demand; daily projection with constraints; role/skill allocation, bench, utilisation; hire triggers; what-if scenarios; dependency-constrained capacity; anomalies; Excel with formulas and dashboards; thresholds.
Guardrails: delivery lead approves allocations; HR/finance approve hiring triggers; monthly capacity review.

#### 12. Managed Services & GCC Setup
Agents: service catalog/SLA, operating model, org design, site analyst, compliance assessor, tooling architect, deck builder, roadmap/investment, risk, transition.
Capabilities: catalog and SLAs; BOT/co-managed options; role taxonomy and staffing; location scoring; regulatory readiness; platform stack; PPT per workstream; phasing and investment; risk register; transfer/scale plan.
Guardrails: steering committee approval; legal/entity setup human-owned; compliance sign-off; no employment or tax commitments.

### 3.3 Cross-cutting requirements

- **Model choice:** expose open-source models (Llama 3.3 70B, Qwen2.5 Coder 32B, DeepSeek Coder V2, Mistral Small 3.1, Gemma 3 27B, Codestral 25.01). Free/open models power prototyping; production site generation and shipping require a paid plan and human approval. Record model ID on every artifact.
- **Evidence:** every artifact stores revision, model, seed, generated timestamp, confidence, assumptions and guardrail state.
- **Consistency:** scope, price and timeline must reconcile; the proposal agent must run explicit checks.
- **Reproducibility:** seeded generation from project ID, function key, revision and instruction; regenerate increments revision.
- **Isolation:** every user gets an isolated sandbox; no cross-tenant artifact or file access; ownership checked on every read and export.
- **Exports:** valid OOXML files with styled tables, charts-to-table fallbacks, formulas in capacity workbooks, branded PDFs, guardrail notices on drafts.
- **Accessibility:** keyboard reachable, labelled controls, visible focus, AA contrast, no colour-only state.

---

## 4. Phase 3 — Product console and "You are the creator of your business"

### 4.1 Category segmentation

Every user selects Small Scale, SMB or Enterprise at registration. The tier segments:
- **Content depth** — market model, competitor count, architecture options, compliance, proposal commercial structure.
- **Sandbox limits** — seats, sandboxes, model access, environments.
- **Guardrail ceremony** — approvals, ARBs, change boards, support SLAs.

### 4.2 "You are the creator of your business" test

A six-question readiness instrument on the home page:
1. Can you name the person who feels this pain weekly?
2. Is there a budget line and a decision maker?
3. Can you access the data with permission?
4. Is the first workflow narrow enough to prove in a quarter?
5. Can a wrong recommendation be corrected cheaply?
6. Do you know what would make you stop?

Score 0–18. Bands: **Shape the wedge** (0–7), **Ready for a pilot** (8–13), **Ready to build** (14–18). The result must feed the idea into registration and prefill the console.

### 4.3 Authentication and console

- Register/login with email and password (hashed with scrypt; HttpOnly session cookie).
- First-run onboarding: idea, tier, model, optional industry.
- Console with live chat: intent routing across all twelve functions, "generate all", artifact-aware replies.
- Workstream grid: 12 cards per tier, status, revision, formats, run/regenerate, open.
- Artifact studio: typed section rendering, approve/reopen, export menu, revision history, agent trace.
- Sandbox: working interactive prototype at `/sandbox/:id`, generated repo scaffold, environments dev/test/prod, generated tests per deployment, production approval gate, SBOM summary.
- FDE consultation: request form, matched FDE pod, generated brief.
- Proposals & collaterals: proposal artifacts plus one-pager, battlecard, case study, architecture brief, executive summary, FAQ; approval and export.
- Blueprint: this document, readable and downloadable.

### 4.4 Data model (minimum)

`users`, `sessions`, `projects` (idea, tier, model, codename, owner, envs), `artifacts` (projectId, functionKey, revision, status, sections, project snapshot, model, confidence, guardrails, approvals), `messages`, `deployments` (env, version, stages, tests, approvals), `consultations`, `collaterals`, `events` (audit).

### 4.5 Acceptance criteria

1. A new user can register, create a project and receive an ideation artifact within 30 seconds.
2. All twelve functions generate unique, brief-specific artifacts at every tier.
3. Each artifact exports to every format advertised, and the files open without repair prompts.
4. Capacity XLSX contains live formulas for gap and utilisation; DPR and RLS sheets are present.
5. Proposal exports to PPTX, PDF and DOCX with pricing, roadmap, assumptions and approval checks.
6. Sandbox prototype is interactive, persistent per user, and isolated.
7. Dev/test deployments generate new tests; production deployment is blocked until a named human approves.
8. No artifact can be approved by an unauthenticated user or across tenants.
9. Every draft export carries a human-in-the-loop notice.
10. Mobile layout is usable at 390 px; no horizontal scroll in the console.

---

## 5. Build order for an implementing agent

1. Domain core: tier profiles, domain packs, seeded RNG, feature inference.
2. Artifact schema + twelve generators.
3. Export engines: PDF, DOCX, PPTX, XLSX, Markdown, CSV, JSON, delivery ZIP.
4. Auth, store, API, ownership and approval.
5. Marketing home with the Phase 0 sections and the readiness test.
6. Console: chat, workstreams, artifact studio, exports.
7. Sandbox prototype, scaffold, deployments and promotion gate.
8. FDE consultation, proposals/collaterals, blueprint.
9. Test: unit (generation), API (auth/ownership), export validity (unzip + XML parse), UI (desktop/mobile), security (path traversal, cross-tenant).
10. Seed a demo account with a realistic multi-workstream workspace.

---

## 6. Quality bar

- **Editorial, not generic.** Warm paper, ink, ember and moss. Serif display, sans body. No purple gradients, no stock SaaS sameness.
- **Dense but legible.** Real numbers, real trade-offs, named owners, dates, thresholds.
- **Show the seams.** Draft labels, confidence, assumptions and limitations are features.
- **Human authority is visible.** Approval is a designed moment, not a checkbox hidden in settings.
- **Every export is a deliverable.** If it would embarrass you in a client meeting, fix the generator.

---

_End of blueprint. Version 1.0 · Kiln · kiln.studio_
