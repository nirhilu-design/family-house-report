// Shared liquidity table client. Uses the Worker API when deployed on Cloudflare;
// falls back to this browser's localStorage when the API is not available (local dev).
import { DEFAULT_LIQUIDITY } from './config.js';
import { key } from './extract.js';

const LOCAL = 'fh.liquidityTable.v1';
const API = 'api/liquidity';

function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL) || '{}'); } catch { return {}; } }
function writeLocal(e) { try { localStorage.setItem(LOCAL, JSON.stringify(e)); } catch { /* storage blocked */ } }

/** @returns {Promise<{entries: Object, mode: 'shared'|'local', canWrite: boolean, user: string|null, error?: string}>} */
export async function loadTable() {
  try {
    const res = await fetch(API, { cache: 'no-store', headers: { accept: 'application/json' } });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = await res.json();
      if (res.ok) return { entries: body.entries || {}, mode: 'shared', canWrite: !!body.canWrite, user: body.user };
      if (body.configured === false) return { entries: readLocal(), mode: 'local', canWrite: true, user: null, error: body.error };
      return { entries: readLocal(), mode: 'local', canWrite: true, user: null, error: body.error || `שגיאה ${res.status}` };
    }
  } catch { /* no API (static server / offline) */ }
  return { entries: readLocal(), mode: 'local', canWrite: true, user: null };
}

export async function saveEntry(table, name, liquidity) {
  const k = key(name);
  if (table.mode === 'shared') {
    const res = await fetch(API, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, liquidity }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `שמירה נכשלה (${res.status})`);
    table.entries[body.key || k] = body.entry;
    return body.entry;
  }
  const entry = { name, liquidity, updatedAt: new Date().toISOString(), updatedBy: 'דפדפן זה' };
  table.entries[k] = entry; writeLocal(table.entries);
  return entry;
}

export async function deleteEntry(table, k) {
  if (table.mode === 'shared') {
    const res = await fetch(`${API}?key=${encodeURIComponent(k)}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `מחיקה נכשלה (${res.status})`);
  }
  delete table.entries[k];
  if (table.mode === 'local') writeLocal(table.entries);
}

/** Merge for display: confirmed table entries + provisional defaults from code. */
export function mergedRows(table) {
  const rows = new Map();
  for (const [name, liquidity] of Object.entries(DEFAULT_LIQUIDITY)) rows.set(key(name), { key: key(name), name, liquidity, status: 'default' });
  for (const [k, e] of Object.entries(table.entries)) rows.set(k, { key: k, ...e, status: 'confirmed' });
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** Shape expected by buildModel(raw, saved): { [managerKey]: { liquidity } } */
export function asOverrides(table) {
  return Object.fromEntries(Object.entries(table.entries).map(([k, e]) => [k, { liquidity: e.liquidity }]));
}

/**
 * For a manager not found by exact name: find a table entry (or provisional default) whose
 * normalised name contains, or is contained in, this one (e.g. "אלפא הזדמנויות" ↔ "קרן אלפא הזדמנויות").
 * Returns the single best candidate or null (ambiguous matches return null).
 */
export function findSimilar(table, name) {
  const k = key(name);
  if (k.length < 4) return null;
  const hits = mergedRows(table).filter(r => r.key !== k && r.liquidity && r.key.length >= 4 && (r.key.includes(k) || k.includes(r.key)));
  if (!hits.length) return null;
  const liqs = new Set(hits.map(h => h.liquidity));
  if (liqs.size > 1) return null; // conflicting candidates → let the user decide
  return hits.sort((a, b) => Math.abs(a.key.length - k.length) - Math.abs(b.key.length - k.length))[0];
}
