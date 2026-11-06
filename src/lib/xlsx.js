'use strict';
/** Dependency-free XLSX (SpreadsheetML) renderer with styled sheets and live formulas. */

const { zip } = require('./zip');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function safeSheetName(name, used) {
  let base = String(name || 'Sheet').replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) { candidate = `${base.slice(0, 26)} ${i++}`; }
  used.add(candidate.toLowerCase());
  return candidate;
}

function dimensions(rows) {
  const maxCols = Math.max(1, ...rows.map((r) => r.length));
  return `A1:${colLetter(maxCols - 1)}${Math.max(1, rows.length)}`;
}

function cellXml(ref, cell, style, formula) {
  if (formula) {
    const cached = typeof cell === 'number' && isFinite(cell) ? cell : 0;
    return `<c r="${ref}" s="${style}"><f>${esc(formula)}</f><v>${cached}</v></c>`;
  }
  if (cell == null || cell === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof cell === 'number' && isFinite(cell)) return `<c r="${ref}" s="${style}"><v>${cell}</v></c>`;
  if (typeof cell === 'boolean') return `<c r="${ref}" s="${style}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  let text = String(cell);
  const pct = /^-?\d+(\.\d+)?%$/.test(text);
  if (pct) return `<c r="${ref}" s="${style === 7 ? 7 : style}" t="n"><v>${(parseFloat(text) / 100).toFixed(6)}</v></c>`;
  if (/^-?\d+(\.\d+)?$/.test(text) && text.length < 14 && !/^0\d/.test(text)) {
    return `<c r="${ref}" s="${style}" t="n"><v>${text}</v></c>`;
  }
  text = text.length > 900 ? text.slice(0, 897) + '...' : text;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

function sheetXml(sheet) {
  const { rows, widths, merges = [], freezeRow = 0, filterRef, formulas = {}, rowStyles = {} } = sheet;
  const rowXml = rows.map((row, ri) => {
    const height = ri === 0 ? 30 : rowStyles[ri] === 'header' ? 24 : 18;
    const cells = row.map((cell, ci) => {
      const ref = colLetter(ci) + (ri + 1);
      const fKey = `${ri}:${ci}`;
      const f = formulas[fKey];
      let style = 4;
      if (ri === 0) style = 1;
      else if (ri === 1) style = 2;
      else if (rowStyles[ri] === 'header') style = 3;
      else if (rowStyles[ri] === 'label') style = 6;
      else if (rowStyles[ri] === 'accent') style = 9;
      else if (ri % 2 === 0) style = 5;
      if (f) {
        style = f.style != null ? f.style : style;
        return cellXml(ref, cell, style, f.formula);
      }
      if (rowStyles[ri] === 'subtotal') style = 6;
      if (typeof cell === 'string' && /^-?\d+(\.\d+)?%$/.test(cell)) style = 7;
      if (typeof cell === 'string' && /^-?[\d,]+(\.\d+)?$/.test(cell) && cell.startsWith('-')) style = 8;
      return cellXml(ref, cell, style);
    }).join('');
    return `<row r="${ri + 1}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join('');
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const pane = freezeRow ? `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freezeRow + 1}" sqref="A${freezeRow + 1}"/>` : '';
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const filter = filterRef ? `<autoFilter ref="${filterRef}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${dimensions(rows)}"/>
<sheetViews><sheetView tabSelected="0" workbookViewId="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${cols}</cols>
<sheetData>${rowXml}</sheetData>
${filter}${mergeXml}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function summarySheet(a) {
  const p = a.project || {};
  const rows = [
    [a.title],
    [`${a.functionName || 'Artifact'}  ·  ${p.tierLabel || ''}  ·  ${p.codename || ''}  ·  ${new Date(a.createdAt || Date.now()).toLocaleDateString('en-GB')}  ·  r${a.revision || 1}  ·  ${String(a.status || 'draft').toUpperCase()}`],
    [],
    ['FIELD', 'DETAIL'],
    ['Artifact', a.title],
    ['Workstream', a.functionName],
    ['Client tier', p.tierLabel],
    ['Sandbox', p.codename],
    ['Model', p.modelName],
    ['Status', a.status === 'approved' ? 'Approved' : 'Draft — human approval required'],
    ['Revision', 'r' + (a.revision || 1)],
    ['Brief', p.idea || ''],
  ];
  const kpis = (a.sections || []).find((s) => s.type === 'kpis');
  if (kpis) {
    rows.push([], ['SNAPSHOT', 'VALUE']);
    (kpis.items || []).forEach((k) => rows.push([String(k.label), String(k.value)]));
  }
  rows.push([], ['HUMAN-IN-THE-LOOP', 'This workbook is a draft. Named sign-off is required before commercial or production use.']);
  const sheet = {
    name: 'Summary', rows, widths: [28, 68],
    merges: ['A1:B1', 'A2:B2'],
    rowStyles: { 3: 'header' },
    freezeRow: 4,
  };
  // style every KPI header row we added
  rows.forEach((r, i) => {
    if (r[0] === 'SNAPSHOT') sheet.rowStyles[i] = 'header';
    if (r[3] === 'FIELD' || r[0] === 'HUMAN-IN-THE-LOOP') sheet.rowStyles[i] = 'header';
  });
  return sheet;
}

function tableSheet(name, section, artifact) {
  const columns = (section.columns || []).map((c) => String(c));
  const data = (section.rows || []).map((r) => r.map((v) => v == null ? '' : v));
  const rows = [
    [section.title || name],
    [`${artifact.functionName}  ·  ${artifact.project ? artifact.project.codename : ''}  ·  source: Kiln`],
    [],
    columns.map((c) => c.toUpperCase()),
    ...data,
  ];
  const widths = columns.map((c, ci) => {
    const lens = [String(c).length * 1.2, ...data.slice(0, 40).map((r) => String(r[ci] == null ? '' : r[ci]).length)];
    return Math.min(58, Math.max(13, Math.round(Math.max(...lens) * 1.05)));
  });
  const formulas = {};
  const low = columns.map((c) => c.toLowerCase());
  if (artifact.functionKey === 'capacity') {
    const gapCol = low.findIndex((h) => h === 'gap' || h === 'gap (fte)');
    const utilCol = low.findIndex((h) => h.includes('utilization'));
    const demandCol = low.findIndex((h) => h === 'demand fte' || h === 'demand' || h === 'demand (fte)');
    const capCol = low.findIndex((h) => h === 'capacity fte' || h === 'capacity' || h === 'capacity (fte)');
    const billCol = low.findIndex((h) => h.includes('billable'));
    const capHrsCol = low.findIndex((h) => h.includes('capacity hrs') || h.includes('available hrs'));
    data.forEach((_, di) => {
      const r = di + 5;
      if (gapCol >= 0 && demandCol >= 0 && capCol >= 0) formulas[`${r - 1}:${gapCol}`] = { formula: `${colLetter(demandCol)}${r}-${colLetter(capCol)}${r}`, style: 8 };
      if (utilCol >= 0 && demandCol >= 0 && capCol >= 0) formulas[`${r - 1}:${utilCol}`] = { formula: `IF(${colLetter(capCol)}${r}=0,0,${colLetter(demandCol)}${r}/${colLetter(capCol)}${r})`, style: 7 };
      if (utilCol >= 0 && billCol >= 0 && capHrsCol >= 0) formulas[`${r - 1}:${utilCol}`] = { formula: `IF(${colLetter(capHrsCol)}${r}=0,0,${colLetter(billCol)}${r}/${colLetter(capHrsCol)}${r})`, style: 7 };
    });
  }
  return {
    name, rows, widths,
    merges: [`A1:${colLetter(columns.length - 1)}1`, `A2:${colLetter(columns.length - 1)}2`],
    rowStyles: { 3: 'header' },
    freezeRow: 4,
    filterRef: `A4:${colLetter(columns.length - 1)}${rows.length}`,
    formulas,
  };
}

function buildSheets(artifact) {
  const used = new Set();
  const sheets = [];
  sheets.push(summarySheet(artifact));
  used.add('summary');
  const tables = (artifact.sections || []).filter((s) => s.type === 'table' && s.columns && s.rows);
  tables.slice(0, 9).forEach((s) => {
    const name = safeSheetName(s.title || 'Detail', used);
    sheets.push(tableSheet(name, s, artifact));
  });
  const bars = (artifact.sections || []).find((s) => s.type === 'bars');
  if (bars) {
    sheets.push(tableSheet(safeSheetName(bars.title || 'Scores', used), { ...bars, columns: ['Dimension', 'Score'], rows: (bars.items || []).map((i) => [i.label, i.valueText || i.value]) }, artifact));
  }
  const timeline = (artifact.sections || []).find((s) => s.type === 'timeline');
  if (timeline) {
    sheets.push({
      name: safeSheetName('Roadmap', used),
      rows: [
        ['Roadmap'],
        [`${artifact.functionName} · ${artifact.project ? artifact.project.codename : ''}`],
        [],
        ['PHASE', 'WINDOW', 'DETAIL'],
        ...(timeline.items || []).map((i) => [i.phase || '', i.weeks || '', i.detail || (i.items || []).join('; ')]),
      ],
      widths: [34, 18, 110],
      merges: ['A1:C1', 'A2:C2'],
      rowStyles: { 3: 'header' },
      freezeRow: 4,
      filterRef: `A4:C${4 + (timeline.items || []).length}`,
    });
  }
  return sheets;
}

function render(artifact) {
  const sheets = buildSheets(artifact);
  const files = [];
  const sheetOverrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  files.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${sheetOverrides}
</Types>`,
  });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>` });
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` });
  files.push({ name: 'xl/styles.xml', data: styles() });
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
  files.push({ name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(artifact.title)}</dc:title><dc:creator>Kiln</dc:creator><cp:lastModifiedBy>Kiln</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>` });
  files.push({ name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Kiln</Application><Company>Kiln</Company><AppVersion>1.0</AppVersion></Properties>` });
  return zip(files);
}

function styles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="8">
<font><sz val="11"/><color rgb="FF161B22"/><name val="Calibri"/></font>
<font><b/><sz val="18"/><color rgb="FF161B22"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF5F6368"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF33373D"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFD3552D"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF161B22"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FFB3261E"/><name val="Calibri"/></font>
</fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF161B22"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8F5EE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFBF3EC"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D2C3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

module.exports = { renderXLSX: render };
