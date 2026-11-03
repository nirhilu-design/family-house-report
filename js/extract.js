// Extraction of the JP Group periodic report (PDF) into a raw data structure.
// Works in the browser and in Node: the caller passes a loaded pdf.js document
// and the pdf.js OPS table. Everything is deterministic and runs locally.

const NUM_RE = /^-?[\d,]+(\.\d+)?%?$/;
const PCT_RE = /^-?\d+(\.\d+)?%$/;

/** Normalise Hebrew text: unify quote marks and whitespace. */
export function norm(s) {
  return String(s ?? '')
    .replace(/''/g, '"')
    .replace(/[״”“]/g, '"')
    .replace(/[׳’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

/** Key used to match the same manager / label across tables. */
export function key(s) {
  return norm(s).replace(/["'\s\-–־]/g, '');
}

export function parseNum(s) {
  const t = String(s).replace(/,/g, '').replace('%', '').trim();
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Group a page's text items into visual rows (y-desc), items sorted right-to-left. */
export async function pageRows(page) {
  const tc = await page.getTextContent();
  const items = tc.items
    .filter(it => it.str && it.str.trim())
    .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]), dir: it.dir }));
  items.sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of items) {
    const r = rows.find(r => Math.abs(r.y - it.y) <= 2);
    if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) {
    r.items.sort((a, b) => b.x - a.x);
    const nums = r.items.filter(i => NUM_RE.test(i.s.trim()));
    r.nums = nums.map(i => ({ v: parseNum(i.s), raw: i.s.trim(), x: i.x, pct: i.s.includes('%') }));
    const maxNumX = nums.length ? Math.max(...nums.map(n => n.x)) : -Infinity;
    // label = text to the right of the first number (RTL). Chart debris sits to the left of the table.
    const labelItems = r.items.filter(i => !NUM_RE.test(i.s.trim()) && i.x > maxNumX);
    r.label = norm(labelItems.map(i => i.s).join(' '));
    r.labelRight = labelItems.length ? Math.max(...labelItems.map(i => i.x + i.w)) : -Infinity;
    r.text = norm(r.items.map(i => i.s).join(' '));
  }
  return { rows, items };
}

const TITLES = [
  ['assetClasses', t => t.startsWith('סה"כ תיק השקעות לפי אפיקים')],
  ['channels', t => t === 'סה"כ תיק השקעות'],
  ['managers', t => t.startsWith('התפלגות לפי מנהלי השקעות')],
  ['structure', t => t.startsWith('מבנה תיק השקעות כולל')],
  ['geo', t => t.startsWith('חשיפה גאוגרפית - תיק השקעות כולל')],
  ['currency', t => t.startsWith('חשיפה למטבעות - תיק השקעות כולל')],
  ['pmStructure', t => t.startsWith('מבנה תיק מנוהל - ניהול תיקים')],
  ['altStructure', t => t.startsWith('מבנה תיק מנוהל - השקעות אלטרנטיביות')],
  ['retILS', t => t.startsWith('תשואות השקעות בש"ח')],
  ['retUSD', t => t.startsWith('תשואות השקעות במט"ח')],
  ['monthly', t => t.startsWith('תשואות השקעות בחתך חודשי')],
];
const TITLE_HINT = /^(חשיפה|מבנה|תשואות|התפלגות|סה"כ תיק השקעות)/;
const COL_HEADER = /(שווי בש"ח|אחוז מהתיק|חשבון\/תקופה|אחוז מהאפיק)/;

function classifyTitle(text) {
  for (const [id, test] of TITLES) if (test(text)) return id;
  return TITLE_HINT.test(text) ? 'other' : null;
}

/**
 * Walk all pages and collect table rows per section.
 * Returns { sections: {id: {page, rows: [...]}}, meta, disclaimer, pageCount }
 */
export async function extractRaw(doc) {
  const sections = {};
  const meta = { reportDate: null, producedAt: null };
  let disclaimer = [];
  let inDisclaimer = false;
  let current = null;
  const pages = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { rows, items } = await pageRows(page);
    pages.push({ page, rows, items, n: p });

    for (const r of rows) {
      const t = r.text;
      if (t.startsWith('דו"ח תקופתי') || t.includes('פירוט תיק ההשקעות לתאריך')) {
        const m = r.items.filter(i => i.dir === 'ltr').sort((a, b) => a.x - b.x).map(i => i.s).join('').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
          || t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m && !meta.reportDate) meta.reportDate = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
        continue;
      }
      if (t.startsWith('מועד הפקת הדוח')) {
        const m = t.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2})/);
        if (m && !meta.producedAt) meta.producedAt = m[1];
        continue;
      }
      if (t.startsWith('חשוב לציין')) inDisclaimer = true;
      if (inDisclaimer) {
        if (t === 'בתודה' || /^JP Group$/i.test(t)) { inDisclaimer = t === 'בתודה'; continue; }
        disclaimer.push(t);
        continue;
      }
      if (r.nums.length === 0) {
        const id = classifyTitle(t);
        if (id) {
          current = id;
          sections[id] ||= { page: p, rows: [], headerRows: [] };
          continue;
        }
        if (COL_HEADER.test(t)) continue;
        if (current && sections[current]) sections[current].headerRows.push({ page: p, row: r });
        continue;
      }
      if (current && sections[current] && r.label) {
        sections[current].rows.push({ page: p, y: r.y, label: r.label, nums: r.nums, right: r.labelRight });
      }
    }
  }
  // Drop chart debris: real table labels are right-aligned to the table edge (RTL);
  // fragments of chart labels picked up under a table sit far to the left of it.
  for (const sec of Object.values(sections)) {
    const maxRight = {};
    for (const r of sec.rows) maxRight[r.page] = Math.max(maxRight[r.page] ?? -Infinity, r.right);
    sec.rows = sec.rows.filter(r => r.right >= maxRight[r.page] - 80);
  }
  disclaimer = disclaimer.join(' ').replace(/\s+/g, ' ').trim();
  return { sections, meta, disclaimer, pages, pageCount: doc.numPages };
}

// ---------- section parsers ----------

const isTotal = l => /^(סה"כ|בסיס הצמדה)/.test(l);

/** Simple 2-column table: [value, pct]. */
export function parseValuePct(sec) {
  if (!sec) return null;
  const out = { page: sec.page, total: null, rows: [] };
  for (const r of sec.rows) {
    const vals = r.nums.filter(n => !n.pct).map(n => n.v);
    const pcts = r.nums.filter(n => n.pct).map(n => n.v);
    const row = { label: r.label, value: vals[0] ?? null, pct: pcts[0] ?? null, page: r.page };
    if (isTotal(r.label) && out.total === null) out.total = row; else if (!isTotal(r.label)) out.rows.push(row);
  }
  return out;
}

/** Grouped exposure table (geography / currency): groups (% of total) with children (% of group). */
export function parseGrouped(sec) {
  const flat = parseValuePct(sec);
  if (!flat) return null;
  const total = flat.total?.value ?? flat.rows.reduce((s, r) => s + (r.value || 0), 0);
  const groups = [];
  let g = null, remaining = 0;
  for (const r of flat.rows) {
    if (r.pct === null) continue;
    // A value-less row (0.00%) is a child of the current group with nothing in it.
    const value = r.value ?? 0;
    if (g && remaining > 0.5) {
      g.children.push({ label: r.label, value, pctOfGroup: r.pct });
      remaining -= value;
    } else {
      g = { label: r.label, value, pct: r.pct, children: [] };
      groups.push(g);
      remaining = value;
    }
  }
  return { page: flat.page, total, groups };
}

/** Returns table: [ytd, 12m, 24m] per manager + total. */
export function parseReturns(sec) {
  if (!sec) return null;
  const out = { page: sec.page, rows: [], total: null };
  for (const r of sec.rows) {
    const p = r.nums.filter(n => n.pct).map(n => n.v);
    if (p.length < 2) continue;
    const [ytd, r12, r24] = p.length >= 3 ? p : [null, p[0], p[1]];
    const row = { label: r.label, ytd, r12, r24 };
    if (/^סה"כ/.test(r.label)) out.total = row; else out.rows.push(row);
  }
  return out;
}

/** Manager names that appear as column headers in a structure section (e.g. portfolio management). */
export function headerNames(sec) {
  if (!sec) return [];
  const names = [];
  for (const { row } of sec.headerRows) {
    if (COL_HEADER.test(row.text)) continue;
    // header cells are separated by large x gaps; merge items that are close together
    const cells = [];
    for (const it of row.items) {
      const last = cells[cells.length - 1];
      if (last && last.minX - (it.x + it.w) < 12) { last.parts.push(it.s); last.minX = it.x; }
      else cells.push({ parts: [it.s], minX: it.x });
    }
    for (const c of cells) names.push(norm(c.parts.join(' ')));
  }
  return names;
}

// ---------- risk/return scatter (standard deviation) ----------

function fitLinear(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of points) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  if (!den) return null;
  const a = num / den;
  return v => my + a * (v - mx);
}

/**
 * Read the "efficiency" scatter chart drawn under a returns table and return marker
 * positions converted to (std %, return %). Markers are small filled vector circles.
 */
export async function extractScatter(pageObj, OPS, belowY) {
  const { page, items } = pageObj;
  // axis tick labels: percent strings below the table
  const ticks = items.filter(i => PCT_RE.test(i.s.trim()) && i.y < belowY - 10);
  const byRow = new Map(), byCol = new Map();
  for (const t of ticks) {
    const ry = Math.round(t.y / 3) * 3; (byRow.get(ry) || byRow.set(ry, []).get(ry)).push(t);
    const cx = Math.round((t.x + t.w) / 4) * 4; (byCol.get(cx) || byCol.set(cx, []).get(cx)).push(t);
  }
  const xTicks = [...byRow.values()].sort((a, b) => b.length - a.length)[0] || [];
  const yTicks = [...byCol.values()].sort((a, b) => b.length - a.length)[0] || [];
  if (xTicks.length < 3 || yTicks.length < 3) return { markers: [], ok: false, reason: 'axis ticks not found' };
  const fx = fitLinear(xTicks.map(t => [t.x + t.w / 2, parseNum(t.s)]));
  const fy = fitLinear(yTicks.map(t => [t.y + t.h * 0.35, parseNum(t.s)]));
  // plot area: tick extents padded by ~1.5 tick steps (points can sit beyond the outer gridlines)
  const ys = yTicks.map(t => t.y).sort((a, b) => a - b), xs = xTicks.map(t => t.x).sort((a, b) => a - b);
  const yStep = (ys[ys.length - 1] - ys[0]) / (ys.length - 1), xStep = (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
  const xMin = xs[0] - 1.5 * xStep, xMax = xs[xs.length - 1] + 1.5 * xStep;
  const yMin = ys[0] - 1.5 * yStep, yMax = ys[ys.length - 1] + 1.5 * yStep;

  const ol = await page.getOperatorList();
  const name = {}; for (const [k, v] of Object.entries(OPS)) name[v] = k;
  const mul = (m, a) => [m[0] * a[0] + m[2] * a[1], m[1] * a[0] + m[3] * a[1], m[0] * a[2] + m[2] * a[3], m[1] * a[2] + m[3] * a[3], m[0] * a[4] + m[2] * a[5] + m[4], m[1] * a[4] + m[3] * a[5] + m[5]];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  const markers = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = name[ol.fnArray[i]], a = ol.argsArray[i];
    if (f === 'save') stack.push(ctm.slice());
    else if (f === 'restore') ctm = stack.pop() || ctm;
    else if (f === 'transform') ctm = mul(ctm, a);
    else if (f === 'paintFormXObjectBegin') { stack.push(ctm.slice()); if (a && a[0]) ctm = mul(ctm, a[0]); }
    else if (f === 'paintFormXObjectEnd') ctm = stack.pop() || ctm;
    else if (f === 'constructPath') {
      const bb = a[2]; if (!bb) continue;
      const P = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
      const [x0, y0] = P(bb[0], bb[1]), [x1, y1] = P(bb[2], bb[3]);
      const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      const next = name[ol.fnArray[i + 1]];
      if (!/fill/i.test(next || '')) continue;
      if (w < 6 || w > 18 || h < 6 || h > 18 || Math.abs(w - h) > 1.5) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (cx < xMin || cx > xMax || cy < yMin || cy > yMax) continue;
      if (markers.some(m => Math.hypot(m.cx - cx, m.cy - cy) < 1)) continue;
      markers.push({ cx, cy, std: fx(cx), ret: fy(cy) });
    }
  }
  return { markers, ok: markers.length > 0 };
}

/**
 * Match scatter markers to managers by 12M return.
 * Same count → pair by rank (robust to any constant offset/scale error in the axis fit).
 * Otherwise → greedy nearest after removing the median offset.
 */
export function matchMarkers(markers, rows) {
  const out = new Map();
  const valid = rows.filter(r => r.r12 != null);
  if (markers.length && markers.length === valid.length) {
    const ms = [...markers].sort((a, b) => a.ret - b.ret);
    const rs = [...valid].sort((a, b) => a.r12 - b.r12);
    rs.forEach((r, i) => out.set(r.label, { std: ms[i].std, retFromChart: ms[i].ret, diff: Math.abs(ms[i].ret - r.r12) }));
    return out;
  }
  const offs = markers.map(m => {
    const best = valid.reduce((b, r) => (Math.abs(m.ret - r.r12) < Math.abs(m.ret - b.r12) ? r : b), valid[0]);
    return m.ret - best.r12;
  }).sort((a, b) => a - b);
  const shift = offs.length ? offs[Math.floor(offs.length / 2)] : 0;
  markers = markers.map(m => ({ ...m, ret: m.ret - shift }));
  rows = valid;
  const pairs = [];
  markers.forEach((m, mi) => rows.forEach((r, ri) => pairs.push({ mi, ri, d: Math.abs(m.ret - r.r12) })));
  pairs.sort((a, b) => a.d - b.d);
  const usedM = new Set(), usedR = new Set();
  for (const p of pairs) {
    if (usedM.has(p.mi) || usedR.has(p.ri)) continue;
    usedM.add(p.mi); usedR.add(p.ri);
    out.set(rows[p.ri].label, { std: markers[p.mi].std, retFromChart: markers[p.mi].ret, diff: p.d });
  }
  return out;
}

/** Full extraction: PDF document → structured raw data (before user review). */
export async function extractReport(doc, OPS) {
  const raw = await extractRaw(doc);
  const S = raw.sections;
  const res = {
    meta: raw.meta,
    pageCount: raw.pageCount,
    disclaimer: raw.disclaimer,
    channels: parseValuePct(S.channels),
    assetClasses: parseValuePct(S.assetClasses),
    managers: parseValuePct(S.managers),
    geo: parseGrouped(S.geo),
    currency: parseGrouped(S.currency),
    pmNames: headerNames(S.pmStructure),
    retILS: parseReturns(S.retILS),
    retUSD: parseReturns(S.retUSD),
    pmPage: S.pmStructure?.page ?? null,
    std: {},
    stdInfo: [],
  };
  for (const [id, label] of [['retILS', 'ILS'], ['retUSD', 'USD']]) {
    const sec = S[id], tbl = res[id];
    if (!sec || !tbl) continue;
    const pageObj = raw.pages[sec.page - 1];
    const lowestRowY = Math.min(...sec.rows.filter(r => r.page === sec.page).map(r => r.y));
    try {
      const sc = await extractScatter(pageObj, OPS, lowestRowY);
      const matched = matchMarkers(sc.markers, tbl.rows);
      for (const [name, m] of matched) res.std[key(name)] = { ...m, source: `עמ' ${sec.page}` };
      res.stdInfo.push({ table: label, page: sec.page, markers: sc.markers.length, managers: tbl.rows.length, ok: sc.ok, reason: sc.reason });
    } catch (e) {
      res.stdInfo.push({ table: label, page: sec.page, ok: false, reason: String(e) });
    }
  }
  return res;
}
