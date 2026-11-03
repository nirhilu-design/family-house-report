// Renders the two A4 report pages from the report model. Output is an HTML string
// (no framework) so the same code drives the on-screen preview and the print export.
import { ramp, textOn, LIQUIDITY } from './config.js';
import { fmt, pct, mil } from './model.js';

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
  const legend = segs.map(s => `<span class="legend-item"><span class="sw" style="background:${s.color}"></span>${esc(s.label)} ${N(pct(s.pct))}</span>`).join('');
  return `<div class="donut"><span class="t">${title}</span>
    <svg width="118" height="118" viewBox="0 0 140 140" role="img" aria-label="${esc(aria)}">
      <g transform="rotate(-90 70 70)" fill="none" stroke-width="13">${arcs}</g>
      <text x="70" y="74" text-anchor="middle" font-size="24" fill="#2A2B2D" direction="ltr">${esc(center.value)}</text>
      <text x="70" y="93" text-anchor="middle" font-size="12" fill="#5E6064">${esc(center.label)}</text>
    </svg><div class="lg">${legend}</div></div>`;
}

function footer(page, extra = '') {
  return `<footer class="ftr">${extra}<div class="line"><span class="conf">CONFIDENTIAL · JP GROUP FAMILY HOUSE</span><span class="muted">עמוד ${page} מתוך 2</span></div></footer>`;
}

export function renderPage1(m, assets) {
  const fx = m.fx, ils = m.returns.ILS, usd = m.returns.USD;
  const kpi = (v, l) => `<div class="kpi">${N(`<span class="v">${v}</span>`)}<span class="l">${l}</span></div>`;

  const classes = [...m.assetClasses].sort((a, b) => b.value - a.value);
  const ac = (i) => ALLOC_COLORS[i] || ramp(i, classes.length);
  const stack = classes.map((c, i) => {
    const col = ac(i), lbl = c.pct >= 6 ? N(pct(c.pct, 1)) : '';
    return `<div style="width:${c.pct}%;min-width:6px;background:${col};color:${textOn(col)}">${lbl}</div>`;
  }).join('');
  const stackLegend = classes.map((c, i) => `<span class="legend-item"><span class="sw" style="background:${ac(i)}"></span>${esc(c.label.replace(' ושו"מ', ''))} ${N(pct(c.pct))}</span>`).join('');

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

  // liquidity (semantic colours): locked dark, ≤1y gold, ≤1m light grey
  const liqSum = k => m.managers.filter(x => x.liquidity === k).reduce((s, x) => s + x.value, 0);
  const liqSegs = ['month', 'year', 'locked'].map(k => ({ label: LIQUIDITY[k].label, pct: m.total ? (liqSum(k) / m.total) * 100 : 0, color: LIQUIDITY[k].color }));
  const liqPending = m.managers.some(x => x.liquiditySource !== 'saved');

  // holdings bar + table (ramp: darker = larger)
  const mgr = m.managers, n = mgr.length;
  const bar = mgr.map((x, i) => {
    const col = ramp(i, n), lbl = x.pct * 6.82 >= 36 ? `<span class="n" style="font-size:12px;font-weight:700">${pct(x.pct, 1)}</span>` : '';
    return `<div style="width:${x.pct}%;background:${col};color:${textOn(col)}">${lbl}</div>`;
  }).join('');
  const half = Math.ceil(n / 2);
  const row = (x, i) => `<div class="hrow"><span class="sq" style="background:${ramp(i, n)}"></span><span class="name"><span class="num n">${x.n}</span><span>${esc(x.name)}</span></span><span class="r n" style="font-weight:700">${pct(x.pct)}</span><span class="r n muted">${fmt(x.value)}</span></div>`;
  const head = `<div class="hrow head"><span></span><span>מנהל השקעות</span><span class="r">משקל</span><span class="r">שווי (₪)</span></div>`;
  const totalRow = `<div class="hrow total"><span></span><span>סה״כ תיק</span><span class="r n">100%</span><span class="r n">${fmt(m.total)}</span></div>`;

  return `<div class="fh-page p1" dir="rtl" lang="he">
  <div class="topline"></div>
  <header class="hdr">
    <div style="display:flex;flex-direction:column;gap:3px">
      <span class="eyebrow">לקוח:</span>
      <span class="client">${placeholder(m.meta.clientName, 'שם הלקוח')}</span>
      <span style="font-size:12px" class="muted">דוח ריכוז השקעות ומנהלים</span>
    </div>
    <img class="logo" src="${assets.logoFull}" alt="JP Group Wealth Management">
  </header>
  <section class="band">
    <div class="main"><span class="label">שווי תיק כולל</span><span class="value">${N(`${fmt(m.total)} ₪`)}</span><span style="font-size:12px" class="muted">נכון ליום ${N(dateDots(m.meta.reportDate))}</span></div>
    ${kpi(ils ? pct(ils.total12) : '—', 'תשואה 12 ח׳<br>אפיקים שקליים')}
    ${kpi(usd ? pct(usd.total12) : '—', 'תשואה 12 ח׳<br>אפיקים דולריים')}
    ${kpi(fx ? pct(fx.pct, 1) : '—', `חשיפה למט״ח<br>${N(mil(fx?.value))}`)}
    ${kpi(String(n), 'מנהלי<br>השקעות')}
  </section>
  <section class="sec">
    <div class="sec-head"><h2 class="small">התפלגות נכסים לפי אפיק</h2><span style="font-size:12px" class="muted">נתונים נוכחיים</span></div>
    <div class="stack" style="height:28px" role="img" aria-label="התפלגות נכסים לפי אפיק">${stack}</div>
    <div class="legend-row">${stackLegend}</div>
  </section>
  <section class="panel">
    ${donut('חשיפה מטבעית', cur.segs, cur.center, 'חשיפה מטבעית')}
    ${donut('חשיפה גאוגרפית', geo.segs, geo.center, 'חשיפה גאוגרפית')}
    ${donut(`פרופיל נזילות${liqPending ? ' <span style="font-weight:400;color:#8A6A1C">[סיווג לאישור]</span>' : ''}`, liqSegs, { value: pct(liqSegs[0].pct, 1), label: 'נזיל' }, 'פרופיל נזילות')}
    <div class="key">מקרא צבעים: בכל התפלגות – גוון כהה יותר = נתח גדול יותר · בנזילות: כהה = נעול מעל שנה · זהב = עד שנה · אפור בהיר = נזיל עד חודש</div>
  </section>
  <section class="sec">
    <div class="sec-head ruled"><h2 class="big">חשיפה למנהלי השקעות</h2><span style="font-size:12px" class="muted">${n} מנהלים · מהגדול לקטן</span></div>
    <div class="stack" style="height:34px;width:100%" role="img" aria-label="פס אחזקות לפי משקל בתיק">${bar}</div>
    <div class="holdings-cols">
      <div>${head}${mgr.slice(0, half).map((x, i) => row(x, i)).join('')}</div>
      <div>${head}${mgr.slice(half).map((x, i) => row(x, i + half)).join('')}${totalRow}</div>
    </div>
  </section>
  ${footer(1)}
</div>`;
}

function returnsTable(title, rows, totals) {
  const r = x => {
    const neg = v => (v != null && v < 0 ? ' style="color:#9B3B2B"' : '');
    return `<div class="rrow"><span>${esc(x.name)}</span><span class="r n muted">${pct(x.pct, 1)}</span><span class="r n" style="font-weight:700${x.r12 < 0 ? ';color:#9B3B2B' : ''}">${pct(x.r12)}</span><span class="r n${x.r24 < 0 ? '' : ' muted'}"${neg(x.r24)}>${pct(x.r24)}</span></div>`;
  };
  const w = rows.reduce((s, x) => s + (x.pct || 0), 0);
  return `<section class="rtbl">
    <div class="ttl"><span class="dot"></span><h2>${title}</h2></div>
    <div class="rrow head"><span>מנהל השקעות</span><span class="r">משקל</span><span class="r">12 ח׳</span><span class="r">24 ח׳</span></div>
    ${rows.map(r).join('')}
    <div class="rrow total"><span style="padding-right:4px">סה״כ</span><span class="r n muted" style="font-weight:400">${pct(w, 1)}</span><span class="r n" style="color:#8A6A1C;font-size:17px">${pct(totals?.total12)}</span><span class="r n" style="padding-left:4px">${pct(totals?.total24)}</span></div>
  </section>`;
}

function bubbleChart(m) {
  const pts = m.managers.filter(x => x.r12 != null && x.std != null);
  const W = 682, H = 330, L = 46, R = 668, T = 12, B = 290;
  const maxStd = Math.max(5, Math.ceil(Math.max(0, ...pts.map(p => p.std))));
  const yMin = Math.min(-20, Math.floor(Math.min(0, ...pts.map(p => p.r12)) / 10) * 10);
  const yMax = Math.max(40, Math.ceil(Math.max(0, ...pts.map(p => p.r12)) / 10) * 10);
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
  o.push(`<text x="${(X(1) - 6).toFixed(1)}" y="${T + 16}" text-anchor="end" font-size="12" fill="#8A6A1C">סיכון נמוך, תשואה חיובית</text>`);

  const b = pts.map(p => ({ p, x: X(p.std), y: Y(p.r12), r: 6 + Math.sqrt((p.pct || 0) / maxW) * 14 }));
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
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="מפת סיכון-תשואה" style="display:block;direction:ltr">${o.join('')}</svg>`;
}

export function renderPage2(m, assets) {
  const byCur = c => m.managers.filter(x => x.currency === c && x.r12 != null).sort((a, b) => b.r12 - a.r12);
  const ils = byCur('ILS'), usd = byCur('USD');
  const notes = `<div class="notes"><span class="t">הערות מנהל ההשקעות</span><p>${m.meta.notes ? esc(m.meta.notes) : '[הערות לתקופה]'}</p><div class="sig">${placeholder(m.meta.signer, 'שם מנהל ההשקעות')}</div></div>`;
  const legend = m.managers.map(x => {
    const L = LIQUIDITY[x.liquidity];
    const onChart = x.r12 != null && x.std != null;
    const style = onChart && L ? `background:${L.color};color:${L.text};${x.liquidity === 'month' ? 'border:1px solid #9A9B9E;' : ''}` : 'background:#FFFFFF;color:#8E9093;border:1px solid #BDBEC1;';
    return `<span class="it"><span class="badge n" style="${style}">${x.n}</span><span class="nm">${esc(x.name)}${x.r12 == null ? ' <span style="color:#8E9093">(ללא תשואה)</span>' : ''}</span></span>`;
  }).join('');
  const liqLegend = ['locked', 'year', 'month'].map(k => `<span class="legend-item"><span style="width:10px;height:10px;border-radius:50%;background:${LIQUIDITY[k].color}"></span>${k === 'locked' ? 'נעול מעל שנה' : k === 'year' ? 'עד שנה' : 'נזיל עד חודש'}</span>`).join('');
  return `<div class="fh-page p2" dir="rtl" lang="he">
  <div class="topline"></div>
  <header class="hdr">
    <div style="display:flex;flex-direction:column;gap:3px"><h1>תשואות וסיכון</h1><span style="font-size:12px" class="muted">תשואה נומינלית לפי מנהל, במטבע המדידה</span></div>
    <div style="display:flex;align-items:center;gap:12px"><span style="font-size:13px;color:#8A6A1C;font-weight:700">${placeholder(m.meta.clientName, 'שם הלקוח')} | ${N(dateDots(m.meta.reportDate))}</span><img class="logo" src="${assets.logoCircle}" alt="JP Group"></div>
  </header>
  <div class="tables">
    <div>${returnsTable('נכסים בשקלים (ILS)', ils, m.returns.ILS)}</div>
    <div>${returnsTable('נכסים בדולר (USD)', usd, m.returns.USD)}${notes}</div>
  </div>
  <section class="sec" style="margin-top:22px;gap:8px">
    <div class="sec-head ruled"><h2 class="big">מפת סיכון–תשואה · 12 חודשים</h2><div style="display:flex;gap:14px;font-size:12px;align-items:center" class="muted">${liqLegend}<span>גודל = משקל · מספור כבעמוד 1</span></div></div>
    ${bubbleChart(m)}
    <div class="chart-legend">${legend}</div>
  </section>
  ${footer(2, `<p>${esc(m.disclaimer)}</p>`)}
</div>`;
}

export function renderReport(m, assets) {
  return renderPage1(m, assets) + renderPage2(m, assets);
}
