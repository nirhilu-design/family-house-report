// Defaults that do not exist in the source PDF. Edited in the UI; saved per browser.

export const LIQUIDITY = {
  month: { label: 'עד חודש', color: '#CFCFD1', text: '#2A2B2D' },
  year: { label: 'עד שנה', color: '#B08D35', text: '#FFFFFF' },
  locked: { label: 'מעל שנה', color: '#2E2F31', text: '#FFFFFF' },
};

export const CHANNELS = {
  pm: { label: 'ניהול תיקים', short: 'ניהול תיקים' },
  alt: { label: 'אלטרנטיב, פוליסות ובנקים זרים', short: 'אלטרנטיב' },
  adv: { label: 'מיועץ', short: 'מיועץ' },
};

// Provisional liquidity classification by instrument type — NOT confirmed by the client.
// Keys are manager names; matching ignores quotes, spaces and dashes.
export const DEFAULT_LIQUIDITY = {
  'מור ניהול תיקים': 'month',
  'כספא ניהול תיקים': 'month',
  'פרופאונד ניהול תיקים': 'month',
  'מיועץ פועלים': 'month',
  'ניהול תיקים UBP': 'month',
  'פוליסה פיננסית': 'month',
  'קומריט': 'year',
  'נוקד אופורטיוניטי': 'year',
  'דאטאקום (IBI)': 'year',
  'אלפא ערך': 'year',
  'קרן אלפא הזדמנויות': 'year',
  'סטארלייט': 'locked',
  'הפניקס חוב נדל"ן שקלי': 'locked',
  'הפניקס חוב נדל"ן דולרי': 'locked',
  'מור קו - אינבסט': 'locked',
};

export const DEFAULT_DISCLAIMER =
  'חשוב לציין, כי הדו"ח אינו ערוך במתכונת הקבועה בתקנות, וכי אינו מחליף את הדו"ח אשר יישלח אליך על פי הדין על ידי בתי ההשקעות. כל הנתונים נכונים ליום הדיווח המפורט בדו"ח זה; שינויים עשויים לחול לאחר מועד זה. בכל מקרה של סתירה ו/או אי התאמה בין הנתונים בדו"ח זה לבין הנתונים המוצגים במערכת, יקבעו הנתונים המופיעים במערכות הבנק. בתודה, JP Group';

// Colour standard: darker = larger share. 3-stop ramp charcoal → logo gold → pale gold.
const STOPS = [[0, [0x2e, 0x2f, 0x31]], [0.4, [0xb0, 0x8d, 0x35]], [1, [0xf2, 0xe8, 0xc9]]];
export function ramp(i, n) {
  const t = n <= 1 ? 0 : i / (n - 1);
  for (let k = 0; k < STOPS.length - 1; k++) {
    const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return '#' + c0.map((c, j) => Math.round(c + (c1[j] - c) * u).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
  }
  return '#F2E8C9';
}
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const textOn = hex => (luminance(hex) < 0.2 ? '#FFFFFF' : '#2A2B2D');
