'use strict';
/** Dependency-free PPTX (Open XML presentation) renderer. */

const { zip } = require('./zip');

const INK = '101820';
const EMBER = 'D3552D';
const MOSS = '1E5B4F';
const BONE = 'F5F1E8';
const MUTED = '5F6368';
const LINE = 'D9D2C3';
const WHITE = 'FFFFFF';
const EMU = 914400;
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;
const M = Math.round(0.72 * EMU);

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function paragraph(text, o = {}) {
  const size = o.size || 1600;
  const color = o.color || INK;
  const bold = o.bold ? ' b="1"' : '';
  const align = o.align || 'l';
  const bullet = o.bullet === false ? '' : `<a:pPr marL="285750" indent="-285750" algn="${align}"><a:buClr><a:srgbClr val="${o.bulletColor || EMBER}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>`;
  const plain = o.bullet === false ? `<a:pPr algn="${align}"/>` : bullet;
  return `<a:p>${plain}<a:r><a:rPr lang="en-US" sz="${size}"${bold} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Helvetica Neue"/></a:rPr><a:t>${esc(text)}</a:t></a:r>${o.spaceAfter ? `<a:endParaRPr lang="en-US" sz="${size}"/>` : ''}</a:p>`;
}

function textBox(id, x, y, w, h, paras, opts = {}) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${opts.anchor || 't'}" lIns="0" rIns="0" tIns="0" bIns="0"><a:normAutofit fontScale="${opts.fontScale || 100000}" lnSpcReduction="0"/></a:bodyPr><a:lstStyle/>${paras.join('')}</p:txBody></p:sp>`;
}

function rect(id, x, y, w, h, color, opacity) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rect ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}">${opacity ? `<a:alpha val="${opacity}"/>` : ''}</a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}

function lineShape(id, x, y, w, color = LINE) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="9525"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></p:spPr></p:sp>`;
}

function background(color) {
  return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
}

function slide(title, shapes, bg = BONE) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>${background(bg)}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
${shapes.join('\n')}
</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`;
}

function contentSlide(artifact, eyebrow, title, bodyShapes) {
  const shapes = [];
  shapes.push(rect(2, 0, 0, Math.round(0.16 * EMU), SLIDE_H, EMBER));
  shapes.push(textBox(3, M, Math.round(0.52 * EMU), SLIDE_W - 2 * M, 300000, [paragraph(eyebrow.toUpperCase(), { size: 900, bold: true, color: EMBER, bullet: false })]));
  const titleLines = wrap(title, 46);
  shapes.push(textBox(4, M, Math.round(0.84 * EMU), SLIDE_W - 2 * M, 780000, titleLines.map((l) => paragraph(l, { size: 2700, bold: true, color: INK, bullet: false }))));
  shapes.push(lineShape(5, M, Math.round(1.74 * EMU), SLIDE_W - 2 * M, LINE));
  shapes.push(...bodyShapes);
  shapes.push(textBox(99, M, SLIDE_H - 400000, SLIDE_W - 2 * M, 220000, [paragraph(`${artifact.project ? artifact.project.codename : 'Kiln'}  /  ${artifact.title}`, { size: 800, color: MUTED, bullet: false })]));
  return slide(title, shapes);
}

function wrap(text, maxChars) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]];
}

function titleSlide(a) {
  const shapes = [];
  shapes.push(rect(2, 0, 0, SLIDE_W, SLIDE_H, INK));
  shapes.push(rect(3, 0, 0, Math.round(0.22 * EMU), SLIDE_H, EMBER));
  shapes.push(rect(4, SLIDE_W - Math.round(3.1 * EMU), Math.round(0.98 * EMU), Math.round(2.4 * EMU), Math.round(0.04 * EMU), EMBER));
  shapes.push(textBox(5, M, Math.round(0.6 * EMU), Math.round(3 * EMU), 300000, [paragraph('KILN', { size: 1200, bold: true, color: BONE, bullet: false })]));
  shapes.push(textBox(6, SLIDE_W - M - Math.round(3.4 * EMU), Math.round(0.62 * EMU), Math.round(3.4 * EMU), 300000, [paragraph('AGENTIC DELIVERY ARTIFACT', { size: 820, bold: true, color: 'B8B2A5', align: 'r', bullet: false })]));
  const titleLines = wrap(a.title, 34).slice(0, 3);
  let y = Math.round(1.9 * EMU);
  shapes.push(textBox(7, M, y, SLIDE_W - 2 * M, Math.round(2.3 * EMU), titleLines.map((l) => paragraph(l, { size: 4400, bold: true, color: WHITE, bullet: false }))));
  y += titleLines.length * Math.round(0.72 * EMU) + 120000;
  const sub = wrap(a.subtitle || a.summary || '', 86).slice(0, 3);
  shapes.push(textBox(8, M, y, SLIDE_W - 2 * M - 500000, 900000, sub.map((l) => paragraph(l, { size: 1350, color: 'CFC8B8', bullet: false }))));
  const meta = `${a.project ? a.project.tierLabel : ''}  /  ${a.functionName || ''}  /  ${new Date(a.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  /  r${a.revision || 1}  /  ${String(a.status || 'draft').toUpperCase()}`;
  shapes.push(textBox(9, M, SLIDE_H - Math.round(0.95 * EMU), SLIDE_W - 2 * M, 260000, [paragraph(meta, { size: 900, color: 'A9A293', bullet: false })]));
  shapes.push(textBox(10, M, SLIDE_H - Math.round(0.68 * EMU), SLIDE_W - 2 * M, 260000, [paragraph(a.project ? `Sandbox ${a.project.codename}  |  ${a.project.modelName || ''}` : 'kiln.studio', { size: 850, color: '7D7769', bullet: false })]));
  return slide(a.title, shapes, INK);
}

function kpiSlides(a, section) {
  const items = (section.items || []).slice(0, 6);
  const shapes = [];
  const gap = 160000;
  const cardW = Math.round((SLIDE_W - 2 * M - gap * 2) / 3);
  const cardH = Math.round(1.28 * EMU);
  items.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (cardW + gap);
    const y = Math.round(2.15 * EMU) + row * (cardH + gap);
    shapes.push(rect(10 + i, x, y, cardW, cardH, WHITE));
    shapes.push(rect(20 + i, x, y, Math.round(0.05 * EMU), cardH, i % 2 ? MOSS : EMBER));
    shapes.push(textBox(30 + i, x + 140000, y + 130000, cardW - 260000, 240000, [paragraph(String(item.label || '').toUpperCase(), { size: 800, bold: true, color: MUTED, bullet: false })]));
    shapes.push(textBox(40 + i, x + 140000, y + Math.round(0.45 * EMU), cardW - 260000, 600000, [paragraph(String(item.value == null ? '' : item.value), { size: String(item.value).length > 18 ? 1400 : 2000, bold: true, color: INK, bullet: false })]));
  });
  return [contentSlide(a, section.title || 'Snapshot', section.title || 'At a glance', shapes)];
}

function tableSlides(a, section) {
  let columns = (section.columns || []).map((c) => String(c));
  const rows = (section.rows || []).map((r) => r.map((v) => String(v == null ? '' : v)));
  if (columns.length > 6) { columns = columns.slice(0, 6); }
  const normalized = rows.map((r) => columns.map((_, i) => (r[i] == null ? '' : String(r[i]))));
  const pages = chunks(normalized, 8);
  return pages.map((pageRows, pi) => {
    const shapes = [];
    const tableX = M;
    const tableY = Math.round(1.95 * EMU);
    const tableW = SLIDE_W - 2 * M;
    const firstW = Math.round(tableW * 0.24);
    const otherW = Math.round((tableW - firstW) / Math.max(1, columns.length - 1));
    const widths = columns.map((_, i) => (i === 0 ? firstW : otherW));
    const headerH = 360000;
    const rowH = Math.min(420000, Math.round(4.35 * EMU / Math.max(1, pageRows.length)));
    const rowsXml = [];
    rowsXml.push(`<a:tr h="${headerH}">${columns.map((c, i) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="850" b="1"><a:solidFill><a:srgbClr val="${WHITE}"/></a:solidFill><a:latin typeface="Helvetica Neue"/></a:rPr><a:t>${esc(String(c).toUpperCase())}</a:t></a:r></a:p></a:txBody><a:tcPr marL="70000" marR="50000" marT="40000" marB="40000" anchor="ctr"><a:solidFill><a:srgbClr val="${INK}"/></a:solidFill></a:tcPr></a:tc>`).join('')}</a:tr>`);
    pageRows.forEach((r, ri) => {
      rowsXml.push(`<a:tr h="${rowH}">${columns.map((c, i) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="780"${i === 0 ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${i === 0 ? INK : '33373D'}"/></a:solidFill><a:latin typeface="Helvetica Neue"/></a:rPr><a:t>${esc(truncate(String(r[i] || ''), 90))}</a:t></a:r></a:p></a:txBody><a:tcPr marL="60000" marR="40000" marT="30000" marB="30000" anchor="ctr"><a:solidFill><a:srgbClr val="${ri % 2 ? WHITE : 'FAF7F0'}"/></a:solidFill></a:tcPr></a:tc>`).join('')}</a:tr>`);
    });
    const cy = headerH + rowH * pageRows.length;
    const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="60" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${tableX}" y="${tableY}"/><a:ext cx="${tableW}" cy="${cy}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rowsXml.join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
    shapes.push(table);
    if (pi > 0) shapes.push(textBox(98, M, Math.round(0.52 * EMU), 3000000, 220000, [paragraph('CONTINUED', { size: 780, bold: true, color: EMBER, bullet: false })]));
    return contentSlide(a, section.title || 'Detail', (pi ? section.title + ' (cont.)' : section.title) + ' — detail', shapes);
  });
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function bulletSlides(a, section, numbered) {
  const items = (section.items || []).map((i) => (typeof i === 'string' ? i : i.label || ''));
  const pages = chunks(items, 7);
  return pages.map((pageItems, pi) => {
    const shapes = [];
    const startY = Math.round(2.0 * EMU);
    const colW = SLIDE_W - 2 * M;
    const rowH = Math.round(4.3 * EMU / Math.max(1, pageItems.length));
    pageItems.forEach((item, i) => {
      const y = startY + i * rowH;
      const num = numbered ? String(items.indexOf(item) + 1).padStart(2, '0') : '•';
      shapes.push(textBox(10 + i * 3, M, y + 40000, 420000, 320000, [paragraph(num, { size: 1100, bold: true, color: i % 2 ? MOSS : EMBER, bullet: false })]));
      const lines = wrap(item, 92);
      shapes.push(textBox(11 + i * 3, M + 430000, y, colW - 430000, rowH - 50000, lines.slice(0, 3).map((l) => paragraph(l, { size: lines.length > 2 ? 1050 : 1250, color: INK, bullet: false }))));
      if (i < pageItems.length - 1) shapes.push(lineShape(12 + i * 3, M + 430000, y + rowH - 60000, colW - 430000, LINE));
    });
    return contentSlide(a, section.title || 'Detail', pi ? (section.title || 'Detail') + ' (cont.)' : section.title, shapes);
  });
}

function proseSlides(a, section) {
  const lines = wrap(section.text || '', 88);
  const pages = chunks(lines, 10);
  return pages.map((ls, pi) => {
    const shapes = [];
    shapes.push(textBox(10, M, Math.round(2.05 * EMU), SLIDE_W - 2 * M - 300000, Math.round(4.2 * EMU), ls.map((l) => paragraph(l, { size: 1350, color: '33373D', bullet: false }))));
    return contentSlide(a, section.title || 'Context', section.title || 'Context', shapes);
  });
}

function timelineSlides(a, section) {
  const items = (section.items || []).slice(0, 6);
  const shapes = [];
  const startY = Math.round(2.05 * EMU);
  const rowH = Math.round(4.2 * EMU / Math.max(1, items.length));
  items.forEach((it, i) => {
    const y = startY + i * rowH;
    shapes.push(rect(10 + i * 3, M, y + 40000, Math.round(0.08 * EMU), Math.round(0.08 * EMU), EMBER));
    shapes.push(textBox(11 + i * 3, M + 170000, y, Math.round(4 * EMU), rowH - 40000, [paragraph(it.phase || '', { size: 1350, bold: true, color: INK, bullet: false }), paragraph(truncate(it.detail || (it.items || []).join(' · '), 160), { size: 950, color: MUTED, bullet: false })]));
    if (it.weeks) shapes.push(textBox(12 + i * 3, SLIDE_W - M - Math.round(1.4 * EMU), y, Math.round(1.4 * EMU), 260000, [paragraph(it.weeks, { size: 1000, bold: true, color: MOSS, align: 'r', bullet: false })]));
  });
  return [contentSlide(a, section.title || 'Plan', section.title || 'Roadmap', shapes)];
}

function calloutSlides(a, section) {
  const shapes = [];
  shapes.push(rect(10, M, Math.round(2.05 * EMU), SLIDE_W - 2 * M, Math.round(1.6 * EMU), section.tone === 'warn' ? 'FBEFE8' : 'EAF1EC'));
  shapes.push(rect(11, M, Math.round(2.05 * EMU), Math.round(0.06 * EMU), Math.round(1.6 * EMU), section.tone === 'warn' ? EMBER : MOSS));
  shapes.push(textBox(12, M + 220000, Math.round(2.25 * EMU), SLIDE_W - 2 * M - 440000, Math.round(1.2 * EMU), [paragraph(section.title || 'Note', { size: 1500, bold: true, color: INK, bullet: false }), ...wrap(section.text || '', 92).slice(0, 5).map((l) => paragraph(l, { size: 1050, color: '33373D', bullet: false }))]));
  return [contentSlide(a, 'Guardrail', section.title || 'Note', shapes)];
}

function sectionSlides(a, section) {
  if (!section || !section.type) return [];
  if (section.type === 'kpis') return kpiSlides(a, section);
  if (section.type === 'table') return tableSlides(a, section);
  if (section.type === 'bullets') return bulletSlides(a, section, false);
  if (section.type === 'numbered') return bulletSlides(a, section, true);
  if (section.type === 'timeline') return timelineSlides(a, section);
  if (section.type === 'checklist') return bulletSlides(a, { ...section, items: (section.items || []).map((i) => (typeof i === 'string' ? i : i.label)) }, false);
  if (section.type === 'bars') return [contentSlide(a, section.title, section.title, [textBox(10, M, Math.round(2.1 * EMU), SLIDE_W - 2 * M, Math.round(4 * EMU), (section.items || []).slice(0, 8).map((i) => paragraph(`${i.label}: ${i.valueText || i.value}`, { size: 1350, color: INK })))])];
  if (section.type === 'callout') return calloutSlides(a, section);
  if (section.type === 'prose') return proseSlides(a, section);
  if (section.type === 'keyvalue') return tableSlides(a, { ...section, columns: ['Field', 'Detail'], rows: (section.items || []).map((i) => [i.label, i.value]) });
  return [];
}

function render(artifact) {
  const a = artifact;
  const slides = [titleSlide(a)];
  if (a.summary) {
    slides.push(contentSlide(a, 'Executive summary', 'The shape of the opportunity', [
      textBox(10, M, Math.round(2.0 * EMU), SLIDE_W - 2 * M - 400000, Math.round(4.2 * EMU), wrap(a.summary, 78).slice(0, 9).map((l) => paragraph(l, { size: 1400, color: INK, bullet: false }))),
    ]));
  }
  (a.sections || []).forEach((s) => { sectionSlides(a, s).forEach((sl) => slides.push(sl)); });

  // Closing / guardrails
  const guard = [];
  guard.push(rect(3, 0, 0, SLIDE_W, SLIDE_H, INK));
  guard.push(rect(4, 0, 0, Math.round(0.2 * EMU), SLIDE_H, EMBER));
  guard.push(textBox(5, M, Math.round(0.9 * EMU), 6000000, 300000, [paragraph('HUMAN-IN-THE-LOOP', { size: 950, bold: true, color: EMBER, bullet: false })]));
  guard.push(textBox(6, M, Math.round(1.3 * EMU), SLIDE_W - 2 * M - 700000, 1300000, [paragraph('Nothing ships without a named human.', { size: 3200, bold: true, color: WHITE, bullet: false })]));
  guard.push(textBox(7, M, Math.round(3.1 * EMU), SLIDE_W - 2 * M - 900000, 1600000, [
    paragraph('This artifact is a draft produced by Kiln agents. Sign-off is required before any client commitment, production promotion, pricing decision, or legal/IP-sensitive use.', { size: 1300, color: 'CFC8B8', bullet: false }),
    paragraph(`Status: ${String(a.status || 'draft').toUpperCase()}    Revision: r${a.revision || 1}    Owner: ${a.project ? a.project.ownerName || 'Account FDE' : 'Account FDE'}`, { size: 950, color: '98917F', bullet: false }),
  ]));
  guard.push(textBox(8, M, SLIDE_H - Math.round(0.9 * EMU), SLIDE_W - 2 * M, 260000, [paragraph('kiln.studio  /  from a sentence to shipped software', { size: 900, color: '7D7769', bullet: false })]));
  slides.push(slide('Human in the loop', guard, INK));

  const files = [];
  files.push({ name: '[Content_Types].xml', data: contentTypes(slides.length) });
  files.push({ name: '_rels/.rels', data: rootRels() });
  files.push({ name: 'docProps/core.xml', data: core(a) });
  files.push({ name: 'docProps/app.xml', data: app() });
  files.push({ name: 'ppt/presentation.xml', data: presentation(slides.length) });
  files.push({ name: 'ppt/_rels/presentation.xml.rels', data: presentationRels(slides.length) });
  files.push({ name: 'ppt/theme/theme1.xml', data: theme() });
  files.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: slideMaster() });
  files.push({ name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: slideMasterRels() });
  files.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: slideLayout() });
  files.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: slideLayoutRels() });
  slides.forEach((xml, i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: xml });
    files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: slideRels() });
  });
  return zip(files);
}

function contentTypes(n) {
  const slideOverrides = Array.from({ length: n }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${slideOverrides}
</Types>`;
}

const rootRels = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const presentation = (n) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst>
<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/>
<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle>
</p:presentation>`;

const presentationRels = (n) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${Array.from({ length: n }, (_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;

const slideMaster = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${BONE}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200" b="1"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1600"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:otherStyle></p:txStyles>
</p:sldMaster>`;

const slideMasterRels = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const slideLayout = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const slideLayoutRels = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const slideRels = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

const theme = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Kiln">
<a:themeElements>
<a:clrScheme name="Kiln"><a:dk1><a:srgbClr val="${INK}"/></a:dk1><a:lt1><a:srgbClr val="${BONE}"/></a:lt1><a:dk2><a:srgbClr val="1E5B4F"/></a:dk2><a:lt2><a:srgbClr val="FFFFFF"/></a:lt2><a:accent1><a:srgbClr val="${EMBER}"/></a:accent1><a:accent2><a:srgbClr val="${MOSS}"/></a:accent2><a:accent3><a:srgbClr val="C9A227"/></a:accent3><a:accent4><a:srgbClr val="6B7B8C"/></a:accent4><a:accent5><a:srgbClr val="8C4A3C"/></a:accent5><a:accent6><a:srgbClr val="4F6457"/></a:accent6><a:hlink><a:srgbClr val="1F5F8B"/></a:hlink><a:folHlink><a:srgbClr val="6A4C93"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Kiln"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Helvetica Neue"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Kiln">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

const core = (a) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(a.title)}</dc:title><dc:creator>Kiln</dc:creator><cp:lastModifiedBy>Kiln</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`;

const app = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Kiln</Application><Company>Kiln</Company><AppVersion>1.0</AppVersion></Properties>`;

module.exports = { renderPPTX: render };
