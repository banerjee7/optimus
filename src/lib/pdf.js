'use strict';
/**
 * Dependency-free PDF renderer for Kiln artifacts.
 * A4, brand cover, KPI cards, tables with pagination, bars, timelines, guardrails.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = [0.055, 0.075, 0.11];
const EMBER = [0.827, 0.325, 0.176];
const MOSS = [0.09, 0.32, 0.27];
const BONE = [0.965, 0.945, 0.91];
const LINE = [0.84, 0.81, 0.75];
const MUTED = [0.38, 0.39, 0.4];
const WHITE = [1, 1, 1];

const HELV = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, 'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
  'H': 722, 'I': 278, 'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778,
  'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944,
  'X': 667, 'Y': 667, 'Z': 611, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556,
  '`': 333, 'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556,
  'h': 556, 'i': 222, 'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556,
  'p': 556, 'q': 556, 'r': 333, 's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722,
  'x': 500, 'y': 500, 'z': 500, '{': 334, '|': 260, '}': 334, '~': 584,
};
const HELV_BOLD = {
  ' ': 278, '!': 333, '"': 474, '#': 556, '$': 556, '%': 889, '&': 722, "'": 238,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 333, ';': 333, '<': 584, '=': 584, '>': 584, '?': 611,
  '@': 975, 'A': 722, 'B': 722, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
  'H': 722, 'I': 278, 'J': 556, 'K': 722, 'L': 611, 'M': 833, 'N': 722, 'O': 778,
  'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944,
  'X': 667, 'Y': 667, 'Z': 611, '[': 333, '\\': 278, ']': 333, '^': 584, '_': 556,
  '`': 333, 'a': 556, 'b': 611, 'c': 556, 'd': 611, 'e': 556, 'f': 333, 'g': 611,
  'h': 611, 'i': 278, 'j': 278, 'k': 556, 'l': 278, 'm': 889, 'n': 611, 'o': 611,
  'p': 611, 'q': 611, 'r': 389, 's': 556, 't': 333, 'u': 611, 'v': 556, 'w': 778,
  'x': 556, 'y': 556, 'z': 500, '{': 389, '|': 280, '}': 389, '~': 584,
};

function sanitize(str) {
  return String(str == null ? '' : str)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '\u0095')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?')
    .replace(/\t/g, '    ');
}

function clean(str) {
  return sanitize(str).replace(/\*\*/g, '').replace(/`/g, '');
}

function measure(text, size, bold) {
  const table = bold ? HELV_BOLD : HELV;
  let total = 0;
  for (const ch of clean(text)) total += table[ch] || 556;
  return (total / 1000) * size;
}

function escapePdf(text) {
  return clean(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text, size, width, bold = false) {
  const raw = String(text == null ? '' : text).split('\n');
  const lines = [];
  for (const para of raw) {
    const words = clean(para).split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (measure(candidate, size, bold) <= width || !line) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

class PDF {
  constructor(artifact) {
    this.artifact = artifact;
    this.pages = [];
    this.page = null;
    this.y = 0;
    this.totalPages = 0;
  }

  startPage(cover = false) {
    this.page = [];
    this.pages.push(this.page);
    this.y = PAGE_H - (cover ? 190 : 74);
    if (!cover) {
      this.rect(0, PAGE_H - 38, PAGE_W, 38, [0.99, 0.985, 0.975]);
      this.line(MARGIN, PAGE_H - 38, PAGE_W - MARGIN, PAGE_H - 38, LINE, 0.6);
      this.text('KILN', MARGIN, PAGE_H - 25, 8, 'bold', EMBER, 0);
      this.text(this.artifact.title || 'Artifact', PAGE_W / 2, PAGE_H - 25, 8, 'regular', MUTED, 'center');
    }
  }

  ensure(h) {
    if (this.y - h < 58) this.startPage(false);
  }

  op(s) { this.page.push(s); }

  rect(x, y, w, h, color, strokeColor) {
    this.op(`${color[0]} ${color[1]} ${color[2]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    if (strokeColor) {
      this.op(`${strokeColor[0]} ${strokeColor[1]} ${strokeColor[2]} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    }
  }

  line(x1, y1, x2, y2, color = LINE, width = 0.7) {
    this.op(`${color[0]} ${color[1]} ${color[2]} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  text(str, x, y, size = 10, font = 'regular', color = INK, align = 'left') {
    const f = font === 'bold' ? 'F2' : font === 'italic' ? 'F3' : 'F1';
    let tx = x;
    if (align === 'center') tx = x - measure(str, size, font === 'bold') / 2;
    else if (align === 'right') tx = x - measure(str, size, font === 'bold');
    this.op(`BT /${f} ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg 1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(str)}) Tj ET`);
  }

  paragraph(str, { size = 9.4, color = [0.2, 0.22, 0.25], leading = 13.4, gap = 6, width = CONTENT_W, x = MARGIN, bold = false } = {}) {
    const lines = wrap(str, size, width, bold);
    this.ensure(lines.length * leading + gap);
    for (const line of lines) {
      if (this.y < 58) this.startPage(false);
      this.text(line, x, this.y, size, bold ? 'bold' : 'regular', color);
      this.y -= leading;
    }
    this.y -= gap;
  }

  sectionTitle(index, title) {
    this.ensure(44);
    this.y -= 8;
    this.rect(MARGIN, this.y - 1.5, 3, 15, EMBER);
    this.text(String(index).padStart(2, '0'), MARGIN + 12, this.y + 1, 7.5, 'bold', EMBER);
    this.text(title, MARGIN + 28, this.y + 1, 13.5, 'bold', INK);
    this.y -= 16;
    this.line(MARGIN, this.y, PAGE_W - MARGIN, this.y, LINE, 0.5);
    this.y -= 14;
  }

  kpis(items) {
    const gap = 10;
    const cols = 2;
    const w = (CONTENT_W - gap) / cols;
    const h = 48;
    items.forEach((item, i) => {
      const col = i % cols;
      if (col === 0) this.ensure(h + gap);
      const x = MARGIN + col * (w + gap);
      const y = this.y - h;
      this.rect(x, y, w, h, BONE);
      this.rect(x, y, 2.5, h, i % 2 ? MOSS : EMBER);
      this.text(String(item.label || '').toUpperCase(), x + 10, y + h - 15, 6.6, 'bold', MUTED);
      const value = String(item.value == null ? '' : item.value);
      const vs = value.length > 24 ? 11 : value.length > 16 ? 13 : 17;
      this.text(value, x + 10, y + 14, vs, 'bold', INK);
      if (col === cols - 1 || i === items.length - 1) this.y -= h + gap;
    });
  }

  table(columns, rows, widths) {
    const size = 7.7;
    const pad = 5;
    const cols = columns.length;
    const w = widths && widths.length === cols
      ? widths.map((n) => n * CONTENT_W)
      : columns.map((_, i) => (i === 0 ? CONTENT_W * 0.27 : CONTENT_W * 0.73 / (cols - 1)));
    const drawHeader = () => {
      this.ensure(58);
      this.rect(MARGIN, this.y - 18, CONTENT_W, 18, INK);
      let x = MARGIN;
      columns.forEach((c, i) => {
        this.text(String(c).toUpperCase(), x + pad, this.y - 12, 6.4, 'bold', WHITE);
        x += w[i];
      });
      this.y -= 18;
    };
    drawHeader();
    rows.forEach((row, ri) => {
      const cells = columns.map((_, i) => wrap(row[i] == null ? '-' : row[i], size, w[i] - pad * 2, i === 0));
      const lineCount = Math.max(...cells.map((c) => c.length), 1);
      const h = Math.min(lineCount * 9.6 + 8, 62);
      if (this.y - h < 58) { this.startPage(false); drawHeader(); }
      const y0 = this.y - h;
      if (ri % 2 === 0) this.rect(MARGIN, y0, CONTENT_W, h, [0.985, 0.98, 0.968]);
      this.line(MARGIN, y0, PAGE_W - MARGIN, y0, [0.9, 0.885, 0.85], 0.4);
      let x = MARGIN;
      cells.forEach((lines, i) => {
        let ty = this.y - 10;
        lines.slice(0, 5).forEach((line, li) => {
          this.text(line, x + pad, ty, size, i === 0 ? 'bold' : 'regular', i === 0 ? INK : [0.25, 0.26, 0.28]);
          ty -= 9.6;
        });
        x += w[i];
      });
      this.y -= h;
    });
    this.y -= 14;
  }

  bullets(items, numbered = false) {
    const size = 9.3;
    items.forEach((item, i) => {
      const lines = wrap(item, size, CONTENT_W - 22);
      this.ensure(lines.length * 12.6 + 3);
      this.text(numbered ? `${i + 1}.` : '\u0095', MARGIN + 1, this.y, numbered ? 8.2 : 9, 'bold', i % 2 ? MOSS : EMBER);
      let ty = this.y;
      for (const line of lines) {
        this.text(line, MARGIN + 18, ty, size, 'regular', [0.2, 0.22, 0.25]);
        ty -= 12.6;
      }
      this.y = ty - 2;
    });
    this.y -= 6;
  }

  callout(callout) {
    const tone = callout.tone === 'warn' ? [0.99, 0.95, 0.9] : callout.tone === 'good' ? [0.93, 0.97, 0.94] : BONE;
    const bar = callout.tone === 'warn' ? EMBER : callout.tone === 'good' ? MOSS : INK;
    const titleLines = wrap(callout.title || 'Note', 8.6, CONTENT_W - 28, true);
    const bodyLines = wrap(callout.text || '', 8.8, CONTENT_W - 28);
    const h = 22 + titleLines.length * 11 + bodyLines.length * 11.8;
    this.ensure(h + 8);
    const y0 = this.y - h;
    this.rect(MARGIN, y0, CONTENT_W, h, tone);
    this.rect(MARGIN, y0, 3, h, bar);
    let ty = this.y - 14;
    titleLines.forEach((l) => { this.text(l, MARGIN + 14, ty, 8.6, 'bold', INK); ty -= 11; });
    ty -= 2;
    bodyLines.forEach((l) => { this.text(l, MARGIN + 14, ty, 8.8, 'regular', [0.25, 0.26, 0.28]); ty -= 11.8; });
    this.y = y0 - 12;
  }

  bars(items) {
    const size = 8.4;
    const labelW = 132;
    const valueW = 44;
    items.forEach((item) => {
      this.ensure(18);
      const max = Math.max(...items.map((d) => Number(d.max || d.value) || 1));
      const bw = CONTENT_W - labelW - valueW - 20;
      this.text(String(item.label), MARGIN, this.y, size, 'regular', INK);
      this.rect(MARGIN + labelW, this.y - 1, bw, 8, [0.92, 0.905, 0.87]);
      const ratio = Math.max(0.03, Math.min(1, (Number(item.value) || 0) / max));
      this.rect(MARGIN + labelW, this.y - 1, bw * ratio, 8, item.color === 'moss' ? MOSS : EMBER);
      this.text(String(item.valueText || item.value), PAGE_W - MARGIN, this.y, size, 'bold', INK, 'right');
      this.y -= 18;
    });
    this.y -= 8;
  }

  timeline(items) {
    items.forEach((item) => {
      this.ensure(56);
      this.rect(MARGIN, this.y - 6, 7, 7, EMBER);
      this.text(item.phase || '', MARGIN + 15, this.y - 3, 9.6, 'bold', INK);
      if (item.weeks) this.text(item.weeks, PAGE_W - MARGIN, this.y - 3, 8, 'bold', MOSS, 'right');
      this.y -= 15;
      if (item.detail) this.paragraph(item.detail, { size: 8.6, color: MUTED, leading: 11.6, gap: 2, width: CONTENT_W - 18, x: MARGIN + 15 });
      if (Array.isArray(item.items) && item.items.length) {
        this.bullets(item.items, false);
      }
      this.line(MARGIN + 3, this.y + 4, MARGIN + 3, this.y - 4, LINE, 0.5);
      this.y -= 8;
    });
  }

  checklist(items) {
    items.forEach((item) => {
      const label = typeof item === 'string' ? item : item.label;
      const checked = typeof item === 'object' && item.state === 'approved';
      const lines = wrap(label, 8.9, CONTENT_W - 26);
      this.ensure(lines.length * 12 + 4);
      this.rect(MARGIN + 1, this.y - 2, 8, 8, checked ? MOSS : WHITE, checked ? null : LINE);
      if (checked) this.text('x', MARGIN + 2.6, this.y, 6.5, 'bold', WHITE);
      let ty = this.y;
      lines.forEach((l) => { this.text(l, MARGIN + 18, ty, 8.9, 'regular', [0.22, 0.24, 0.27]); ty -= 12; });
      this.y = ty - 3;
    });
    this.y -= 4;
  }

  render() {
    const a = this.artifact;
    const project = a.project || {};
    this.startPage(true);

    // Cover
    this.rect(0, PAGE_H - 190, PAGE_W, 190, INK);
    this.rect(0, PAGE_H - 190, 6, 190, EMBER);
    this.text('KILN', MARGIN, PAGE_H - 38, 10, 'bold', [0.96, 0.92, 0.85]);
    this.text('DELIVERY ARTIFACT  /  ' + String(a.functionName || '').toUpperCase(), PAGE_W - MARGIN, PAGE_H - 38, 7, 'bold', [0.75, 0.72, 0.65], 'right');
    const titleLines = wrap(a.title || 'Artifact', 25, CONTENT_W, true);
    let ty = PAGE_H - 82;
    titleLines.slice(0, 3).forEach((l) => { this.text(l, MARGIN, ty, 25, 'bold', WHITE); ty -= 29; });
    const subLines = wrap(a.subtitle || a.summary || '', 10, CONTENT_W - 20);
    subLines.slice(0, 3).forEach((l) => { this.text(l, MARGIN, ty - 2, 10, 'regular', [0.82, 0.81, 0.77]); ty -= 14; });

    this.y = PAGE_H - 214;
    const meta = [
      ['ACCOUNT TIER', project.tierLabel || '-'],
      ['SANDBOX', project.codename || '-'],
      ['MODEL', project.modelName || '-'],
      ['REVISION', 'r' + (a.revision || 1)],
      ['STATUS', String(a.status || 'draft').toUpperCase()],
      ['GENERATED', new Date(a.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
    ];
    const mw = CONTENT_W / 3;
    meta.forEach((m, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = MARGIN + col * mw;
      const y = this.y - row * 32;
      this.text(m[0], x, y, 6.4, 'bold', MUTED);
      this.text(m[1], x, y - 12, 9, 'bold', INK);
    });
    this.y -= 82;

    if (a.summary) {
      this.callout({ title: 'Executive summary', text: a.summary, tone: 'default' });
    }
    if (project.idea) {
      this.paragraph('Brief: ' + project.idea, { size: 8.3, color: MUTED, leading: 11.6, gap: 8 });
    }

    let sectionNo = 0;
    (a.sections || []).forEach((section) => {
      if (!section || !section.type) return;
      const showTitle = section.title && !['kpis'].includes(section.type);
      if (showTitle) sectionNo += 1;
      if (showTitle) this.sectionTitle(sectionNo, section.title);
      switch (section.type) {
        case 'kpis': this.kpis(section.items || []); break;
        case 'prose': this.paragraph(section.text || '', { size: 9.4, leading: 14, gap: 10 }); break;
        case 'bullets': this.bullets(section.items || []); break;
        case 'numbered': this.bullets(section.items || [], true); break;
        case 'table': this.table(section.columns || [], section.rows || [], section.widths); break;
        case 'timeline': this.timeline(section.items || []); break;
        case 'bars': this.bars(section.items || []); break;
        case 'callout': this.callout(section); break;
        case 'checklist': this.checklist(section.items || []); break;
        case 'keyvalue':
          this.table(['Field', 'Detail'], (section.items || []).map((i) => [i.label, i.value]));
          break;
        default: break;
      }
    });

    if (a.status !== 'approved') {
      this.callout({
        title: 'Human-in-the-loop notice',
        text: 'This artifact is a draft generated by Kiln. It requires named human sign-off before it can be used for a client commitment, production promotion, or commercial decision.',
        tone: 'warn',
      });
    }

    this.totalPages = this.pages.length;
    this.pages.forEach((page, i) => {
      const footerY = 30;
      page.push(`${LINE[0]} ${LINE[1]} ${LINE[2]} RG 0.5 w ${MARGIN} ${footerY + 8} m ${PAGE_W - MARGIN} ${footerY + 8} l S`);
      page.push(`BT /F1 6.8 Tf ${MUTED[0]} ${MUTED[1]} ${MUTED[2]} rg 1 0 0 1 ${MARGIN} ${footerY} Tm (kiln.studio  /  ${escapePdf(a.status === 'approved' ? 'Approved artifact' : 'Draft - approval required')}) Tj ET`);
      const label = `Page ${i + 1} of ${this.totalPages}`;
      page.push(`BT /F1 6.8 Tf ${MUTED[0]} ${MUTED[1]} ${MUTED[2]} rg 1 0 0 1 ${(PAGE_W - MARGIN - measure(label, 6.8)).toFixed(2)} ${footerY} Tm (${escapePdf(label)}) Tj ET`);
    });

    return this.serialize();
  }

  serialize() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('PAGES_PLACEHOLDER');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    const a = this.artifact;
    const info = clean(`${a.title} | Kiln | ${a.functionName || ''} | ${a.status || 'draft'}`);
    add(`<< /Title (${escapePdf(info)}) /Author (Kiln) /Creator (Kiln Agentic Delivery Platform) /Subject (${escapePdf(a.functionName || 'Delivery artifact')}) >>`);

    const pageIds = [];
    for (const page of this.pages) {
      let stream = 'q\n';
      for (const op of page) stream += op + '\n';
      stream += 'Q';
      const bytes = Buffer.from(stream, 'latin1');
      const contentId = add(`<< /Length ${bytes.length} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }
    objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => id + ' 0 R').join(' ')}] >>`;

    let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefStart = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((off) => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
  }
}

module.exports = { renderPDF: (artifact) => new PDF(artifact).render() };
