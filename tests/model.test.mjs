// Unit tests on synthetic data (no client data in the repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGrouped, parseReturns, matchMarkers, norm, key } from '../js/extract.js';
import { buildModel, pct } from '../js/model.js';
import { ramp, textOn } from '../js/config.js';

const row = (label, ...nums) => ({ label, page: 1, nums: nums.map(n => ({ v: typeof n === 'string' ? Number(n.replace('%', '')) : n, pct: typeof n === 'string' })) });

test('norm/key unify Hebrew quote marks and dashes', () => {
  assert.equal(norm("סה''כ  תיק"), 'סה"כ תיק');
  assert.equal(key('מור קו - אינבסט'), key('מור קו – אינבסט'));
  assert.equal(key('הפניקס חוב נדל"ן'), key('הפניקס חוב נדל״ן'));
});

test('pct rounds half up despite float error', () => {
  assert.equal(pct(36.55, 1), '36.6%');
  assert.equal(pct(12.45, 1), '12.5%');
  assert.equal(pct(-18.02), '-18.02%');
  assert.equal(pct(null), '—');
});

test('parseGrouped splits groups and children by running remainder', () => {
  const sec = { page: 6, rows: [
    row('סה"כ תיק מנוהל', 1000, '100.00%'),
    row('ישראל', 400, '40.00%'), row('ישראל', 400, '100.00%'),
    row('חו"ל', 600, '60.00%'), row('ארצות הברית', 450, '75.00%'), row('קנדה', 150, '25.00%'),
  ] };
  const g = parseGrouped(sec);
  assert.equal(g.total, 1000);
  assert.deepEqual(g.groups.map(x => [x.label, x.value, x.children.length]), [['ישראל', 400, 1], ['חו"ל', 600, 2]]);
});

test('parseReturns reads ytd/12m/24m and total', () => {
  const r = parseReturns({ page: 13, rows: [row('מנהל א', '5.00%', '5.00%', '9.00%'), row('סה"כ', '4.00%', '4.00%', '8.00%')] });
  assert.deepEqual(r.rows[0], { label: 'מנהל א', ytd: 5, r12: 5, r24: 9 });
  assert.equal(r.total.r12, 4);
});

test('matchMarkers pairs by rank when counts match (robust to axis offset)', () => {
  const rows = [{ label: 'A', r12: 12.54 }, { label: 'B', r12: 12.17 }, { label: 'C', r12: 3.39 }];
  // chart read with a +0.5pp offset: nearest-value matching would swap A and B
  const markers = [{ ret: 12.67, std: 0.92 }, { ret: 13.04, std: 0.61 }, { ret: 3.89, std: 0.65 }];
  const m = matchMarkers(markers, rows);
  assert.equal(m.get('A').std, 0.61);
  assert.equal(m.get('B').std, 0.92);
  assert.equal(m.get('C').std, 0.65);
});

test('buildModel: ordering, channels, currency, checks', () => {
  const raw = {
    meta: { reportDate: '31/12/2024', producedAt: '01/01/2025 10:00' }, pageCount: 16, disclaimer: 'חשוב לציין',
    channels: { page: 2, rows: [{ label: 'מיועץ', value: 100, pct: 10 }, { label: 'ניהול תיקים', value: 300, pct: 30 }, { label: 'קרנות גידור ואלטרנטיב', value: 600, pct: 60 }] },
    assetClasses: { page: 2, rows: [{ label: 'מניות', value: 500, pct: 50 }, { label: 'נכסי חוב', value: 500, pct: 50 }] },
    managers: { page: 3, total: { value: 1000 }, rows: [
      { label: 'קרן ב', value: 600, pct: 60, page: 3 }, { label: 'מיועץ פועלים', value: 100, pct: 10, page: 3 }, { label: 'מנהל א', value: 300, pct: 30, page: 3 }] },
    geo: { page: 6, total: 1000, groups: [{ label: 'ישראל', value: 400, pct: 40, children: [] }, { label: 'חו"ל', value: 600, pct: 60, children: [] }] },
    currency: { page: 6, total: 1000, groups: [{ label: 'שקל', value: 700, pct: 70, children: [] }, { label: 'מט"ח', value: 300, pct: 30, children: [] }] },
    pmNames: ['מנהל א'],
    retILS: { page: 13, rows: [{ label: 'מנהל א', r12: 5, r24: 9 }], total: { r12: 5, r24: 9 } },
    retUSD: { page: 14, rows: [{ label: 'קרן ב', r12: 7, r24: 12 }], total: { r12: 7, r24: 12 } },
    std: { [key('מנהל א')]: { std: 0.5, diff: 0.1 }, [key('קרן ב')]: { std: 1.2, diff: 0.1 } },
  };
  const m = buildModel(raw, { [key('קרן ב')]: { liquidity: 'locked' } });
  assert.deepEqual(m.managers.map(x => [x.n, x.name, x.channel, x.currency]), [[1, 'קרן ב', 'alt', 'USD'], [2, 'מנהל א', 'pm', 'ILS'], [3, 'מיועץ פועלים', 'adv', null]]);
  assert.equal(m.managers[0].liquiditySource, 'saved');
  assert.equal(m.fx.pct, 30);
  const levels = Object.fromEntries(m.checks.map(c => [c.text, c.level]));
  assert.equal(levels['סכום 3 המנהלים תואם לשווי הכולל'], 'ok');
  assert.equal(levels['שיוך המנהלים לערוצים תואם לעמוד הערוצים'], 'ok');
  assert.ok(m.checks.some(c => c.level === 'error' && c.text.startsWith('מנהלים שאינם בטבלת הנזילות')));
});

test('colour ramp: dark → gold → pale, text contrast flips', () => {
  assert.equal(ramp(0, 15), '#2E2F31');
  assert.equal(ramp(14, 15), '#F2E8C9');
  assert.equal(textOn(ramp(0, 15)), '#FFFFFF');
  assert.equal(textOn(ramp(14, 15)), '#2A2B2D');
});

test('findSimilar: renamed manager inherits liquidity from a containing name; ambiguity returns null', async () => {
  const { findSimilar } = await import('../js/store.js');
  const table = { entries: { [key('קרן ב׳ הזדמנויות')]: { name: 'קרן ב׳ הזדמנויות', liquidity: 'locked' } } };
  // provisional defaults also count: 'קרן אלפא הזדמנויות' → year
  assert.equal(findSimilar(table, 'אלפא הזדמנויות')?.name, 'קרן אלפא הזדמנויות');
  assert.equal(findSimilar(table, 'אלפא הזדמנויות').liquidity, 'year');
  assert.equal(findSimilar(table, 'ב׳ הזדמנויות')?.liquidity, 'locked');
  assert.equal(findSimilar(table, 'מנהל חדש לגמרי'), null);
  // "הזדמנויות" alone matches two entries with different liquidity → no guess
  assert.equal(findSimilar(table, 'הזדמנויות'), null);
});

test('chooseLayout: tables on page 1 while they fit, else on page 2 (one-page layout off in version B)', async () => {
  const { chooseLayout } = await import('../js/render.js');
  const mk = (n, ils) => ({ managers: Array.from({ length: n }, (_, i) => ({ n: i + 1, currency: i < ils ? 'ILS' : 'USD', r12: 1 })) });
  assert.equal(chooseLayout(mk(6, 3)).mode, 'tables-p1');
  assert.equal(chooseLayout(mk(15, 9)).mode, 'tables-p1');  // 8 + 9 rows (the real 15-manager report)
  assert.equal(chooseLayout(mk(16, 8)).mode, 'tables-p1');
  const l = chooseLayout(mk(16, 12));
  assert.equal(l.mode, 'tables-p2');
  assert.ok(l.p2ChartH >= 200 && l.p2ChartH < 290);
});

test('USD rate: dollars in the USD table only when a rate is entered', async () => {
  const { usdRate } = await import('../js/render.js');
  assert.equal(usdRate({ meta: { usdRate: 3.647 } }), 3.647);
  assert.equal(usdRate({ meta: { usdRate: null } }), null);
  assert.equal(usdRate({ meta: { usdRate: 0 } }), null);
  assert.equal(usdRate({ meta: {} }), null);
});

test('firstNameFirst: PDF "surname first" → "first surname"', async () => {
  const { firstNameFirst } = await import('../js/model.js');
  assert.equal(firstNameFirst('כהן ישראל'), 'ישראל כהן');
  assert.equal(firstNameFirst('בן דוד יוסי'), 'יוסי בן דוד');
  assert.equal(firstNameFirst('כהן'), 'כהן');
  assert.equal(firstNameFirst(null), '');
});

test('YTD: taken from the PDF returns tables into managers and totals, checked against 12M in December', () => {
  const raw = {
    meta: { reportDate: '31/12/2024' }, pageCount: 16,
    managers: { page: 3, total: { value: 300 }, rows: [{ label: 'מנהל א', value: 200, pct: 66.67, page: 3 }, { label: 'קרן ב', value: 100, pct: 33.33, page: 3 }] },
    retILS: parseReturns({ page: 13, rows: [row('מנהל א', '5.00%', '5.00%', '9.00%'), row('סה"כ', '5.00%', '5.00%', '9.00%')] }),
    retUSD: parseReturns({ page: 14, rows: [row('קרן ב', '7.10%', '7.10%', '12.00%'), row('סה"כ', '7.10%', '7.10%', '12.00%')] }),
  };
  const m = buildModel(raw, {});
  assert.deepEqual(m.managers.map(x => [x.name, x.ytd, x.r12]), [['מנהל א', 5, 5], ['קרן ב', 7.1, 7.1]]);
  assert.equal(m.returns.ILS.totalYtd, 5);
  assert.equal(m.returns.USD.totalYtd, 7.1);
  assert.ok(m.checks.some(c => c.level === 'ok' && c.text.startsWith('תשואה מתחילת שנה נקראה')));
  // a December report whose YTD differs from 12M means the columns were misread
  raw.retILS = parseReturns({ page: 13, rows: [row('מנהל א', '3.00%', '5.00%', '9.00%')] });
  assert.ok(buildModel(raw, {}).checks.some(c => c.level === 'warn' && c.text.includes('סדר העמודות')));
});

test('p1Fill: small portfolios spread the spare height; a full page is left as is', async () => {
  const { chooseLayout, p1Fill } = await import('../js/render.js');
  const mk = (n, ils) => ({ managers: Array.from({ length: n }, (_, i) => ({ n: i + 1, currency: i < ils ? 'ILS' : 'USD', r12: 1 })) });
  const small = mk(6, 3), f = p1Fill(small, chooseLayout(small));
  assert.ok(f.donut > 72 && f.gap > 18, 'larger donuts and gaps');
  const full = mk(15, 9);
  assert.equal(p1Fill(full, chooseLayout(full)), null);
});
