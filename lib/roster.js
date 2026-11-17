// The shared roster: who has sent which re:gen in. Every write goes through here,
// so ownership is checked on the server and toggle times come from the server clock.
import { store } from './store.js';
import { holdings } from './holdings.js';
import { fail } from './http.js';
import { checkName } from './bosses.js';

const AGENTS = 'informant:agents', SEASONS = 'informant:seasons';
const MAX_PER_WALLET = 3;
const cleanName = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 .'\-#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
const validPx = px => px && typeof px === 'object' && typeof px.p === 'string' && px.p.length <= 600
  && /^~?[0-9a-f]{6}(,~?[0-9a-f]{6})*$/.test(px.p) && typeof px.d === 'string' && /^[.0-9a-zA-Z]{324}$/.test(px.d);
const parse = v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } };
function pruneLog(log, now) {
  const cut = now - 21 * 864e5, keep = log.filter(e => e[0] >= cut), before = log.filter(e => e[0] < cut);
  return (before.length ? [before[before.length - 1]] : []).concat(keep).slice(-60);
}
const lastOn = a => { const l = a.log || []; return l.length ? !!l[l.length - 1][1] : false; };

export async function readRoster(cfg) {
  const db = store(cfg);
  const [agents, seasons] = await Promise.all([db.hgetall(AGENTS), db.hgetall(SEASONS)]);
  const out = { agents: {}, seasons: {} };
  for (const [addr, v] of Object.entries(agents)) { const list = parse(v); if (list.length) out.agents[addr] = list; }
  for (const [id, v] of Object.entries(seasons)) { try { out.seasons[id] = JSON.parse(v); } catch {} }
  return out;
}

export async function act(cfg, address, input) {
  const db = store(cfg), now = Date.now();
  const mine = parse(await db.hget(AGENTS, address));
  const save = list => (list.length ? db.hset(AGENTS, address, JSON.stringify(list)) : db.hdel(AGENTS, address));

  if (input.action === 'enroll') {
    const token = Number(input.token);
    if (!Number.isInteger(token) || token < 1 || token > 6666) throw fail(400, 'Pick one of your re:gens.');
    if (mine.length >= MAX_PER_WALLET) throw fail(400, `You can send in ${MAX_PER_WALLET} at a time.`);
    if (mine.some(a => a.token === token)) throw fail(400, 'That re:gen is already in.');
    const owned = await holdings(address, cfg, { fresh: true });
    const it = owned.find(x => x.id === token);
    if (!it) throw fail(403, "That re:gen isn't in your wallet or your stakes.");
    if (input.px && !validPx(input.px)) throw fail(400, 'Bad card art.');
    checkName(cleanName(input.name) || '#' + token, token);
    // if a previous holder still has it entered, it goes with the re:gen to its new owner
    const all = await db.hgetall(AGENTS);
    for (const [addr, v] of Object.entries(all)) {
      if (addr === address) continue;
      const list = parse(v); const kept = list.filter(a => a.token !== token);
      if (kept.length !== list.length) await (kept.length ? db.hset(AGENTS, addr, JSON.stringify(kept)) : db.hdel(AGENTS, addr));
    }
    // the fighter's id is the re:gen itself, so its XP and level stay with the re:gen, even through a sale
    const agent = { id: 'regen' + token, token, look: -1, type: it.type, style: it.style, name: cleanName(input.name) || '#' + token, px: input.px || null, log: [[now, 1]] };
    mine.push(agent); await save(mine);
    return mine;
  }
  const i = mine.findIndex(a => a.id === input.id);
  if (i < 0) throw fail(404, "That fighter isn't yours.");
  if (input.action === 'toggle') {
    const a = mine[i], on = !lastOn(a);
    if (on) {   // sending it back in: still yours?
      const owned = await holdings(address, cfg);
      if (!owned.some(x => x.id === a.token)) throw fail(403, "That re:gen isn't in your wallet or your stakes anymore.");
    }
    a.log = pruneLog([...(a.log || []), [now, on ? 1 : 0]], now);
    await save(mine); return mine;
  }
  if (input.action === 'retire') { mine.splice(i, 1); await save(mine); return mine; }
  throw fail(400, 'Unknown action.');
}

// first viewer after the last bell records the week; later writes are ignored
export async function settle(cfg, id, data) {
  if (!/^\d{4}-\d\d-\d\d$/.test(id || '')) throw fail(400, 'Bad week.');
  if (!data || typeof data !== 'object' || typeof data.xp !== 'object') throw fail(400, 'Bad record.');
  const xp = {};
  for (const [k, v] of Object.entries(data.xp).slice(0, 400)) if (/^[a-z0-9]{6,24}$/.test(k) && Number.isFinite(v)) xp[k] = Math.max(0, Math.min(5000, Math.round(v)));
  const booth = Array.isArray(data.booth) ? data.booth.filter(x => typeof x === 'string' && x.length <= 24).slice(0, 40) : [];
  const rec = { week: id, xp, booth, champ: typeof data.champ === 'string' ? data.champ.slice(0, 24) : null, fighters: Number(data.fighters) || 0, at: Date.now() };
  const wrote = await store(cfg).hsetnx(SEASONS, id, JSON.stringify(rec));
  return { wrote: !!wrote };
}
