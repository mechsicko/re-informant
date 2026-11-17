// Live tables (public and friends). The table lives in the database as one JSON object.
// Every request moves it forward in time first, so no server needs to stay awake.
import { createRequire } from 'module';
import { store } from './store.js';
import { seal, unseal } from './auth.js';
import { holdings } from './holdings.js';
import { fail } from './http.js';
import { checkName } from './bosses.js';

const require = createRequire(import.meta.url);
const L = require('./engine/live.js');
const TTL = 3 * 3600;                         // tables vanish 3 hours after the last move
const KEY = id => 'inf:t:' + id, LOCK = id => 'inf:lock:' + id, PUB = 'inf:public';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => CODE[b % CODE.length]).join('');
const cleanName = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 .'\-#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
const validPx = px => px && typeof px === 'object' && typeof px.p === 'string' && px.p.length <= 600
  && /^~?[0-9a-f]{6}(,~?[0-9a-f]{6})*$/.test(px.p) && typeof px.d === 'string' && /^[.0-9a-zA-Z]{324}$/.test(px.d);

async function load(db, id) { const v = await db.get(KEY(id)); return v ? JSON.parse(v) : null; }
const save = (db, st) => db.set(KEY(st.id), JSON.stringify(st), { ex: TTL });
async function locked(db, id, fn) {
  for (let i = 0; i < 30; i++) {
    if (await db.set(LOCK(id), '1', { nx: true, px: 5000 })) {
      try { return await fn(); } finally { await db.del(LOCK(id)); }
    }
    await sleep(60 + Math.random() * 90);
  }
  throw fail(503, 'The table is busy. Try again.');
}
// who is sitting down: a sample re:gen, or one the signed-in wallet really holds
async function who(cfg, input, address) {
  const pid = String(input.pid || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
  if (pid.length < 8) throw fail(400, 'Missing player id.');
  const p = { pid, name: cleanName(input.name) };
  const token = Number(input.token);
  if (Number.isInteger(token) && token > 0) {
    if (!address) throw fail(401, 'Sign in with your wallet to play your own re:gen.');
    const it = (await holdings(address, cfg)).find(x => x.id === token);
    if (!it) throw fail(403, "That re:gen isn't in your wallet or your stakes.");
    Object.assign(p, { token, type: it.type, style: it.style, px: validPx(input.px) ? input.px : null });
    if (!p.name) p.name = '#' + token;
  } else {
    const look = Number(input.look);
    if (!Number.isInteger(look) || look < 0 || look > 29) throw fail(400, 'Pick a re:gen.');
    p.look = look;
  }
  if (!p.name) p.name = 'GUEST';
  checkName(p.name, p.token);      // family bosses' names are reserved for their holders
  return p;
}
const ticket = (cfg, id, seat, pid) => seal({ t: id, s: seat, p: pid, exp: Date.now() + 6 * 3600e3 }, cfg.secret);
async function fromTicket(cfg, k) {
  const t = await unseal(k, cfg.secret);
  if (!t || typeof t.t !== 'string') throw fail(401, 'That seat expired. Join again.');
  return t;
}

export async function quickJoin(cfg, input, address) {
  const db = store(cfg), p = await who(cfg, input, address), now = Date.now();
  return locked(db, 'public', async () => {
    let id = await db.get(PUB), st = id ? await load(db, id) : null;
    if (st) L.tick(st, now);
    if (!st || st.phase !== 'lobby' || st.seats.length >= L.SEATS) {
      id = newCode();
      st = L.createTable({ id, mode: 'public', now, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
    }
    return locked(db, id, async () => {
      const fresh = (await load(db, id)) || st;
      L.tick(fresh, now);
      const seat = L.join(fresh, p, now);
      await save(db, fresh);
      if (fresh.phase === 'lobby') await db.set(PUB, id, { ex: 600 }); else await db.del(PUB);
      return { id, k: await ticket(cfg, id, seat, p.pid), view: L.view(fresh, seat, 0, now) };
    });
  });
}
export async function createFriends(cfg, input, address) {
  const db = store(cfg), p = await who(cfg, input, address), now = Date.now();
  let id; for (let i = 0; i < 5; i++) { id = newCode(); if (!(await db.get(KEY(id)))) break; }
  const st = L.createTable({ id, mode: 'friends', now, seed: crypto.getRandomValues(new Uint32Array(1))[0], host: p.pid });
  const seat = L.join(st, p, now);
  await save(db, st);
  return { id, k: await ticket(cfg, id, seat, p.pid), view: L.view(st, seat, 0, now) };
}
export async function joinFriends(cfg, input, address) {
  const db = store(cfg), p = await who(cfg, input, address), now = Date.now();
  const id = String(input.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!(await db.get(KEY(id)))) throw fail(404, 'No table with that code. Check it and try again.');
  return locked(db, id, async () => {
    const st = await load(db, id);
    L.tick(st, now);
    const seat = L.join(st, p, now);
    await save(db, st);
    return { id, k: await ticket(cfg, id, seat, p.pid), view: L.view(st, seat, 0, now) };
  });
}
export async function move(cfg, k, action) {
  const t = await fromTicket(cfg, k), db = store(cfg), now = Date.now();
  return locked(db, t.t, async () => {
    const st = await load(db, t.t);
    if (!st) throw fail(404, 'That table is gone.');
    L.tick(st, now);
    if (action.type === 'leave') L.leave(st, t.p, now); else L.act(st, t.s, action, now);
    await save(db, st);
    return L.view(st, t.s, Number(action.since) || 0, now);
  });
}
export async function poll(cfg, k, since) {
  const t = await fromTicket(cfg, k), db = store(cfg), now = Date.now();
  let st = await load(db, t.t);
  if (!st) throw fail(404, 'That table is gone.');
  if (L.needsTick(st, now)) {
    st = await locked(db, t.t, async () => { const s = await load(db, t.t); if (L.tick(s, now)) await save(db, s); return s; });
  }
  return L.view(st, t.s, since, now);
}
