'use strict';
/** Kiln orchestrator chat: intent routing, idea capture and artifact-aware replies. */

const { FUNCTIONS, MODELS } = require('./catalog');
const { TIERS, projectContext, keywords } = require('./core');

const INTENTS = [
  { key: 'proposal', words: ['proposal', 'quote', 'sow', 'commercial', 'pricing deck', 'sales deck', 'bid', 'contract'] },
  { key: 'capacity', words: ['capacity', 'dpr', 'rls', 'utilisation', 'utilization', 'bench', 'hiring', 'resourcing', 'resource loading', 'forecast'] },
  { key: 'gcc', words: ['gcc', 'managed service', 'managed services', 'sla', 'operating model', 'offshore', 'captive', 'site selection', 'global capability'] },
  { key: 'modernization', words: ['legacy', 'monolith', 'microservice', 'microservices', 'modernise', 'modernize', 'migration', 'migrate', 'strangler', 'refactor'] },
  { key: 'rea', words: ['reverse engineer', 'reverse-engineer', 'rea', 'decompile', 'apk', 'binary', 'firmware', 'parity', 'ghidra', 'ida'] },
  { key: 'testing', words: ['test', 'testing', 'qa', 'coverage', 'regression', 'flaky', 'test case', 'quality gate'] },
  { key: 'dlc', words: ['deploy', 'deployment', 'release', 'pipeline', 'ci/cd', 'cicd', 'devops', 'canary', 'rollback', 'sbom'] },
  { key: 'architecture', words: ['architecture', 'architect', 'adr', 'threat', 'stride', 'nfr', 'bounded context', 'c4', 'design review'] },
  { key: 'fde-consult', words: ['consult', 'consultation', 'assessment', 'raid', 'risk log', 'technical landscape', 'workshop'] },
  { key: 'fde-service', words: ['fde as a service', 'fde service', 'solutioning', 'staffing', 'qualification', 'effort', 'estimate'] },
  { key: 'discovery', words: ['competitor', 'competitors', 'market', 'discovery', 'research', 'whitespace', 'rag', 'predictability'] },
  { key: 'ideation', words: ['idea', 'prototype', 'ideation', 'validate', 'wedge', 'concept', 'mvp', 'business case'] },
];

const HELP = `I can generate twelve workstreams from a single brief — each becomes an editable artifact with PDF, PowerPoint, Word, Excel, Markdown and JSON exports where relevant.

**Start here**
- "Validate this idea and design a prototype" → Ideation to Prototype
- "Who are the competitors and where is the whitespace?" → Discovery & Competitor Analysis
- "Design the architecture and threat model" → Architecture Design & Review
- "Plan capacity with DPR and RLS" → Capacity Planning
- "Build a proposal for the SMB tier" → Proposal Design

You can also click **Generate all 12** in the workstreams panel. Every artifact is a draft until you approve it.`;

function detectIntent(text) {
  const t = String(text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    let score = 0;
    for (const w of intent.words) if (t.includes(w)) score += w.includes(' ') ? 3 : 1.6;
    if (score > bestScore) { best = intent.key; bestScore = score; }
  }
  return bestScore >= 1.6 ? best : null;
}

function firstKpis(artifact, n = 3) {
  const k = (artifact.sections || []).find((s) => s.type === 'kpis');
  return (k ? k.items : []).slice(0, n);
}

function artifactReply(artifact, project) {
  const kpis = firstKpis(artifact);
  const facts = kpis.map((k) => `• **${k.label}:** ${k.value}`).join('\n');
  const next = nextSteps(artifact.functionKey);
  return `**${artifact.title}**\n${artifact.summary}\n\n${facts}\n\nDraft **r${artifact.revision}** is in your artifact panel — exports: ${artifact.formats.map((f) => f.toUpperCase()).join(', ')}. ${next}\n\n_Guardrail: ${artifact.guardrails[0]}. Approve it when a named reviewer has checked the assumptions._`;
}

function nextSteps(key) {
  const map = {
    ideation: 'Next: run **Discovery** to pressure-test the market, or open the **Sandbox** to try the prototype.',
    discovery: 'Next: run **FDE Consultation** to turn evidence into a delivery plan.',
    'fde-consult': 'Next: run **Architecture** or **Capacity Planning**.',
    architecture: 'Next: run **AI DLC** for the delivery pipeline or **Modernization** for legacy scope.',
    modernization: 'Next: run **Testing** to generate equivalence tests for the first wave.',
    rea: 'Next: use the recovered rules in **Modernization** or **Discovery**.',
    dlc: 'Next: run **Testing** to generate the diff-aware suite.',
    testing: 'Next: open **Deployments** to promote through dev and test.',
    'fde-service': 'Next: convert this into a **Proposal** or check **Capacity**.',
    proposal: 'Next: review in **Proposals**, then get FDE and commercial approval.',
    capacity: 'Next: download the **Excel workbook** — the DPR and RLS sheets contain live formulas.',
    gcc: 'Next: export the **PowerPoint** for the steering committee.',
  };
  return map[key] || '';
}

function genericReply(message, project, artifacts) {
  const ctx = projectContext(project);
  const tier = TIERS[project.tier] || TIERS.smb;
  const t = message.toLowerCase();

  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(t)) {
    return `Welcome. You are in the **${tier.label}** sandbox for **${project.name}**. I have the brief: "${project.idea.slice(0, 180)}${project.idea.length > 180 ? '…' : ''}".

Tell me what you want to make real, or pick a workstream. I can generate a validated prototype, competitor analysis, architecture, a migration plan, release evidence, proposals and capacity models.

${HELP}`;
  }
  if (t.includes('pricing') || t.includes('cost') || t.includes('price')) {
    return `**${tier.label} pricing** — ${tier.price} ${tier.priceNote}. Build programmes start around ${tier.buildFrom}; a typical engagement for this sandbox is modelled at **$${Math.round(ctx.budget / 1000)}k** over **${ctx.weeks} weeks** with a **${ctx.team}-person** pod.

Included: ${tier.seats} builder seats, ${tier.sandboxes} sandboxes, ${tier.compliance}, ${tier.support}. AI usage: ${tier.aiCredits}.

I can turn this into a full commercial proposal with tranches, run costs and approval gates. Say **"build a proposal"**.`;
  }
  if (t.includes('security') || t.includes('compliance') || t.includes('gdpr') || t.includes('hipaa')) {
    return `**Security posture for ${tier.label}: ${tier.compliance}.**

Guardrails are structural, not advisory:
• Every external action requires a named human approval.
• Sensitive fields are redacted before model context; no raw PII in prompts.
• Artifacts carry evidence, confidence and assumptions.
• Production promotion is a human decision; rollback is rehearsed and time-bound.

Want the full threat model and NFR trade-offs? Run **Architecture Design & Review**.`;
  }
  if (t.includes('rea') || t.includes('reverse')) {
    return `**REA** is the reverse-engineering workstream. It triages shipped artifacts (native, APK, .NET, Electron, firmware, WASM), selects the right backend (Ghidra, IDA, JADX, Hopper), and turns static and dynamic evidence into behaviour specs, call graphs, API surfaces and a feature-parity checklist.

It does **not** claim source code and it requires legal/IP review before use. Run **Reverse Engineering with REA** when you need to replace, rebuild or integrate with a system you cannot read.`;
  }
  if (t.includes('what can you do') || t.includes('help') || t.includes('how does this work')) return HELP;
  if (t.includes('approve') || t.includes('approval')) {
    return `Approval is deliberately manual. Open any artifact and select **Approve** — that records your name against revision r1. Approvals are required before client commitments, production promotion, pricing decisions and legal/IP-sensitive use. Nothing is auto-sent.`;
  }

  const kws = keywords(message, 3);
  return `Captured: **${message.length > 160 ? message.slice(0, 160) + '…' : message}**

For a ${tier.label.toLowerCase()} build I would move in this order:
1. **Ideation to Prototype** — frame the wedge and the kill criteria.
2. **Discovery & Competitor Analysis** — validate the market and the whitespace.
3. **FDE Consultation** — turn it into a scoped delivery plan.
${kws.length ? `\nSignals I picked up: ${kws.join(', ')}. ` : ''}Then architecture, a deployment pipeline, a generated test suite and a commercial proposal.

Say **"generate all"** to create every workstream, or name the one you want.`;
}

function respond(project, message, artifacts = []) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return { reply: 'Tell me what you want to build, change or prove.' };

  if (/^(generate|run|do)\s+(all|everything|the lot|12)\b/i.test(trimmed) || /all 12/i.test(trimmed)) {
    return {
      reply: `Running all twelve workstreams for **${project.name}**. I will seed each agent with the brief, the ${TIERS[project.tier].label} profile and the selected open-source model, then hold every output as a draft for your approval.`,
      runAll: true,
      suggestions: ['Open Workstreams', 'Download delivery pack', 'Build a proposal'],
    };
  }

  const explicit = FUNCTIONS.find((f) => trimmed.toLowerCase().includes(f.name.toLowerCase()));
  const functionKey = explicit ? explicit.key : detectIntent(trimmed);
  const ideaUpdate = null;

  if (functionKey) {
    const fn = FUNCTIONS.find((f) => f.key === functionKey);
    const count = artifacts.filter((a) => a.functionKey === functionKey).length;
    return {
      reply: `Running **${fn.name}**${count ? ` (revision ${count + 1})` : ''} for the ${TIERS[project.tier].label.toLowerCase()} sandbox. I am grounding it in the brief, ${projectContext(project).features.length} inferred capabilities and ${projectContext(project).domain.label.toLowerCase()} patterns.`,
      functionKey,
      instruction: trimmed,
      suggestions: ['Approve artifact', 'Export PDF', 'Run next workstream'],
    };
  }

  return {
    reply: genericReply(trimmed, project, artifacts),
    suggestions: ['Validate this idea', 'Analyse competitors', 'Design architecture', 'Build a proposal', 'Generate all'],
  };
}

module.exports = { respond, detectIntent, artifactReply, HELP };
