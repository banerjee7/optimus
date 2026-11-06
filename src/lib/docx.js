'use strict';
/** Dependency-free DOCX (WordprocessingML) renderer. */

const { zip } = require('./zip');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const INK = '161B22';
const MUTED = '5F6368';
const EMBER = 'D3552D';
const MOSS = '1E5B4F';
const LINE = 'D9D2C3';

function run(text, opts = {}) {
  const { bold, italic, color, size, breakLine } = opts;
  return `<w:r>${breakLine ? '<w:br/>' : ''}<w:rPr>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}<w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(content, opts = {}) {
  const { style, align, before = 0, after = 80, indent, shade, border, keepNext } = opts;
  const pPr = `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keepNext ? '<w:keepNext/>' : ''}${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}${border ? `<w:pBdr><w:left w:val="single" w:sz="24" w:space="6" w:color="${border}"/></w:pBdr>` : ''}<w:spacing w:before="${before}" w:after="${after}"/>${indent ? `<w:ind w:left="${indent}"/>` : ''}${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>`;
  return `<w:p>${pPr}${Array.isArray(content) ? content.join('') : content}</w:p>`;
}

function heading(text, level = 1) {
  return para(run(text, { bold: true, size: level === 1 ? 30 : 25, color: INK }), {
    style: level === 1 ? 'Heading1' : 'Heading2', before: level === 1 ? 260 : 200, after: 100, keepNext: true,
    border: level === 1 ? EMBER : null,
  });
}

function cell(text, width, opts = {}) {
  const { header, bold, fill } = opts;
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="center"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar></w:tcPr>${para(run(String(text == null ? '' : text), { bold: bold || header, size: 16, color: header ? 'FFFFFF' : INK }), { after: 0 })}</w:tc>`;
}

function table(columns, rows) {
  const total = 9200;
  const first = Math.round(total * 0.26);
  const rest = Math.round((total - first) / Math.max(1, columns.length - 1));
  const widths = columns.map((_, i) => (i === 0 ? first : rest));
  const borders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="${LINE}"/><w:left w:val="none" w:sz="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="${LINE}"/><w:right w:val="none" w:sz="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="${LINE}"/><w:insideV w:val="none" w:sz="0" w:color="auto"/></w:tblBorders>`;
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${columns.map((c, i) => cell(String(c).toUpperCase(), widths[i], { header: true, fill: INK })).join('')}</w:tr>`;
  const body = rows.map((r, ri) => `<w:tr>${columns.map((c, i) => cell(r[i], widths[i], { fill: ri % 2 ? 'FFFFFF' : 'F8F5EE', bold: i === 0 })).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>${para('', { after: 60 })}`;
}

function kpiTable(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = [items[i], items[i + 1]].filter(Boolean);
    rows.push(pair.map((p) => `${String(p.label).toUpperCase()}\n${p.value}`));
  }
  const t = `<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="single" w:sz="4" w:color="${LINE}"/><w:insideV w:val="single" w:sz="4" w:color="${LINE}"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4600"/><w:gridCol w:w="4600"/></w:tblGrid>${rows.map((r) => `<w:tr>${r.map((v, i) => {
    const [label, value] = String(v).split('\n');
    return `<w:tc><w:tcPr><w:tcW w:w="4600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8F5EE"/><w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${para(run(label, { bold: true, size: 13, color: MUTED }), { after: 30 })}${para(run(value, { bold: true, size: 26, color: INK }), { after: 0 })}</w:tc>`;
  }).join('')}${r.length === 1 ? '<w:tc><w:tcPr><w:tcW w:w="4600" w:type="dxa"/></w:tcPr></w:tc>' : ''}</w:tr>`).join('')}</w:tbl>${para('', { after: 100 })}`;
  return t;
}

function bullets(items, numbered) {
  return items.map((item, i) => {
    const text = typeof item === 'string' ? item : item.label || '';
    return para([run(numbered ? `${i + 1}.  ` : '•  ', { bold: true, color: EMBER, size: 20 }), run(text, { size: 20, color: INK })], { indent: 260, after: 50 });
  }).join('');
}

function render(artifact) {
  const a = artifact;
  const project = a.project || {};
  const body = [];

  body.push(para(run('KILN  /  ' + String(a.functionName || 'DELIVERY ARTIFACT').toUpperCase(), { bold: true, size: 15, color: EMBER }), { after: 120 }));
  body.push(para(run(a.title || 'Artifact', { bold: true, size: 48, color: INK }), { after: 80 }));
  body.push(para(run(a.subtitle || '', { size: 22, color: MUTED, italic: true }), { after: 160 }));
  body.push(para(run(`Tier: ${project.tierLabel || '-'}   |   Sandbox: ${project.codename || '-'}   |   Model: ${project.modelName || '-'}   |   Revision r${a.revision || 1}   |   Status: ${String(a.status || 'draft').toUpperCase()}   |   ${new Date(a.createdAt || Date.now()).toLocaleDateString('en-GB')}`, { size: 15, color: MUTED }), { after: 240, shade: 'F8F5EE' }));

  if (a.summary) {
    body.push(para(run('EXECUTIVE SUMMARY', { bold: true, size: 16, color: EMBER }), { after: 60 }));
    body.push(para(run(a.summary, { size: 21, color: INK }), { after: 160, border: EMBER, indent: 160 }));
  }
  if (project.idea) body.push(para([run('Brief: ', { bold: true, size: 17, color: MUTED }), run(project.idea, { size: 17, color: MUTED, italic: true })], { after: 200 }));

  (a.sections || []).forEach((s) => {
    if (!s || !s.type) return;
    if (s.title) body.push(heading(s.title, 1));
    switch (s.type) {
      case 'kpis': body.push(kpiTable(s.items || [])); break;
      case 'prose': body.push(para(run(s.text, { size: 20, color: '33373D' }), { after: 140 })); break;
      case 'bullets': body.push(bullets(s.items || [], false)); break;
      case 'numbered': body.push(bullets(s.items || [], true)); break;
      case 'table': body.push(table(s.columns || [], s.rows || [])); break;
      case 'timeline':
        (s.items || []).forEach((it) => {
          body.push(para([run(it.phase, { bold: true, size: 21, color: INK }), run(it.weeks ? `   ${it.weeks}` : '', { bold: true, size: 17, color: MOSS })], { after: 40 }));
          if (it.detail) body.push(para(run(it.detail, { size: 18, color: MUTED }), { after: 40, indent: 200 }));
          if (it.items) body.push(bullets(it.items, false));
        });
        break;
      case 'bars':
        body.push(table(['Measure', 'Value'], (s.items || []).map((i) => [i.label, i.valueText || i.value])));
        break;
      case 'callout':
        body.push(para(run(s.title || 'Note', { bold: true, size: 18, color: s.tone === 'warn' ? EMBER : MOSS }), { after: 30, shade: 'F8F5EE', border: s.tone === 'warn' ? EMBER : MOSS }));
        body.push(para(run(s.text || '', { size: 18, color: '33373D' }), { after: 140, shade: 'F8F5EE' }));
        break;
      case 'checklist':
        body.push((s.items || []).map((i) => {
          const label = typeof i === 'string' ? i : i.label;
          const ok = typeof i === 'object' && i.state === 'approved';
          return para([run(ok ? '[x]  ' : '[  ]  ', { bold: true, size: 19, color: ok ? MOSS : MUTED }), run(label, { size: 19 })], { after: 50 });
        }).join(''));
        break;
      case 'keyvalue': body.push(table(['Field', 'Detail'], (s.items || []).map((i) => [i.label, i.value]))); break;
      default: break;
    }
  });

  if (a.status !== 'approved') {
    body.push(para(run('HUMAN-IN-THE-LOOP NOTICE', { bold: true, size: 16, color: EMBER }), { after: 40, before: 200 }));
    body.push(para(run('This artifact is a draft generated by Kiln. It requires named human sign-off before use in a client commitment, production promotion, or commercial decision.', { size: 17, color: '33373D' }), { after: 0, shade: 'FBF3EC', border: EMBER }));
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body.join('')}
<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica"/><w:sz w:val="20"/><w:color w:val="${INK}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style>
</w:styles>`;

  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${LINE}"/></w:pBdr></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${EMBER}"/><w:sz w:val="14"/></w:rPr><w:t>KILN</w:t></w:r><w:r><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="14"/></w:rPr><w:t xml:space="preserve">  /  ${esc(a.title || '')}</w:t></w:r></w:p></w:hdr>`;

  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${LINE}"/></w:pBdr></w:pPr><w:r><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="14"/></w:rPr><w:t xml:space="preserve">kiln.studio  /  ${esc(a.status === 'approved' ? 'Approved' : 'Draft - approval required')}  /  Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(a.title)}</dc:title><dc:creator>Kiln</dc:creator><cp:lastModifiedBy>Kiln</cp:lastModifiedBy><cp:revision>${a.revision || 1}</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Kiln</Application><Company>Kiln</Company><AppVersion>1.0</AppVersion></Properties>`;

  return zip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/header1.xml', data: header },
    { name: 'word/footer1.xml', data: footer },
    { name: 'docProps/core.xml', data: core },
    { name: 'docProps/app.xml', data: app },
  ]);
}

module.exports = { renderDOCX: render };
