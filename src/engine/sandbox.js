'use strict';
/** Generates a working per-project prototype, repository scaffold and deployment runs. */

const crypto = require('crypto');
const { projectContext, Rng, money, num, iso } = require('./core');

const SANDBOX_GUARDRAILS = [
  'Human approval required before any external action',
  'No PII in model context; redact and tokenise at the edge',
  'Every recommendation carries evidence and confidence',
  'Production promotion is always a named human decision',
];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FIRST = ['Maya', 'Rohan', 'Elena', 'Marcus', 'Priya', 'Jonas', 'Leila', 'Owen', 'Nadia', 'Diego', 'Hana', 'Felix'];
const LAST = ['Mehta', 'Okafor', 'Lindqvist', 'Patel', 'Rossi', 'Chen', 'Bauer', 'Nwosu', 'Reyes', 'Kaur'];

function sampleRows(ctx, rng, count = 7) {
  const entity = ctx.domain.entities[0];
  const second = ctx.domain.entities[1];
  return Array.from({ length: count }, (_, i) => ({
    id: `${entity.slice(0, 3).toUpperCase()}-${rng.int(1000, 9999)}`,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    item: ['Priority review', 'Standard intake', 'Exception hold', 'Renewal', 'Expansion', 'Escalation'][i % 6],
    detail: `${second} · ${rng.pick(['North', 'Central', 'West', 'East'])}`,
    value: money(rng.int(400, 24000)),
    status: rng.pick(['In review', 'Approved', 'Needs evidence', 'Queued', 'Approved']),
    confidence: rng.int(62, 97),
    owner: rng.pick(['A. Rao', 'S. Klein', 'M. Okafor', 'L. Chen']),
  }));
}

function prototypeHTML(project, ctx) {
  const rng = new Rng(`proto:${ctx.seed}`);
  const rows = sampleRows(ctx, rng, 9);
  const entity = ctx.domain.entities[0];
  const plural = entity.endsWith('y') ? entity.slice(0, -1) + 'ies' : entity + 's';
  const features = ctx.features.slice(0, 6);
  const metrics = ctx.domain.metrics.slice(0, 4);
  const kpiValues = [rng.int(18, 46), `${rng.int(72, 96)}%`, `${rng.int(2, 9)}.${rng.int(0, 9)}h`, money(rng.int(12000, 90000))];
  const trend = [42, 58, 51, 74, 66, 88, 81, 96, 88, 104, 112, 121];
  const maxTrend = Math.max(...trend);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(ctx.codename)} — generated prototype</title>
<style>
  :root{--ink:#101820;--paper:#f7f4ec;--card:#fffdf8;--line:#e3dccd;--muted:#6d6a61;--ember:#d3552d;--moss:#1e5b4f;--gold:#c9a227;--radius:14px}
  *{box-sizing:border-box} body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:var(--paper);color:var(--ink);font-size:14px;line-height:1.5}
  .shell{display:grid;grid-template-columns:214px 1fr;min-height:100vh}
  aside{background:var(--ink);color:#cfc8b8;padding:22px 18px;display:flex;flex-direction:column;gap:22px}
  .brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;letter-spacing:.01em}
  .brand .glyph{width:26px;height:26px;border:2px solid var(--ember);border-radius:50% 50% 50% 4px;display:grid;place-items:center;font-size:10px;color:var(--ember)}
  .brand small{display:block;font-size:9px;letter-spacing:.16em;color:#8f8879;font-weight:600}
  nav{display:flex;flex-direction:column;gap:3px}
  nav button{appearance:none;border:0;background:transparent;color:#b9b2a2;text-align:left;padding:8px 10px;border-radius:8px;font:inherit;font-size:12.5px;cursor:pointer;display:flex;gap:9px;align-items:center}
  nav button:hover{background:#1a232d;color:#fff} nav button.on{background:#1c2732;color:#fff;box-shadow:inset 2px 0 0 var(--ember)}
  .tier{margin-top:auto;font-size:10px;border-top:1px solid #26313c;padding-top:14px;color:#8f8879;line-height:1.7}
  .tier b{color:#f3ecdd;display:block;font-size:11px}
  main{padding:0 0 40px;min-width:0}
  header.top{background:var(--card);border-bottom:1px solid var(--line);padding:15px 26px;display:flex;align-items:center;justify-content:space-between;gap:16px;position:sticky;top:0;z-index:5}
  .crumb{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)} .crumb b{color:var(--ember)}
  h1{font-size:19px;margin:2px 0 0;letter-spacing:-.02em}
  .top-actions{display:flex;gap:8px;align-items:center}
  .badge{font-size:10px;padding:4px 8px;border:1px solid var(--line);border-radius:99px;color:var(--muted);background:#fff;white-space:nowrap}
  .badge.live{border-color:#c9dfd5;background:#eef6f1;color:var(--moss)} .badge.gen{border-color:#f0cdbd;background:#fdf1eb;color:var(--ember)}
  .btn{appearance:none;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:8px;padding:8px 13px;font:inherit;font-size:12px;cursor:pointer}
  .btn:hover{opacity:.9}.btn.ghost{background:#fff;color:var(--ink);border-color:var(--line)} .btn.ember{background:var(--ember);border-color:var(--ember)}
  .btn.sm{padding:5px 9px;font-size:11px;border-radius:6px}
  .content{padding:24px 26px;max-width:1180px}
  .banner{background:#fbf3ec;border:1px solid #f0d6c7;border-radius:var(--radius);padding:12px 16px;display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:20px}
  .banner p{margin:0;font-size:11.5px;color:#7a5a48}.banner b{color:var(--ember)}
  .grid{display:grid;gap:14px}.g4{grid-template-columns:repeat(4,1fr)}.g2{grid-template-columns:1.55fr 1fr}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px}
  .kpi .lab{font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
  .kpi .val{font-size:23px;font-weight:750;letter-spacing:-.03em;margin-top:6px}
  .kpi .sub{font-size:10px;color:var(--moss);margin-top:2px}
  .sec-head{display:flex;justify-content:space-between;align-items:center;margin:22px 0 10px;gap:10px}
  .sec-head h2{font-size:14px;margin:0;letter-spacing:-.01em} .sec-head span{font-size:11px;color:var(--muted)}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{text-align:left;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:7px 8px;border-bottom:1px solid var(--line);font-weight:600}
  td{padding:9px 8px;border-bottom:1px solid #f0ebdf;vertical-align:top}
  tr:hover td{background:#fcf9f2}
  .pill{display:inline-block;padding:2px 7px;border-radius:99px;font-size:9.5px;border:1px solid var(--line);background:#fff;white-space:nowrap}
  .pill.ok{background:#edf6f1;border-color:#cfe4d9;color:var(--moss)}.pill.warn{background:#fdf1eb;border-color:#f0d2c4;color:var(--ember)}.pill.mut{background:#f2efe7;color:#6d6a61}
  .search{display:flex;gap:8px;margin-bottom:12px}
  .search input{flex:1;border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 10px;font:inherit;font-size:12px;outline:none}
  .search input:focus{border-color:var(--ember);box-shadow:0 0 0 3px #d3552d1c}
  .agent{display:flex;flex-direction:column;gap:10px}
  .agent-msg{background:#f8f5ee;border:1px solid var(--line);border-left:3px solid var(--moss);border-radius:8px;padding:10px 11px;font-size:11.5px}
  .agent-msg b{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:3px}
  .bar{height:7px;background:#eee8da;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--ember)}
  .bars{display:flex;align-items:flex-end;gap:7px;height:64px;margin-top:10px}
  .bars i{flex:1;background:#dcd4c3;border-radius:3px 3px 0 0;min-height:4px}.bars i:last-child{background:var(--ember)}
  .list{display:flex;flex-direction:column;gap:9px;font-size:11.5px}
  .list div{display:flex;gap:8px;align-items:flex-start}.dot{width:6px;height:6px;border-radius:50%;background:var(--moss);margin-top:6px;flex:none}
  .hidden{display:none!important}
  .modal{position:fixed;inset:0;background:#101820aa;display:grid;place-items:center;padding:20px;z-index:30}
  .modal .card{width:min(440px,100%);padding:20px}.modal h3{margin:0 0 12px;font-size:15px}
  .field{margin-bottom:10px}.field label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px}
  .field input,.field select{width:100%;padding:8px 9px;border:1px solid var(--line);border-radius:7px;font:inherit;font-size:12px;background:#fff}
  footer{padding:18px 26px;color:var(--muted);font-size:10px;border-top:1px solid var(--line);margin-top:20px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
  @media(max-width:920px){.shell{grid-template-columns:1fr}aside{flex-direction:row;flex-wrap:wrap;align-items:center}nav{flex-direction:row;flex-wrap:wrap}.tier{margin:0;border:0;padding:0}.g4{grid-template-columns:1fr 1fr}.g2{grid-template-columns:1fr}}
  @media(max-width:560px){.g4{grid-template-columns:1fr}.content{padding:16px}header.top{position:static}}
</style>
</head>
<body>
<div class="shell">
  <aside>
    <div class="brand"><div class="glyph">K</div><div>${esc(ctx.codename)}<small>${esc(ctx.domain.label.toUpperCase())}</small></div></div>
    <nav>
      <button class="on" data-view="overview">◈ Overview</button>
      <button data-view="records">▤ ${esc(plural)}</button>
      <button data-view="agent">✦ Agent runs</button>
      <button data-view="impact">◔ Impact</button>
      <button data-view="settings">⚙ Settings</button>
    </nav>
    <div class="tier"><b>${esc(ctx.tier.label)} sandbox</b>${esc(ctx.project.name)}<br/>${esc(ctx.tier.uptime)} target · ${esc(ctx.tier.compliance.split(',')[0])}<br/><span style="color:#d3552d">Generated prototype</span></div>
  </aside>
  <main>
    <header class="top">
      <div><div class="crumb">Kiln sandbox / <b>${esc(ctx.tier.label)}</b></div><h1>${esc(ctx.codename)}</h1></div>
      <div class="top-actions"><span class="badge gen">Prototype · r1</span><span class="badge live">● live</span><button class="btn sm ghost" id="reset">Reset demo</button></div>
    </header>
    <div class="content">
      <div class="banner"><p><b>This is a generated, working prototype.</b> Data is synthetic and stored in your browser only. Approvals and deploys are simulated; production requires human sign-off.</p><button class="btn sm ember" data-view-jump="agent">Run agent</button></div>

      <section data-view="overview">
        <div class="grid g4">
          ${metrics.map((m, i) => `<div class="card kpi"><div class="lab">${esc(m)}</div><div class="val">${esc(kpiValues[i])}</div><div class="sub">▲ ${rng.int(2, 18)}% vs last 30d</div></div>`).join('')}
        </div>
        <div class="sec-head"><h2>Operating picture</h2><span>last 30 days · synthetic</span></div>
        <div class="grid g2">
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:12px">${esc(features[0].name)}</b><span class="pill ok">within threshold</span></div>
            <div class="bars">${trend.map((v) => `<i style="height:${Math.round((v / maxTrend) * 100)}%"></i>`).join('')}</div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:6px"><span>4 weeks ago</span><span>today</span></div>
            <div class="list" style="margin-top:16px">
              ${features.slice(0, 3).map((f) => `<div><span class="dot"></span><span><b>${esc(f.name)}</b> — ${esc(f.desc)}</span></div>`).join('')}
            </div>
          </div>
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:12px">Agent activity</b><span class="pill mut">${rng.int(12, 40)} runs</span></div>
            <div class="agent" style="margin-top:12px">
              <div class="agent-msg"><b>Recommendation · ${esc(features[1].name)}</b>${rng.int(3, 9)} ${esc(plural.toLowerCase())} need attention. Projected value ${money(rng.int(2400, 28000))}/mo. Confidence ${rng.int(76, 96)}%.</div>
              <div class="agent-msg" style="border-left-color:var(--ember)"><b>Awaiting human approval</b>${rng.int(1, 4)} external actions are queued. No commitment is sent automatically.</div>
              <button class="btn sm" data-view-jump="agent">Open agent console</button>
            </div>
          </div>
        </div>
        <div class="sec-head"><h2>Recent ${esc(plural.toLowerCase())}</h2><span>${rows.length} synthetic records</span></div>
        <div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Value</th><th>Status</th></tr></thead><tbody>
          ${rows.slice(0, 5).map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${esc(r.item)}</td><td>${esc(r.value)}</td><td><span class="pill ${r.status === 'Approved' ? 'ok' : r.status === 'Needs evidence' ? 'warn' : 'mut'}">${esc(r.status)}</span></td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <section data-view="records" class="hidden">
        <div class="sec-head"><h2>${esc(plural)}</h2><span id="recordCount">${rows.length} records</span></div>
        <div class="search"><input id="q" placeholder="Search by name, ID or status…"/><button class="btn sm ember" id="add">+ New ${esc(entity.toLowerCase())}</button></div>
        <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Detail</th><th>Value</th><th>Confidence</th><th>Status</th><th>Owner</th></tr></thead><tbody id="rows"></tbody></table></div>
      </section>

      <section data-view="agent" class="hidden">
        <div class="sec-head"><h2>Agent console</h2><span>simulated reasoning · human approval required</span></div>
        <div class="grid g2">
          <div class="card">
            <b style="font-size:12px">Ask the agent to improve a workflow</b>
            <div class="search" style="margin-top:10px"><input id="ask" value="Review ${esc(plural.toLowerCase())} and recommend the next best actions"/><button class="btn sm ember" id="runAgent">Run</button></div>
            <div id="agentOut" class="agent" style="margin-top:6px"><div class="agent-msg"><b>Ready</b>Describe a goal. The agent will retrieve approved context, propose actions and wait for your approval before anything external happens.</div></div>
          </div>
          <div class="card">
            <b style="font-size:12px">Guardrails in this prototype</b>
            <div class="list" style="margin-top:12px">
              <div><span class="dot"></span><span>No external message is sent without an explicit human approval.</span></div>
              <div><span class="dot"></span><span>Synthetic data only; no customer records are used.</span></div>
              <div><span class="dot"></span><span>Every recommendation shows evidence and confidence.</span></div>
              <div><span class="dot"></span><span>Production promotion is out of scope for this sandbox.</span></div>
            </div>
          </div>
        </div>
      </section>

      <section data-view="impact" class="hidden">
        <div class="sec-head"><h2>Value model</h2><span>prototype evidence · modelled</span></div>
        <div class="grid g4">
          <div class="card kpi"><div class="lab">Modelled annual value</div><div class="val">${money(ctx.budget * 2.4)}</div><div class="sub">3 value levers</div></div>
          <div class="card kpi"><div class="lab">Cost per action</div><div class="val">$${rng.float(0.12, 0.9).toFixed(2)}</div><div class="sub">model + infra</div></div>
          <div class="card kpi"><div class="lab">Cycle time</div><div class="val">−${rng.int(22, 58)}%</div><div class="sub">target vs baseline</div></div>
          <div class="card kpi"><div class="lab">Payback</div><div class="val">${rng.int(7, 18)} mo</div><div class="sub">modelled</div></div>
        </div>
        <div class="sec-head"><h2>Assumptions</h2><span>edit in Settings</span></div>
        <div class="card" style="padding:0"><table><thead><tr><th>Lever</th><th>Basis</th><th>Confidence</th><th>Owner</th></tr></thead><tbody>
          ${['Throughput recovered', 'Rework avoided', 'Faster decisions', 'New revenue'].map((l, i) => `<tr><td>${l}</td><td>${['hours/week × staff', 'error rate × cost per error', 'cycle time × volume', 'attach rate × ARPU'][i]}</td><td><span class="pill ${i < 2 ? 'ok' : 'mut'}">${i < 2 ? 'Medium' : 'Low'}</span></td><td>${esc(ctx.owner)}</td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <section data-view="settings" class="hidden">
        <div class="sec-head"><h2>Project settings</h2><span>sandbox only</span></div>
        <div class="grid g2">
          <div class="card">
            <div class="field"><label>Project</label><input value="${esc(ctx.project.name)}" readonly/></div>
            <div class="field"><label>Brief</label><input value="${esc(ctx.project.idea)}" readonly/></div>
            <div class="field"><label>Tier</label><input value="${esc(ctx.tier.label)}" readonly/></div>
            <div class="field"><label>Model</label><input value="${esc(ctx.project.modelName || '')}" readonly/></div>
          </div>
          <div class="card">
            <b style="font-size:12px">Environment</b>
            <div class="list" style="margin-top:10px">
              <div><span class="dot" style="background:var(--moss)"></span><span><b>dev</b> — generated prototype, synthetic data</span></div>
              <div><span class="dot" style="background:var(--gold)"></span><span><b>test</b> — suite generated per deployment</span></div>
              <div><span class="dot" style="background:var(--ember)"></span><span><b>prod</b> — requires human promotion</span></div>
            </div>
            <p style="font-size:11px;color:var(--muted);margin-top:16px">Generated by Kiln for ${esc(ctx.project.ownerName || 'the account FDE')}. Reset clears local changes only.</p>
          </div>
        </div>
      </section>
    </div>
    <footer><span>${esc(ctx.codename)} · ${esc(ctx.tier.label)} sandbox · synthetic data</span><span>Built with Kiln · human-in-the-loop</span></footer>
  </main>
</div>
<div class="modal hidden" id="modal"><div class="card"><h3>New ${esc(entity.toLowerCase())}</h3>
  <div class="field"><label>Name</label><input id="f-name" value="New ${esc(entity.toLowerCase())}"/></div>
  <div class="field"><label>Type</label><select id="f-type">${['Priority review', 'Standard intake', 'Exception hold', 'Renewal'].map((t) => `<option>${t}</option>`).join('')}</select></div>
  <div class="field"><label>Value</label><input id="f-value" value="$1,200"/></div>
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" id="cancel">Cancel</button><button class="btn ember" id="save">Create</button></div>
</div></div>
<script>
(function(){
  const KEY = 'kiln:${esc(project.id)}';
  const seedRows = ${JSON.stringify(rows)};
  const state = JSON.parse(localStorage.getItem(KEY) || 'null') || { rows: seedRows };
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusClass = (s) => s === 'Approved' ? 'ok' : s === 'Needs evidence' ? 'warn' : 'mut';
  function renderRows(){
    const q = (document.getElementById('q').value || '').toLowerCase();
    const list = state.rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    document.getElementById('rows').innerHTML = list.map(r => '<tr><td>'+esc(r.id)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.item)+'</td><td>'+esc(r.detail)+'</td><td>'+esc(r.value)+'</td><td><div class="bar" style="width:64px;display:inline-block;vertical-align:middle"><i style="width:'+r.confidence+'%"></i></div> '+r.confidence+'%</td><td><span class="pill '+statusClass(r.status)+'">'+esc(r.status)+'</span></td><td>'+esc(r.owner)+'</td></tr>').join('') || '<tr><td colspan="8" style="padding:24px;text-align:center;color:#6d6a61">No matching records.</td></tr>';
    document.getElementById('recordCount').textContent = list.length + ' records';
  }
  function show(view){
    document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('hidden', el.dataset.view !== view));
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    if (view === 'records') renderRows();
  }
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
  document.querySelectorAll('[data-view-jump]').forEach(b => b.addEventListener('click', () => show(b.dataset.viewJump)));
  document.getElementById('q').addEventListener('input', renderRows);
  document.getElementById('add').addEventListener('click', () => document.getElementById('modal').classList.remove('hidden'));
  document.getElementById('cancel').addEventListener('click', () => document.getElementById('modal').classList.add('hidden'));
  document.getElementById('save').addEventListener('click', () => {
    const name = document.getElementById('f-name').value || 'New record';
    state.rows.unshift({ id: '${entity.slice(0,3).toUpperCase()}-' + Math.floor(1000 + Math.random()*9000), name, item: document.getElementById('f-type').value, detail: 'Created in prototype', value: document.getElementById('f-value').value, status: 'Queued', confidence: 88, owner: 'You' });
    save(); renderRows(); document.getElementById('modal').classList.add('hidden');
  });
  document.getElementById('reset').addEventListener('click', () => { localStorage.removeItem(KEY); location.reload(); });
  document.getElementById('runAgent').addEventListener('click', () => {
    const out = document.getElementById('agentOut');
    out.innerHTML = '<div class="agent-msg"><b>Retrieving context</b>Reading approved knowledge and '+state.rows.length+' synthetic records…</div>';
    setTimeout(() => { out.innerHTML = '<div class="agent-msg"><b>Proposal · confidence ${rng.int(80, 96)}%</b>Prioritise '+Math.min(3, state.rows.length)+' records with low confidence and high value. Expected cycle-time reduction ${rng.int(18, 42)}%. Evidence: status mix, value distribution, owner load.</div><div class="agent-msg" style="border-left-color:var(--ember)"><b>Approval required</b>Three actions are drafted and waiting for you. Nothing has been sent.<div style="display:flex;gap:8px;margin-top:8px"><button class="btn sm ember" onclick="this.closest(\\'.agent-msg\\').innerHTML=\\'<b>Approved</b>Draft actions released to the queue. Audit entry written.\\'">Approve</button><button class="btn sm ghost" onclick="this.closest(\\'.agent-msg\\').innerHTML=\\'<b>Rejected</b>No action taken. Reason captured for evaluation.\\'">Reject</button></div></div>'; }, 700);
  });
  show('overview'); renderRows();
})();
</script>
</body>
</html>`;
}

function openapiYAML(ctx) {
  const paths = ctx.features.slice(0, 5).map((f) => {
    const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `  /${slug}:
    post:
      summary: ${f.name}
      operationId: ${slug.replace(/-/g, '')}
      tags: [agents]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AgentRequest'
      responses:
        '202':
          description: Accepted. Human approval required before external action.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AgentRun'
        '403': { description: Insufficient scope }
        '429': { description: Rate limited }`;
  }).join('\n');

  return `openapi: 3.1.0
info:
  title: ${ctx.codename} API
  description: Generated by Kiln for ${ctx.project.name}. Human-in-the-loop on all external actions.
  version: 0.1.0
servers:
  - url: https://api.${ctx.codename.toLowerCase().replace(/\s+/g, '-')}.example.com/v1
    description: ${ctx.tier.label} sandbox
security:
  - bearerAuth: []
paths:
${paths}
  /approvals/{runId}:
    post:
      summary: Approve or reject a proposed action
      operationId: decideApproval
      parameters:
        - name: runId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [decision, reason]
              properties:
                decision: { type: string, enum: [approve, reject] }
                reason: { type: string }
      responses:
        '200': { description: Decision recorded in the evidence log }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    AgentRequest:
      type: object
      required: [intent]
      properties:
        intent: { type: string }
        contextRefs: { type: array, items: { type: string } }
        dryRun: { type: boolean, default: true }
    AgentRun:
      type: object
      properties:
        runId: { type: string }
        status: { type: string, enum: [draft, awaiting_approval, approved, rejected, executed] }
        confidence: { type: number, minimum: 0, maximum: 1 }
        evidence: { type: array, items: { type: string } }
`;
}

function scaffoldFiles(ctx) {
  const slug = ctx.codename.toLowerCase().replace(/\s+/g, '-');
  const entity = ctx.domain.entities[0];
  return [
    { path: 'README.md', lang: 'md', content: `# ${ctx.codename}\n\nGenerated by Kiln for **${ctx.project.name}** (${ctx.tier.label}).\n\n> ${ctx.project.idea}\n\n## What is here\n- \`frontend/\` – interactive prototype (the live sandbox preview)\n- \`services/api/\` – OpenAPI contract + service skeleton\n- \`services/agents/\` – agent orchestration with approval gates\n- \`infra/\` – Terraform baseline\n- \`tests/\` – risk-based E2E scaffold\n- \`docs/adr-001.md\` – first architecture decision\n\n## Run locally\n\`\`\`bash\nnode services/api/server.js\nopen frontend/index.html\n\`\`\`\n\n## Guardrails\n${SANDBOX_GUARDRAILS.map((g) => `- ${g}`).join('\n')}\n\nGenerated ${new Date().toISOString().slice(0, 10)} · revision 1 · ${ctx.project.modelName || 'model'}\n` },
    { path: 'frontend/index.html', lang: 'html', content: prototypeHTML(ctx.project, ctx) },
    { path: 'services/api/openapi.yaml', lang: 'yaml', content: openapiYAML(ctx) },
    { path: 'services/api/server.js', lang: 'js', content: `'use strict';\n// ${ctx.codename} API skeleton — dependency-free, generated by Kiln.\nconst http = require('http');\nconst crypto = require('crypto');\n\nconst runs = new Map();\nconst PORT = process.env.PORT || 8080;\n\nfunction json(res, code, body) {\n  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });\n  res.end(JSON.stringify(body));\n}\n\nfunction readBody(req) {\n  return new Promise((resolve, reject) => {\n    let data = '';\n    req.on('data', (c) => { data += c; if (data.length > 1e6) reject(new Error('too large')); });\n    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });\n  });\n}\n\nhttp.createServer(async (req, res) => {\n  const url = new URL(req.url, 'http://localhost');\n  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, version: '0.1.0' });\n  if (req.method === 'POST' && url.pathname.startsWith('/v1/')) {\n    try {\n      const body = await readBody(req);\n      if (!body.intent) return json(res, 400, { error: 'intent is required' });\n      const runId = crypto.randomUUID();\n      const run = { runId, intent: body.intent, status: 'awaiting_approval', confidence: 0.87, evidence: ['synthetic://sample'], createdAt: new Date().toISOString() };\n      runs.set(runId, run);\n      return json(res, 202, run);\n    } catch (e) { return json(res, 400, { error: e.message }); }\n  }\n  if (req.method === 'POST' && url.pathname.startsWith('/v1/approvals/')) {\n    const runId = url.pathname.split('/').pop();\n    const run = runs.get(runId);\n    if (!run) return json(res, 404, { error: 'run not found' });\n    const body = await readBody(req);\n    if (!['approve', 'reject'].includes(body.decision)) return json(res, 400, { error: 'decision must be approve or reject' });\n    run.status = body.decision === 'approve' ? 'approved' : 'rejected';\n    run.decidedAt = new Date().toISOString();\n    return json(res, 200, { ...run, decision: body.decision });\n  }\n  json(res, 404, { error: 'not found' });\n}).listen(PORT, () => console.log('${ctx.codename} API on :' + PORT));\n` },
    { path: 'services/agents/orchestrator.js', lang: 'js', content: `'use strict';\n// Agent orchestration for ${ctx.codename}. Draft -> evidence -> human approval -> execute.\n\nconst APPROVAL_REQUIRED = new Set([\n${ctx.domain.useCases.map((u) => `  '${u[0].replace(/'/g, "\\'")}'`).join(',\n')}\n]);\n\nasync function runAgent({ intent, contextRefs = [], model = '${ctx.project.model || 'llama-3.3-70b'}' }) {\n  if (!intent) throw new Error('intent required');\n  const evidence = await retrieve(contextRefs);\n  const proposal = await reason({ intent, evidence, model });\n  return {\n    status: APPROVAL_REQUIRED.has(intent) ? 'awaiting_approval' : 'draft',\n    proposal,\n    evidence: evidence.map((e) => e.id),\n    guardrails: ${JSON.stringify(SANDBOX_GUARDRAILS)},\n  };\n}\n\nasync function retrieve(refs) {\n  // TODO: connect the approved corpus. Never pass raw PII to the model.\n  return refs.map((id) => ({ id, text: 'synthetic evidence for ' + id }));\n}\n\nasync function reason({ intent, evidence, model }) {\n  // TODO: call the private model gateway. Return structured, cited output only.\n  return { intent, recommendation: 'Review and propose next best action', citations: evidence.map((e) => e.id), confidence: 0.0, model };\n}\n\nmodule.exports = { runAgent, APPROVAL_REQUIRED };\n` },
    { path: 'infra/terraform/main.tf', lang: 'tf', content: `# ${ctx.codename} — generated baseline (${ctx.tier.label})\nterraform {\n  required_version = ">= 1.6"\n  required_providers {\n    aws = { source = "hashicorp/aws", version = "~> 5.0" }\n  }\n}\n\nvariable "environment" { default = "dev" }\nvariable "region" { default = "eu-west-1" }\n\nmodule "network" {\n  source   = "./modules/network"\n  region   = var.region\n  az_count = ${ctx.tier.key === 'enterprise' ? 3 : 2}\n}\n\nmodule "runtime" {\n  source          = "./modules/runtime"\n  environment     = var.environment\n  cpu             = ${ctx.tier.key === 'small' ? 512 : 1024}\n  desired_count   = ${ctx.tier.key === 'enterprise' ? 3 : 2}\n  private_subnets = module.network.private_subnets\n}\n\nresource "aws_s3_bucket" "evidence" {\n  bucket = "${slug}-evidence-${ctx.tier.key}"\n  # Object lock + versioning enabled in the module; required for audit evidence.\n}\n\n# Policy gates: no public buckets, encryption required, two-person apply for prod.\n` },
    { path: 'tests/e2e/critical-path.spec.ts', lang: 'ts', content: `// Generated by Kiln: risk-based critical path for ${ctx.codename}\nimport { test, expect } from '@playwright/test';\n\nconst BASE = process.env.BASE_URL || 'http://localhost:8080';\n\ntest.describe('${entity} critical path', () => {\n  test('creates a ${entity.toLowerCase()} and requires approval for external action', async ({ page }) => {\n    await page.goto(BASE);\n    await page.getByRole('button', { name: /new ${entity.toLowerCase()}/i }).click();\n    await page.getByLabel('Name').fill('Synthetic ${entity}');\n    await page.getByRole('button', { name: /create/i }).click();\n    await expect(page.getByText('Synthetic ${entity}')).toBeVisible();\n\n    await page.getByRole('button', { name: /run agent/i }).click();\n    await expect(page.getByText(/approval required/i)).toBeVisible();\n    // Guardrail: no external action before explicit approval.\n  });\n\n  test('rejects unauthenticated API access', async ({ request }) => {\n    const res = await request.post(BASE + '/v1/${ctx.features[0].name.toLowerCase().replace(/[^a-z]+/g, '-')}', { data: { intent: 'test' } });\n    expect([401, 403]).toContain(res.status());\n  });\n});\n` },
    { path: '.github/workflows/ci.yml', lang: 'yaml', content: `name: ci\non: [push, pull_request]\npermissions: { contents: read }\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 22, cache: npm }\n      - run: npm ci || npm install\n      - run: npm run lint --if-present\n      - run: npm test --if-present\n      - name: Security scan\n        run: npx --yes audit-ci --high || true\n      - name: Generate SBOM\n        run: npx --yes @cyclonedx/cyclonedx-npm --output-file sbom.json || true\n      - uses: actions/upload-artifact@v4\n        with: { name: sbom, path: sbom.json }\n  policy:\n    needs: verify\n    runs-on: ubuntu-latest\n    steps:\n      - name: Human approval required for production\n        run: echo "Production promotion is gated by a named human approver."\n` },
    { path: 'docs/adr-001.md', lang: 'md', content: `# ADR-001 — System shape\n\n- **Status:** Proposed\n- **Date:** ${iso(new Date())}\n- **Owners:** ${ctx.owner}\n\n## Context\n${ctx.codename} must ship a ${ctx.tier.label.toLowerCase()} product slice in ${ctx.weeks} weeks without creating a distributed system the team cannot operate.\n\n## Decision\n${ctx.tier.key === 'small' ? 'Start with a modular monolith and extract a single agent service when scaling or isolation demands it.' : 'Use domain-aligned services behind a governed agent gateway, with one writer per bounded context.'}\n\n## Consequences\n- Faster initial delivery; fewer operational surfaces.\n- Clear seam for the first extraction if load or compliance requires it.\n- Review at week ${Math.round(ctx.weeks * 0.55)} with actual traffic and failure data.\n\n## Guardrails\n${SANDBOX_GUARDRAILS.map((g) => `- ${g}`).join('\n')}\n` },
  ];
}

function deployment(project, env, index, opts = {}) {
  const ctx = projectContext(project);
  const rng = new Rng(`${ctx.seed}:deploy:${env}:${index}`);
  const tests = Array.from({ length: rng.int(6, 11) }, (_, i) => {
    const f = ctx.features[i % ctx.features.length];
    const type = ['E2E', 'API', 'Security', 'Performance', 'Contract'][i % 5];
    const pass = !(i === 2 && rng.chance(0.22));
    return {
      id: `TC-${rng.int(1000, 9999)}`,
      feature: f.name,
      type,
      status: pass ? 'pass' : 'fail',
      duration: `${rng.int(1, 38)}s`,
      generated: 'diff-aware',
    };
  });
  const failed = tests.filter((t) => t.status === 'fail').length;
  const stages = [
    { name: 'Checkout & build', status: 'pass', duration: `${rng.int(38, 96)}s`, detail: 'Signed artifact produced; SBOM attached.' },
    { name: 'Diff analysis', status: 'pass', duration: `${rng.int(4, 12)}s`, detail: `${tests.length} tests selected from the changed surface.` },
    { name: 'Generated test suite', status: failed ? 'warn' : 'pass', duration: `${rng.int(42, 140)}s`, detail: `${tests.length - failed}/${tests.length} passed.` },
    { name: 'Security & policy', status: 'pass', duration: `${rng.int(9, 28)}s`, detail: 'No critical findings; policy gates evaluated.' },
    { name: env === 'prod' ? 'Production approval' : 'Environment deploy', status: env === 'prod' ? 'blocked' : 'pass', duration: env === 'prod' ? '—' : `${rng.int(8, 30)}s`, detail: env === 'prod' ? 'Waiting for named human approval.' : `Deployed to ${env}; health checks green.` },
  ];
  return {
    id: `dep_${crypto.randomUUID().slice(0, 8)}`,
    env,
    version: `v${index + 1}.${rng.int(0, 9)}.${rng.int(0, 9)}`,
    commit: crypto.randomBytes(3).toString('hex'),
    status: env === 'prod' ? 'awaiting_approval' : failed ? 'deployed_with_warnings' : 'deployed',
    createdAt: new Date().toISOString(),
    approvedBy: null,
    stages,
    tests,
    testsTotal: tests.length,
    testsPassed: tests.length - failed,
    newTests: rng.int(8, 44),
    coverage: rng.int(70, 94),
    readiness: rng.int(76, 96),
    sbom: rng.int(28, 96),
    rollback: `${rng.int(3, 18)} min`,
    duration: `${rng.int(3, 12)} min`,
    notes: failed ? `${failed} generated test(s) failed. Promotion blocked until resolved or waived by a named owner.` : 'All generated tests passed. Production still requires human approval.',
  };
}

function buildSandbox(project) {
  const ctx = projectContext(project);
  return {
    previewUrl: `/sandbox/${project.id}`,
    codename: ctx.codename,
    files: scaffoldFiles(ctx),
    entities: ctx.domain.entities,
    features: ctx.features,
    metrics: ctx.domain.metrics,
  };
}

module.exports = { prototypeHTML, buildSandbox, deployment, scaffoldFiles };
