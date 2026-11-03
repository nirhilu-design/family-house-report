// Cloudflare Worker: serves the static app and a tiny shared "liquidity table" API.
// Stores ONLY manager name → liquidity class (+ who/when). Never client data.
//
//   GET    /api/liquidity          → { entries, canWrite, user, configured }
//   PUT    /api/liquidity          body { name, liquidity }   (upsert)
//   DELETE /api/liquidity?key=…    (remove one entry)
//
// Writes require a valid Cloudflare Access JWT (team domain + AUD from env vars),
// unless REQUIRE_ACCESS is "false" (local development only).

const KV_KEY = 'liquidity-table.v1';
const LIQ = new Set(['month', 'year', 'locked']);

export function managerKey(s) {
  return String(s ?? '')
    .replace(/''/g, '"').replace(/[״”“]/g, '"').replace(/[׳’]/g, "'")
    .replace(/["'\s\-–־]/g, '');
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// ---------- Cloudflare Access JWT verification (RS256) ----------
const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
let certCache = { at: 0, keys: [] };

async function accessKeys(env, fetchImpl) {
  if (Date.now() - certCache.at < 10 * 60 * 1000 && certCache.keys.length) return certCache.keys;
  const res = await fetchImpl(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const body = await res.json();
  certCache = { at: Date.now(), keys: body.keys || [] };
  return certCache.keys;
}

export async function verifyAccess(request, env, fetchImpl = fetch) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  const jwk = (await accessKeys(env, fetchImpl)).find(k => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return { email: payload.email || payload.sub || 'unknown' };
}

// ---------- storage ----------
async function readTable(env) {
  const raw = await env.LIQUIDITY.get(KV_KEY);
  return raw ? JSON.parse(raw) : { entries: {} };
}
async function writeTable(env, table) {
  await env.LIQUIDITY.put(KV_KEY, JSON.stringify(table));
}

export async function handleApi(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/liquidity') return json({ error: 'not found' }, 404);
  if (!env.LIQUIDITY) return json({ error: 'אחסון הטבלה לא הוגדר (KV binding LIQUIDITY חסר)', configured: false }, 503);

  const open = env.REQUIRE_ACCESS === 'false';
  const user = await verifyAccess(request, env, fetchImpl).catch(() => null);
  const canWrite = Boolean(user) || open;

  if (request.method === 'GET') {
    const t = await readTable(env);
    return json({ entries: t.entries, canWrite, user: user?.email || null, configured: true });
  }
  if (!canWrite) {
    return json({ error: 'עריכה מותרת רק למשתמש מזוהה דרך Cloudflare Access' }, 403);
  }
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'גוף בקשה לא תקין' }, 400); }
    const name = String(body?.name ?? '').trim().slice(0, 120);
    const liquidity = String(body?.liquidity ?? '');
    if (!name || !managerKey(name)) return json({ error: 'חסר שם מנהל' }, 400);
    if (!LIQ.has(liquidity)) return json({ error: 'סוג נזילות לא חוקי' }, 400);
    const t = await readTable(env);
    const k = managerKey(name);
    t.entries[k] = { name, liquidity, updatedAt: new Date().toISOString(), updatedBy: user?.email || 'dev' };
    await writeTable(env, t);
    return json({ key: k, entry: t.entries[k] });
  }
  if (request.method === 'DELETE') {
    const k = url.searchParams.get('key');
    if (!k) return json({ error: 'חסר מפתח' }, 400);
    const t = await readTable(env);
    const existed = Boolean(t.entries[k]);
    delete t.entries[k];
    await writeTable(env, t);
    return json({ deleted: existed });
  }
  return json({ error: 'method not allowed' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
