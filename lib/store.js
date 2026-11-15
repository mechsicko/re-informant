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
  async get(k) { const e = mem.get('s:' + k); if (!e) return null; if (e.exp && e.exp < Date.now()) { mem.delete('s:' + k); return null; } return e.v; },
  async set(k, v, o = {}) {
    const cur = await this.get(k);
    if (o.nx && cur != null) return null;
    mem.set('s:' + k, { v, exp: o.px ? Date.now() + o.px : o.ex ? Date.now() + o.ex * 1000 : 0 }); return 'OK';
  },
  async del(k) { mem.delete('s:' + k); },
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
    get: k => call('GET', k),
    set: (k, v, o = {}) => call('SET', k, v, ...(o.nx ? ['NX'] : []), ...(o.px ? ['PX', o.px] : o.ex ? ['EX', o.ex] : [])),
    del: k => call('DEL', k),
  };
}
export const store = cfg => cfg.redisUrl && cfg.redisToken ? upstash(cfg.redisUrl, cfg.redisToken) : memStore;
export function resetMemory() { mem.clear(); }
