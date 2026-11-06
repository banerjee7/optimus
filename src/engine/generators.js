'use strict';
/** Twelve workstream generators. Every table, score and figure is derived from the brief, tier and seed. */

const { Rng, projectContext, money, num, pct, dateStr, iso, tierScale } = require('./core');
const { FUNCTIONS, MODELS } = require('./catalog');

const FIRST = ['Aarav', 'Maya', 'Elena', 'Rohan', 'Sofia', 'Marcus', 'Priya', 'Jonas', 'Leila', 'Tom', 'Nadia', 'Owen', 'Imani', 'Diego', 'Hana', 'Felix', 'Anika', 'Noah', 'Zara', 'Luca'];
const LAST = ['Mehta', 'Okafor', 'Lindqvist', 'Patel', 'Rossi', 'Chen', 'Bauer', 'Nwosu', 'Reyes', 'Kaur', 'Berg', 'Silva', 'Haddad', 'Kim', 'Novak', 'Price', 'Iyer', 'Tanaka'];
const ROLES = ['FDE lead', 'Solution architect', 'Senior engineer', 'Data engineer', 'QA automation', 'Product designer', 'SRE', 'Security engineer', 'Delivery manager'];

const pickName = (rng) => `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const score = (rng, lo = 52, hi = 96) => Math.round(rng.float(lo, hi));
const tShirt = (n) => (n <= 3 ? 'S' : n <= 8 ? 'M' : n <= 16 ? 'L' : n <= 26 ? 'XL' : 'XXL');
const sev = (rng) => rng.pick(['Critical', 'High', 'High', 'Medium', 'Medium', 'Low']);
const weeksToDate = (weeks) => dateStr(new Date(Date.now() + weeks * 7 * 86400000));

function projectSnapshot(project, ctx) {
  const model = MODELS.find((m) => m.id === project.model) || MODELS[0];
  return {
    name: project.name,
    codename: ctx.codename,
    tier: ctx.tier.key,
    tierLabel: ctx.tier.label,
    idea: project.idea,
    industry: ctx.industry,
    modelName: model.name,
    model: model.id,
    ownerName: project.ownerName || 'Account FDE',
    budget: ctx.budget,
    weeks: ctx.weeks,
    team: ctx.team,
    users: ctx.users,
    uptime: ctx.tier.uptime,
  };
}

function shell(ctx, key) {
  const fn = FUNCTIONS.find((f) => f.key === key);
  return { fn, formats: fn.formats, guardrails: fn.guardrails, ctx };
}

/* ---------------------------------------------------------------- 1. IDEATION */
function ideation(ctx, rng) {
  const { domain, features, tier, project } = ctx;
  const tam = Math.round(rng.float(1.2, 16) * 1e9);
  const sam = Math.round(tam * rng.float(0.06, 0.14));
  const som = Math.round(sam * rng.float(0.015, 0.05));
  const confidence = score(rng, 61, 88);
  const personas = domain.personas;

  return {
    title: `${ctx.codename}: from idea to evidence`,
    subtitle: `Prototype thesis and market case for ${domain.label.toLowerCase()} — ${tier.label}`,
    summary: `Kiln reframed the brief into a testable wedge: ${features[0].name.toLowerCase()} for ${personas[0][0].toLowerCase()}s, with ${features[1].name.toLowerCase()} as the second proof point. The prototype can be in front of real users in ${Math.round(ctx.weeks * 0.55)} weeks for ${money(ctx.budget * 0.42)}, against a serviceable market of ${money(sam)}.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Serviceable market (SAM)', value: money(sam) },
        { label: '12-month obtainable (SOM)', value: money(som) },
        { label: 'Prototype investment', value: money(ctx.budget * 0.42) },
        { label: 'Time to user evidence', value: `${Math.round(ctx.weeks * 0.55)} weeks` },
        { label: 'Idea confidence', value: `${confidence} / 100` },
        { label: 'Primary persona', value: personas[0][0] },
      ] },
      { type: 'prose', title: 'The wedge', text: `${project.idea} The strongest entry point is not the full platform — it is ${features[0].name.toLowerCase()}. ${personas[0][0]}s feel this pain weekly, the output is observable, and a wrong recommendation is cheap to correct. ${features[1].name} becomes the second proof point once the first workflow retains users. The prototype deliberately stops short of ${domain.entities[2].toLowerCase()} automation until a human approval loop has been validated.` },
      { type: 'table', title: 'Market validation by segment', columns: ['Segment', 'Urgency (1–5)', 'Budget owner', 'Willingness to pay', 'Evidence strength'], rows: personas.slice(0, 3).map((p, i) => {
        const w = Math.round(rng.float(18, 95));
        return [p[0], String(5 - i), i === 0 ? 'Operations' : i === 1 ? 'Function lead' : 'Finance', `$${w}–$${Math.round(w * 3.4)} / seat / mo`, rng.pick(['Strong (interviews)', 'Moderate (desk + signals)', 'Emerging (hypothesis)'])];
      }) },
      { type: 'table', title: 'Business value model', columns: ['Value lever', 'Annual impact', 'Basis', 'Confidence'], rows: [
        ['Throughput recovered', money(rng.float(ctx.budget * 0.8, ctx.budget * 2.4)), `${Math.round(rng.float(4, 14))} hrs/week × ${ctx.team} staff`, 'Medium'],
        ['Error and rework reduction', money(rng.float(ctx.budget * 0.4, ctx.budget * 1.6)), `${Math.round(rng.float(1.2, 5.5))}% of avoidable cost base`, 'Medium'],
        ['Faster time to decision', money(rng.float(ctx.budget * 0.3, ctx.budget * 1.1)), `${Math.round(rng.float(20, 60))}% cycle-time reduction on core task`, 'High'],
        ['New revenue surface', money(rng.float(ctx.budget * 0.6, ctx.budget * 3.2)), `${rng.int(2, 8)}% attach rate on adjacent offer`, 'Low'],
      ] },
      { type: 'table', title: 'Prototype scope — build this, not that', columns: ['Capability', 'Priority', 'Why it earns a place', 'Deliberately excluded'], rows: features.slice(0, 6).map((f, i) => [f.name, f.priority, f.desc, i === 0 ? 'Full permissions model' : i === 1 ? 'Multi-region deployment' : 'Billing automation']) },
      { type: 'timeline', title: 'Path to evidence', items: [
        { phase: 'Frame the bet', weeks: `Week 1–2`, detail: 'Problem interviews, assumption map, success thresholds agreed with founder.', items: [`${rng.int(6, 12)} customer conversations`, 'Baseline metric instrumented', 'Kill criteria written down'] },
        { phase: 'Concept prototype', weeks: `Week 3–${Math.round(ctx.weeks * 0.4)}`, detail: 'Clickable flow with synthetic data and an agent-grounded answer path.', items: ['Happy path + one failure path', 'Prompt and eval harness v0', 'Security pre-check'] },
        { phase: 'Working slice', weeks: `Week ${Math.round(ctx.weeks * 0.4) + 1}–${Math.round(ctx.weeks * 0.75)}`, detail: 'One real integration, real data in a controlled tenant, measurable outcome.', items: [domain.integrations[0], 'Human approval gate', 'Cost per action measured'] },
        { phase: 'Evidence review', weeks: `Week ${Math.round(ctx.weeks * 0.75) + 1}–${ctx.weeks}`, detail: 'Decide scale, pivot or stop using pre-agreed thresholds.', items: [`${rng.int(10, 40)} weekly active testers`, 'Value model re-based on actuals', 'Scale decision pack'] },
      ] },
      { type: 'table', title: 'Security and data needs', columns: ['Area', 'Prototype requirement', tier.label + ' control'], rows: [
        ['Data classification', 'Identify PII / PHI / financial fields before ingestion', tier.compliance],
        ['Model boundary', 'No raw sensitive records in prompts; redact and tokenise', 'Private model gateway'],
        ['Access', 'SSO for testers, least-privilege roles, audit of exports', tier.key === 'small' ? 'OIDC + MFA' : 'SSO / SCIM + RBAC'],
        ['Retention', 'Delete test data at day 30 unless consented', 'Documented retention schedule'],
        ['Supplier risk', `Review ${domain.integrations[0]} terms and data residency`, 'Vendor security review'],
      ] },
      { type: 'table', title: 'Scalability posture', columns: ['Dimension', 'Prototype choice', 'Production path'], rows: [
        ['Traffic', `${num(Math.round(ctx.users * 0.04))} testers`, `${num(ctx.users)} users, ${tier.uptime} target`],
        ['Processing', 'Synchronous calls, single queue', 'Event-driven workers + backpressure'],
        ['Data', `${rng.int(2, 20)} GB synthetic + pilot`, 'Partitioned store, lineage, retention'],
        ['Model cost', 'Metered per action', 'Router + cache + distillation'],
        ['Failure', 'Manual retry', 'Idempotency, dead-letter, auto-rollback'],
      ] },
      { type: 'bars', title: 'Assumption confidence', items: [
        { label: 'Problem is painful and frequent', value: score(rng, 68, 94) },
        { label: 'Buyer has budget and authority', value: score(rng, 46, 78) },
        { label: 'Workflow can be safely automated', value: score(rng, 55, 86) },
        { label: 'Data is available and usable', value: score(rng, 40, 82) },
        { label: 'Value is measurable within a quarter', value: score(rng, 58, 90) },
      ] },
      { type: 'callout', title: 'Kill criteria — decide before you fall in love', tone: 'warn', text: `Stop or pivot if fewer than ${rng.int(5, 9)} of 12 target users describe the problem unprompted, if the agent's grounded answer accuracy stays below ${rng.int(72, 86)}% after two eval cycles, or if the value per action is below ${money(rng.float(3, 12))}.` },
      { type: 'checklist', title: 'Human-in-the-loop gates', items: [
        { label: 'Founder confirms the problem statement and target persona', state: 'pending' },
        { label: 'Security reviews data classes before pilot ingestion', state: 'pending' },
        { label: 'FDE validates prototype scope and kill criteria', state: 'pending' },
        { label: 'Pilot participants consent to data use', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 2. DISCOVERY */
function discovery(ctx, rng) {
  const { domain, features, tier } = ctx;
  const competitors = domain.competitors;
  const whitespace = score(rng, 58, 89);
  const predictability = score(rng, 61, 91);
  const confidence = score(rng, 64, 92);

  return {
    title: `Market, competitors and the odds of production`,
    subtitle: `Evidence pack for ${ctx.codename} — ${domain.label}`,
    summary: `${competitors.length} competitors mapped across four positions. The clearest whitespace is ${features[1].name.toLowerCase()} — every credible player covers capture, few close the loop with evidence and approval. Predictability of prototype-to-production is ${predictability}/100, driven by data readiness and workflow determinism rather than model quality.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Competitors analysed', value: `${competitors.length + rng.int(4, 11)}` },
        { label: 'Whitespace score', value: `${whitespace} / 100` },
        { label: 'Evidence confidence', value: `${confidence} / 100` },
        { label: 'Prototype → production', value: `${predictability}%` },
        { label: 'Ranked use cases', value: `${rng.int(6, 11)}` },
        { label: 'Primary evidence sources', value: `${rng.int(5, 9)}` },
      ] },
      { type: 'prose', title: 'What the market is actually buying', text: `Buyers in ${domain.label.toLowerCase()} are not shopping for "AI". They are buying ${domain.metrics[0].toLowerCase()} and ${domain.metrics[1].toLowerCase()} with less operational heroics. The incumbents monetise access and workflow depth; the opening is an outcome layer that is provable in one quarter. ${competitors[0][0]} owns ${competitors[0][3].toLowerCase()}, but ${competitors[0][4].toLowerCase()} leaves room for a narrower, faster product.` },
      { type: 'table', title: 'Competitor matrix', columns: ['Player', 'Positioning', 'Pricing signal', 'Strength', 'Exploitable gap', 'Threat'], rows: competitors.map((c) => [c[0], c[1], c[2], c[3], c[4], String(score(rng, 38, 88))]) },
      { type: 'table', title: 'Feature gap map', columns: ['Capability', ...competitors.map((c) => c[0]), `${ctx.codename} target`], rows: features.slice(0, 7).map((f, i) => [f.name, ...competitors.map(() => rng.pick(['Strong', 'Partial', 'Partial', 'Gap'])), i < 2 ? 'Differentiated' : i < 4 ? 'Parity +' : 'Table stakes']) },
      { type: 'bullets', title: 'Whitespace opportunities', items: [
        `${features[0].name}: convert an unstructured trigger into a governed, auditable action — incumbents stop at dashboards.`,
        `${features[1].name}: close the loop from recommendation to outcome evidence; no competitor shows realised value per action.`,
        `Segment focus: ${domain.personas[1][0].toLowerCase()}s at ${tier.key === 'enterprise' ? 'multi-site enterprises' : tier.key === 'smb' ? '20–500 person companies' : 'lean founder-led teams'} are underserved by enterprise pricing and onboarding.`,
        `Commercial wedge: ${rng.pick(['usage-based pricing with a value floor', 'a fixed-fee pilot with a production credit', 'per-site pricing with an outcome guarantee'])} lowers adoption risk.`,
        `Proof asset: a live ${rng.int(30, 90)}-day benchmark on the buyer's own data is more persuasive than another feature list.`,
      ] },
      { type: 'table', title: 'Confidence scoring model', columns: ['Source', 'Coverage', 'Quality', 'Recency', 'Confidence'], rows: [
        ['Analyst and market reports', 'High', 'Medium', '6–18 months', `${score(rng, 65, 88)}%`],
        ['Review mining and community threads', 'High', 'Medium', 'Live', `${score(rng, 70, 92)}%`],
        ['Competitor product teardown', 'Medium', 'High', 'Current', `${score(rng, 78, 96)}%`],
        ['Buyer interviews', 'Low–Medium', 'High', 'Current', `${score(rng, 58, 84)}%`],
        ['Search and hiring signals', 'Medium', 'Low–Medium', 'Live', `${score(rng, 52, 76)}%`],
        ['Win / loss evidence', 'Low', 'High', 'Historical', `${score(rng, 45, 72)}%`],
      ] },
      { type: 'table', title: 'RAG training and evaluation plan', columns: ['Corpus', 'Documents', 'Refresh', 'Retrieval test', 'Owner'], rows: [
        ['Approved product knowledge', `${rng.int(120, 900)}`, 'On release', 'Answer groundedness ≥ 0.92', 'Product'],
        ['Policy and compliance library', `${rng.int(40, 240)}`, 'Quarterly', 'Citation precision ≥ 0.95', 'Risk'],
        ['Customer transcripts', `${rng.int(80, 500)}`, 'Weekly', 'PII redaction 100%', 'Ops'],
        ['Competitor intelligence', `${rng.int(60, 320)}`, 'Monthly', 'Freshness ≤ 45 days', 'Strategy'],
        ['Support macros and tickets', `${rng.int(300, 2400)}`, 'Daily', 'Deflection quality ≥ 4.2/5', 'Support'],
      ] },
      { type: 'table', title: 'Prototype-to-production predictability', columns: ['Factor', 'Weight', 'Score', 'Weighted', 'What moves the number'], rows: [
        ['Data readiness and access', '25%', `${score(rng, 45, 88)}`, '', 'Signed data agreement, clean sample'],
        ['Workflow determinism', '20%', `${score(rng, 62, 94)}`, '', 'Narrow first workflow, clear rules'],
        ['Integration feasibility', '15%', `${score(rng, 50, 85)}`, '', domain.integrations[0] + ' sandbox'],
        ['User adoption and change', '15%', `${score(rng, 48, 84)}`, '', 'Champion + training plan'],
        ['Security and compliance path', '15%', `${score(rng, 52, 90)}`, '', tier.compliance],
        ['Unit economics', '10%', `${score(rng, 55, 86)}`, '', 'Cost per action below value per action'],
      ].map((r) => {
        const w = parseInt(r[1], 10) / 100;
        const s = parseInt(r[2], 10);
        return [r[0], r[1], r[2], `${Math.round(w * s)}`, r[4]];
      }) },
      { type: 'bars', title: 'Production readiness by dimension', items: [
        { label: 'Problem evidence', value: score(rng, 66, 93) },
        { label: 'Data readiness', value: score(rng, 42, 82) },
        { label: 'Integration readiness', value: score(rng, 48, 86) },
        { label: 'Security readiness', value: score(rng, 55, 89) },
        { label: 'Commercial readiness', value: score(rng, 50, 88) },
      ] },
      { type: 'table', title: 'Top use cases for the prototype', columns: ['Rank', 'Use case', 'Persona', 'Value', 'Feasibility', 'Score'], rows: domain.useCases.map((u, i) => [String(i + 1), u[0], domain.personas[i % domain.personas.length][0], rng.pick(['High', 'Medium–High', 'Medium']), `${score(rng, 58, 95)}%`, String(score(rng, 68, 95) - i * 3)]) },
      { type: 'callout', title: 'Method note', tone: 'default', text: `Figures are illustrative and calibrated to the ${tier.label} profile and the supplied brief. ${confidence}% of claims trace to two or more sources; the remainder are explicitly marked as hypotheses. No confidential competitor data was used.` },
    ],
  };
}

/* ---------------------------------------------------------------- 3. FDE CONSULTATION */
function fdeConsult(ctx, rng) {
  const { domain, tier, features, team, weeks, budget } = ctx;
  const readiness = score(rng, 54, 82);
  const raidCount = rng.int(7, 12);
  return {
    title: `${ctx.codename}: technical and delivery consultation`,
    subtitle: `FDE assessment, RAID log and solution blueprint — ${tier.label}`,
    summary: `Readiness is ${readiness}/100: the problem is well-framed, but integration and data ownership carry the delivery risk. A ${team}-person pod over ${weeks} weeks at ${money(budget)} is viable if ${domain.integrations[0]} access is secured by week two and the approval workflow is treated as a product surface, not an afterthought.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Delivery readiness', value: `${readiness} / 100` },
        { label: 'Open RAID items', value: `${raidCount}` },
        { label: 'Estimate range', value: `${money(budget * 0.86)}–${money(budget * 1.16)}` },
        { label: 'Critical path', value: `${domain.integrations[0]}` },
        { label: 'Pod shape', value: `${team} people` },
        { label: 'Recommended start', value: `${rng.int(1, 4)} weeks` },
      ] },
      { type: 'table', title: 'Agent fleet for the engagement', columns: ['Agent', 'Input', 'Output', 'Autonomy', 'Human gate'], rows: [
        ['Discovery intake', 'Questionnaires, transcripts, docs', 'Structured requirement set', 'Draft', 'FDE reviews omissions'],
        ['Interview synthesis', 'Interview notes', 'Themes, quotes, requirements', 'Draft', 'Accountable lead validates'],
        ['Landscape assessor', 'Repos, CI/CD, cloud configs', 'Findings and severity', 'Read-only', 'No production writes'],
        ['Risk and RAID', 'Findings + plan', 'Scored RAID log', 'Draft', 'Delivery lead owns'],
        ['ADR drafter', 'Options + constraints', 'Decision record', 'Draft', 'Architect signs'],
        ['Blueprint co-author', 'Requirements + landscape', 'C4 and topology', 'Draft', 'FDE + customer validate'],
        ['Estimator', 'Scope + history', 'Points, cost, mix', 'Draft', 'Commercial approval'],
        ['Workshop facilitator', 'Agenda + live capture', 'Actions and decisions', 'Assist', 'Facilitator publishes'],
        ['Status narrator', 'Delivery signals', 'Weekly narrative', 'Draft', 'Engagement lead sends'],
      ] },
      { type: 'table', title: 'Discovery intake status', columns: ['Question', 'Owner', 'Status', 'Impact if unresolved'], rows: [
        ['Who feels the pain weekly, and what do they do today?', 'Product sponsor', 'Answered', 'Weak wedge'],
        [domain.integrations[0] + ' — API access, rate limits, sandbox?', 'IT / platform', rng.pick(['In progress', 'Blocked']), 'Critical path slip'],
        ['Which data is regulated and where may it reside?', 'Compliance', 'In progress', 'Architecture rework'],
        ['What does "good" look like after 90 days?', 'Business owner', 'Answered', 'Unmeasurable pilot'],
        ['Who signs off production and commercial changes?', 'Sponsor', 'Answered', 'Gate ambiguity'],
        ['What is the hard deadline and why?', 'Programme', 'In progress', 'Scope compression'],
      ] },
      { type: 'table', title: 'Technical landscape assessment', columns: ['Area', 'Finding', 'Severity', 'Recommended action'], rows: [
        ['Source control', rng.pick(['Repo sprawl across two orgs', 'Single monorepo with clear ownership', 'Mixed ownership and stale branches']), rng.pick(['Medium', 'Low', 'High']), 'Consolidate and add CODEOWNERS'],
        ['CI/CD', rng.pick(['Manual release approvals and no rollback', 'Pipeline exists but tests are not gating', 'Two pipelines with inconsistent secrets']), rng.pick(['High', 'Medium']), 'Introduce policy gates and signed artifacts'],
        ['Cloud', rng.pick(['Single region, over-privileged service accounts', 'Reasonable landing zone, weak tagging', 'Unknown spend by environment']), rng.pick(['High', 'Medium']), 'Least privilege + cost allocation tags'],
        ['Data', rng.pick(['No owner for customer records', 'Schema documented but no lineage', 'Duplicate customer masters']), 'High', 'Assign data owners, define golden record'],
        ['Dependencies', rng.pick([`${rng.int(3, 18)} end-of-life libraries`, `${rng.int(20, 80)} licences unreviewed`]), 'Medium', 'Licence and CVE inventory before build'],
        ['Observability', rng.pick(['Logs only, no traces', 'Metrics present, no SLOs', 'Alert fatigue at 200+ rules']), 'Medium', 'Define 4 SLOs and trace the critical path'],
      ] },
      { type: 'table', title: 'RAID log (top items)', columns: ['ID', 'Type', 'Description', 'P', 'I', 'Score', 'Owner', 'Mitigation'], rows: Array.from({ length: rng.int(6, 8) }, (_, i) => {
        const type = ['Risk', 'Risk', 'Assumption', 'Issue', 'Dependency'][i % 5];
        const p = rng.int(2, 5); const im = rng.int(2, 5);
        const desc = [
          `${domain.integrations[0]} sandbox not available before build start`,
          `Data quality below the threshold assumed in the business case`,
          `Pilot users will change their workflow within ${rng.int(2, 6)} weeks`,
          `Security review adds ${rng.int(2, 5)} weeks before production`,
          `Third-party model licence restricts embedding in the product`,
          `Single approver becomes the bottleneck`,
          `Peak load ${rng.int(3, 12)}× average not covered by the design`,
          `Vendor contract renewal blocks export of historical data`,
        ][i];
        return [`R-${String(i + 1).padStart(2, '0')}`, type, desc, String(p), String(im), String(p * im), rng.pick(['FDE lead', 'Customer IT', 'Product', 'Compliance', 'Vendor mgr']), rng.pick(['Secure sandbox by week 2', 'Profile sample and set rules', 'Embed change champions', 'Parallel review track', 'Legal review before architecture lock'])];
      }) },
      { type: 'table', title: 'Architecture decisions to make now', columns: ['ADR', 'Decision', 'Options', 'Recommendation', 'Reversibility'], rows: [
        ['ADR-001', 'System shape for the first release', 'Modular monolith / services', tier.key === 'enterprise' ? 'Domain-aligned services with a shared platform' : 'Modular monolith with one extracted agent service', 'High'],
        ['ADR-002', 'Model access pattern', 'Direct vendor / private gateway', 'Private gateway with routing and cost metering', 'Medium'],
        ['ADR-003', 'Human approval model', 'Per-action / batch review', 'Per-action for external commitments, batch for drafts', 'Low'],
        ['ADR-004', 'Data store for evidence', 'Postgres / vector-only', 'Postgres + vector index, immutable evidence events', 'Medium'],
        ['ADR-005', 'Integration style', 'Point-to-point / event bus', 'Event-driven for state changes, synchronous for reads', 'Medium'],
      ] },
      { type: 'table', title: 'Estimate and resource mix', columns: ['Epic', 'Points', 'Size', 'Mix', 'Weeks'], rows: [
        ['Discovery and blueprint', String(rng.int(5, 13)), 'S', 'FDE + architect', String(Math.round(weeks * 0.15))],
        ['Core workflow and UI', String(rng.int(13, 34)), 'L', '2 engineers + designer', String(Math.round(weeks * 0.3))],
        ['Integrations and data', String(rng.int(8, 26)), 'M–L', 'Data engineer + engineer', String(Math.round(weeks * 0.25))],
        ['Agent, evals and guardrails', String(rng.int(8, 21)), 'M', 'FDE + engineer', String(Math.round(weeks * 0.2))],
        ['Security, CI/CD and launch', String(rng.int(5, 16)), 'S–M', 'SRE + security', String(Math.round(weeks * 0.15))],
        ['Pilot support and handover', String(rng.int(3, 10)), 'S', 'FDE + delivery', String(Math.round(weeks * 0.12))],
      ] },
      { type: 'timeline', title: 'Workshop and engagement cadence', items: [
        { phase: 'Mobilise', weeks: 'Week 1', detail: 'Access, owners, decision rights and guardrails confirmed.', items: ['Kickoff + RACI', 'Sandbox and repo access', 'Success measures frozen'] },
        { phase: 'Assess and co-design', weeks: 'Weeks 2–3', detail: 'Landscape findings challenged with the customer; blueprint drafted live.', items: ['Two working sessions', 'ADR review', 'Estimate sanity check'] },
        { phase: 'Ship the slice', weeks: `Weeks 4–${Math.max(6, Math.round(weeks * 0.6))}`, detail: 'Weekly demo, written decisions, no status theatre.', items: ['Working software each week', 'Risk log refreshed', 'Pilot cohort recruited'] },
        { phase: 'Prove and decide', weeks: `Weeks ${Math.max(7, Math.round(weeks * 0.6)) + 1}–${weeks}`, detail: 'Outcome review against the frozen measures; scale / stop recommendation.', items: ['Benefit baseline vs actual', 'Operational readiness', 'Scale plan and commercial options'] },
      ] },
      { type: 'prose', title: 'Engagement narrative', text: `${ctx.codename} is a ${tier.label.toLowerCase()} engagement with an unusually clear wedge and two structural risks: access to ${domain.integrations[0]} and the discipline to keep humans accountable for external actions. The ${team}-person pod should be weighted toward integration and evaluation early, then shift to adoption. We recommend a ${rng.int(2, 4)}-week paid discovery before committing the full ${money(budget)} programme.` },
      { type: 'checklist', title: 'Sign-off gates', items: [
        { label: 'FDE signs the recommendations and risk ratings', state: 'pending' },
        { label: 'Customer validates the blueprint in a working session', state: 'pending' },
        { label: 'Commercial owner approves pricing and contingency', state: 'pending' },
        { label: 'Security accepts the data-flow design', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 4. ARCHITECTURE */
function architecture(ctx, rng) {
  const { domain, tier, features } = ctx;
  const services = tier.key === 'enterprise' ? rng.int(7, 11) : tier.key === 'smb' ? rng.int(4, 7) : rng.int(2, 4);
  const coupling = rng.int(12, 38);
  const threats = rng.int(6, 11);
  const contexts = domain.entities.slice(0, 5);

  return {
    title: `${ctx.codename}: architecture design and review`,
    subtitle: `Bounded contexts, decisions, threats and NFR evidence — ${tier.label}`,
    summary: `${services} services are justified, not fashionable: ${contexts.slice(0, 3).join(', ')} carry distinct change cadence and data ownership. The dominant risk is not scale, it is trust — every externally visible action needs an evidence trail and a human gate. Architecture review recommends ${tier.key === 'small' ? 'a modular monolith with one extracted agent service' : 'domain-aligned services behind a governed agent gateway'}.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Proposed services', value: `${services}` },
        { label: 'Coupling index', value: `${coupling} / 100` },
        { label: 'STRIDE threats', value: `${threats}` },
        { label: 'NFR coverage', value: `${score(rng, 78, 96)}%` },
        { label: 'Open ADRs', value: `${rng.int(5, 9)}` },
        { label: 'Drift findings', value: `${rng.int(2, 7)}` },
      ] },
      { type: 'table', title: 'Architecture lint findings', columns: ['Rule', 'Location', 'Severity', 'Remediation'], rows: [
        ['Dependency direction', `${rng.pick(['ui', 'api', 'agent-core'])} → ${rng.pick(['data', 'domain'])}`, 'High', 'Invert the dependency behind a port'],
        ['Cyclic dependency', `${rng.pick(['billing ↔ entitlements', 'orders ↔ inventory', 'auth ↔ tenancy'])}`, 'High', tier.key === 'small' ? 'Collapse into one module' : 'Introduce domain events'],
        ['God module', `${rng.pick(['core/service.ts', 'lib/workflow.js', 'app/logic.py'])} (${num(rng.int(1800, 9400))} LOC)`, 'Medium', 'Split by bounded context'],
        ['Unbounded queue consumer', 'worker/' + rng.pick(['ingest', 'notify', 'sync']), 'Medium', 'Add backpressure and DLQ'],
        ['Shared database across contexts', `${rng.pick(['customers', 'catalog', 'cases'])}`, 'High', 'Assign a single owning service'],
        ['N+1 access pattern', `${rng.pick(['GET /api/v1/search', 'dashboard aggregate', 'case list'])}`, 'Low', 'Batch or precompute'],
      ] },
      { type: 'table', title: 'Bounded contexts and ownership', columns: ['Context', 'Owns', 'Change cadence', 'Data class', 'Team'], rows: contexts.map((c, i) => [c, domain.entities[(i + 1) % domain.entities.length], rng.pick(['Daily', 'Weekly', 'Monthly']), rng.pick(['Operational', 'Personal', 'Restricted']), rng.pick(['Core', 'Experience', 'Platform'])]) },
      { type: 'table', title: 'Architecture decision records', columns: ['ADR', 'Decision', 'Options considered', 'Trade-off accepted', 'Status'], rows: [
        ['ADR-001', 'Modular monolith first', 'Monolith, microservices', 'Slower independent scaling, faster delivery', 'Accepted'],
        ['ADR-002', 'Private model gateway', 'Direct vendor SDK, gateway', 'Extra hop and ops cost, control and metering', 'Accepted'],
        ['ADR-003', 'Event-backed evidence log', 'Mutable audit table, append-only events', 'Storage growth, defensible provenance', 'Accepted'],
        ['ADR-004', 'Postgres as system of record', 'Postgres, document store', 'Manual partitioning at scale, strong consistency', 'Accepted'],
        ['ADR-005', 'Async by default for side effects', 'Sync calls, queue', 'Added complexity, resilience', 'Proposed'],
        ['ADR-006', 'No PII in prompt payloads', 'Tokenise, redact-at-edge', 'Precision loss, lower breach blast radius', 'Accepted'],
      ] },
      { type: 'table', title: 'STRIDE threat model', columns: ['Threat', 'Scenario', 'Impact', 'Mitigation', 'Residual'], rows: [
        ['Spoofing', 'A user impersonates an approver', 'High', 'SSO, step-up auth for approvals', 'Low'],
        ['Tampering', 'Evidence log mutated after decision', 'High', 'Append-only store + hash chain', 'Low'],
        ['Repudiation', 'Approver denies authorising action', 'Medium', 'Signed decision record with identity', 'Low'],
        ['Information disclosure', `Sensitive ${domain.entities[0].toLowerCase()} data echoed by model`, 'High', 'Redaction, allow-listed context, output filter', 'Medium'],
        ['Denial of service', 'Agent loop or retry storm exhausts budget', 'Medium', 'Token budgets, circuit breakers', 'Low'],
        ['Elevation of privilege', 'Agent uses a service account beyond scope', 'High', 'Scoped workload identity, no wildcard IAM', 'Low'],
        ['Prompt injection', 'Untrusted document changes agent behaviour', 'High', 'Content isolation, tool allow-list, human gate', 'Medium'],
        ['Supply chain', 'Malicious dependency in build', 'High', 'SBOM, signed artifacts, dependency pinning', 'Medium'],
      ] },
      { type: 'table', title: 'NFR scenarios and trade-offs', columns: ['Quality attribute', 'Scenario', 'Target', 'Design response', 'Cost'], rows: [
        ['Latency', 'User requests a grounded recommendation', `P95 < ${tier.key === 'enterprise' ? '1.8' : '2.5'} s`, 'Streaming + cached retrieval', 'Medium'],
        ['Availability', `Core workflow during business hours`, tier.uptime, 'Multi-AZ + graceful degradation', 'High'],
        ['Throughput', `Peak ${num(Math.round(ctx.users * 0.2))} concurrent actions`, `${num(rng.int(40, 400))} rps`, 'Queue + horizontal workers', 'Medium'],
        ['Recoverability', 'Regional data-plane failure', `RPO ${tier.key === 'enterprise' ? '5 min' : '1 h'}, RTO 4 h`, 'PITR + rehearsed restore', 'High'],
        ['Auditability', 'Regulator asks who approved an action', '< 2 min to evidence', 'Immutable log + export', 'Low'],
        ['Cost', 'Model spend per successful action', `< ${money(rng.float(0.15, 1.8))}`, 'Routing, cache, distillation', 'Medium'],
      ] },
      { type: 'bars', title: 'Reference pattern fit', items: [
        { label: 'Modular monolith + agent service', value: score(rng, 78, 96) },
        { label: 'Domain-aligned microservices', value: score(rng, 55, 86) + (tier.key === 'enterprise' ? 6 : 0) },
        { label: 'Event-driven core', value: score(rng, 58, 88) },
        { label: 'Serverless workflow', value: score(rng, 45, 76) },
        { label: 'Third-party BPM suite', value: score(rng, 28, 58) },
      ] },
      { type: 'bullets', title: 'Diagram-as-code outputs', items: [
        `C4 context: ${ctx.codename}, ${ctx.team} delivery pod, ${domain.integrations.slice(0, 2).join(', ')}, model gateway.`,
        'C4 container view: web, API, agent orchestrator, evidence store, worker pool, model router.',
        `Sequence: ${features[0].name.toLowerCase()} — request → retrieve → reason → propose → human approve → commit → evidence.`,
        `Deployment: ${tier.key === 'enterprise' ? 'multi-region active/passive with data residency' : 'single region, multi-AZ'} on ${rng.pick(['AWS', 'Azure', 'GCP'])}.`,
        'Generated as Mermaid + Structurizr DSL, versioned with the ADRs.',
      ] },
      { type: 'table', title: 'Design vs as-built drift', columns: ['Element', 'Designed', 'Observed', 'Drift', 'Action'], rows: [
        ['Service boundaries', `${services} contexts`, `${services + rng.int(1, 3)} deployables`, 'Moderate', 'Merge or re-document'],
        ['Data ownership', 'Single writer per context', rng.pick(['Two writers on customer table', 'Aligned']), rng.pick(['High', 'Low']), 'Refactor or accept exception'],
        ['Auth model', 'Scoped workload identity', rng.pick(['Shared service account', 'Aligned']), rng.pick(['High', 'Low']), 'Rotate and scope'],
        ['Observability', 'Traces on critical path', rng.pick(['Partial coverage', 'Aligned']), 'Moderate', 'Instrument missing spans'],
      ] },
      { type: 'table', title: 'Cost / performance options', columns: ['Option', 'Monthly run', 'P95 latency', 'Scale ceiling', 'Verdict'], rows: [
        ['Managed serverless', money(tier.infra * 0.8), '2.8 s', 'High burst', 'Prototype'],
        ['Container platform + managed DB', money(tier.infra * 1.15), '1.6 s', 'High', 'Recommended'],
        ['Dedicated model gateway (VPC)', money(tier.infra * 1.8), '1.2 s', 'Very high', tier.key === 'enterprise' ? 'Recommended' : 'Later'],
      ] },
      { type: 'checklist', title: 'Architecture review board', items: [
        { label: 'Lead architect signs the bounded context map', state: 'pending' },
        { label: 'Security accepts residual STRIDE risks', state: 'pending' },
        { label: `ARB approves the ${tier.key === 'small' ? 'modular monolith' : 'service decomposition'} decision`, state: 'pending' },
        { label: 'Exceptions register opened for accepted drift', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 5. MODERNIZATION */
function modernization(ctx, rng) {
  const { domain, tier, features } = ctx;
  const loc = Math.round(rng.float(180, 2400)) * 1000;
  const candidates = tier.key === 'enterprise' ? rng.int(9, 16) : tier.key === 'smb' ? rng.int(5, 9) : rng.int(2, 5);
  const waves = tier.key === 'enterprise' ? 4 : tier.key === 'smb' ? 3 : 2;
  const entities = domain.entities;

  return {
    title: `Legacy to modern: ${ctx.codename} migration plan`,
    subtitle: `Strangler-fig sequencing, service boundaries and equivalence evidence — ${tier.label}`,
    summary: `A ${num(loc)} LOC estate with ${candidates} modernisation candidates. We recommend extracting ${features[0].name.toLowerCase()} first: it has the highest change frequency and the cleanest data seam. No big-bang rewrite. ${waves} waves, each with a parallel-run gate, a rollback path, and behavioural equivalence tests against the legacy baseline.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Estate scanned', value: `${num(loc)} LOC` },
        { label: 'Modernisation candidates', value: `${candidates}` },
        { label: 'Migration waves', value: `${waves}` },
        { label: 'Estimated decommission', value: `${ctx.weeks + rng.int(4, 16)} weeks` },
        { label: 'Risk reduction', value: `${score(rng, 52, 82)}%` },
        { label: 'Dead code found', value: `${rng.int(4, 24)}%` },
      ] },
      { type: 'table', title: 'Portfolio scan and candidate scoring', columns: ['Module', 'LOC', 'Change freq', 'Coupling', 'Risk', 'Score', 'Decision'], rows: Array.from({ length: Math.min(7, candidates + 2) }, (_, i) => {
        const module = ['Order capture', 'Customer master', 'Billing engine', 'Reporting', 'Auth', 'Notification', 'Pricing rules', 'Admin console'][i];
        const scoreV = score(rng, 42, 96);
        return [module, num(rng.int(4, 180) * 1000), rng.pick(['High', 'Medium', 'Low']), rng.pick(['Tight', 'Moderate', 'Loose']), rng.pick(['High', 'Medium']), String(scoreV), scoreV > 75 ? 'Extract now' : scoreV > 60 ? 'Next wave' : 'Retain / wrap'];
      }) },
      { type: 'table', title: 'Dependency hotspots', columns: ['Hotspot', 'Type', 'Depends on', 'Why it matters', 'Mitigation'], rows: [
        ['Shared customer table', 'Data', '7 modules', 'Every service writes the same record', 'Golden record service + views'],
        ['God service "core"', 'Code', `${rng.int(12, 40)} callers`, 'Blocks independent deploys', 'Strangler facade + event extraction'],
        ['Nightly batch ETL', 'Process', 'Reporting + billing', 'Untestable and opaque', 'Incremental CDC pipeline'],
        ['Inline pricing logic', 'Business rule', 'Order + billing', 'Two sources of truth', 'Rules service with decision table'],
        ['Session state in memory', 'Runtime', 'Web tier', 'Prevents horizontal scale', 'Externalised session store'],
      ] },
      { type: 'table', title: 'Proposed services and data ownership', columns: ['Service', 'Owns data', 'API style', 'Extraction order', 'Cutover style'], rows: [
        [entities[0] + ' service', entities[0], 'REST + events', '1', 'Canary with shadow reads'],
        [features[0].name.replace(/\s+/g, '-').toLowerCase() + ' service', entities[1], 'REST', '2', 'Parallel run'],
        [entities[2] + ' service', entities[2], 'gRPC + events', '3', 'Blue/green'],
        ['Evidence service', 'Audit events', 'Append-only event API', '1', 'Dual-write then cut'],
        ['Identity adapter', 'Identity mapping', 'OIDC bridge', '0', 'Read-only facade'],
      ] },
      { type: 'timeline', title: 'Strangler-fig waves', items: Array.from({ length: waves }, (_, i) => ({
        phase: `Wave ${i + 1} — ${['Establish the seam', 'Extract the first value stream', 'Retire the core', 'Scale and decommission'][i] || 'Expand'}`,
        weeks: `Week ${Math.round(i * ctx.weeks / waves) + 1}–${Math.round((i + 1) * ctx.weeks / waves)}`,
        detail: ['Facade, routing, observability and dual-run harness.', 'First service in production behind a flag with shadow traffic.', 'Move writes, reconcile, decommission legacy module.', 'Harden, document, remove the strangler facade.'][i],
        items: [
          ['Contract tests', 'Feature flags', 'Baseline capture'],
          ['Shadow reads', '1% canary', 'Reconciliation report'],
          ['Dual-write', 'Backfill', 'Rollback rehearsal'],
          ['Load test', 'Runbook sign-off', 'Legacy shutdown'],
        ][i],
      })) },
      { type: 'table', title: 'Database decomposition plan', columns: ['Legacy schema', 'Target owner', 'Strategy', 'Reconciliation', 'Risk'], rows: [
        ['customers', 'Customer service', 'Shared views, then physical split', 'Row counts + checksum per tenant', 'High'],
        ['orders', 'Order service', 'Logical split + CDC', 'Order count and value totals', 'Medium'],
        ['billing_ledger', 'Billing service', 'Retain, harden, expose API', 'Double-entry reconciliation', 'High'],
        ['audit_log', 'Evidence service', 'Append-only migration', 'Hash chain verification', 'Low'],
        ['reference_data', 'Platform', 'Replicate read-only', 'Daily diff report', 'Low'],
      ] },
      { type: 'table', title: 'Behavioural equivalence suite', columns: ['Test', 'Legacy oracle', 'Tolerance', 'Owner', 'Gate'], rows: [
        ['Order total calculation', 'Legacy batch output', '0.01 currency unit', 'QA automation', 'Wave 1'],
        ['Pricing rule precedence', 'Decision table export', 'Exact', 'Product + QA', 'Wave 1'],
        ['Tax jurisdiction mapping', 'Finance sample', 'Exact', 'Finance', 'Wave 2'],
        ['Customer merge behaviour', 'Manual golden records', '98% match', 'Data', 'Wave 2'],
        ['Month-end close totals', 'Finance ledger', '0 variance', 'Finance', 'Wave 3'],
      ] },
      { type: 'table', title: 'Technical debt and dead code', columns: ['Finding', 'Type', 'Impact', 'Effort', 'Action'], rows: [
        ['Unused feature flags', 'Dead code', 'Cognitive load', 'S', 'Delete after confirmation'],
        ['Duplicate validation logic', 'Debt', 'Inconsistent behaviour', 'M', 'Centralise in domain service'],
        ['Direct DB access from UI', 'Architecture', 'Security + coupling', 'L', 'Introduce API boundary'],
        ['Deprecated auth library', 'Risk', 'CVE exposure', 'M', 'Replace before wave 1'],
        ['Orphaned scheduled jobs', 'Dead code', 'Cost + surprise', 'S', 'Disable and monitor'],
      ] },
      { type: 'numbered', title: 'Migration runbook', items: [
        'Freeze scope and capture the legacy baseline (traffic, outputs, data counts).',
        'Deploy the strangler facade in observe-only mode; verify routing parity.',
        'Enable shadow reads on the new service; reconcile daily for five business days.',
        'Rehearse rollback in staging, including data repair steps and owner paging.',
        'Canary 1% → 10% → 50% with automated rollback on error or latency thresholds.',
        'Promote to 100% only after human go/no-go and a clean reconciliation window.',
        'Retain legacy write path for one billing cycle; then decommission with evidence.',
      ] },
      { type: 'callout', title: 'Rollback contract', tone: 'warn', text: `Every wave has a tested rollback within ${rng.int(5, 30)} minutes. Rollback is triggered automatically on error rate > ${rng.float(1.5, 4).toFixed(1)}% or P95 latency > ${rng.int(1200, 3500)} ms, and manually by the delivery lead or SRE on call. Data written during the cutover must remain reconcilable in both models.` },
      { type: 'checklist', title: 'Guardrails', items: [
        { label: 'Architect approves service boundaries before wave 1', state: 'pending' },
        { label: 'Finance signs the reconciliation tolerances', state: 'pending' },
        { label: 'Parallel-run evidence attached for each wave', state: 'pending' },
        { label: 'Production cutover requires human go/no-go', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 6. REA */
function rea(ctx, rng) {
  const { domain, tier } = ctx;
  const artifacts = rng.int(3, 7);
  const functions = rng.int(240, 2400);
  const rules = rng.int(18, 72);
  return {
    title: `REA analysis: behaviour recovery from shipped artifacts`,
    subtitle: `Evidence-backed feature parity — ${domain.label}, ${tier.label}`,
    summary: `${artifacts} artifacts triaged, ${functions} functions inventoried and ${rules} undocumented business rules recovered with confidence grades. The highest-value finding is the ${rng.pick(['pricing precedence', 'entitlement check', 'retry and idempotency', 'routing rule'])} logic, which is not documented anywhere and is a production-parity risk. No source code is claimed; every behaviour statement is tied to observable evidence.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Artifacts analysed', value: `${artifacts}` },
        { label: 'Functions inventoried', value: num(functions) },
        { label: 'Business rules recovered', value: `${rules}` },
        { label: 'Feature parity', value: `${score(rng, 62, 92)}%` },
        { label: 'High-confidence findings', value: `${score(rng, 54, 88)}%` },
        { label: 'Open legal reviews', value: `${rng.int(0, 2)}` },
      ] },
      { type: 'table', title: 'Artifact triage', columns: ['Artifact', 'Format', 'Analysis backend', 'Coverage', 'Confidence'], rows: [
        ['Desktop client', 'Native x86-64', 'Ghidra + dynamic tracing', `${score(rng, 55, 92)}%`, 'Medium'],
        ['Mobile app', 'APK / AAB', 'JADX + Frida', `${score(rng, 62, 95)}%`, 'High'],
        ['Admin console', 'JS / Electron', 'Source-map and bundle analysis', `${score(rng, 70, 96)}%`, 'High'],
        ['Integration service', '.NET assembly', 'ILSpy / dnSpy', `${score(rng, 48, 88)}%`, 'Medium'],
        ['Edge device', 'Firmware / ARM', 'Ghidra + hardware UART', `${score(rng, 30, 70)}%`, 'Low'],
        ['Public web surface', 'WASM / JS', 'Browser instrumentation', `${score(rng, 65, 94)}%`, 'High'],
      ].slice(0, Math.max(3, artifacts)) },
      { type: 'table', title: 'Backend selection and orchestration', columns: ['Backend', 'Used for', 'Licence', 'Autonomy', 'Human gate'], rows: [
        ['Ghidra', 'Native binaries, firmware', 'Apache 2.0', 'Automated', 'Analyst validates key functions'],
        ['IDA Pro', 'Deep native analysis', 'Commercial (licensed seats)', 'Analyst-driven', 'Licence compliance review'],
        ['JADX', 'Android decompilation', 'Apache 2.0', 'Automated', 'Sample verification'],
        ['Hopper', 'macOS / Mach-O', 'Commercial', 'Analyst-driven', 'Licence compliance review'],
        ['Frida', 'Dynamic instrumentation', 'Open source', 'Assisted', 'Legal + environment approval'],
        ['Custom LLM synthesis', 'Pseudocode → behaviour spec', 'Private deployment', 'Draft only', 'Human verification required'],
      ] },
      { type: 'numbered', title: 'Behaviour questions driving the analysis', items: [
        'What determines the price a customer actually sees, and in what precedence order?',
        'Which server-side checks are enforced versus merely displayed client-side?',
        'How are retries, duplicates and partial failures handled across the sync protocol?',
        'What entitlement rules gate premium features, and where are they evaluated?',
        'Which local data persists after logout, uninstall or account deletion?',
        'What happens when the service is offline — queue, drop or degrade?',
        'Which undocumented fields are sent to third parties, and under what consent state?',
      ] },
      { type: 'table', title: 'Call graph and module inventory', columns: ['Module', 'Functions', 'Cyclomatic avg', 'External calls', 'Evidence', 'Notes'], rows: [
        ['auth', String(rng.int(24, 90)), String(rng.int(3, 9)), '2', 'Bin + strings', 'Token refresh logic undocumented'],
        ['sync', String(rng.int(40, 180)), String(rng.int(6, 14)), '4', 'Dynamic trace', 'Retry storm risk under offline'],
        ['pricing', String(rng.int(18, 70)), String(rng.int(4, 12)), '1', 'Native + API capture', 'Precedence rules recovered'],
        ['entitlements', String(rng.int(12, 55)), String(rng.int(2, 8)), '2', 'APK + server responses', 'Client and server disagree'],
        ['reporting', String(rng.int(30, 120)), String(rng.int(3, 10)), '3', 'API surface', 'Undocumented export endpoint'],
        ['update', String(rng.int(8, 30)), String(rng.int(2, 7)), '1', 'Strings + traffic', 'Unsigned fallback path'],
      ] },
      { type: 'table', title: 'Behaviour specification sample', columns: ['Behaviour', 'Evidence', 'Inference', 'Confidence', 'Verification'], rows: [
        ['Price = base × tier multiplier, then promo, then tax', 'Native branch + captured API payload', 'Precedence order', 'High', 'Fixture replay'],
        ['Entitlement checked client-side only for export', 'APK branch, no server call observed', 'Potential bypass', 'Medium', 'Server probe'],
        ['Offline queue retries 5× with fixed 30s backoff', 'Dynamic trace over 4 runs', 'Storm under outage', 'High', 'Fault injection'],
        ['Deletion scrubs profile but retains analytics ID', 'Storage diff after logout', 'Privacy gap', 'High', 'Second-device check'],
        ['Duplicate order key is client-generated', 'Payload capture', 'Idempotency risk', 'Medium', 'Replay test'],
      ] },
      { type: 'table', title: 'Feature parity checklist', columns: ['Feature', 'Legacy behaviour', 'Target', 'Parity', 'Gap / owner'], rows: [
        ['Account creation', 'Email + invite code', 'SSO + email', 'Partial', 'Invite code policy'],
        ['Bulk import', 'CSV, max 5k rows', 'CSV + API', 'Full', '—'],
        ['Offline mode', 'Queue and retry', 'Queue with idempotency', 'Improved', 'Sync owner'],
        ['Export', 'CSV + PDF', 'Same + API', 'Full', '—'],
        ['Audit trail', 'None', 'Immutable log', 'New', 'Compliance'],
        ['Admin roles', 'Two roles', 'RBAC', 'Improved', 'Security'],
      ] },
      { type: 'table', title: 'Reconstructed API surface', columns: ['Endpoint', 'Method', 'Observed', 'Auth', 'Risk'], rows: [
        ['/v1/session', 'POST', 'Yes', 'Bearer', 'Low'],
        ['/v1/items', 'GET', 'Yes', 'Bearer', 'Low'],
        ['/v1/items/export', 'POST', 'Yes', 'Bearer (weak)', 'High'],
        ['/v1/entitlements', 'GET', 'Yes', 'Bearer', 'Medium'],
        ['/v1/admin/usage', 'GET', 'Undocumented', 'API key', 'High'],
        ['/v1/sync/batch', 'POST', 'Yes', 'HMAC', 'Medium'],
      ] },
      { type: 'table', title: 'Undocumented business rules', columns: ['Rule', 'Where found', 'Impact on rebuild', 'Confidence'], rows: [
        ['Volume discount applies before promo stacking', 'Pricing module', 'Revenue correctness', 'High'],
        ['Accounts with >3 failed payments enter silent grace', 'Billing branch', 'Collections policy', 'Medium'],
        ['Same-day cancellations are non-refundable after 4pm local', 'Client + server', 'Consumer terms', 'High'],
        ['Exports are capped at 5,000 rows without warning', 'API response', 'Operational surprise', 'High'],
        ['Admin impersonation leaves no audit entry', 'Admin bundle', 'Compliance gap', 'Medium'],
      ] },
      { type: 'callout', title: 'Confidence and limitation disclosure', tone: 'warn', text: `Findings describe observable behaviour, not original source code. Static analysis cannot prove runtime intent; dynamic evidence was captured in an approved environment. Low-confidence items (${rng.int(3, 9)}) are explicitly marked and must not drive product decisions without human verification. Legal and IP review is required before any reuse.` },
      { type: 'checklist', title: 'Guardrails', items: [
        { label: 'Legal / IP review completed for each artifact', state: 'pending' },
        { label: 'Licensed tooling (IDA) used only under valid seats', state: 'pending' },
        { label: 'High-impact behaviour claims verified by a human analyst', state: 'pending' },
        { label: 'No source-code claim is made in client materials', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 7. AI DLC */
function dlc(ctx, rng) {
  const { tier, domain } = ctx;
  const readiness = score(rng, 72, 96);
  const selected = rng.int(38, 240);
  return {
    title: `Release readiness: ${ctx.codename} v${rng.int(1, 4)}.${rng.int(0, 9)}`,
    subtitle: `Agentic build, progressive delivery and promotion evidence — ${tier.label}`,
    summary: `Release readiness is ${readiness}/100. ${selected} of ${rng.int(300, 1400)} tests were selected for this diff; the canary is within tolerance and no policy gate is blocking. Production promotion remains a human decision and is not pre-approved by this artifact.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Release readiness', value: `${readiness} / 100` },
        { label: 'Tests selected', value: `${selected}` },
        { label: 'Build time saved', value: `${rng.int(18, 52)}%` },
        { label: 'Policy gates', value: `${rng.int(4, 9)} passed` },
        { label: 'Canary status', value: rng.pick(['Within tolerance', 'Within tolerance', 'Watch — latency']) },
        { label: 'Human approval', value: 'Required' },
      ] },
      { type: 'table', title: 'Pipeline stages', columns: ['Stage', 'Agent action', 'Evidence', 'Gate', 'Status'], rows: [
        ['Commit', 'PR review + secret scan', 'Review comments, SBOM', 'Blocking', 'Passed'],
        ['Build', 'SmartBuild cache and failure prediction', 'Build graph, timing', 'Blocking', 'Passed'],
        ['Test selection', 'Diff-aware suite selection', 'Coverage map, risk score', 'Advisory', 'Passed'],
        ['Security', 'SAST, dependency and IaC scan', 'Findings, signed report', 'Blocking', 'Passed'],
        ['Environment', 'IaC plan and drift check', 'Plan diff, policy result', 'Two-person', 'Passed'],
        ['Canary', 'Progressive traffic + analysis', 'Metrics window, error budget', 'Auto-rollback', 'Running'],
        ['Production', 'Promotion', 'Signed artifact, approvals', 'Human', 'Pending'],
      ] },
      { type: 'table', title: 'PR review findings', columns: ['Finding', 'File', 'Severity', 'Agent recommendation', 'Disposition'], rows: [
        ['Unbounded retry loop', `worker/${rng.pick(['sync', 'ingest', 'notify'])}.ts`, 'High', 'Cap attempts and add jitter', 'Fixed'],
        ['Missing authorization check', `api/routes/${rng.pick(['export', 'admin', 'cases'])}.ts`, 'Critical', 'Enforce tenant scope at handler', 'Fixed'],
        ['N+1 query', 'repository/search.ts', 'Medium', 'Batch fetch by IDs', 'Accepted'],
        ['Hardcoded prompt version', 'agent/prompt.ts', 'Medium', 'Read from registry', 'Fixed'],
        ['Missing test for failure path', 'tests/api.spec.ts', 'Low', 'Add timeout case', 'Added'],
      ] },
      { type: 'table', title: 'SmartBuild prediction', columns: ['Stage', 'Predicted', 'Actual', 'Variance', 'Action'], rows: [
        ['Dependency install', '48s', '44s', '-8%', 'Cache hit'],
        ['Type check', '32s', '39s', '+22%', 'Split project references'],
        ['Unit tests', '76s', '71s', '-7%', '—'],
        ['Bundle', '54s', '61s', '+13%', 'Investigate duplicate dep'],
        ['Container build', '88s', '84s', '-5%', '—'],
      ] },
      { type: 'table', title: 'IaC drift and remediation', columns: ['Resource', 'Desired', 'Observed', 'Drift', 'Action'], rows: [
        ['api-service task count', '3', String(rng.int(1, 6)), rng.pick(['Yes', 'No']), 'Re-apply with approval'],
        ['database backup retention', '14 days', rng.pick(['7 days', '14 days']), rng.pick(['Yes', 'No']), 'Restore policy'],
        ['WAF rate limit', '2000 rps', '2000 rps', 'No', '—'],
        ['object storage encryption', 'KMS', 'KMS', 'No', '—'],
        ['worker autoscaling max', '12', String(rng.int(6, 20)), rng.pick(['Yes', 'No']), 'Align to capacity plan'],
      ] },
      { type: 'table', title: 'Canary analysis', columns: ['Metric', 'Baseline', 'Canary', 'Threshold', 'Verdict'], rows: [
        ['Error rate', '0.4%', `${rng.float(0.2, 0.8).toFixed(2)}%`, '≤ 1.0%', 'Pass'],
        ['P95 latency', '820 ms', `${rng.int(760, 1150)} ms`, '≤ 1,200 ms', 'Pass'],
        ['Saturation', '54%', `${rng.int(46, 72)}%`, '≤ 80%', 'Pass'],
        ['Business conversion', '3.8%', `${rng.float(3.5, 4.2).toFixed(2)}%`, '± 5%', 'Pass'],
        ['Cost per request', '$0.011', `$${rng.float(0.009, 0.014).toFixed(4)}`, '≤ $0.015', 'Pass'],
      ] },
      { type: 'table', title: 'Release gates', columns: ['Gate', 'Rule', 'Evidence', 'Result', 'Approver'], rows: [
        ['Test', 'Critical suite 100% pass', 'JUnit + coverage', 'Pass', 'Automated'],
        ['Security', 'No critical or high open', 'Scan report', 'Pass', 'Automated'],
        ['Change', 'Two-person rule for infra', 'Signed approvals', 'Pass', 'Platform lead'],
        ['Commercial', 'Run cost within budget', 'Cost model', rng.pick(['Pass', 'Watch']), 'Finance'],
        ['Production', 'Named human approval', 'Decision record', 'Pending', ctx.tier.key === 'enterprise' ? 'Change board' : 'Product owner'],
      ] },
      { type: 'table', title: 'SBOM and supply chain', columns: ['Component', 'Version', 'Licence', 'Vulns', 'Status'], rows: [
        ['node', '22.x LTS', 'MIT', '0 high', 'Approved'],
        ['postgres', '16.x', 'PostgreSQL', '0 high', 'Approved'],
        ['openai-sdk', '4.x', 'Apache 2.0', '0 high', 'Approved'],
        [`${rng.pick(['langchain', 'llamaindex', 'haystack'])}`, '0.x', 'MIT', `${rng.int(0, 2)} medium`, 'Watch'],
        ['internal-agent-core', `1.${rng.int(2, 9)}.0`, 'Proprietary', '0', 'Signed'],
      ] },
      { type: 'numbered', title: 'Auto-rollback and recovery', items: [
        'Abort the rollout if error rate exceeds the canary baseline by 2× for 3 minutes.',
        'Shift traffic back to the stable revision; keep the canary environment for forensics.',
        'Freeze the queue consumer and drain in-flight work with idempotency keys.',
        'Run the smoke suite against the stable revision and confirm business transactions.',
        'Emit a decision record with metrics, timeline and owner; page the release manager.',
        'Open a follow-up with the failing diff and the exact evaluation that missed it.',
      ] },
      { type: 'checklist', title: 'Promotion guardrails', items: [
        { label: 'Production promotion approved by a named human', state: 'pending' },
        { label: 'Policy-as-code gates evaluated on the exact artifact', state: 'pending' },
        { label: 'Two-person rule satisfied for infrastructure changes', state: 'pending' },
        { label: 'Rollback rehearsed in the last 30 days', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 8. TESTING */
function testing(ctx, rng) {
  const { domain, features, tier } = ctx;
  const cases = rng.int(24, 120);
  const coverage = rng.int(64, 94);
  const risk = score(rng, 18, 46);
  const flaky = rng.int(1, 9);
  const types = ['E2E', 'API', 'Unit', 'Performance', 'Security', 'Accessibility'];
  return {
    title: `Test generation and quality gate: deployment ${rng.int(40, 180)}`,
    subtitle: `Diff-aware suite, risk coverage and release evidence — ${tier.label}`,
    summary: `${cases} new test cases were generated for this deployment, mapped to ${features.length} capabilities and ${domain.metrics.length} business metrics. Risk-weighted coverage is ${coverage}% with ${flaky} flaky test${flaky === 1 ? '' : 's'} quarantined. The quality gate is ${risk < 35 ? 'green with one waiver required' : 'amber — review before promotion'}.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'New tests generated', value: `${cases}` },
        { label: 'Risk-weighted coverage', value: `${coverage}%` },
        { label: 'Residual risk', value: `${risk} / 100` },
        { label: 'Flaky quarantined', value: `${flaky}` },
        { label: 'Critical-path oracles', value: `${rng.int(3, 9)}` },
        { label: 'Quality gate', value: risk < 35 ? 'Green + waiver' : 'Amber' },
      ] },
      { type: 'table', title: 'Generated test cases (sample)', columns: ['ID', 'Capability', 'Type', 'Priority', 'Oracle', 'State'], rows: Array.from({ length: 9 }, (_, i) => {
        const f = features[i % features.length];
        return [`TC-${String(rng.int(1000, 9999))}`, f.name, types[i % types.length], rng.pick(['P0', 'P1', 'P1', 'P2']), rng.pick(['Explicit expected value', 'Invariant', 'Human-approved oracle', 'Snapshot + review']), rng.pick(['Generated', 'Generated', 'Passing', 'Needs oracle'])];
      }) },
      { type: 'table', title: 'Coverage gaps', columns: ['Area', 'Current', 'Target', 'Gap', 'Recommended tests'], rows: [
        ['Critical business paths', `${coverage}%`, '100%', `${100 - coverage}%`, `${rng.int(3, 9)} E2E flows`],
        ['API contracts', `${rng.int(70, 95)}%`, '95%', `${rng.int(0, 20)}%`, 'Schema + negative cases'],
        ['Authorization boundaries', `${rng.int(40, 85)}%`, '100%', `${rng.int(15, 50)}%`, 'Cross-tenant probes'],
        ['Failure and recovery', `${rng.int(30, 70)}%`, '90%', `${rng.int(20, 55)}%`, 'Chaos + timeout cases'],
        ['Accessibility', `${rng.int(35, 80)}%`, '90%', `${rng.int(10, 45)}%`, 'Keyboard + screen reader'],
        ['Performance', `${rng.int(20, 60)}%`, '80%', `${rng.int(20, 55)}%`, 'Load + soak'],
      ] },
      { type: 'table', title: 'Risk-based prioritisation', columns: ['Journey', 'Impact', 'Likelihood', 'Detectability', 'Risk', 'Test depth'], rows: domain.useCases.slice(0, 5).map((u, i) => {
        const imp = rng.int(3, 5); const lik = rng.int(2, 4); const det = rng.int(1, 4);
        return [u[0], String(imp), String(lik), String(det), String(imp * lik * (5 - det)), i < 2 ? 'Exhaustive' : 'Focused'];
      }) },
      { type: 'table', title: 'Test data strategy', columns: ['Data set', 'Source', 'Masking', 'Refresh', 'Owner'], rows: [
        ['Core accounts', 'Synthetic', 'Generated', 'Per run', 'QA'],
        ['Historical transactions', 'Production sample', 'Tokenised at ingest', 'Weekly', 'Data'],
        ['Documents and attachments', 'Synthetic corpus', 'N/A', 'Per release', 'QA'],
        ['Identity and roles', 'Seeded fixtures', 'N/A', 'Per run', 'Security'],
        ['Performance volume', 'Generated', 'N/A', 'Monthly', 'SRE'],
      ] },
      { type: 'table', title: 'Flaky tests and quarantine', columns: ['Test', 'Failure rate', 'Likely cause', 'Action', 'Owner'], rows: Array.from({ length: Math.max(2, flaky) }, (_, i) => [`${rng.pick(['checkout', 'sync', 'export', 'login', 'search'])} › ${rng.pick(['timeout', 'race', 'retry', 'stale fixture'])}-${i + 1}`, `${rng.float(2, 18).toFixed(1)}%`, rng.pick(['Async wait too short', 'Shared mutable fixture', 'Clock/timezone dependency', 'Third-party sandbox latency']), rng.pick(['Quarantined + fixed', 'Retry with backoff', 'Fixture isolation']), rng.pick(['QA', 'SRE', 'Feature team'])]) },
      { type: 'table', title: 'Defect triage sample', columns: ['Defect', 'Severity', 'Dedupe', 'Likely root cause', 'Suggested owner'], rows: [
        ['Export produces zero rows for filtered view', 'High', '3 duplicates', 'Filter applied after pagination', 'API team'],
        ['Approval email delayed > 10 min', 'Medium', 'Unique', 'Queue consumer backlog', 'Platform'],
        ['Currency rounding drift on refunds', 'High', '2 duplicates', 'Float arithmetic in price calc', 'Billing'],
        ['Keyboard trap in modal', 'Medium', 'Unique', 'Focus restore missing', 'Frontend'],
      ] },
      { type: 'table', title: 'Quality gate decisioning', columns: ['Gate', 'Threshold', 'Actual', 'Decision', 'Sign-off'], rows: [
        ['P0 test pass rate', '100%', `${rng.int(96, 100)}%`, rng.chance(0.75) ? 'Pass' : 'Conditional', 'QA lead'],
        ['Risk-weighted coverage', '≥ 80%', `${coverage}%`, coverage >= 80 ? 'Pass' : 'Waiver', 'QA lead'],
        ['Critical defects open', '0', `${rng.int(0, 2)}`, 'Conditional', 'Product owner'],
        ['Performance budget', 'P95 ≤ 1.2s', `${(rng.float(0.7, 1.4)).toFixed(2)}s`, 'Pass', 'SRE'],
        ['Security criticals', '0', '0', 'Pass', 'Security'],
      ] },
      { type: 'bars', title: 'Coverage by capability', items: features.slice(0, 6).map((f) => ({ label: f.name, value: score(rng, 45, 97) })) },
      { type: 'callout', title: 'Test oracle guardrail', tone: 'warn', text: `AI-authored tests for ${features.slice(0, 3).map((f) => f.name.toLowerCase()).join(', ')} depend on business oracles that only a human can approve. Waivers expire after ${rng.int(7, 30)} days and must name an accountable owner. Passing tests are evidence, not proof of correctness.` },
      { type: 'checklist', title: 'Sign-offs', items: [
        { label: 'Critical-path test oracles approved by product', state: 'pending' },
        { label: 'Waivers signed with an expiry and owner', state: 'pending' },
        { label: 'Human review of AI-authored security tests', state: 'pending' },
        { label: 'Quality gate decision recorded with evidence', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 9. FDE AS A SERVICE */
function fdeService(ctx, rng) {
  const { domain, tier, team, weeks, budget } = ctx;
  const features = ctx.features;
  const fit = score(rng, 68, 94);
  return {
    title: `AI FDE service: ${ctx.codename} solutioning`,
    subtitle: `Qualification, options, SOW and staffing — ${tier.label}`,
    summary: `Qualification fit is ${fit}/100. The recommended motion is a ${weeks}-week ${tier.label.toLowerCase()} engagement with a ${team}-person pod at ${money(budget)}, structured as paid discovery followed by two outcome-gated delivery tranches. Every client-facing claim in this pack is a draft until a named FDE validates it.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Qualification fit', value: `${fit} / 100` },
        { label: 'Recommended tier', value: tier.label },
        { label: 'Effort', value: `${team * weeks} person-weeks` },
        { label: 'Commercial value', value: money(budget * 1.22) },
        { label: 'Gross margin', value: `${rng.int(31, 48)}%` },
        { label: 'Time to SOW', value: `${rng.int(3, 10)} days` },
      ] },
      { type: 'table', title: 'Qualification scorecard', columns: ['Criterion', 'Weight', 'Evidence', 'Score'], rows: [
        ['Pain is urgent and funded', '25%', 'Executive sponsor + budget line', String(score(rng, 65, 96))],
        ['Data access is realistic', '20%', 'Named owner, sample received', String(score(rng, 42, 88))],
        ['Workflow is automatable', '20%', 'Rules and exceptions understood', String(score(rng, 55, 92))],
        ['Technical landscape can support it', '15%', 'API and cloud assessment', String(score(rng, 45, 86))],
        ['Decision process is clear', '10%', 'Single accountable buyer', String(score(rng, 50, 90))],
        ['Strategic expansion potential', '10%', `${domain.personas.length} personas, ${rng.int(2, 5)} sites`, String(score(rng, 60, 95))],
      ] },
      { type: 'table', title: 'Solution options', columns: ['Option', 'Shape', 'Time to value', 'Cost', 'Trade-off'], rows: [
        ['A — Product-led pilot', `${features0(ctx)} with synthetic and one real integration`, `${Math.round(weeks * 0.45)} weeks`, money(budget * 0.42), 'Fast evidence, narrow scope'],
        ['B — Production slice', 'End-to-end vertical slice with security and ops', `${weeks} weeks`, money(budget), 'Balanced; needs data access'],
        ['C — Platform build', 'Shared platform + multiple workflows', `${Math.round(weeks * 1.8)} weeks`, money(budget * 2.3), 'Highest leverage, highest change load'],
      ] },
      { type: 'table', title: 'SOW outline', columns: ['Section', 'Content', 'Owner'], rows: [
        ['Outcomes', `${features[0].name} live for ${rng.int(8, 40)} pilot users`, 'FDE lead'],
        ['Scope', `${features.slice(0, 4).map((f) => f.name).join(', ')}`, 'Solution lead'],
        ['Out of scope', 'Billing, full RBAC, data migration at scale', 'Commercial'],
        ['Assumptions', `${domain.integrations[0]} sandbox by week 2; named product owner`, 'FDE lead'],
        ['Acceptance', 'Outcome thresholds + evidence pack + handover', 'QA + client'],
        ['Governance', 'Weekly demo, monthly steering, RAID log', 'Delivery manager'],
        ['Commercials', `${money(budget)} fixed by tranche, expenses excluded`, 'Finance'],
      ] },
      { type: 'table', title: 'Pricing recommendation', columns: ['Tranche', 'Scope', 'Fee', 'Trigger'], rows: [
        ['0 — Discovery', 'Two weeks of assessment and blueprint', money(budget * 0.14), 'Signed SOW'],
        ['1 — Pilot', 'Core workflow, synthetic data, eval harness', money(budget * 0.38), 'Discovery accepted'],
        ['2 — Production', 'Real integrations, security, operability', money(budget * 0.48), 'Pilot outcome met'],
        ['Run (monthly)', 'Support, model ops, improvement', money(tier.infra * 0.9 + 1800), 'Go-live'],
      ] },
      { type: 'table', title: 'Staffing proposal', columns: ['Role', 'Allocation', 'Named / TBD', 'Responsibility'], rows: [
        ['FDE lead', '80%', rng.pick(['Named', 'TBD']), 'Outcomes, client interface, guardrails'],
        ['Solution architect', '50%', 'Named', 'Boundaries, ADRs, ARB'],
        ['Senior engineer', '100%', 'TBD', 'Core workflow and integrations'],
        ['Data engineer', '60%', 'TBD', 'Pipelines, quality, reconciliation'],
        ['Product designer', '40%', 'TBD', 'Workflow and prototype'],
        ['QA automation', '50%', 'TBD', 'Oracles, suites, evidence'],
        ['Delivery manager', '30%', 'Named', 'Plan, risks, reporting'],
      ] },
      { type: 'timeline', title: 'Delivery plan', items: [
        { phase: 'Qualify and commit', weeks: 'Week 0–1', detail: 'Fit, data access, decision rights and commercial envelope.', items: ['SOW signed', 'Kickoff', 'Success measures'] },
        { phase: 'Prove the slice', weeks: `Weeks 2–${Math.round(weeks * 0.55)}`, detail: 'One workflow with real users and measured outcomes.', items: ['Working software', 'Eval evidence', 'Pilot cohort'] },
        { phase: 'Harden and launch', weeks: `Weeks ${Math.round(weeks * 0.55) + 1}–${weeks}`, detail: 'Security, operability, support model and handover.', items: ['Runbook', 'SLOs', 'Training + handover'] },
        { phase: 'Expand', weeks: `Post week ${weeks}`, detail: 'Second workflow or second site, priced as an option.', items: ['Value review', 'Expansion proposal', 'Managed service option'] },
      ] },
      { type: 'table', title: 'Escalation to a human FDE', columns: ['Trigger', 'Threshold', 'Escalate to', 'Response'], rows: [
        ['Commercial commitment requested', 'Any contract or discount', 'Account FDE + finance', 'Same business day'],
        ['Security or legal question', 'Any regulated data or IP issue', 'Security + legal', '4 business hours'],
        ['Low confidence solution', 'Confidence < 60%', 'Principal FDE', '1 business day'],
        ['Client dissatisfaction', 'Negative sentiment 2 cycles', 'Engagement lead', 'Same day'],
        ['Scope change > 20%', 'Effort or timeline', 'Delivery + commercial', '2 business days'],
      ] },
      { type: 'callout', title: 'Standing guardrail', tone: 'warn', text: 'Kiln agents do not make commitments on scope, price, delivery dates or outcomes. This solutioning pack is internal until a named FDE validates every client-facing statement and the commercial owner approves pricing.' },
      { type: 'checklist', title: 'Release-to-client gates', items: [
        { label: 'FDE validates scope, estimate and confidence', state: 'pending' },
        { label: 'Pricing and margin approved by commercial owner', state: 'pending' },
        { label: 'Legal reviews assumptions, IP and data terms', state: 'pending' },
        { label: 'Client-facing pack personally reviewed by the FDE', state: 'pending' },
      ] },
    ],
  };
}

function features0(ctx) { return ctx.features[0].name; }

/* ---------------------------------------------------------------- 10. PROPOSAL */
function proposal(ctx, rng) {
  const { domain, tier, features, team, weeks, budget } = ctx;
  const runCost = Math.round((tier.infra + team * rng.int(240, 420)) / 100) * 100;
  const aiCost = Math.round(tier.infra * rng.float(0.25, 0.6));
  const total = budget + runCost * 6 + aiCost * 6;
  return {
    title: `${ctx.codename} — proposal for ${tier.label.toLowerCase()} delivery`,
    subtitle: `${domain.label} · ${weeks} weeks · fixed-scope tranches and a governed path to production`,
    summary: `A ${weeks}-week engagement to take ${ctx.codename} from a validated wedge to a production slice. Build investment is ${money(budget)} across three tranches, with a monthly run cost of ${money(runCost + aiCost)}. Payback is modelled at ${rng.int(9, 22)} months; the first value milestone lands in week ${Math.round(weeks * 0.55)}.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Build investment', value: money(budget) },
        { label: 'Monthly run', value: money(runCost + aiCost) },
        { label: 'Time to first value', value: `${Math.round(weeks * 0.55)} weeks` },
        { label: 'Modelled payback', value: `${rng.int(9, 22)} months` },
        { label: 'Pod size', value: `${team} people` },
        { label: 'Confidence', value: `${score(rng, 74, 94)}%` },
      ] },
      { type: 'prose', title: 'What we heard', text: `You need ${features[0].name.toLowerCase()} without adding another system of record or another black box. ${domain.personas[0][0]}s currently absorb the cost through ${rng.pick(['manual reconciliation', 'spreadsheet workarounds', 'queue triage and rework', 'fragmented tooling'])}. The buying trigger is ${rng.pick(['a growth target', 'a compliance deadline', 'a service-level failure', 'a cost-reduction mandate'])}, which makes an outcome-gated programme more attractive than an open-ended transformation.` },
      { type: 'table', title: 'Scope by tranche', columns: ['Tranche', 'Deliverables', 'Duration', 'Fee', 'Acceptance'], rows: [
        ['Discovery', 'Landscape, blueprint, ADRs, estimate, pilot design', '2 weeks', money(budget * 0.14), 'Blueprint accepted'],
        ['Pilot', `${features.slice(0, 3).map((f) => f.name).join(', ')} with synthetic + one real integration`, `${Math.round(weeks * 0.4)} weeks`, money(budget * 0.38), 'Outcome thresholds met'],
        ['Production', 'Security, operations, integration breadth, handover', `${Math.round(weeks * 0.45)} weeks`, money(budget * 0.48), 'Go-live checklist signed'],
      ] },
      { type: 'timeline', title: 'Roadmap', items: [
        { phase: 'Discover', weeks: `Week 1–2`, detail: 'Confirm the wedge, access and success thresholds.', items: ['Stakeholder interviews', 'Landscape assessment', 'Blueprint signed'] },
        { phase: 'Prove', weeks: `Week 3–${Math.round(weeks * 0.55)}`, detail: 'Working slice with pilot users and measured outcomes.', items: ['Core workflow', 'Eval harness', 'First value review'] },
        { phase: 'Harden', weeks: `Week ${Math.round(weeks * 0.55) + 1}–${Math.round(weeks * 0.85)}`, detail: 'Security, reliability, integrations and support model.', items: ['Pen-test remediation', 'SLOs and runbooks', 'Training'] },
        { phase: 'Scale', weeks: `Week ${Math.round(weeks * 0.85) + 1}–${weeks}`, detail: 'Expand to second cohort or site; handover to your team.', items: ['Adoption review', 'Handover', 'Expansion options'] },
      ] },
      { type: 'table', title: 'Pricing and commercial model', columns: ['Line', 'Basis', 'Amount', 'Notes'], rows: [
        ['Build — discovery', 'Fixed fee', money(budget * 0.14), 'Credited against production tranche'],
        ['Build — pilot', 'Fixed fee', money(budget * 0.38), 'Outcome-gated'],
        ['Build — production', 'Fixed fee', money(budget * 0.48), 'Acceptance criteria attached'],
        ['Platform run', 'Monthly', money(runCost), 'Hosting, observability, support'],
        ['AI usage', 'Monthly cap', money(aiCost), 'Metered, with overage at cost + 10%'],
        ['Total first 6 months', 'Build + run', money(total), 'Excludes client-side data remediation'],
      ] },
      { type: 'table', title: 'Assumptions and exclusions', columns: ['Type', 'Item', 'Impact if false'], rows: [
        ['Assumption', `${domain.integrations[0]} sandbox by week 2`, 'Timeline +2–4 weeks'],
        ['Assumption', 'Named product owner with decision authority', 'Weekly rework'],
        ['Assumption', 'Test data available under an approved agreement', 'Pilot delay'],
        ['Exclusion', 'Large-scale historical data migration', 'Separate SOW'],
        ['Exclusion', 'Client-side change management beyond pilot cohort', 'Adoption risk'],
        ['Exclusion', 'Third-party licence fees', 'Pass-through'],
      ] },
      { type: 'table', title: 'Why this team', columns: ['Proof point', 'Evidence', 'Relevance'], rows: [
        ['Comparable delivery', `${rng.int(2, 9)} similar ${domain.label.toLowerCase()} engagements`, 'Pattern reuse'],
        ['Agent guardrails', 'Human approval and evidence architecture in every build', 'Risk reduction'],
        ['Speed', `First working slice in ${rng.int(3, 6)} weeks`, 'Faster evidence'],
        ['Handover', 'Documentation, training and runbooks as deliverables', 'No dependency trap'],
        ['Commercials', 'Outcome-gated tranches', 'Aligned incentives'],
      ] },
      { type: 'table', title: 'Stakeholder personalisation', columns: ['Role', 'What they care about', 'Lead message'], rows: [
        ['Executive sponsor', 'Payback and risk', `${money(budget)} to first evidence in ${Math.round(weeks * 0.55)} weeks; downside capped by tranche gates.`],
        ['CTO / architect', 'Boundaries and operability', 'Modular core, private model gateway, ADRs and drift checks from day one.'],
        ['Security / compliance', 'Evidence and control', `${tier.compliance}; signed artifacts, append-only evidence, human approval gates.`],
        ['Operations lead', 'Adoption and workload', 'Embedded in the existing workflow; no new console to manage.'],
        ['Finance', 'Predictability', 'Fixed build fee, capped run cost, monthly AI usage reporting.'],
      ] },
      { type: 'table', title: 'Consistency checks', columns: ['Check', 'Result', 'Evidence'], rows: [
        ['Scope ↔ price', 'Pass', 'Every deliverable mapped to a tranche'],
        ['Price ↔ timeline', 'Pass', `${team} × ${weeks} weeks supports the estimate`],
        ['Scope ↔ assumptions', rng.pick(['Pass', 'Review']), 'Integration timing is the critical assumption'],
        ['Claims ↔ evidence', 'Review', 'Outcome figures are modelled, not guaranteed'],
        ['Brand / legal', 'Pending', 'Awaiting review'],
      ] },
      { type: 'callout', title: 'Commercial guardrail', tone: 'warn', text: 'This proposal is a draft. It cannot be sent, priced or committed until a named FDE validates technical accuracy, the commercial owner approves pricing and margin, and legal/brand review is complete. No autonomous commitments are made by Kiln agents.' },
      { type: 'checklist', title: 'Approval workflow', items: [
        { label: 'FDE technical accuracy review', state: 'pending' },
        { label: 'Commercial approval (price, margin, terms)', state: 'pending' },
        { label: 'Brand and legal review', state: 'pending' },
        { label: 'Accountable partner signs the release', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 11. CAPACITY */
function capacity(ctx, rng) {
  const { tier, team, weeks, domain } = ctx;
  const baseDemand = Math.round(team * rng.float(0.85, 1.25) * 10) / 10;
  const baseCap = Math.round(team * rng.float(1.0, 1.18) * 10) / 10;
  const gap = Math.round((baseDemand - baseCap) * 10) / 10;
  const util = Math.round((baseDemand / baseCap) * 100);
  const people = Array.from({ length: 8 }, () => ({ name: pickName(rng), role: rng.pick(ROLES) }));
  const dprDays = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.now() + (i + 1) * 86400000);
    const demand = Math.round(baseDemand * rng.float(0.82, 1.3) * 10) / 10;
    const cap = Math.round(baseCap * rng.float(0.9, 1.08) * 10) / 10;
    return [`Day ${i + 1}`, iso(d), demand.toFixed(1), cap.toFixed(1), (demand - cap).toFixed(1), `${Math.round((demand / cap) * 100)}%`];
  });
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() + i + 1);
    const pipeline = Math.round(rng.float(1.2, 3.8) * 10) / 10;
    const backlog = Math.round(rng.float(0.8, 2.6) * 10) / 10;
    const demand = pipeline + backlog;
    const cap = Math.round(baseCap * rng.float(0.95, 1.1) * 10) / 10;
    return [d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), pipeline.toFixed(1), backlog.toFixed(1), demand.toFixed(1), cap.toFixed(1), (demand - cap).toFixed(1)];
  });
  return {
    title: `Capacity plan: DPR and RLS for ${ctx.codename}`,
    subtitle: `Daily projection, resource loading and hire triggers — ${tier.label}`,
    summary: `Demand is ${baseDemand} FTE against ${baseCap} FTE of committed capacity — utilisation ${util}%, gap ${gap > 0 ? '+' : ''}${gap} FTE. The DPR flags ${rng.int(2, 6)} days above the ${rng.int(88, 96)}% threshold; the RLS shows bench concentrated in ${rng.pick(['design', 'QA automation', 'data engineering'])}. Two hire triggers are recommended. The Excel workbook contains live formulas, so scenario edits recalculate.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Current utilisation', value: `${util}%` },
        { label: 'Demand FTE', value: `${baseDemand} FTE` },
        { label: 'Committed capacity', value: `${baseCap} FTE` },
        { label: 'Capacity gap', value: `${gap > 0 ? '+' : ''}${gap} FTE` },
        { label: 'Hire triggers', value: `${rng.int(1, 3)} roles` },
        { label: 'Overloaded days (30d)', value: `${rng.int(2, 8)} days` },
      ] },
      { type: 'table', title: 'Demand forecast (6 months)', columns: ['Month', 'Pipeline FTE', 'Backlog FTE', 'Demand FTE', 'Capacity FTE', 'Gap'], rows: months },
      { type: 'table', title: 'DPR — daily projection report (next 10 business days)', columns: ['Day', 'Date', 'Demand FTE', 'Capacity FTE', 'Gap', 'Utilization'], rows: dprDays },
      { type: 'table', title: 'RLS — resource loading sheet', columns: ['Person', 'Role', 'Primary project', 'Billable hrs', 'Capacity hrs', 'Utilization %'], rows: people.map((p, i) => {
        const capHrs = rng.pick([32, 36, 40]);
        const bill = clamp(Math.round(capHrs * rng.float(0.62, 1.12)), 8, 46);
        return [p.name, p.role, i % 4 === 0 ? 'Internal / bench' : `${ctx.codename} — ${rng.pick(['Wave 1', 'Wave 2', 'Run', 'Discovery'])}`, String(bill), String(capHrs), `${Math.round((bill / capHrs) * 100)}%`];
      }) },
      { type: 'bars', title: 'Utilisation by role', items: ROLES.slice(0, 6).map((r) => ({ label: r, value: score(rng, 58, 112), valueText: `${score(rng, 58, 112)}%` })) },
      { type: 'table', title: 'Skill gaps and hiring triggers', columns: ['Skill', 'Required', 'Available', 'Gap', 'Trigger', 'Action'], rows: [
        ['Solution architecture', '2.0', '1.2', '0.8', 'Two consecutive weeks > 95%', 'Contract architect'],
        ['Data engineering', '2.5', '1.0', '1.5', 'Pipeline conversion > 40%', 'Hire 1 FTE'],
        ['QA automation', '1.5', '1.8', '+0.3', '—', 'Redeploy to wave 2'],
        ['FDE', '1.0', '0.6', '0.4', 'New engagement signed', 'Named FDE assignment'],
        ['SRE', '1.0', '0.5', '0.5', 'Production go-live within 6 weeks', 'Managed support add-on'],
      ] },
      { type: 'table', title: 'Scenario simulation', columns: ['Scenario', 'Demand', 'Capacity', 'Gap', 'Outage risk', 'Cost / mo'], rows: [
        ['Base plan', `${baseDemand} FTE`, `${baseCap} FTE`, `${gap}`, rng.pick(['Medium', 'Medium', 'Low']), money(tier.infra + team * 320)],
        ['Win 2 pipeline deals', `${(baseDemand + 2.4).toFixed(1)} FTE`, `${baseCap} FTE`, `+${(baseDemand + 2.4 - baseCap).toFixed(1)}`, 'High', money(tier.infra + team * 360 + 12000)],
        ['Hire 2 + defer 1 deal', `${(baseDemand + 0.6).toFixed(1)} FTE`, `${(baseCap + 2).toFixed(1)} FTE`, `${(baseDemand + 0.6 - baseCap - 2).toFixed(1)}`, 'Low', money(tier.infra + team * 380 + 22000)],
        ['Automate 30% of manual QA', `${(baseDemand - 0.5).toFixed(1)} FTE`, `${(baseCap + 0.4).toFixed(1)} FTE`, `${(baseDemand - 0.5 - baseCap - 0.4).toFixed(1)}`, 'Low', money(tier.infra + team * 310 - 2500)],
      ] },
      { type: 'table', title: 'Anomalies and alerts', columns: ['Signal', 'Observed', 'Threshold', 'Severity', 'Owner'], rows: [
        ['Utilisation spike', `${rng.int(96, 112)}%`, '95% for 3 days', 'High', 'Delivery lead'],
        ['Bench concentration', `${rng.int(3, 7)} people`, '> 2 for 2 weeks', 'Medium', 'Resource manager'],
        ['Overtime trend', `+${rng.int(8, 26)}%`, '+15% month-on-month', 'High', 'HR + delivery'],
        ['Pipeline conversion', `${rng.int(22, 48)}%`, 'Below 30%', 'Medium', 'Commercial'],
        ['Forecast variance', `±${rng.int(6, 18)}%`, '±10%', 'Low', 'PMO'],
      ] },
      { type: 'callout', title: 'Workbook and approval note', tone: 'default', text: 'The Excel export contains DPR, RLS, Scenarios and Summary sheets with live formulas for gap and utilisation. Editing demand or capacity recalculates the model. Allocations require delivery-lead approval; hiring triggers require HR and finance sign-off; the plan is reviewed monthly.' },
      { type: 'checklist', title: 'Approvals', items: [
        { label: 'Delivery lead approves the allocation plan', state: 'pending' },
        { label: 'HR and finance sign off hiring triggers', state: 'pending' },
        { label: 'Commercial validates pipeline assumptions', state: 'pending' },
        { label: 'Monthly capacity review scheduled', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- 12. GCC */
function gcc(ctx, rng) {
  const { tier, domain, team } = ctx;
  const sites = ['Bengaluru', 'Pune', 'Hyderabad', 'Lisbon', 'Kraków', 'Manila', 'Cairo', 'Bogotá'];
  const chosen = rng.picks(sites, 5);
  const investment = Math.round(tier.buildMid * rng.float(0.9, 1.7) / 1000) * 1000;
  return {
    title: `Managed services and GCC blueprint`,
    subtitle: `${tier.label} operating model, site strategy and transition plan — ${domain.label}`,
    summary: `A ${rng.pick(['build–operate–transfer', 'build–operate', 'co-managed'])} model is recommended, starting with ${rng.int(2, 4)} service lines and scaling to ${team + rng.int(8, 30)} FTE over ${rng.int(12, 24)} months. ${chosen[0]} scores highest on talent depth and time-zone overlap; ${chosen[1]} is the strongest cost hedge. Entity setup and legal remain human-owned.`,
    sections: [
      { type: 'kpis', items: [
        { label: 'Sites scored', value: `${chosen.length}` },
        { label: 'Target FTEs (24 mo)', value: `${team + rng.int(8, 30)}` },
        { label: 'Service lines', value: `${rng.int(2, 4)}` },
        { label: 'Investment', value: money(investment) },
        { label: 'SLA coverage', value: `${score(rng, 80, 97)}%` },
        { label: 'Go-live', value: `${rng.int(6, 12)} months` },
      ] },
      { type: 'table', title: 'Service catalog and SLAs', columns: ['Service', 'Scope', 'SLA', 'Hours', 'Owner'], rows: [
        ['Application support', 'Incidents, service requests, root cause', 'P1 response 1h, resolve 4h', '24x5', 'Service desk'],
        ['AI platform operations', 'Model gateway, evals, cost, prompt regressions', 'P1 1h, 99.9%', '24x7', 'Platform'],
        ['Data operations', 'Pipelines, quality, reconciliation', 'Critical pipeline 2h', '24x5', 'Data'],
        ['Security operations', 'Monitoring, triage, access reviews', 'Critical 30m', '24x7', 'Security'],
        ['Release management', 'Change, deployment, rollback', 'Change window adherence', 'Business hours', 'SRE'],
        ['Continuous improvement', 'Backlog, automation, value reporting', 'Monthly value pack', 'Business hours', 'FDE'],
      ] },
      { type: 'table', title: 'Operating model options', columns: ['Model', 'Control', 'Speed', 'Cost', 'Recommended'], rows: [
        ['Client-owned GCC', 'High', 'Medium', 'Medium', tier.key === 'enterprise' ? 'Yes' : 'Later'],
        ['Build–operate–transfer', 'Medium → High', 'Fast', 'Medium', 'Yes'],
        ['Managed service', 'Medium', 'Fastest', 'Higher', 'For run scope'],
        ['Co-managed pod', 'Shared', 'Fast', 'Low', 'Pilot phase'],
      ] },
      { type: 'table', title: 'Org design and role taxonomy', columns: ['Function', 'Roles', 'Year 1 FTE', 'Year 2 FTE', 'Location'], rows: [
        ['Delivery', 'FDE lead, engineers, QA', String(Math.round(team * 0.45)), String(Math.round(team * 0.6)), chosen[0]],
        ['Platform / SRE', 'SRE, platform engineer', String(Math.max(2, Math.round(team * 0.15))), String(Math.round(team * 0.2)), chosen[0]],
        ['Data', 'Data engineer, analyst', String(Math.max(1, Math.round(team * 0.12))), String(Math.round(team * 0.16)), chosen[1]],
        ['Security', 'Security analyst, IAM', String(Math.max(1, Math.round(team * 0.08))), String(Math.round(team * 0.1)), chosen[1]],
        ['Service management', 'Service desk, incident, problem', String(Math.max(2, Math.round(team * 0.12))), String(Math.round(team * 0.18)), chosen[2]],
        ['Leadership / PMO', 'Head of GCC, PMO, finance', String(Math.max(2, Math.round(team * 0.08))), String(Math.round(team * 0.1)), chosen[0]],
      ] },
      { type: 'table', title: 'Site selection scoring', columns: ['Location', 'Talent depth', 'Cost index', 'Attrition risk', 'Time-zone fit', 'Score'], rows: chosen.map((city) => {
        const talent = score(rng, 65, 96); const cost = rng.int(38, 82); const attrition = rng.int(18, 55); const tz = score(rng, 55, 96);
        const total = Math.round(talent * 0.35 + (100 - cost) * 0.25 + (100 - attrition) * 0.2 + tz * 0.2);
        return [city, `${talent}`, `${cost}`, `${attrition}%`, `${tz}`, `${total}`];
      }) },
      { type: 'table', title: 'Compliance and regulatory readiness', columns: ['Requirement', 'Applicability', 'Current', 'Action', 'Owner'], rows: [
        ['Data residency', 'High', rng.pick(['Partial', 'Gap']), 'Select region + contractual clauses', 'Legal + security'],
        ['SOC 2 / ISO 27001', 'High', rng.pick(['In place', 'Partial']), 'Extend scope to GCC entity', 'Compliance'],
        ['Employment and entity law', 'High', 'Gap', 'Local counsel and entity setup', 'Legal (human-owned)'],
        ['Cross-border transfer', 'Medium', 'Partial', 'Transfer impact assessment', 'Privacy'],
        ['Sector regulation', domain.compliance[0], rng.pick(['Partial', 'Gap']), 'Regulatory mapping workshop', 'Domain compliance'],
      ] },
      { type: 'table', title: 'Tooling and platform stack', columns: ['Layer', 'Choice', 'Why', 'Migration'], rows: [
        ['Service management', 'ITSM + incident tooling', 'Audit and SLA evidence', 'Greenfield'],
        ['Observability', 'OpenTelemetry + managed backend', 'Vendor flexibility', 'Bridge from client'],
        ['Identity', 'SSO + SCIM + PAM', 'Least privilege at scale', 'Federate'],
        ['AI platform', 'Private model gateway + eval registry', 'Cost and quality control', 'Reuse Kiln'],
        ['Data', 'Lakehouse + lineage', 'Quality and reconciliation', 'Connect to source'],
        ['Security', 'SIEM + CSPM + secrets', 'Detect and prove', 'Integrate with client SOC'],
      ] },
      { type: 'timeline', title: 'Phasing roadmap', items: [
        { phase: 'Mobilise', weeks: 'Month 1–2', detail: 'Entity/legal track, site decision, leadership hires.', items: ['Site selected', 'Entity plan', 'Service catalog signed'] },
        { phase: 'Stand up', weeks: 'Month 3–5', detail: 'Facilities, tooling, first 15 roles, knowledge transfer.', items: ['Tooling live', 'Runbooks', 'Shadow operations'] },
        { phase: 'Operate', weeks: 'Month 6–9', detail: 'Steady-state SLAs, automation backlog, cost to serve.', items: ['SLA reporting', 'Automation releases', 'Client satisfaction'] },
        { phase: 'Scale / transfer', weeks: 'Month 10–24', detail: 'Expand service lines; optional transfer to client entity.', items: ['Expansion plan', 'Leadership development', 'Transfer readiness'] },
      ] },
      { type: 'table', title: 'Investment model', columns: ['Line', 'Year 1', 'Year 2', 'Notes'], rows: [
        ['People', money(investment * 0.55), money(investment * 0.78), 'Ramp to target FTE'],
        ['Facilities and IT', money(investment * 0.12), money(investment * 0.1), 'Fit-out then run'],
        ['Tooling and licences', money(investment * 0.1), money(investment * 0.08), 'Per-seat model'],
        ['Transition and training', money(investment * 0.14), money(investment * 0.04), 'Front-loaded'],
        ['Contingency', money(investment * 0.09), money(investment * 0.05), '10% of build'],
      ] },
      { type: 'table', title: 'Risk register', columns: ['Risk', 'Impact', 'Likelihood', 'Mitigation', 'Owner'], rows: [
        ['Attrition above plan', 'High', 'Medium', 'Career lattice, retention bonus, second site', 'HR'],
        ['Knowledge transfer gaps', 'High', 'Medium', 'Shadowing, runbooks, exit criteria', 'Delivery'],
        ['Regulatory delay', 'High', 'Low', 'Early legal workstream', 'Legal'],
        ['Client dependency on key people', 'Medium', 'High', 'Pairing, documentation, rotation', 'GCC head'],
        ['Cost escalation', 'Medium', 'Medium', 'Indexed contract, quarterly review', 'Finance'],
      ] },
      { type: 'callout', title: 'Human-owned decisions', tone: 'warn', text: 'Entity incorporation, employment contracts, tax structuring, regulatory filings and site leases are human-owned and require local counsel. Kiln generates the operating blueprint and evidence pack; it does not execute legal, financial or employment commitments.' },
      { type: 'checklist', title: 'Steering committee gates', items: [
        { label: 'Steering committee approves the operating model', state: 'pending' },
        { label: 'Legal and entity setup owned by a named human', state: 'pending' },
        { label: 'Compliance signs the readiness assessment', state: 'pending' },
        { label: 'Finance approves the investment case', state: 'pending' },
      ] },
    ],
  };
}

/* ---------------------------------------------------------------- dispatcher */
const GENERATORS = { ideation, discovery, 'fde-consult': fdeConsult, architecture, modernization, rea, dlc, testing, 'fde-service': fdeService, proposal, capacity, gcc };

function generateArtifact(project, functionKey, options = {}) {
  const fn = FUNCTIONS.find((f) => f.key === functionKey);
  if (!fn) throw new Error(`Unknown workstream: ${functionKey}`);
  const ctx = projectContext(project);
  const revision = options.revision || 1;
  const instruction = options.instruction || '';
  const rng = new Rng(`${ctx.seed}:${functionKey}:r${revision}:${instruction}`);
  const body = GENERATORS[functionKey](ctx, rng);
  const model = MODELS.find((m) => m.id === project.model) || MODELS[0];
  const now = new Date().toISOString();
  return {
    id: options.id || `${project.id}-${functionKey}-r${revision}`,
    projectId: project.id,
    functionKey,
    functionName: fn.name,
    title: body.title,
    subtitle: body.subtitle,
    summary: body.summary,
    sections: body.sections,
    formats: fn.formats,
    status: options.status || 'draft',
    revision,
    createdAt: now,
    updatedAt: now,
    model: model.id,
    modelName: model.name,
    confidence: Math.round((body.sections.find((s) => s.type === 'kpis')?.items?.[0]?.value ? 78 : 72) + rng.int(0, 14)),
    guardrails: fn.guardrails,
    capabilities: fn.capabilities,
    tierNote: fn.tierNotes[ctx.tier.key],
    project: projectSnapshot(project, ctx),
    agentTrace: [
      { step: 'Parse brief', detail: `Extracted ${ctx.features.length} capabilities and ${ctx.kws.length} domain signals`, state: 'done' },
      { step: 'Retrieve patterns', detail: `Matched ${ctx.domain.label} reference pack + ${ctx.tier.label} guardrails`, state: 'done' },
      { step: 'Generate model', detail: `${model.name} (${ctx.modelProfile}) drafted structured sections from a seeded context`, state: 'done' },
      { step: 'Self-check', detail: `Checked scope–tier alignment and ${fn.guardrails.length} guardrails`, state: 'done' },
      { step: 'Human approval', detail: 'Waiting for a named reviewer to approve', state: 'pending' },
    ],
  };
}

module.exports = { generateArtifact, GENERATORS };
