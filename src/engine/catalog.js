'use strict';
/** Shared product catalog: tiers, workstreams, models, services. */

const FORMAT_LABELS = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel', md: 'Markdown', json: 'JSON' };

const FUNCTIONS = [
  {
    key: 'ideation', n: 1, name: 'Ideation to Prototype', short: 'Turn a sentence into a validated, clickable prototype.',
    outcome: 'A scoped prototype, market case, security posture and scalability path — in one artifact.',
    formats: ['pdf', 'pptx', 'docx', 'md', 'json'],
    capabilities: [
      'NLP-based chat interface for idea intake and clarification',
      'Ideation validation against market competitors',
      'Market cap and business value it delivers',
      'Solution visualization with a clickable prototype',
      'Security needs and data-handling posture',
      'Scalability for large-scale processing',
      'Value levers, success metrics and experiment plan',
    ],
    guardrails: ['Founder confirms problem statement', 'Assumptions disclosed with confidence', 'Security review before real user data'],
    tierNotes: {
      small: 'Single product wedge, 6–10 week prototype, founder-led validation.',
      smb: 'Multi-persona prototype with integration proof and a pilot commercial model.',
      enterprise: 'Opportunity portfolio view, architecture pre-conditions and investment committee pack.',
    },
  },
  {
    key: 'discovery', n: 2, name: 'Discovery & Competitor Analysis', short: 'Evidence-backed market, competitor and predictability analysis.',
    outcome: 'A ranked use-case portfolio, competitor matrix, confidence model and production-success prediction.',
    formats: ['pdf', 'docx', 'xlsx', 'md', 'json'],
    capabilities: [
      'Connector marketplace for pick-and-choose evidence sources',
      'Competitor analytics and confidence scoring',
      'Machine learning for training RAG for agents',
      'Predictability scoring for prototype-to-production success',
      'Top use cases for the prototype',
      'PDF report with sources, assumptions and whitespace map',
    ],
    guardrails: ['Source provenance on every claim', 'No confidential competitor data', 'FDE reviews scoring weights'],
    tierNotes: {
      small: 'Desk research, 5–8 competitors, two-week signal sprint.',
      smb: 'Primary interviews, 10–15 competitors, win/loss evidence.',
      enterprise: 'Analyst-grade market model, regulatory scan, board-ready synthesis.',
    },
  },
  {
    key: 'fde-consult', n: 3, name: 'FDE Consultation', short: 'Technical and delivery consultation with a forward-deployed engineer.',
    outcome: 'Landscape assessment, RAID log, ADRs, estimate and a co-authored solution blueprint.',
    formats: ['pdf', 'docx', 'pptx', 'md', 'json'],
    capabilities: [
      'Discovery intake and artifact ingestion agent (questionnaires, transcripts, docs)',
      'Stakeholder interview synthesis and requirement extraction',
      'Technical landscape assessment agent (repos, CI/CD, cloud configs, dependency and licensing inventory)',
      'Delivery risk scoring and RAID log generation',
      'ADR drafting agent (options, trade-offs, recommendation)',
      'Solution blueprint co-authoring (C4 diagrams, integration topology)',
      'Estimation and cost model generator (story points, T-shirt sizing, resource mix)',
      'Workshop facilitation support (agenda, live capture, action items)',
      'Engagement reporting and status narrative',
    ],
    guardrails: ['FDE sign-off on recommendations', 'Customer validation workshop', 'Pricing approval before release'],
    tierNotes: {
      small: 'Two facilitated sessions, lightweight assessment, founder decision pack.',
      smb: 'Structured discovery, stakeholder interviews, delivery risk model.',
      enterprise: 'Multi-team assessment, ARB-ready blueprint, programme governance.',
    },
  },
  {
    key: 'architecture', n: 4, name: 'Architecture Design & Review', short: 'Design, lint and govern architecture with evidence.',
    outcome: 'Bounded contexts, ADRs, STRIDE review and an ARB-ready decision pack.',
    formats: ['pdf', 'docx', 'pptx', 'md', 'json'],
    capabilities: [
      'Automated architecture linting (dependency direction, coupling, cyclic dependencies)',
      'Bounded context and domain decomposition proposal',
      'ADR generation and traceability',
      'Threat modeling (STRIDE) and security review',
      'NFR / quality attribute scenario generation and trade-off analysis',
      'Reference architecture pattern retrieval and fit scoring',
      'Diagram-as-code generation (C4, sequence, deployment)',
      'Architecture drift detection (design vs as-built)',
      'Cost and performance modeling per design option',
      'Review board pack assembly and decision log',
    ],
    guardrails: ['Architecture review board approval', 'Named architect sign-off', 'Exceptions register maintained'],
    tierNotes: {
      small: 'Modular monolith with clean boundaries; defer distributed complexity.',
      smb: 'Service-oriented core, managed data plane, cost-aware patterns.',
      enterprise: 'Domain-aligned services, multi-region posture, ARB controls.',
    },
  },
  {
    key: 'modernization', n: 5, name: 'Legacy to Microservices', short: 'Modernise monoliths with strangler-fig sequencing and proof.',
    outcome: 'Candidate scoring, service boundaries, wave plan, API contracts and equivalence tests.',
    formats: ['pdf', 'docx', 'xlsx', 'md', 'json'],
    capabilities: [
      'Portfolio scan and modernization candidate scoring',
      'Code and data dependency graph construction',
      'Bounded context discovery via domainification (DDD + AI clustering)',
      'Service boundary and data ownership proposal',
      'Strangler-fig migration plan and sequencing (wave planning)',
      'Automated refactoring: service skeleton, API contract (OpenAPI), containerization, IaC',
      'Database decomposition plan and data migration scripts with reconciliation',
      'Behavioral equivalence test generation against legacy baseline',
      'Technical debt and dead-code identification',
      'Migration runbook and rollback plan generation',
    ],
    guardrails: ['Architect approves boundaries', 'Parallel-run validation before cutover', 'Production cutover human go/no-go'],
    tierNotes: {
      small: 'Extract one high-value capability; keep the monolith as system of record.',
      smb: 'Three to five services around clear seams; shared platform baseline.',
      enterprise: 'Portfolio waves, domain ownership model, programme-level cutover governance.',
    },
  },
  {
    key: 'rea', n: 6, name: 'Reverse Engineering with REA', short: 'Recover behaviour and feature parity from shipped artifacts.',
    outcome: 'Evidence-backed behaviour specs, call graphs, API surface and parity checklist.',
    formats: ['pdf', 'docx', 'md', 'json'],
    capabilities: [
      'Artifact triage and format identification (native, APK, .NET, JS/Electron, firmware, WASM, web)',
      'Analysis backend selection and orchestration (Ghidra, IDA, JADX, Hopper)',
      'Behavioral question formulation and evidence-backed answering',
      'Call-graph, module and function inventory extraction',
      'Pseudocode and assembly evidence synthesis into behavior specs',
      'Feature parity checklist generation from evidence',
      'Protocol and API surface reconstruction',
      'Undocumented business rule extraction for domainification',
      'Confidence scoring and limitation disclosure',
    ],
    guardrails: ['Licensed tool compliance (IDA)', 'Legal / IP review before use', 'Human verification of high-impact claims', 'No source-code claim'],
    tierNotes: {
      small: 'Single target, feature parity for a rebuild or replacement decision.',
      smb: 'Multi-version comparison, integration and API surface reconstruction.',
      enterprise: 'Vendor escrow, portfolio-level knowledge recovery, legal chain of custody.',
    },
  },
  {
    key: 'dlc', n: 7, name: 'AI DLC & Deployment', short: 'Agentic build, progressive delivery and safe promotion.',
    outcome: 'Release readiness score, signed artifacts, canary analysis and an audit trail.',
    formats: ['pdf', 'xlsx', 'md', 'json'],
    capabilities: [
      'Agentic code generation and PR review',
      'SmartBuild: build failure prediction and optimization',
      'Predictive test selection per change',
      'IaC generation and drift remediation',
      'Environment provisioning and configuration management',
      'Canary analysis and progressive delivery automation',
      'Release readiness scoring and deployment gate evaluation',
      'Self-healing and auto-rollback',
      'Change audit trail and SBOM generation',
    ],
    guardrails: ['Human approval for production promotion', 'Policy-as-code gates', 'Two-person rule for infrastructure changes'],
    tierNotes: {
      small: 'Managed CI, two environments, automatic rollback, low ceremony.',
      smb: 'Dev / test / prod, canary by default, change evidence for customers.',
      enterprise: 'Signed supply chain, policy gates, separation of duties, audit export.',
    },
  },
  {
    key: 'testing', n: 8, name: 'Testing with AI', short: 'New tests on every deployment, risk-based and self-healing.',
    outcome: 'Diff-aware test suites, coverage-gap analysis and a quality gate decision.',
    formats: ['pdf', 'xlsx', 'md', 'json'],
    capabilities: [
      'Diff-aware test generation per deployment',
      'Requirement/story to test scenario derivation',
      'Self-healing test maintenance',
      'Test data generation and masking/synthetic data',
      'Risk-based test prioritization and coverage gap analysis',
      'E2E, API, performance and security test generation',
      'Flaky test detection and quarantine',
      'Defect triage, dedup and root-cause suggestion',
      'Behavioral-equivalence regression for migrations',
      'Test reporting and quality gate decisioning',
    ],
    guardrails: ['Test oracle approval for critical paths', 'Sign-off on waivers', 'Human review of AI-authored critical tests'],
    tierNotes: {
      small: 'Critical-path E2E plus API contracts; manual exploratory still valuable.',
      smb: 'Risk-based regression, shift-left API and performance checks.',
      enterprise: 'Evidence-grade coverage, equivalence suites, regulated release gates.',
    },
  },
  {
    key: 'fde-service', n: 9, name: 'AI FDE as a Service', short: 'A productised FDE bench for consultation and solutioning.',
    outcome: 'Qualification, options, SOW, pricing and staffing — validated by a human FDE.',
    formats: ['pdf', 'docx', 'pptx', 'md'],
    capabilities: [
      'Intake and qualification agent (scope, fit, tier)',
      'Knowledge retrieval (patterns, accelerators, past engagements, RAG)',
      'Solution option generation with trade-off analysis',
      'SOW/scope drafting',
      'Effort, cost and pricing recommendation',
      'Delivery plan and staffing proposal',
      'Q&A assistant for client stakeholders',
      'Engagement knowledge capture and reuse',
      'Escalation to human FDE triggers',
    ],
    guardrails: ['FDE validates all client-facing outputs', 'Pricing approval required', 'No autonomous commitments'],
    tierNotes: {
      small: 'Async FDE review plus a fixed-scope solutioning sprint.',
      smb: 'Named FDE, weekly solutioning cadence, proposal-ready outputs.',
      enterprise: 'Embedded FDE pod, multi-workstream solutioning, exec escalation path.',
    },
  },
  {
    key: 'proposal', n: 10, name: 'Proposal Design', short: 'Tier-aware proposals in PowerPoint, PDF and Word.',
    outcome: 'A commercially consistent proposal with architecture, roadmap, pricing and approvals.',
    formats: ['pptx', 'pdf', 'docx', 'md'],
    capabilities: [
      'CRM/discovery data ingestion and proposal assembly',
      'Tier-specific template selection (Small/SMB/Enterprise)',
      'Content block generation and reuse library management',
      'Architecture and roadmap slide generation',
      'Pricing and commercial model computation per tier',
      'Multi-format export (PPT/PDF/Word) with branding',
      'Consistency checks: scope–price–timeline alignment',
      'Competitive positioning insertion',
      'Version control and approval workflow',
      'Personalization per stakeholder role',
    ],
    guardrails: ['FDE technical accuracy review', 'Commercial approval', 'Brand / legal review', 'No auto-send'],
    tierNotes: {
      small: '8–10 slide founder proposal with a fixed price and clear scope edges.',
      smb: 'Full commercial proposal with phased roadmap and options.',
      enterprise: 'Board-grade pack, multi-lot pricing, compliance and transition appendices.',
    },
  },
  {
    key: 'capacity', n: 11, name: 'Capacity Planning: DPR & RLS', short: 'Daily projection and resource loading with live Excel formulas.',
    outcome: 'A formula-driven workbook with DPR, RLS, scenarios and escalation thresholds.',
    formats: ['xlsx', 'pdf', 'md'],
    capabilities: [
      'Demand forecasting from pipeline and backlog',
      'DPR generation (daily projection, constraint alerts, scenario comparison)',
      'RLS generation (role/skill allocation, bench visibility, utilization)',
      'Skill-gap and hiring trigger detection',
      'Scenario simulation (what-if investment vs outage risk)',
      'Dependency-constrained capacity logic (not just seat counting)',
      'Anomaly detection on utilization/overrun',
      'Excel workbook generation with formulas/dashboards',
      'Escalation and threshold alerting',
    ],
    guardrails: ['Delivery lead approves allocations', 'HR / finance sign-off on hiring triggers', 'Monthly capacity review'],
    tierNotes: {
      small: 'Shared bench, weekly granularity, founder approval.',
      smb: 'Role-level DPR/RLS, monthly hiring triggers, utilisation guardrails.',
      enterprise: 'Programme-level capacity, dependency constraints, finance-grade workbook.',
    },
  },
  {
    key: 'gcc', n: 12, name: 'Managed Services & GCC Setup', short: 'Stand up a managed service or GCC with an operating model.',
    outcome: 'Service catalog, SLAs, org design, site scoring, compliance readiness and a PPT deck.',
    formats: ['pptx', 'pdf', 'docx', 'md'],
    capabilities: [
      'Service catalog and SLA definition generation',
      'Operating model design (build–operate–transfer)',
      'Org design, role taxonomy and staffing model',
      'Location/talent market analysis and site selection scoring',
      'Compliance/regulatory readiness assessment',
      'Tooling/platform stack blueprint',
      'PPT deck generation (per workstream)',
      'Phasing roadmap and investment model',
      'Risk register and mitigation planning',
      'Transition/expansion plan (scale, transfer-to-client)',
    ],
    guardrails: ['Steering committee approval', 'Legal / entity setup is human-owned', 'Compliance sign-off'],
    tierNotes: {
      small: 'Managed pod for a single function; shared services and light governance.',
      smb: 'Multi-function managed service with SLAs and a site shortlist.',
      enterprise: 'Full GCC blueprint: entity, location, compliance, transition and scale.',
    },
  },
];

const MODELS = [
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', family: 'Llama', params: '70B', license: 'Llama 3.3 Community', context: '128k', kind: 'general', speed: 'Balanced', bestFor: 'Discovery, proposals, narrative synthesis', default: true, code: 3 },
  { id: 'qwen2.5-coder-32b', name: 'Qwen2.5 Coder 32B', family: 'Qwen', params: '32B', license: 'Apache 2.0', context: '131k', kind: 'code', speed: 'Fast', bestFor: 'Prototype code, OpenAPI, tests, refactors', code: 5 },
  { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', family: 'DeepSeek', params: '236B MoE', license: 'DeepSeek License', context: '128k', kind: 'code', speed: 'Deep', bestFor: 'Legacy modernisation and complex refactors', code: 5 },
  { id: 'mistral-small-3.1', name: 'Mistral Small 3.1', family: 'Mistral', params: '24B', license: 'Apache 2.0', context: '128k', kind: 'general', speed: 'Fast', bestFor: 'High-volume chat, extraction, classification', code: 3 },
  { id: 'gemma-3-27b', name: 'Gemma 3 27B', family: 'Gemma', params: '27B', license: 'Gemma Terms', context: '128k', kind: 'general', speed: 'Balanced', bestFor: 'On-prem / VPC deployments, analysis', code: 2 },
  { id: 'codestral-25.01', name: 'Codestral 25.01', family: 'Mistral', params: '22B', license: 'Mistral Non-Production', context: '256k', kind: 'code', speed: 'Fast', bestFor: 'Code completion and test scaffolding', code: 5 },
];

const SERVICES = [
  {
    key: 'fde-consultation', name: 'FDE Consultation', kicker: 'Diagnose',
    price: 'From $9,500', unit: '2-week diagnostic', tone: 'ember',
    short: 'A forward-deployed engineer sits with your team, pressure-tests the idea and leaves a decision-ready blueprint.',
    includes: ['2 facilitated workshops', 'Technical landscape assessment', 'Risk-scored delivery plan', 'Build / buy / wait recommendation', 'Board-ready summary deck'],
    bestFor: 'Leaders who need a defensible answer before committing budget.',
  },
  {
    key: 'fde-deployment', name: 'FDE Deployment', kicker: 'Build',
    price: 'From $28k / mo', unit: 'embedded pod', tone: 'moss',
    short: 'A named FDE pod embeds with your team and ships into your sandbox, repos and cloud under your guardrails.',
    includes: ['Named FDE + solution architect', 'Weekly shipping cadence', 'Architecture and security reviews', 'Agentic build and test pipeline', 'Transition and enablement'],
    bestFor: 'Teams that need throughput without a six-month hiring cycle.',
  },
  {
    key: 'fde-training', name: 'FDE Training', kicker: 'Enable',
    price: 'From $6,500', unit: 'per cohort', tone: 'gold',
    short: 'An applied academy for your engineers and product leads: agentic delivery, evaluation, guardrails and operations.',
    includes: ['2-day applied workshop', 'Reference implementation', 'Prompt and eval playbooks', 'Guardrail design clinic', 'Office hours for 30 days'],
    bestFor: 'Organisations building internal agentic capability.',
  },
  {
    key: 'support', name: 'Support', kicker: 'Operate',
    price: 'From $1,900 / mo', unit: 'managed support', tone: 'ink',
    short: 'Run Kiln in production with defined response times, model operations, cost controls and a named technical account manager.',
    includes: ['P1 response from 1 hour', 'Model and prompt regression watch', 'Monthly service review', 'Capacity and cost reporting', 'Security advisory notices'],
    bestFor: 'Live products and managed-service commitments.',
  },
];

const TIER_RANK = ['small', 'smb', 'enterprise'];

const PRICING = TIER_RANK.map((key) => {
  const t = require('./core').TIERS[key];
  return {
    key, label: t.label, price: t.price, priceNote: t.priceNote, buildFrom: t.buildFrom,
    blurb: t.blurb, seats: t.seats, sandboxes: t.sandboxes, uptime: t.uptime,
    compliance: t.compliance, delivery: t.delivery, support: t.support, aiCredits: t.aiCredits,
    features: key === 'small'
      ? ['3 builder seats', '3 isolated sandboxes', 'All 12 workstreams', 'PDF / Word / PPT / Excel exports', 'Community Open Source models', 'Human-in-the-loop approvals', 'Business-hours FDE support']
      : key === 'smb'
        ? ['15 builder seats', '10 isolated sandboxes', 'All 12 workstreams + proposals', 'Connector marketplace access', 'SSO and audit log', 'Priority FDE pod hours', 'SOC 2 evidence pack']
        : ['60 builder seats', '40 isolated sandboxes', 'All workstreams + programme office', 'Private model gateway (VPC)', 'SSO / SCIM / RBAC', 'Named FDE leads + ARB', 'SOC 2, ISO 27001, residency options'],
    cta: key === 'enterprise' ? 'Talk to an FDE' : 'Start building',
  };
});

module.exports = { FUNCTIONS, MODELS, SERVICES, PRICING, FORMAT_LABELS };
