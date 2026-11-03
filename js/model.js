// Turns the raw extraction into the report model and runs consistency checks.
import { key, norm } from './extract.js';
import { DEFAULT_LIQUIDITY, DEFAULT_DISCLAIMER } from './config.js';

const DEF_LIQ = Object.fromEntries(Object.entries(DEFAULT_LIQUIDITY).map(([k, v]) => [key(k), v]));
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;

/**
 * @param raw   output of extractReport()
 * @param saved optional per-manager overrides remembered from earlier sessions: { [managerKey]: {liquidity, channel} }
 */
export function buildModel(raw, saved = {}) {
  const pmKeys = new Set((raw.pmNames || []).map(key));
  const total = raw.managers?.total?.value ?? raw.channels?.total?.value ?? null;
  const ret = { ILS: raw.retILS, USD: raw.retUSD };

  const managers = (raw.managers?.rows || []).map((r, i) => {
    const k = key(r.label);
    let currency = null, r12 = null, r24 = null, ytd = null;
    for (const cur of ['ILS', 'USD']) {
      const hit = ret[cur]?.rows.find(x => key(x.label) === k);
      if (hit) { currency = cur; r12 = hit.r12; r24 = hit.r24; ytd = hit.ytd; }
    }
    const channel = saved[k]?.channel || (pmKeys.has(k) ? 'pm' : /^מיועץ/.test(r.label) ? 'adv' : 'alt');
    const liquidity = saved[k]?.liquidity || DEF_LIQ[k] || '';
    const std = raw.std?.[k]?.std ?? null;
    return {
      id: k, name: norm(r.label), value: r.value, pct: r.pct, page: r.page,
      channel, liquidity, liquiditySource: saved[k]?.liquidity ? 'saved' : DEF_LIQ[k] ? 'default' : 'missing',
      currency, ytd, r12, r24, std: std == null ? null : Math.round(std * 100) / 100,
      stdDiff: raw.std?.[k]?.diff ?? null,
    };
  }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).map((m, i) => ({ ...m, n: i + 1 }));

  const fxGroup = raw.currency?.groups.find(g => !/שקל/.test(g.label));
  const abroad = raw.geo?.groups.find(g => !/ישראל/.test(g.label));

  const model = {
    version: 1,
    meta: {
      clientName: '', notes: '', signer: '',
      reportDate: raw.meta?.reportDate || '', producedAt: raw.meta?.producedAt || '',
      pageCount: raw.pageCount,
    },
    total,
    returns: {
      ILS: raw.retILS ? { total12: raw.retILS.total?.r12 ?? null, total24: raw.retILS.total?.r24 ?? null, page: raw.retILS.page } : null,
      USD: raw.retUSD ? { total12: raw.retUSD.total?.r12 ?? null, total24: raw.retUSD.total?.r24 ?? null, page: raw.retUSD.page } : null,
    },
    fx: fxGroup ? { value: fxGroup.value, pct: fxGroup.pct, page: raw.currency.page } : null,
    abroad: abroad ? { value: abroad.value, pct: abroad.pct, page: raw.geo.page } : null,
    assetClasses: (raw.assetClasses?.rows || []).map(r => ({ label: norm(r.label).replace('וש"מ', 'ושו"מ'), value: r.value, pct: r.pct })),
    assetPage: raw.assetClasses?.page ?? null,
    channels: (raw.channels?.rows || []).map(r => ({ label: norm(r.label), value: r.value, pct: r.pct })),
    channelsPage: raw.channels?.page ?? null,
    currency: raw.currency, geo: raw.geo,
    managers,
    managersPage: raw.managers?.page ?? null,
    disclaimer: raw.disclaimer ? (/JP Group/.test(raw.disclaimer) ? raw.disclaimer : `${raw.disclaimer} בתודה, JP Group`) : DEFAULT_DISCLAIMER,
    stdInfo: raw.stdInfo || [],
  };
  model.checks = runChecks(model, raw);
  return model;
}

export function runChecks(m, raw = null) {
  const out = [];
  const add = (level, text) => out.push({ level, text });
  const sum = a => a.reduce((s, x) => s + (x ?? 0), 0);

  if (m.total == null) add('error', 'לא נמצא שווי תיק כולל');
  if (!m.managers.length) add('error', 'לא נמצאה טבלת "התפלגות לפי מנהלי השקעות"');
  else {
    const s = sum(m.managers.map(x => x.value));
    if (!near(s, m.total, 2)) add('error', `סכום המנהלים (${fmt(s)}) שונה מהשווי הכולל (${fmt(m.total)})`);
    else add('ok', `סכום ${m.managers.length} המנהלים תואם לשווי הכולל`);
    const sp = sum(m.managers.map(x => x.pct));
    if (!near(sp, 100, 0.06)) add('warn', `סכום משקלי המנהלים ${sp.toFixed(2)}% ולא 100%`);
  }
  if (m.assetClasses.length) {
    const s = sum(m.assetClasses.map(x => x.value));
    near(s, m.total, 2) ? add('ok', 'התפלגות האפיקים מסתכמת לשווי הכולל') : add('error', 'התפלגות האפיקים לא מסתכמת לשווי הכולל');
  } else add('error', 'לא נמצאה התפלגות לפי אפיקים');
  for (const [name, g] of [['חשיפה גאוגרפית', m.geo], ['חשיפה מטבעית', m.currency]]) {
    if (!g?.groups?.length) { add('error', `לא נמצאה ${name}`); continue; }
    const s = sum(g.groups.map(x => x.value));
    near(s, m.total, 2) ? add('ok', `${name} מסתכמת לשווי הכולל`) : add('error', `${name} לא מסתכמת לשווי הכולל`);
  }
  // channels vs manager classification
  const chanSum = c => sum(m.managers.filter(x => x.channel === c).map(x => x.value));
  const pmRow = m.channels.find(c => c.label.startsWith('ניהול תיקים'));
  const advRow = m.channels.find(c => c.label.startsWith('מיועץ'));
  if (pmRow && !near(chanSum('pm'), pmRow.value, 2)) add('warn', 'שיוך "ניהול תיקים" למנהלים לא תואם לסכום בעמוד הערוצים');
  if (advRow && !near(chanSum('adv'), advRow.value, 2)) add('warn', 'שיוך "מיועץ" למנהלים לא תואם לסכום בעמוד הערוצים');
  if (pmRow && advRow && near(chanSum('pm'), pmRow.value, 2) && near(chanSum('adv'), advRow.value, 2)) add('ok', 'שיוך המנהלים לערוצים תואם לעמוד הערוצים');

  for (const cur of ['ILS', 'USD']) if (!m.returns[cur]) add('warn', `לא נמצאה טבלת תשואות ${cur === 'ILS' ? 'בש"ח' : 'במט"ח'}`);
  const noRet = m.managers.filter(x => x.r12 == null);
  if (noRet.length) add('info', `ללא תשואה מדווחת: ${noRet.map(x => x.name).join(', ')}`);
  const noStd = m.managers.filter(x => x.r12 != null && x.std == null);
  if (noStd.length) add('warn', `לא חולצה סטיית תקן מהגרף עבור: ${noStd.map(x => x.name).join(', ')} — ניתן להזין ידנית`);
  else if (m.managers.some(x => x.std != null)) add('ok', 'סטיית התקן חולצה מגרפי היעילות לכל המנהלים עם תשואה');
  const badStd = m.managers.filter(x => x.stdDiff != null && x.stdDiff > 1.5);
  if (badStd.length) add('warn', `התאמת נקודה בגרף לא ודאית עבור: ${badStd.map(x => x.name).join(', ')}`);
  const noLiq = m.managers.filter(x => !x.liquidity);
  if (noLiq.length) add('error', `חסר סיווג נזילות עבור: ${noLiq.map(x => x.name).join(', ')}`);
  const defLiq = m.managers.filter(x => x.liquiditySource === 'default');
  if (defLiq.length) add('warn', `סיווג נזילות זמני (ברירת מחדל, לאישור) עבור ${defLiq.length} מנהלים`);
  if (!m.meta.clientName) add('warn', 'לא הוזן שם לקוח');
  if (m.managers.length > 16) add('warn', `${m.managers.length} מנהלים — טבלת האחזקות עלולה לא להיכנס בעמוד 1`);
  return out;
}

export function fmt(n, d = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
// round half away from zero with an epsilon so 36.55 → 36.6 (toFixed alone gives 36.5)
export const round = (n, d) => Math.sign(n) * Math.round(Math.abs(n) * 10 ** d + 1e-7) / 10 ** d;
export const pct = (n, d = 2) => (n == null ? '—' : `${round(Number(n), d).toFixed(d)}%`);
export const mil = n => (n == null ? '—' : `₪${(n / 1e6).toFixed(1)}M`);
