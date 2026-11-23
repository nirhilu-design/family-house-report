// Renders the two A4 report pages from the report model. Output is an HTML string
// (no framework) so the same code drives the on-screen preview and the print export.
import { ramp, textOn, LIQUIDITY } from './config.js';
import { fmt, pct } from './model.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const N = s => `<span class="n">${s}</span>`;
const C = 339.29; // donut circumference, r = 54
const ALLOC_COLORS = ['#2E2F31', '#8B7234', '#C3A75F', '#E2D2A6'];
const dateDots = d => (d || '').replace(/\//g, '.');

function placeholder(v, ph) { return v ? esc(v) : `<span class="placeholder">[${ph}]</span>`; }

function donut(title, segs, center, aria) {
  // segs: [{pct, color}] drawn in order around the ring
  let off = 0;
  const arcs = segs.map(s => {
    const len = (s.pct / 100) * C;
    const a = `<circle cx="70" cy="70" r="54" stroke="${s.color}" stroke-dasharray="${len.toFixed(2)} ${C}" stroke-dashoffset="${(-off).toFixed(2)}"></circle>`;
    off += len; return a;
  }).join('');
  const legend = segs.map(s => `<span class="legend-item"><span class="sw" style="background:${s.color}"></span>${esc(s.label)} ${N(pct(s.pct, 1))}</span>`).join('');
  return `<div class="donut"><span class="t">${title}</span>
    <svg width="72" height="72" viewBox="0 0 140 140" role="img" aria-label="${esc(aria)}">
      <g transform="rotate(-90 70 70)" fill="none" stroke-width="13">${arcs}</g>
      <text x="70" y="74" text-anchor="middle" font-size="24" fill="#2A2B2D" direction="ltr">${esc(center.value)}</text>
      <text x="70" y="93" text-anchor="middle" font-size="12" fill="#5E6064">${esc(center.label)}</text>
    </svg><div class="lg">${legend}</div></div>`;
}

function footer(page, extra = '', pages = 2) {
  return `<footer class="ftr">${extra}<div class="line"><span class="conf">CONFIDENTIAL · JP GROUP FAMILY HOUSE</span><span class="muted">עמוד ${page} מתוך ${pages}</span></div></footer>`;
}

// ---------- layout choice (deterministic, from row counts) ----------
// Measured on the fixed 794×1123 page (version B design). Table rows are ~22.7px.
// Page 1 with the returns tables ends at ≈ 898 + 22.7 × (rows − 10), rows = holding rows + returns rows;
// the footer starts at 1067, so the tables stay on page 1 up to 17 rows.
// Page 2 with the tables ends at ≈ 389 + 21.5 × returns rows + 25 × legend rows + chart height (footer ~1018).
// The one-page layout (chart under the tables, ≤ 6 managers) no longer fits with the version B page 1
// (hero, four donuts, section headers): it overflows by ~90px even with 6 managers, so it is off for now.
export const ROW_H = 22.7;
export const ONE_PAGE_ENABLED = false;
const returnRows = m => {
  const c = cur => m.managers.filter(x => x.currency === cur && x.r12 != null).length;
  return Math.max(c('ILS'), c('USD'));
};
// rows in the holdings table incl. its total row: one column up to 8 managers, else the taller of two columns
const holdRows = n => (n <= 8 ? n + 1 : Math.floor(n / 2) + 1);
export function chooseLayout(m) {
  const n = m.managers.length, rows = holdRows(n) + returnRows(m);
  if (ONE_PAGE_ENABLED && n <= 6) {
    const chartH = CHART_H - Math.max(0, rows - 10) * ROW_H;
    if (chartH >= 110) return { mode: 'one', pages: 1, chartH };
  }
  if (rows <= 17) return { mode: 'tables-p1', pages: 2 };
  const legendRows = Math.ceil(n / 4);
  const p2ChartH = Math.round(Math.max(200, Math.min(P2_CHART_H, 1010 - 389 - 21.5 * returnRows(m) - 25 * legendRows)));
  return { mode: 'tables-p2', pages: 2, p2ChartH };
}

// USD rate entered on the upload page (₪ per $1, month-end representative rate). The PDF reports
// every amount in ₪; with a rate the USD table shows dollars (value / rate), without it ₪ as reported.
export const usdRate = m => { const r = Number(m.meta?.usdRate); return Number.isFinite(r) && r > 0 ? r : null; };

function returnsBlock(m, notes = '') {
  const byCur = c => m.managers.filter(x => x.currency === c && x.r12 != null).sort((a, b) => b.r12 - a.r12);
  const ils = byCur('ILS'), usd = byCur('USD');
  const rows = Math.max(ils.length, usd.length); // pad the shorter table so both are the same height
  const rate = usdRate(m);
  const usdOpts = rate
    ? { cur: '$', conv: v => v / rate, note: `(לפי שער יציג ${rate})` }
    : { cur: '₪', conv: v => v, note: '(סכומים מצוינים בשקלים)' };
  return `<div class="tables">
    <div>${returnsTable('נכסים בשקלים (ILS)', ils, m.returns.ILS, { padTo: rows })}</div>
    <div>${returnsTable('נכסים בדולר (USD)', usd, m.returns.USD, { padTo: rows, ...usdOpts })}${notes}</div>
  </div>`;
}

const INTRO = 'להלן תמונת המצב של תיק ההשקעות שלך לסוף החודש: פיזור הנכסים, מנהלי ההשקעות והתשואה של כל אחד מהם, לרבות היחס בין הסיכון לתשואה של כל מנהל.';
const secHead = (title, sub) => `<div class="sec-head ruled"><h2>${title}</h2><span class="sub">${sub}</span></div>`;

export function renderPage1(m, assets, layout = chooseLayout(m)) {
  const onePage = layout.mode === 'one';
  // asset allocation donut (darker = larger); centre shows the largest class
  const classes = [...m.assetClasses].sort((a, b) => b.value - a.value);
  const allocSegs = classes.map((c, i) => ({ label: c.label.replace(' ושו"מ', ''), pct: c.pct, color: ALLOC_COLORS[i] || ramp(i, classes.length) }));
  const allocCenter = allocSegs[0] ? { value: pct(allocSegs[0].pct, 1), label: allocSegs[0].label } : { value: '—', label: '' };

  // two-group donuts: larger share dark, smaller gold
  const twoGroup = (groups, centerTest, centerLabel) => {
    const g = [...(groups || [])].sort((a, b) => b.value - a.value);
    const cols = ['#2E2F31', '#B08D35', '#C3A75F', '#E2D2A6'];
    const segs = g.map((x, i) => ({ label: x.label, pct: x.pct, color: cols[i] || '#DCDCDE' }));
    const c = g.find(centerTest) || g[0];
    return { segs, center: { value: c ? pct(c.pct, 1) : '—', label: centerLabel } };
  };
  const cur = twoGroup(m.currency?.groups, x => !/שקל/.test(x.label), 'מט״ח');
  const geo = twoGroup(m.geo?.groups, x => !/ישראל/.test(x.label), 'חו״ל');
  // investment channel ("סה"כ תיק השקעות" in the PDF): darker = larger
  const chans = [...(m.channels || [])].sort((a, b) => b.value - a.value);
  const chanSegs = chans.map((c, i) => ({ label: c.label, pct: c.pct, color: ALLOC_COLORS[i] || ramp(i, chans.length) }));
  const chanCenter = chanSegs[0] ? { value: pct(chanSegs[0].pct, 1), label: /אלטרנטיב/.test(chanSegs[0].label) ? 'אלטרנטיב' : chanSegs[0].label } : null;
  const donuts = [
    chanCenter && donut('לפי ערוץ השקעה', chanSegs, chanCenter, 'סה״כ תיק השקעות לפי ערוץ'),
    donut('חשיפה מטבעית', cur.segs, cur.center, 'חשיפה מטבעית'),
    donut('חשיפה גאוגרפית', geo.segs, geo.center, 'חשיפה גאוגרפית'),
    donut('התפלגות נכסים לפי אפיק', allocSegs, allocCenter, 'התפלגות נכסים לפי אפיק'),
  ].filter(Boolean);

  // managers: graded bar + numbered table (ramp: darker = larger); up to 8 managers → one column
  const mgr = m.managers, n = mgr.length;
  const bar = mgr.map((x, i) => {
    const col = ramp(i, n), lbl = x.pct * 6.82 >= 36 ? `<span class="n" style="font-size:12px;font-weight:700">${pct(x.pct, 1)}</span>` : '';
    return `<div style="width:${x.pct}%;background:${col};color:${textOn(col)}">${lbl}</div>`;
  }).join('');
  const oneCol = n <= 8;
  const half = oneCol ? n : Math.ceil(n / 2);
  const row = (x, i) => `<div class="hrow"><span class="sq" style="background:${ramp(i, n)}"></span><span class="name"><span class="num n">${x.n}</span><span>${esc(x.name)}</span></span><span class="r n" style="font-weight:700">${pct(x.pct, 1)}</span><span class="r n muted">${fmt(x.value)}</span></div>`;
  const head = `<div class="hrow head"><span></span><span>מנהל השקעות</span><span class="r">משקל</span><span class="r">שווי (₪)</span></div>`;
  const totalRow = `<div class="htotal"><span class="l">סה״כ תיק <span class="n muted">100%</span></span><span class="v n">${fmt(m.total)} ₪</span></div>`;
  const asOf = m.meta.reportDate ? `נכון ליום ${N(dateDots(m.meta.reportDate))} · ` : '';
  const cols = oneCol
    ? `<div class="holdings-cols one"><div>${head}${mgr.map(row).join('')}${totalRow}</div></div>`
    : `<div class="holdings-cols"><div>${head}${mgr.slice(0, half).map((x, i) => row(x, i)).join('')}</div><div>${head}${mgr.slice(half).map((x, i) => row(x, i + half)).join('')}${totalRow}</div></div>`;


  return `<div class="fh-page p1${onePage ? ' one-page' : ''}" dir="rtl" lang="he">
  <div class="topline"></div>
  <header class="hdr">
    <div style="display:flex;flex-direction:column;gap:3px">
      <span class="eyebrow">לקוח:</span>
      <span class="client">${placeholder(m.meta.clientName, 'שם הלקוח')}</span>
      <span style="font-size:12px" class="muted">דוח ריכוז השקעות ומנהלים</span>
    </div>
    <img class="logo" src="${assets.logoFull}" alt="JP Group Wealth Management">
  </header>
  <section class="hero" aria-label="שווי התיק המנוהל">
    <div class="hv">
      <span class="lbl">שווי התיק המנוהל</span>
      <span class="amt n"><span class="v">${fmt(m.total)}</span><span class="cur">₪</span></span>
      <span class="sub">${asOf}${n} מנהלי השקעות</span>
    </div>
    <p>${INTRO}</p>
  </section>
  <section class="sec">
    ${secHead('פיזור התיק', 'בכל התפלגות – גוון כהה יותר = נתח גדול יותר')}
    <div class="panel" style="grid-template-columns:repeat(${donuts.length}, minmax(0, 1fr))">${donuts.join('')}</div>
  </section>
  <section class="sec">
    ${secHead('התפלגות מנהלי השקעות', `${n} מנהלים · מהגדול לקטן`)}
    <div class="stack" style="height:20px;width:100%" role="img" aria-label="פס אחזקות לפי משקל בתיק">${bar}</div>
    ${cols}
  </section>
  ${layout.mode === 'tables-p2' ? '' : `<section class="sec">
    ${secHead('תשואות לפי מנהל', 'תשואה נומינלית במטבע המדידה · 24 ח׳ מצטבר')}
    ${returnsBlock(m)}
  </section>`}
  ${onePage ? `<section class="sec wide-chart">
    ${secHead('מפת סיכון–תשואה · 12 חודשים', 'גודל = משקל · מספור כבטבלאות')}
    ${bubbleChart(m, { W: 682, H: layout.chartH || CHART_H, dispW: 682, tight: true, rMax: 11 })}
  </section>` : ''}
  ${onePage ? footer(1, `<p>${esc(m.disclaimer)}</p>`, 1) : footer(1)}
</div>`;
}

// Returns table: number (as in the managers table / chart) · name · value (₪ as reported, or $ via the entered rate) · YTD · 12M · 24M, one decimal.
function returnsTable(title, rows, totals, { padTo = 0, cur = '₪', conv = v => v, note = '' } = {}) {
  const money = v => (v == null ? '—' : fmt(conv(v)));
  const neg = v => (v != null && v < 0 ? 'color:#9B3B2B' : '');
  const r = x => `<div class="rrow"><span class="name"><span class="num n">${x.n}</span><span>${esc(x.name)}</span></span><span class="r n">${money(x.value)}</span><span class="r n muted" style="${neg(x.ytd)}">${pct(x.ytd, 1)}</span><span class="r n" style="font-weight:700;${neg(x.r12)}">${pct(x.r12, 1)}</span><span class="r n${x.r24 < 0 ? '' : ' muted'}" style="${neg(x.r24)}">${pct(x.r24, 1)}</span></div>`;
  const v = rows.reduce((s, x) => s + (x.value || 0), 0); // total converted once, so it matches the PDF total / rate
  return `<section class="rtbl">
    <div class="ttl"><span class="dot"></span><h3>${title}</h3>${note ? `<span class="muted" style="font-size:12px">${note}</span>` : ''}</div>
    <div class="rrow head"><span>מנהל השקעות</span><span class="r">שווי ${cur}</span><span class="r">מתחילת<br>שנה</span><span class="r">12 ח׳</span><span class="r">24 ח׳</span></div>
    ${rows.map(r).join('')}
    ${'<div class="rrow pad" aria-hidden="true"><span>&nbsp;</span></div>'.repeat(Math.max(0, padTo - rows.length))}
    <div class="rrow total"><span style="padding-right:4px">סה״כ</span><span class="r n">${money(v)}</span><span class="r n muted" style="font-weight:400">${pct(totals?.totalYtd, 1)}</span><span class="r n" style="color:#8A6A1C;font-size:15px">${pct(totals?.total12, 1)}</span><span class="r n" style="padding-left:4px">${pct(totals?.total24, 1)}</span></div>
  </section>`;
}

export const CHART_H = 150; // one-page chart height (px)
export const P2_CHART_H = 290; // page-2 chart height (px), full width

function bubbleChart(m, { W = 682, H = 330, dispW = W === 682 ? 580 : W, dispH = Math.round(H * dispW / W), tight = false, rMax = 14 } = {}) {
  const pts = m.managers.filter(x => x.r12 != null && x.std != null);
  const L = 46, R = W - 14, T = 12, B = H - 40;
  const maxStd = Math.max(5, Math.ceil(Math.max(0, ...pts.map(p => p.std))));
  // tight: axis fitted to the data (one-page layout); default keeps the fixed -20%..40% frame
  const yMin = Math.min(tight ? -10 : -20, Math.floor(Math.min(0, ...pts.map(p => p.r12)) / 10) * 10);
  const yMax = Math.max(tight ? 10 : 40, Math.ceil((Math.max(0, ...pts.map(p => p.r12)) + (tight ? 2 : 0)) / 10) * 10);
  const X = v => L + (v / maxStd) * (R - L), Y = v => B - ((v - yMin) / (yMax - yMin)) * (B - T);
  const maxW = Math.max(...m.managers.map(x => x.pct || 0), 1);
  const o = [];
  o.push(`<rect x="${L}" y="${T}" width="${(X(1) - L).toFixed(1)}" height="${(Y(0) - T).toFixed(1)}" fill="#FAF7EE"></rect>`);
  for (let v = yMin; v <= yMax; v += 10) {
    const y = Y(v);
    if (v !== 0) o.push(`<line x1="${L}" y1="${y.toFixed(1)}" x2="${R}" y2="${y.toFixed(1)}" stroke="#E6E6E6"></line>`);
    o.push(`<text x="${L - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${v === 0 ? '#2A2B2D' : '#5E6064'}">${v}%</text>`);
  }
  for (let v = 0; v <= maxStd; v++) {
    if (v) o.push(`<line x1="${X(v).toFixed(1)}" y1="${T}" x2="${X(v).toFixed(1)}" y2="${B}" stroke="#EFEFEF"></line>`);
    o.push(`<text x="${X(v).toFixed(1)}" y="${B + 18}" text-anchor="middle" font-size="12" fill="#5E6064">${v}%</text>`);
  }
  o.push(`<line x1="${L}" y1="${T}" x2="${L}" y2="${B}" stroke="#BDBDBD"></line>`);
  o.push(`<line x1="${L}" y1="${Y(0).toFixed(1)}" x2="${R}" y2="${Y(0).toFixed(1)}" stroke="#2A2B2D"></line>`);
  o.push(`<text x="${(L + R) / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="#5E6064">סטיית תקן (סיכון)</text>`);
  o.push(`<text x="12" y="${(T + B) / 2}" text-anchor="middle" font-size="12" fill="#5E6064" transform="rotate(-90 12 ${(T + B) / 2})">תשואה 12 חודשים</text>`);
  if (X(1) - L > 150) o.push(`<text x="${(X(1) - 6).toFixed(1)}" y="${T + 16}" text-anchor="end" font-size="12" fill="#8A6A1C">סיכון נמוך, תשואה חיובית</text>`);

  const b = pts.map(p => ({ p, x: X(p.std), y: Y(p.r12), r: 6 + Math.sqrt((p.pct || 0) / maxW) * rMax }));
  for (const q of [...b].sort((a, c) => c.r - a.r)) {
    const LQ = LIQUIDITY[q.p.liquidity] || { color: "#FFFFFF", text: "#2A2B2D" };
    o.push(`<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${q.r.toFixed(1)}" fill="${LQ.color}" fill-opacity="0.9" stroke="${q.p.liquidity === 'month' || !q.p.liquidity ? '#9A9B9E' : '#FFFFFF'}" stroke-width="1.5"></circle>`);
  }
  // number labels: relax overlapping labels apart (deterministic)
  const lab = b.map(q => ({ q, x: q.x, y: q.y }));
  for (let it = 0; it < 40; it++) {
    for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) {
      const a = lab[i], c = lab[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 18) {
        const push = (18 - d) / 2, ux = d ? dx / d : 1, uy = d ? dy / d : 0;
        a.x -= ux * push; a.y -= uy * push; c.x += ux * push; c.y += uy * push;
      }
    }
  }
  for (const l of lab) {
    const LQ = LIQUIDITY[l.q.p.liquidity] || { text: "#2A2B2D", color: "#FFFFFF" };
    const halo = l.q.p.liquidity === "year" ? "#8A6A1C" : LQ.color;
    o.push(`<text x="${l.x.toFixed(1)}" y="${(l.y + 4.2).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${LQ.text}" stroke="${halo}" stroke-width="2.5" paint-order="stroke">${l.q.p.n}</text>`);
  }
  return `<svg width="${dispW}" height="${dispH}" viewBox="0 0 ${W} ${H}" role="img" aria-label="מפת סיכון-תשואה" style="display:block;direction:ltr;margin:0 auto">${o.join('')}</svg>`;
}

export function renderPage2(m, assets, layout = chooseLayout(m)) {
  const withTables = layout.mode === 'tables-p2';
  const notes = `<div class="notes"><span class="t">הערות מנהל ההשקעות</span><p>${m.meta.notes ? esc(m.meta.notes) : '[הערות לתקופה]'}</p><div class="sig">${placeholder(m.meta.signer, 'שם מנהל ההשקעות')}</div></div>`;
  const legend = m.managers.map(x => {
    const L = LIQUIDITY[x.liquidity];
    const onChart = x.r12 != null && x.std != null;
    const style = onChart && L ? `background:${L.color};color:${L.text};${x.liquidity === 'month' ? 'border:1px solid #9A9B9E;' : ''}` : 'background:#FFFFFF;color:#8E9093;border:1px solid #BDBEC1;';
    return `<span class="it"><span class="badge n" style="${style}">${x.n}</span><span class="nm">${esc(x.name)}${x.r12 == null ? ' <span style="color:#8E9093">(ללא תשואה)</span>' : ''}</span></span>`;
  }).join('');
  return `<div class="fh-page p2" dir="rtl" lang="he">
  <div class="topline"></div>
  <header class="hdr">
    <div style="display:flex;flex-direction:column;gap:3px"><h1>תשואות וסיכון</h1><span style="font-size:12px" class="muted">תשואה נומינלית לפי מנהל, במטבע המדידה</span></div>
    <div style="display:flex;align-items:center;gap:12px"><span style="font-size:13px;color:#8A6A1C;font-weight:700">${placeholder(m.meta.clientName, 'שם הלקוח')} | ${N(dateDots(m.meta.reportDate))}</span><img class="logo" src="${assets.logoCircle}" alt="JP Group"></div>
  </header>
  ${withTables ? returnsBlock(m, notes) : ''}
  <section class="sec" style="margin-top:22px;gap:8px">
    <div class="sec-head ruled"><h2 class="big">מפת סיכון–תשואה · 12 חודשים</h2></div>
    ${bubbleChart(m, { W: 682, H: layout.p2ChartH || P2_CHART_H, dispW: 682 })}
    <div class="chart-legend">${legend}</div>
  </section>
  ${withTables ? '' : `<div style="margin-top:18px">${notes}</div>`}
  ${footer(2, `<p>${esc(m.disclaimer)}</p>`)}
</div>`;
}

// ≤ 6 managers → everything on one page (if it fits); otherwise two pages, with the returns
// tables on page 1 when they fit there and on page 2 when they don't.
export function renderReport(m, assets) {
  const layout = chooseLayout(m);
  return layout.pages === 1 ? renderPage1(m, assets, layout) : renderPage1(m, assets, layout) + renderPage2(m, assets, layout);
}
