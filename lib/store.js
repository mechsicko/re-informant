// Tiny key-value store: Upstash Redis over REST (free tier works; Vercel's KV is the same thing),
// or memory when no database is configured (fine for local testing, not for a live site).
import { fail } from './http.js';

const mem = new Map();
const memStore = {
  kind: 'memory',
  async hgetall(k) { return Object.fromEntries(mem.get(k) || []); },
  async hget(k, f) { return (mem.get(k) || new Map()).get(f) ?? null; },
  async hset(k, f, v) { if (!mem.has(k)) mem.set(k, new Map()); mem.get(k).set(f, v); },
  async hsetnx(k, f, v) { if (!mem.has(k)) mem.set(k, new Map()); const m = mem.get(k); if (m.has(f)) return 0; m.set(f, v); return 1; },
  async hdel(k, f) { (mem.get(k) || new Map()).delete(f); },
};
function upstash(url, token) {
  const call = async (...cmd) => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) throw fail(502, "Couldn't reach the roster database.");
    const j = await r.json();
    if (j.error) throw fail(502, 'Roster database error.');
    return j.result;
  };
  return {
    kind: 'upstash',
    async hgetall(k) { const a = await call('HGETALL', k) || []; const o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o; },
    hget: (k, f) => call('HGET', k, f),
    hset: (k, f, v) => call('HSET', k, f, v),
    hsetnx: (k, f, v) => call('HSETNX', k, f, v),
    hdel: (k, f) => call('HDEL', k, f),
  };
}
export const store = cfg => cfg.redisUrl && cfg.redisToken ? upstash(cfg.redisUrl, cfg.redisToken) : memStore;
export function resetMemory() { mem.clear(); }
