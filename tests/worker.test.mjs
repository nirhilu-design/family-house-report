// Worker API tests: in-memory KV, real RS256 JWTs signed with a throwaway key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi, managerKey } from '../worker/index.js';
import { key } from '../js/extract.js';

function memKV() { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function setupAccess() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256' };
  const sign = async (payload) => {
    const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), p = b64url(JSON.stringify(payload));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${b64url(sig)}`;
  };
  const fetchImpl = async () => new Response(JSON.stringify({ keys: [jwk] }));
  return { sign, fetchImpl };
}
const env = (extra = {}) => ({ LIQUIDITY: memKV(), ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud-123', ...extra });
const req = (method, body, headers = {}, q = '') => new Request(`https://x.workers.dev/api/liquidity${q}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });

test('worker key matches client key normalisation', () => {
  for (const n of ['מור קו - אינבסט', 'הפניקס חוב נדל"ן שקלי', "סה''כ", 'דאטאקום (IBI)']) assert.equal(managerKey(n), key(n));
});

test('read is open, write without Access is refused', async () => {
  const e = env();
  const r = await handleApi(req('GET'), e);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).canWrite, false);
  const w = await handleApi(req('PUT', { name: 'מנהל א', liquidity: 'year' }), e);
  assert.equal(w.status, 403);
});

test('valid Access JWT can upsert and delete; bad aud / expired are refused', async () => {
  const { sign, fetchImpl } = await setupAccess();
  const e = env();
  const now = Math.floor(Date.now() / 1000);
  const good = await sign({ aud: ['aud-123'], email: 'nir@zviran.co.il', exp: now + 600 });
  let r = await handleApi(req('PUT', { name: 'מנהל א', liquidity: 'locked' }, { 'Cf-Access-Jwt-Assertion': good }), e, fetchImpl);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entry.updatedBy, 'nir@zviran.co.il');
  r = await handleApi(req('GET', null, { 'Cf-Access-Jwt-Assertion': good }), e, fetchImpl);
  const t = await r.json();
  assert.equal(t.canWrite, true);
  assert.equal(t.entries[body.key].liquidity, 'locked');

  const badAud = await sign({ aud: ['other'], email: 'x@y', exp: now + 600 });
  assert.equal((await handleApi(req('PUT', { name: 'ב', liquidity: 'year' }, { 'Cf-Access-Jwt-Assertion': badAud }), e, fetchImpl)).status, 403);
  const expired = await sign({ aud: ['aud-123'], email: 'x@y', exp: now - 10 });
  assert.equal((await handleApi(req('PUT', { name: 'ב', liquidity: 'year' }, { 'Cf-Access-Jwt-Assertion': expired }), e, fetchImpl)).status, 403);
  const forged = good.slice(0, -4) + 'AAAA';
  assert.equal((await handleApi(req('PUT', { name: 'ב', liquidity: 'year' }, { 'Cf-Access-Jwt-Assertion': forged }), e, fetchImpl)).status, 403);

  r = await handleApi(req('DELETE', null, { 'Cf-Access-Jwt-Assertion': good }, `?key=${encodeURIComponent(body.key)}`), e, fetchImpl);
  assert.equal((await r.json()).deleted, true);
});

test('validation and dev mode', async () => {
  const e = env({ REQUIRE_ACCESS: 'false' });
  assert.equal((await handleApi(req('PUT', { name: 'א', liquidity: 'forever' }), e)).status, 400);
  assert.equal((await handleApi(req('PUT', { name: '  ', liquidity: 'year' }), e)).status, 400);
  assert.equal((await handleApi(req('PUT', { name: 'א', liquidity: 'month' }), e)).status, 200);
  const noKv = await handleApi(req('GET'), { REQUIRE_ACCESS: 'false' });
  assert.equal(noKv.status, 503);
});
