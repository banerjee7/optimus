'use strict';
/** Seeded generation primitives + domain packs used by every workstream. */

const crypto = require('crypto');

function hashSeed(input) {
  const h = crypto.createHash('sha256').update(String(input)).digest();
  return h.readUInt32LE(0);
}

class Rng {
  constructor(seed) { this.state = hashSeed(seed) || 1; }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  picks(arr, n) {
    const copy = [...arr];
    const out = [];
    while (copy.length && out.length < n) out.push(copy.splice(Math.floor(this.next() * copy.length), 1)[0]);
    return out;
  }
  chance(p) { return this.next() < p; }
  skew(max) { return Math.max(0.55, Math.min(1.65, 0.62 + this.next() * 0.95)); }
}

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const num = (n) => Math.round(n).toLocaleString('en-US');
const pct = (n) => `${Math.round(n)}%`;
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const dateStr = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const iso = (d) => new Date(d).toISOString().slice(0, 10);

const TIERS = {
  small: {
    key: 'small', label: 'Small Scale', short: 'Small', price: '$490', priceNote: 'per month, 3 builder seats',
    buildFrom: '$12k', buildMid: 26000, buildHigh: 48000, weeks: 8, team: 4, users: 1200,
    seats: 3, sandboxes: 3, uptime: '99.5%', payers: 'Founders and lean product teams',
    infra: 420, aiCredits: '150k tokens / mo', compliance: 'Baseline OWASP + GDPR-aware defaults',
    delivery: 'Guided build with async FDE review', support: 'Business hours, 1 business day',
    credit: 300, color: 'ember', blurb: 'For founders turning a validated idea into a live product without hiring a platform team.',
  },
  smb: {
    key: 'smb', label: 'SMB', short: 'SMB', price: '$2,400', priceNote: 'per month, 15 builder seats',
    buildFrom: '$90k', buildMid: 165000, buildHigh: 285000, weeks: 16, team: 11, users: 38000,
    seats: 15, sandboxes: 10, uptime: '99.9%', payers: 'Scaling companies, 20–500 staff',
    infra: 2800, aiCredits: '1.2m tokens / mo', compliance: 'SOC 2 track, DPA, SSO',
    delivery: 'Embedded FDE pod, bi-weekly steering', support: 'Priority, 4h P1 response',
    credit: 1400, color: 'moss', blurb: 'For scaling businesses that need delivery throughput, governance and a modern platform in one motion.',
  },
  enterprise: {
    key: 'enterprise', label: 'Enterprise', short: 'Enterprise', price: 'Custom', priceNote: 'annual platform + FDE pod',
    buildFrom: '$450k', buildMid: 890000, buildHigh: 1600000, weeks: 30, team: 32, users: 310000,
    seats: 60, sandboxes: 40, uptime: '99.95%', payers: 'Regulated enterprises and GCC programmes',
    infra: 18500, aiCredits: 'pooled, committed', compliance: 'SOC 2 Type II, ISO 27001, HIPAA / residency options',
    delivery: 'Programme office, named FDE leads, ARB', support: '24x7, 1h P1, named TAM',
    credit: 5200, color: 'gold', blurb: 'For enterprises modernising portfolios and standing up GCC / managed services with hard guardrails.',
  },
};

const DOMAINS = [
  {
    key: 'health', label: 'Health & Life Sciences',
    keywords: ['health', 'pharma', 'pharmacy', 'patient', 'clinic', 'hospital', 'medical', 'care', 'therapist', 'dental', 'wellness', 'mental', 'diagnos', 'nurse', 'doctor', 'ehr', 'emr'],
    entities: ['Patient', 'Care plan', 'Appointment', 'Prescription', 'Clinician', 'Claim'],
    personas: [
      ['Operations lead', 'Owns throughput, stock and staffing across sites'],
      ['Frontline clinician', 'Needs answers in seconds, inside the care moment'],
      ['Patient / caregiver', 'Wants clarity, continuity and zero repeat admin'],
      ['Compliance officer', 'Accountable for PHI handling and audit evidence'],
    ],
    metrics: ['Time to care decision', 'No-show rate', 'Stockout incidents', 'Claim rejection rate', 'Clinician admin hours'],
    compliance: ['HIPAA / PHI safeguards', 'GDPR / UK GDPR', 'HL7 FHIR interoperability', 'Clinical safety review (DCB0129-style)'],
    integrations: ['EHR / FHIR API', 'Pharmacy inventory', 'Claims clearinghouse', 'Identity (OIDC + MFA)'],
    competitors: [
      ['Aster Care', 'Vertical copilot for clinics', '$39 / clinician / mo', 'Deep EHR integrations', 'Thin forecasting and no payer loop'],
      ['Vitalis', 'Pharmacy operations suite', '$250–$900 / site / mo', 'Inventory breadth', 'Legacy UX, slow onboarding'],
      ['CuraLink', 'Patient engagement platform', 'Usage-based', 'Consumer brand and reach', 'Weak workflow automation'],
      ['Nexa Health', 'Enterprise data platform', 'Six-figure ACV', 'Security posture', 'Requires a data team to operate'],
    ],
    useCases: [
      ['Stockout prediction and auto-replenishment', 'Forecast demand per SKU and draft purchase orders for approval'],
      ['Reimbursement gap explainer', 'Translate claim rejections into a plain-language recovery plan'],
      ['Care-plan copilot', 'Summarise history and propose next actions with citations'],
      ['Intake automation', 'Convert unstructured referrals into structured, validated records'],
    ],
    risks: ['PHI exposure through model context', 'Unsafe clinical recommendation', 'Integration fragility with legacy EHR', 'Alert fatigue for frontline staff'],
  },
  {
    key: 'fintech', label: 'Financial Services',
    keywords: ['fintech', 'bank', 'payment', 'lending', 'loan', 'credit', 'insurance', 'invest', 'wealth', 'trading', 'accounting', 'invoice', 'payroll', 'tax', 'crypto', 'wallet', 'underwrit'],
    entities: ['Account', 'Transaction', 'Application', 'Policy', 'Ledger entry', 'Customer'],
    personas: [
      ['Risk & compliance lead', 'Balances growth against regulatory exposure'],
      ['Operations analyst', 'Clears exceptions and reconciles daily'],
      ['End customer', 'Expects instant, transparent money movement'],
      ['Partner engineer', 'Integrates APIs into a broader stack'],
    ],
    metrics: ['Straight-through processing rate', 'False-positive rate', 'Reconciliation break count', 'Time to decision', 'Cost per transaction'],
    compliance: ['PCI DSS scope', 'SOC 2 Type II', 'KYC / AML controls', 'PSD2 / open banking'],
    integrations: ['Core banking / ledger', 'KYC provider', 'Payment rails', 'Sanctions screening'],
    competitors: [
      ['LedgerWorks', 'Embedded finance infrastructure', '0.4–0.9% per transaction', 'Developer experience', 'Enterprise pricing cliff'],
      ['NorthPay', 'SMB payments and cashflow', '$49–$399 / mo', 'Distribution', 'Shallow underwriting'],
      ['Aperture Risk', 'AI decisioning for lenders', 'Enterprise ACV', 'Model governance', 'Long implementation'],
      ['Clarity Finance', 'Finance ops automation', '$1k–$6k / mo', 'Reconciliation depth', 'Limited real-time coverage'],
    ],
    useCases: [
      ['Exception triage and auto-reconciliation', 'Cluster breaks, propose matches and route to approvers'],
      ['Application decisioning copilot', 'Assemble evidence and draft a defensible decision memo'],
      ['Dispute resolution assistant', 'Summarise case history and recommend next action'],
      ['Cashflow forecasting', 'Predict 13-week liquidity with scenario overlays'],
    ],
    risks: ['Model risk and explainability', 'Regulatory reporting errors', 'Fraud feedback loops', 'PII in prompts and logs'],
  },
  {
    key: 'commerce', label: 'Retail & Commerce',
    keywords: ['shop', 'store', 'commerce', 'ecommerce', 'retail', 'marketplace', 'brand', 'product', 'cart', 'checkout', 'fashion', 'seller', 'merchant', 'd2c', 'catalog', 'order'],
    entities: ['Product', 'Order', 'Customer', 'Return', 'SKU', 'Promotion'],
    personas: [
      ['Merchandising lead', 'Owns range, price and margin'],
      ['Store / ops manager', 'Keeps fulfilment and service on track'],
      ['Shopper', 'Wants confidence, speed and fair price'],
      ['Growth marketer', 'Needs attribution and repeat purchase'],
    ],
    metrics: ['Conversion rate', 'Average order value', 'Return rate', 'Sell-through', 'Contribution margin'],
    compliance: ['GDPR / consent', 'PCI DSS for payments', 'Consumer protection', 'Accessibility (WCAG 2.2)'],
    integrations: ['Commerce platform', 'Payments', 'Warehouse / WMS', 'Support desk'],
    competitors: [
      ['Northline Commerce', 'Composable storefront', '$2k–$12k / mo', 'Flexibility', 'Requires engineering'],
      ['Kestrel', 'Retention automation', '$99–$999 / mo', 'Fast time to value', 'No merchandising logic'],
      ['Sable Retail', 'Unified commerce suite', 'Enterprise ACV', 'Omnichannel depth', 'Heavy implementation'],
      ['Mercato AI', 'AI merchandising assistant', 'Usage-based', 'Search relevance', 'Narrow workflow coverage'],
    ],
    useCases: [
      ['Demand-aware merchandising', 'Recommend range, price and placement per cohort'],
      ['Returns intelligence', 'Explain return drivers and propose policy or product fixes'],
      ['Assisted selling copilot', 'Give store staff product answers and basket suggestions'],
      ['Promotion simulator', 'Model margin and inventory impact before launch'],
    ],
    risks: ['Price and promotion errors', 'Inventory data quality', 'Personalisation privacy', 'Channel conflict'],
  },
  {
    key: 'saas', label: 'Software & SaaS',
    keywords: ['saas', 'software', 'platform', 'api', 'developer', 'crm', 'ops', 'workflow', 'project', 'team', 'collaborat', 'analytics', 'dashboard', 'no-code', 'automation', 'b2b'],
    entities: ['Workspace', 'User', 'Workflow', 'Integration', 'Usage record', 'Subscription'],
    personas: [
      ['Product lead', 'Owns activation and retention'],
      ['Platform engineer', 'Cares about APIs, latency and operability'],
      ['End user', 'Wants less tooling, more flow'],
      ['Security reviewer', 'Gates procurement on evidence'],
    ],
    metrics: ['Activation rate', 'Weekly active teams', 'Net revenue retention', 'Time to first value', 'P95 latency'],
    compliance: ['SOC 2', 'GDPR / sub-processor register', 'ISO 27001', 'Accessibility (WCAG 2.2)'],
    integrations: ['Identity provider', 'Billing', 'Event pipeline', 'Customer support'],
    competitors: [
      ['Stackline', 'Workflow automation', '$29–$149 / seat / mo', 'Breadth of templates', 'Fragile at scale'],
      ['CoreOS Cloud', 'Platform primitives', 'Usage-based', 'Reliability', 'Too low-level for business users'],
      ['Fieldbase', 'Vertical SaaS', '$199–$899 / mo', 'Domain depth', 'Closed ecosystem'],
      ['Loopwork', 'AI project copilot', '$19 / seat / mo', 'Fast adoption', 'Shallow governance'],
    ],
    useCases: [
      ['Onboarding copilot', 'Turn setup into a guided, personalised path'],
      ['Product usage intelligence', 'Explain churn risk and expansion signals'],
      ['Automation builder', 'Describe a workflow and generate a governed automation'],
      ['Support deflection', 'Answer with product-grounded citations'],
    ],
    risks: ['Tenant isolation', 'Prompt injection via content', 'Model cost creep', 'Feature sprawl'],
  },
  {
    key: 'education', label: 'Education & Learning',
    keywords: ['education', 'school', 'learn', 'student', 'teacher', 'course', 'tutor', 'university', 'training', 'curriculum', 'exam', 'lms', 'skill'],
    entities: ['Learner', 'Course', 'Cohort', 'Assessment', 'Enrolment', 'Instructor'],
    personas: [
      ['Programme director', 'Owns completion and outcomes'],
      ['Instructor', 'Needs time back and better diagnostics'],
      ['Learner', 'Wants momentum and believable progress'],
      ['Accreditation lead', 'Needs evidence and integrity'],
    ],
    metrics: ['Course completion', 'Assessment integrity', 'Time to feedback', 'Learner satisfaction', 'Employer placement'],
    compliance: ['FERPA-style controls', 'GDPR', 'Accessibility (WCAG 2.2)', 'Assessment integrity'],
    integrations: ['LMS / LTI', 'Identity (SSO)', 'Video', 'Assessment provider'],
    competitors: [
      ['Lumina Learn', 'Adaptive courseware', '$15–$40 / learner / mo', 'Content library', 'Generic pedagogy'],
      ['Cohortly', 'Cohort operations', '$299–$1,200 / mo', 'Community tooling', 'No assessment intelligence'],
      ['SkillGraph', 'Skills intelligence', 'Enterprise ACV', 'Labour market data', 'Weak delivery loop'],
      ['Tutorly', 'AI tutoring', '$9–$29 / learner / mo', 'Engagement', 'Thin safeguarding'],
    ],
    useCases: [
      ['Adaptive study plans', 'Diagnose gaps and sequence practice with evidence'],
      ['Instructor copilot', 'Draft feedback and flag struggling learners'],
      ['Assessment integrity', 'Detect anomalies and produce review packets'],
      ['Employer skills mapping', 'Translate learning outcomes into role competencies'],
    ],
    risks: ['Learner data and minors', 'Assessment bias', 'Hallucinated citations', 'Academic integrity claims'],
  },
  {
    key: 'logistics', label: 'Logistics & Mobility',
    keywords: ['logistics', 'delivery', 'fleet', 'truck', 'shipping', 'warehouse', 'supply', 'route', 'transport', 'driver', 'mobility', 'cargo', 'last mile', 'dispatch'],
    entities: ['Shipment', 'Route', 'Vehicle', 'Driver', 'Depot', 'Exception'],
    personas: [
      ['Network planner', 'Owns service level and cost per drop'],
      ['Dispatcher', 'Recovers the day when reality changes'],
      ['Driver', 'Needs unambiguous instructions'],
      ['Customer', 'Wants an honest ETA'],
    ],
    metrics: ['On-time delivery', 'Cost per drop', 'Empty miles', 'Exception resolution time', 'ETA accuracy'],
    compliance: ['Driver hours / safety', 'Customs documentation', 'GDPR', 'Dangerous goods rules'],
    integrations: ['TMS / WMS', 'Telematics', 'Maps and routing', 'Customs broker'],
    competitors: [
      ['Wayline', 'Route optimisation', '$0.02–$0.06 / stop', 'Optimisation depth', 'Poor change handling'],
      ['DepotIQ', 'Warehouse execution', 'Enterprise ACV', 'WMS breadth', 'Slow to configure'],
      ['Relay', 'Delivery experience', 'Usage-based', 'Customer comms', 'No operational core'],
      ['FleetPulse', 'Fleet telemetry', '$25 / vehicle / mo', 'Hardware reach', 'Analytics is descriptive only'],
    ],
    useCases: [
      ['Dynamic re-planning', 'Rebalance routes as exceptions land'],
      ['ETA confidence comms', 'Explain delay risk and notify proactively'],
      ['Exception triage', 'Classify failures and assign recovery plays'],
      ['Depot capacity forecast', 'Predict congestion and stage labour'],
    ],
    risks: ['Safety-critical routing', 'GPS and telemetry gaps', 'Carrier data contracts', 'Automation overreach'],
  },
  {
    key: 'realestate', label: 'Property & Construction',
    keywords: ['property', 'real estate', 'building', 'construction', 'housing', 'rent', 'landlord', 'tenant', 'architect', 'facility', 'maintenance', 'smart home', 'lease'],
    entities: ['Property', 'Unit', 'Lease', 'Work order', 'Bid', 'Asset'],
    personas: [
      ['Portfolio manager', 'Owns yield and occupancy'],
      ['Site manager', 'Coordinates trades and safety'],
      ['Tenant / occupier', 'Wants fast resolution'],
      ['Surveyor', 'Needs defensible evidence'],
    ],
    metrics: ['Occupancy', 'Days to lease', 'Maintenance resolution time', 'Cost variance', 'Energy intensity'],
    compliance: ['Building safety regulations', 'GDPR', 'Fair housing / tenancy law', 'Environmental reporting'],
    integrations: ['Property management system', 'IoT / BMS', 'Accounting', 'Contractor network'],
    competitors: [
      ['Stonebridge', 'Property management suite', '$1–$4 / unit / mo', 'Operational depth', 'Legacy UI'],
      ['SiteWise', 'Construction field ops', '$49–$199 / user / mo', 'Offline-first', 'No portfolio view'],
      ['Hearth', 'Resident experience', '$2–$5 / unit / mo', 'Adoption', 'Thin asset intelligence'],
      ['PlanGrid AI', 'Design review', 'Enterprise ACV', 'Model analysis', 'Narrow to design phase'],
    ],
    useCases: [
      ['Maintenance triage', 'Diagnose, prioritise and dispatch work orders'],
      ['Lease abstraction', 'Extract obligations and dates with citations'],
      ['Construction RFI copilot', 'Answer from drawings and specs with sources'],
      ['Portfolio scenario model', 'Test capex and energy interventions'],
    ],
    risks: ['Safety and structural claims', 'Legacy document quality', 'Tenant privacy', 'Contractual liability'],
  },
  {
    key: 'food', label: 'Food & Hospitality',
    keywords: ['food', 'restaurant', 'kitchen', 'hotel', 'hospitality', 'menu', 'chef', 'recipe', 'cafe', 'booking', 'reservation', 'travel', 'tourism'],
    entities: ['Menu item', 'Order', 'Reservation', 'Ingredient', 'Venue', 'Shift'],
    personas: [
      ['Venue operator', 'Balances covers, cost and experience'],
      ['Head chef', 'Owns menu and waste'],
      ['Guest', 'Wants a reliable, memorable visit'],
      ['Supplier', 'Needs clear forecasts'],
    ],
    metrics: ['Gross margin', 'Food waste %', 'Covers per shift', 'Repeat visit rate', 'Prep time variance'],
    compliance: ['Food safety (HACCP)', 'Allergen disclosure', 'GDPR', 'Licensing'],
    integrations: ['POS', 'Reservations', 'Supplier ordering', 'Payments'],
    competitors: [
      ['PlateIQ', 'Menu costing and purchasing', '$99–$499 / venue / mo', 'Cost accuracy', 'Weak demand forecasting'],
      ['Tabletale', 'Reservations and CRM', '$49–$299 / mo', 'Guest data', 'No kitchen loop'],
      ['KitchenOS', 'Back-of-house ops', 'Usage-based', 'Recipe control', 'Poor multi-site reporting'],
      ['ServeSmart', 'Staffing and scheduling', '$3 / employee / mo', 'Scheduling speed', 'No revenue context'],
    ],
    useCases: [
      ['Demand-aware prep', 'Forecast covers and generate prep lists'],
      ['Allergen-safe ordering', 'Trace ingredients and flag conflicts'],
      ['Menu margin optimiser', 'Simulate price and mix changes'],
      ['Guest recovery copilot', 'Detect dissatisfaction and trigger recovery'],
    ],
    risks: ['Allergen safety', 'Forecast volatility', 'Staff adoption', 'Supplier data gaps'],
  },
  {
    key: 'hr', label: 'People & Work',
    keywords: ['hr', 'recruit', 'hiring', 'employee', 'talent', 'people', 'workforce', 'onboarding', 'payroll', 'benefits', 'performance', 'staffing'],
    entities: ['Candidate', 'Role', 'Employee', 'Policy', 'Review', 'Shift'],
    personas: [
      ['People lead', 'Owns experience and compliance'],
      ['Hiring manager', 'Needs signal, not more admin'],
      ['Candidate / employee', 'Wants fairness and clarity'],
      ['Finance partner', 'Needs cost and headcount control'],
    ],
    metrics: ['Time to hire', 'Offer acceptance', '90-day retention', 'Manager admin hours', 'Pay equity gap'],
    compliance: ['GDPR / candidate data', 'Equal opportunity', 'Right-to-work checks', 'Works council rules'],
    integrations: ['HRIS', 'ATS', 'Identity provider', 'Payroll'],
    competitors: [
      ['Hirelane', 'Recruiting automation', '$1.5k–$12k / yr', 'Sourcing reach', 'Weak interview intelligence'],
      ['PeopleCore', 'HRIS', '$6–$14 / employee / mo', 'System of record', 'Rigid workflows'],
      ['Atlas People', 'Employee experience', '$4–$9 / employee / mo', 'Adoption', 'Limited analytics'],
      ['TalentGraph', 'Skills intelligence', 'Enterprise ACV', 'Skills taxonomy', 'Heavy data setup'],
    ],
    useCases: [
      ['Structured interview copilot', 'Generate scorecards and probe follow-ups'],
      ['Onboarding agent', 'Sequence tasks and answer policy questions'],
      ['Attrition risk briefing', 'Explain drivers with manager actions'],
      ['Policy Q&A', 'Answer with jurisdiction-aware citations'],
    ],
    risks: ['Bias and adverse impact', 'Sensitive personal data', 'Automated decision laws', 'Manager over-trust'],
  },
  {
    key: 'industry', label: 'Industry & Energy',
    keywords: ['manufactur', 'factory', 'industrial', 'energy', 'solar', 'wind', 'utility', 'iot', 'sensor', 'maintenance', 'oil', 'gas', 'water', 'carbon', 'esg', 'mining', 'grid'],
    entities: ['Asset', 'Sensor reading', 'Work order', 'Site', 'Permit', 'Energy contract'],
    personas: [
      ['Plant manager', 'Owns uptime and throughput'],
      ['Reliability engineer', 'Prevents failures with limited windows'],
      ['Field technician', 'Works safely with incomplete context'],
      ['Sustainability lead', 'Needs audit-grade numbers'],
    ],
    metrics: ['Unplanned downtime', 'OEE', 'Mean time to repair', 'Energy cost per unit', 'Emissions intensity'],
    compliance: ['ISO 55000 asset practice', 'Safety permits (LOTO)', 'Environmental reporting', 'NIS2 / OT security'],
    integrations: ['SCADA / historian', 'CMMS', 'ERP', 'Weather and market data'],
    competitors: [
      ['Axis Industrial', 'Condition monitoring', '$18–$60 / asset / mo', 'Sensor breadth', 'Alert-heavy'],
      ['GridMind', 'Energy optimisation', 'Usage-based', 'Market integration', 'Needs clean telemetry'],
      ['PlantIQ', 'Manufacturing analytics', 'Enterprise ACV', 'OEE depth', 'Slow deployment'],
      ['CarbonLedger', 'Emissions assurance', '$6k–$40k / yr', 'Audit trail', 'Weak operational loop'],
    ],
    useCases: [
      ['Failure prediction and work-order drafting', 'Rank interventions by risk and window'],
      ['Energy arbitrage advisor', 'Recommend load shifting with constraints'],
      ['Permit-to-work copilot', 'Assemble safety evidence before release'],
      ['Emissions assurance', 'Reconcile meter data and flag anomalies'],
    ],
    risks: ['OT safety and availability', 'Sensor data quality', 'Regulatory reporting', 'Physical-world action limits'],
  },
  {
    key: 'public', label: 'Public & Civic',
    keywords: ['government', 'public', 'citizen', 'city', 'civic', 'municipal', 'policy', 'permit', 'benefit', 'social', 'nonprofit', 'ngo', 'grant'],
    entities: ['Citizen', 'Case', 'Permit', 'Benefit', 'Service request', 'Policy'],
    personas: [
      ['Service director', 'Owns outcomes and equity'],
      ['Case worker', 'Needs defensible, fast decisions'],
      ['Citizen', 'Wants a clear next step'],
      ['Auditor', 'Needs traceability'],
    ],
    metrics: ['Case cycle time', 'First-contact resolution', 'Equity of access', 'Cost per case', 'Appeal overturn rate'],
    compliance: ['Data protection', 'Accessibility', 'Administrative law', 'Records retention'],
    integrations: ['Case management', 'Identity verification', 'Payments', 'GIS'],
    competitors: [
      ['CivicStack', 'Case management', 'Licence + services', 'Configurability', 'Legacy architecture'],
      ['PermitFlow', 'Permitting', '$8k–$60k / yr', 'Process depth', 'Poor citizen UX'],
      ['OpenCity', 'City data platform', 'Grant / licence', 'Open standards', 'Requires data team'],
      ['BenefitBridge', 'Benefits navigation', 'Outcome-based', 'Accessibility', 'Thin case integration'],
    ],
    useCases: [
      ['Benefit eligibility explainer', 'Guide citizens with rule-backed clarity'],
      ['Case triage', 'Prioritise by vulnerability and statutory clock'],
      ['Permit pre-check', 'Find missing evidence before submission'],
      ['Policy impact briefing', 'Model effects with transparent assumptions'],
    ],
    risks: ['Algorithmic fairness', 'Statutory deadlines', 'Vendor lock-in', 'Public trust'],
  },
  {
    key: 'generic', label: 'Digital Platform',
    keywords: [],
    entities: ['Account', 'Workspace', 'Request', 'Document', 'Task', 'Insight'],
    personas: [
      ['Business owner', 'Owns growth and margin'],
      ['Operations lead', 'Owns throughput and quality'],
      ['End user', 'Wants the job done with less friction'],
      ['Risk owner', 'Needs control and evidence'],
    ],
    metrics: ['Time to value', 'Task cycle time', 'Conversion', 'Cost per case', 'Retention'],
    compliance: ['GDPR-aware data handling', 'SOC 2 path', 'OWASP ASVS', 'Accessibility (WCAG 2.2)'],
    integrations: ['Identity provider', 'CRM', 'Payments', 'Document store'],
    competitors: [
      ['Northstar Suite', 'Horizontal workflow suite', '$29–$199 / seat / mo', 'Breadth', 'Generic depth'],
      ['Cobalt', 'AI copilots for ops', 'Usage-based', 'Fast deployment', 'Thin governance'],
      ['Meridian Cloud', 'Enterprise platform', 'Enterprise ACV', 'Scalability', 'Heavy services'],
      ['Slate Labs', 'Vertical AI', '$500–$3k / mo', 'Sharp UX', 'Narrow scope'],
    ],
    useCases: [
      ['Intelligent intake', 'Turn unstructured requests into structured work'],
      ['Workflow copilot', 'Recommend and execute the next best action'],
      ['Knowledge assistant', 'Answer with citations from approved sources'],
      ['Performance intelligence', 'Explain variance and propose interventions'],
    ],
    risks: ['Unclear ownership', 'Data quality', 'Change fatigue', 'Scope expansion'],
  },
];

const CODENAME_A = ['Amber', 'Basalt', 'Cinder', 'Dovetail', 'Ember', 'Fathom', 'Granite', 'Harbor', 'Ivory', 'Juniper', 'Keel', 'Lumen', 'Meridian', 'Northwind', 'Onyx', 'Pine', 'Quarry', 'Ridge', 'Slate', 'Terra', 'Umber', 'Vellum', 'Willow', 'Zephyr'];
const CODENAME_B = ['Atlas', 'Bloom', 'Circuit', 'Delta', 'Forge', 'Grid', 'Hollow', 'Iris', 'Junction', 'Kiln', 'Ledger', 'Mesa', 'Nexus', 'Orbit', 'Prism', 'Quill', 'Reef', 'Signal', 'Trace', 'Union', 'Vector', 'Weave'];

function detectDomain(text) {
  const t = String(text || '').toLowerCase();
  let best = DOMAINS.find((d) => d.key === 'generic');
  let bestScore = 0;
  for (const d of DOMAINS) {
    let score = 0;
    for (const k of d.keywords) if (t.includes(k)) score += k.length > 5 ? 2 : 1.5;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return { ...best, matched: bestScore > 0 };
}

const STOP = new Set('the a an and or for with that this from into over under to of in on at by as is are be can will our your their its it we you they i build create make need want using use help platform app application system solution product service tool tools across all new more than about which who how what when where why not no yes do does'.split(' '));

function keywords(text, max = 8) {
  const counts = new Map();
  String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).forEach((w) => {
    if (w.length < 4 || STOP.has(w)) return;
    counts.set(w, (counts.get(w) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max).map((e) => e[0]);
}

function titleCase(s) { return String(s || '').replace(/\b[a-z]/g, (c) => c.toUpperCase()); }

function buildFeatures(idea, domain, rng) {
  const kws = keywords(idea, 6);
  const base = domain.useCases.map(([name, desc], i) => ({ name, desc, priority: i < 2 ? 'P0' : i === 2 ? 'P1' : 'P2' }));
  const generic = [
    { name: 'Unified intake', desc: 'Capture requests, documents and signals into one structured record', priority: 'P0' },
    { name: 'Explainable recommendations', desc: 'Every suggestion carries evidence, confidence and an owner', priority: 'P0' },
    { name: 'Approval workflow', desc: 'Human sign-off with audit trail at each commitment point', priority: 'P1' },
    { name: 'Operational dashboard', desc: 'Live view of throughput, exceptions and value realised', priority: 'P1' },
  ];
  const custom = kws.slice(0, 3).map((k) => ({
    name: `${titleCase(k)} intelligence`,
    desc: `Agent that understands ${k} context, proposes actions and cites source evidence`,
    priority: rng.chance(0.5) ? 'P1' : 'P2',
  }));
  const merged = [...base, ...generic, ...custom];
  const seen = new Set();
  return merged.filter((f) => { if (seen.has(f.name)) return false; seen.add(f.name); return true; }).slice(0, 9);
}

function buildCodename(project) {
  const rng = new Rng(project.id || project.idea || 'kiln');
  return `${rng.pick(CODENAME_A)} ${rng.pick(CODENAME_B)}`;
}

function projectContext(project) {
  const tier = TIERS[project.tier] || TIERS.smb;
  const model = project.model || 'llama-3.3-70b';
  const modelProfile = /coder|codestral|deepseek/i.test(model)
    ? 'implementation-first'
    : /mistral/i.test(model)
      ? 'concise-operational'
      : /gemma/i.test(model)
        ? 'explanation-first'
        : 'balanced-reasoning';
  const domain = detectDomain(`${project.idea} ${project.industry || ''}`);
  const rng = new Rng(`${project.id}:${project.idea}:${tier.key}:${model}`);
  const features = buildFeatures(project.idea, domain, rng);
  const codename = project.codename || buildCodename(project);
  const team = Math.max(3, Math.round(tier.team * rng.float(0.9, 1.12)));
  const weeks = Math.max(4, Math.round(tier.weeks * rng.float(0.92, 1.14)));
  const budget = Math.round(tier.buildMid * rng.float(0.82, 1.18) / 1000) * 1000;
  const users = Math.round(tier.users * rng.float(0.7, 1.5));
  const kws = keywords(project.idea, 8);
  return {
    project, tier, domain, features, codename, team, weeks, budget, users, kws,
    owner: project.ownerName || 'Account FDE',
    industry: domain.label,
    model,
    modelProfile,
    // The selected model is part of the deterministic seed, so swapping models
    // changes generated tables, figures and recommendations rather than only the label.
    seed: `${project.id}:${tier.key}:${model}:${project.revision || 0}`,
  };
}

function tierScale(tier, fnKey, ctx) {
  return `${tier.label} profile: ${ctx.team}-person pod, ${ctx.weeks}-week arc, ${num(ctx.users)} target users, ${tier.uptime} availability.`;
}

module.exports = {
  Rng, TIERS, DOMAINS, detectDomain, keywords, titleCase, buildFeatures, projectContext, buildCodename,
  money, num, pct, daysAgo, dateStr, iso, tierScale, hashSeed,
};
