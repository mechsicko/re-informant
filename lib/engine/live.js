/* =====================================================================
   re:informant LIVE — tables people play themselves
   One table = one plain JSON object. The same code runs the table in the
   browser (solo) and on the server (public and friends tables).
   Phases: lobby -> deal -> talk -> vote -> reveal -> night -> (talk ...) -> end -> over
   ===================================================================== */
(function (root) {
'use strict';
const B = typeof module !== 'undefined' ? require('./sim.js') : root.Brawl;
const Rt = typeof module !== 'undefined' ? require('./rat.js') : root.Rat;
const SEATS = 7, MAX_DAYS = 5, LEVEL = 10;     // everyone plays at level 10: these modes are just for fun
const T = { lobby: 30e3, deal: 6e3, talk1: 55e3, talk: 45e3, vote: 20e3, reveal: 6e3, night: 14e3, end: 25e3 };
const LINE_KIND = { accuse: 'accuse', saw: 'tipaccuse', clean: 'vouch', notme: 'defend', hmm: 'hmm' };
const LINE_W = { accuse: .55, tipaccuse: .65, vouch: -.45, defend: 0, deflect: .5, counter: .5, probe: 1.4, clear: -.6, share: .6 };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function rnd(st) {
  let a = st.r = (st.r + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const fail = msg => Object.assign(new Error(msg), { status: 400, expose: true });

/* ---------- seats ---------- */
function makeSeat(p, kind, key) {
  const real = Number.isInteger(p.token) && p.token > 0;
  const a = { id: key, name: p.name, look: real ? -1 : p.look, token: real ? p.token : undefined, px: real ? p.px : undefined, type: real ? p.type : undefined, style: real ? p.style : undefined };
  const f = Rt.buildPlayer(a, LEVEL);
  return { kind, pid: p.pid || null, name: f.name, look: f.look, token: f.token, px: real ? (p.px || null) : null, type: f.type, style: f.style,
    per: f.per, pers: f.pers, dec: f.dec, res: f.res, agg: f.agg, cha: f.cha, talk: f.talk,
    alive: true, probe: f.type === 'alien', wrap: f.type === 'mummy', back: f.type === 'zombie' };
}
function createTable({ id, mode, now, seed, host }) {
  return { v: 1, id, mode, host: host || null, phase: 'lobby', created: now, deadline: null, seats: [], rat: -1, day: 0,
    ev: [], seq: 0, votes: {}, said: {}, done: {}, silenced: {}, tip: {}, acc: {}, calls: [], firstCall: -1, nightPick: null,
    winner: null, sus: null, trust: null, bq: [], r: (seed | 0) || 1, lies: 0, updated: now };
}
function push(st, e, now) { e.seq = ++st.seq; e.t = now; st.ev.push(e); if (st.ev.length > 400) st.ev.splice(0, st.ev.length - 400); }
const humans = st => st.seats.filter(s => s.kind === 'human');
const alive = st => st.seats.map((s, i) => i).filter(i => st.seats[i].alive);
const aliveClean = st => alive(st).filter(i => i !== st.rat);

function join(st, p, now) {
  const had = st.seats.findIndex(s => s.kind === 'human' && s.pid === p.pid);
  if (had >= 0) return had;
  if (st.phase !== 'lobby') throw fail('That table already started.');
  if (st.seats.length >= SEATS) throw fail('That table is full.');
  st.seats.push(makeSeat(p, 'human', 'p' + st.seats.length + ':' + p.pid));
  if (st.mode === 'public' && st.deadline == null) st.deadline = now + T.lobby;
  push(st, { k: 'join', by: st.seats.length - 1 }, now);
  if (st.seats.length >= SEATS) start(st, now);
  st.updated = now;
  return st.seats.length - 1;
}
function leave(st, pid, now) {
  const i = st.seats.findIndex(s => s.kind === 'human' && s.pid === pid);
  if (i < 0) return;
  if (st.phase === 'lobby') { st.seats.splice(i, 1); push(st, { k: 'left' }, now); if (st.mode === 'public' && !humans(st).length) st.deadline = null; }
  else { st.seats[i].kind = 'bot'; st.seats[i].pid = null; push(st, { k: 'autopilot', by: i }, now); }   // its re:gen plays on by itself
  st.updated = now;
}
function start(st, now) {
  if (st.phase !== 'lobby') return;
  if (!humans(st).length) throw fail('Nobody is sitting down yet.');
  const used = new Set(st.seats.map(s => s.look)), seen = {};
  let k = 0;
  while (st.seats.length < SEATS) {
    let look; do look = Math.floor(rnd(st) * B.LOOKS.length); while (used.has(look) && used.size < B.LOOKS.length);
    used.add(look); seen[look] = (seen[look] || 0) + 1;
    st.seats.push(makeSeat({ look, name: B.LOOKS[look].name }, 'bot', 'bot' + (k++) + ':' + st.id + ':' + look));
  }
  const n = st.seats.length;
  st.rat = Math.floor(rnd(st) * n);
  st.sus = st.seats.map(() => new Array(n).fill(0));
  st.trust = st.seats.map(() => st.seats.map(s => s.type === 'celestial' ? 1.3 : 1));
  st.phase = 'deal'; st.deadline = now + T.deal;
  push(st, { k: 'deal', n }, now);
  st.seats.forEach((s, i) => { if (s.kind === 'human') push(st, { k: 'role', to: i, rat: i === st.rat }, now); });
}

/* ---------- the table's mood (what the bots think, on average) ---------- */
function heat(st) {
  const ls = aliveClean(st).filter(i => st.seats[i].kind === 'bot');
  return st.seats.map((s, q) => {
    if (!s.alive || !st.sus) return 0;
    const xs = ls.filter(l => l !== q);
    return xs.length ? Math.round(xs.reduce((a, l) => a + st.sus[l][q], 0) / xs.length * 100) / 100 : 0;
  });
}

/* ---------- someone says something; every clean bot weighs it ---------- */
function listen(st, A, kind, Tg, now) {
  const w = LINE_W[kind] ?? 0, S = st.seats, a = S[A];
  const noticed = [];
  const lying = A === st.rat && Tg !== st.rat && ['accuse', 'tipaccuse', 'deflect', 'probe', 'counter'].includes(kind);
  if (lying) st.lies++;
  let pers = a.pers * (a.type === 'gold' ? 1.4 : 1) * (a.type === 'ape' && w > 0 ? 1.6 : 1);
  if (A === st.rat) pers = Math.max(pers, a.dec * 1.15);
  for (const L of alive(st)) {
    if (L === A || L === st.rat || S[L].kind !== 'bot') continue;
    const l = S[L];
    if (lying && rnd(st) < clamp((l.per - a.dec) * .5 + .03, .01, .4)) { st.sus[L][A] += 1.2; st.trust[L][A] *= .8; noticed.push(L); }
    if (kind === 'defend') { st.sus[L][A] -= .35 * pers * st.trust[L][A] * (1 - .5 * l.res); continue; }
    if (L === Tg) { if (w > 0) { st.sus[L][A] += .4; st.trust[L][A] *= .88; st.acc[L] = A; } continue; }
    if (w > 0 && st.sus[L][A] > st.sus[L][Tg] + 1) { st.sus[L][A] += .2; continue; }
    const resist = Math.max(.1, 1 - .55 * l.res * (l.type === 'rebot' ? 1.4 : 1));
    st.sus[L][Tg] += w * pers * st.trust[L][A] * resist * (S[Tg].type === 'bones' && w > 0 ? .7 : 1);
  }
  if (w > 0) { st.calls.push([A, Tg]); if (Tg === st.rat && st.firstCall < 0 && A !== st.rat) st.firstCall = A; }
  push(st, { k: 'say', by: A, kind, on: Tg, noticed, heat: heat(st) }, now);
}
function argmax(arr, f) { let b = -1, bv = -1e9; for (const x of arr) { const v = f(x); if (v > bv) { bv = v; b = x; } } return b; }

function botSpeak(st, i, now) {
  const S = st.seats, p = S[i];
  if (!p.alive || st.silenced[i] || st.phase !== 'talk') return;
  const others = alive(st).filter(q => q !== i);
  if (!others.length) return;
  if (i !== st.rat) {
    const sus = st.sus[i];
    if (p.probe) {
      const t = argmax(others, q => sus[q]);
      const right = rnd(st) < .75, dirty = right ? t === st.rat : t !== st.rat;
      sus[t] += dirty ? 3 : -1.5; p.probe = false;
      return listen(st, i, dirty ? 'probe' : 'clear', t, now);
    }
    const t = argmax(others, q => sus[q]);
    if (p.wrap && sus[t] > 1.2) { p.wrap = false; st.silenced[t] = true; return push(st, { k: 'wrap', by: i, on: t, heat: heat(st) }, now); }
    if (st.acc[i] != null && S[st.acc[i]].alive && rnd(st) < .6) {
      const ac = st.acc[i]; delete st.acc[i];
      return sus[ac] > 1 ? listen(st, i, 'counter', ac, now) : listen(st, i, 'defend', i, now);
    }
    const bar = .9 - p.agg * .6;
    if (sus[t] > bar) return listen(st, i, st.tip[i] === t ? 'tipaccuse' : 'accuse', t, now);
    if (st.tip[i] != null && S[st.tip[i]].alive) { const tp = st.tip[i]; delete st.tip[i]; return listen(st, i, 'share', tp, now); }
    const cl = argmax(others, q => -sus[q]);
    if (sus[cl] < -.3 && rnd(st) < .6) return listen(st, i, 'vouch', cl, now);
    return push(st, { k: 'say', by: i, kind: 'hmm', on: -1, noticed: [], heat: heat(st) }, now);
  }
  // a bot rat steers the table toward someone clean
  const inn = others.filter(q => q !== st.rat), h = heat(st);
  if (!inn.length) return;
  const threat = argmax(inn, q => (S[q].kind === 'bot' ? st.sus[q][i] : 0) + S[q].per * .5 + st.calls.filter(c => c[0] === q && c[1] === i).length * .8);
  const goat = argmax(inn, q => h[q] + (q === threat ? .3 : 0));
  if (p.wrap && threat >= 0) { p.wrap = false; st.silenced[threat] = true; return push(st, { k: 'wrap', by: i, on: threat, heat: h }, now); }
  if (st.acc[i] != null && S[st.acc[i]].alive) { const ac = st.acc[i]; delete st.acc[i]; return rnd(st) < .6 ? listen(st, i, rnd(st) < .5 ? 'tipaccuse' : 'deflect', ac, now) : listen(st, i, 'defend', i, now); }
  if (st.day === 1 && rnd(st) < .5) { if (rnd(st) < .5) return listen(st, i, 'vouch', argmax(inn, q => -h[q]), now); return push(st, { k: 'say', by: i, kind: 'hmm', on: -1, noticed: [], heat: h }, now); }
  if (rnd(st) < .45) return listen(st, i, 'tipaccuse', goat, now);
  if (rnd(st) < .2) return listen(st, i, 'vouch', argmax(inn, q => -h[q]), now);
  return listen(st, i, 'accuse', goat, now);
}

/* ---------- phases ---------- */
const talkLimit = (st, i) => 3 + (st.seats[i].style === 'HUSTLER' ? 1 : 0) + (st.seats[i].type === 'human' ? 1 : 0);
function beginDay(st, now) {
  st.day++; st.said = {}; st.done = {}; st.silenced = {}; st.votes = {}; st.acc = {};
  st.phase = 'talk';
  const len = st.day === 1 ? T.talk1 : T.talk;
  st.deadline = now + len;
  push(st, { k: 'day', d: st.day, alive: st.seats.map(s => s.alive), heat: heat(st) }, now);
  // tips: somebody saw something
  for (const i of aliveClean(st)) {
    const p = st.seats[i];
    let tips = rnd(st) < .32 ? 1 : 0; if (p.type === 'ghost') tips++;
    for (let k = 0; k < tips; k++) {
      const pool = aliveClean(st).filter(q => q !== i);
      const truth = rnd(st) < .12 + .38 * p.per || !pool.length;
      const on = truth ? st.rat : pool[Math.floor(rnd(st) * pool.length)];
      if (p.kind === 'bot') { st.sus[i][on] += .6 * (.4 + p.per); st.tip[i] = on; }
      else push(st, { k: 'tip', to: i, on }, now);
    }
  }
  // bots take their turns spread across the talk
  st.bq = [];
  for (const i of alive(st)) {
    if (st.seats[i].kind !== 'bot') continue;
    const n = st.seats[i].talk + (st.seats[i].type === 'human' ? 1 : 0);
    for (let k = 0; k < n; k++) st.bq.push({ at: now + 3500 + rnd(st) * (len - 9000), s: i });
  }
  st.bq.sort((a, b) => a.at - b.at);
}
function botVote(st, i, tally) {
  const others = alive(st).filter(q => q !== i);
  if (i === st.rat) { const h = heat(st); return argmax(others, q => tally[q] * .8 + h[q]); }
  const p = st.seats[i], sus = st.sus[i];
  const t = argmax(others, q => sus[q] + (p.style === 'TANK' ? 0 : .25 * tally[q]) + (rnd(st) - .5) * (.5 + p.cha * 2));
  if (sus[t] < .55 - p.cha * .5 && tally[t] < 2) return -1;
  return t;
}
function resolveVote(st, now) {
  const n = st.seats.length, tally = new Array(n).fill(0), votes = [];
  const wv = i => st.seats[i].type === 'demoness' ? 1.5 : 1;
  for (const i of alive(st)) if (st.seats[i].kind === 'human' && st.votes[i] != null) { const t = st.votes[i]; if (t >= 0 && st.seats[t].alive && t !== i) { tally[t] += wv(i); votes.push([i, t, wv(i)]); } else votes.push([i, -1, 0]); }
  const bots = alive(st).filter(i => st.seats[i].kind === 'bot');
  for (let k = bots.length - 1; k > 0; k--) { const j = Math.floor(rnd(st) * (k + 1)); [bots[k], bots[j]] = [bots[j], bots[k]]; }
  for (const i of bots) { const t = botVote(st, i, tally); if (t >= 0) { tally[t] += wv(i); votes.push([i, t, wv(i)]); } else votes.push([i, -1, 0]); }
  for (const i of alive(st)) if (st.seats[i].kind === 'human' && st.votes[i] == null) votes.push([i, -1, 0]);
  const max = Math.max(...tally), tops = tally.map((v, i) => v === max ? i : -1).filter(i => i >= 0);
  const cast = votes.reduce((a, v) => a + v[2], 0);
  const out = tops.length === 1 && max >= 2 && max > cast / 3 ? tops[0] : -1;
  push(st, { k: 'vote', votes, tally, out, wasRat: out >= 0 && out === st.rat, heat: heat(st) }, now);
  if (out >= 0) {
    st.seats[out].alive = false;
    if (out === st.rat) st.winner = 'town';
    else for (const L of aliveClean(st)) if (st.seats[L].kind === 'bot') for (const [by, on] of st.calls) if (on === out && by !== L) {
      const hit = st.seats[by].type === 'ape' ? .8 : .9; st.trust[L][by] *= st.seats[L].type === 'robot' ? hit * hit : hit;
    }
  }
  if (!st.winner && alive(st).length <= 3) st.winner = 'rat';
  st.phase = 'reveal'; st.deadline = now + T.reveal; st.bq = [];
}
function botNightPick(st) {
  return argmax(aliveClean(st), q => (st.seats[q].kind === 'bot' ? st.sus[q][st.rat] : 0) + st.seats[q].per * .5 + st.calls.filter(c => c[0] === q && c[1] === st.rat).length * .8 + rnd(st) * .3);
}
function beginNight(st, now) {
  st.phase = 'night'; st.deadline = now + T.night; st.nightPick = null;
  push(st, { k: 'lights' }, now);
}
function resolveNight(st, now) {
  let v = st.nightPick;
  if (v == null || !st.seats[v] || !st.seats[v].alive || v === st.rat) v = botNightPick(st);
  if (v >= 0) {
    const s = st.seats[v];
    if (s.back) { s.back = false; push(st, { k: 'night', on: v, back: true }, now); }
    else { s.alive = false; push(st, { k: 'night', on: v, back: false }, now); }
  }
  if (alive(st).length <= 3 || st.day >= MAX_DAYS) { st.winner = 'rat'; return end(st, now); }
  beginDay(st, now);
}
function end(st, now) {
  st.phase = 'end'; st.deadline = now + T.end; st.bq = [];
  push(st, { k: 'end', winner: st.winner, rat: st.rat, firstCall: st.firstCall, days: st.day }, now);
}
function advance(st, now) {
  switch (st.phase) {
    case 'lobby': if (humans(st).length) start(st, now); else st.deadline = null; break;
    case 'deal': beginDay(st, now); break;
    case 'talk': st.phase = 'vote'; st.deadline = now + T.vote; st.votes = {}; st.bq = []; push(st, { k: 'callvote' }, now); break;
    case 'vote': resolveVote(st, now); break;
    case 'reveal': if (st.winner) end(st, now); else beginNight(st, now); break;
    case 'night': resolveNight(st, now); break;
    case 'end': st.phase = 'over'; st.deadline = null; break;
  }
}
// move the table forward to `now`; returns true if anything changed
function tick(st, now) {
  let changed = false;
  for (let guard = 0; guard < 60; guard++) {
    if (st.phase === 'talk' && st.bq.length && st.bq[0].at <= now && st.bq[0].at <= st.deadline) { const b = st.bq.shift(); botSpeak(st, b.s, b.at); changed = true; continue; }
    if (st.deadline != null && now >= st.deadline) { advance(st, Math.max(st.deadline, now - 50)); changed = true; continue; }
    break;
  }
  if (changed) st.updated = now;
  return changed;
}
const needsTick = (st, now) => (st.deadline != null && now >= st.deadline) || (st.phase === 'talk' && st.bq.length > 0 && st.bq[0].at <= now);

/* ---------- what a player does ---------- */
function act(st, seat, a, now) {
  const s = st.seats[seat];
  if (!s || s.kind !== 'human') throw fail("That's not your seat.");
  if (a.type === 'start') {
    if (st.phase !== 'lobby') throw fail('Already started.');
    if (st.mode === 'friends' && st.host != null && st.host !== s.pid) throw fail('Only the host can start the table.');
    start(st, now); return;
  }
  if (!s.alive) throw fail("You're out. You can still watch.");
  const target = Number.isInteger(a.on) ? a.on : -1;
  const valid = t => t >= 0 && t < st.seats.length && st.seats[t].alive && t !== seat;
  if (a.type === 'say') {
    if (st.phase !== 'talk') throw fail('Talk is over for today.');
    if (st.silenced[seat]) throw fail("You're wrapped up. No talking today.");
    const kind = LINE_KIND[a.line];
    if (!kind) throw fail('Pick a line.');
    if ((st.said[seat] || 0) >= talkLimit(st, seat)) throw fail("You've said your piece today.");
    if (['accuse', 'tipaccuse', 'vouch'].includes(kind) && !valid(target)) throw fail('Pick someone at the table.');
    st.said[seat] = (st.said[seat] || 0) + 1;
    if (kind === 'hmm') push(st, { k: 'say', by: seat, kind: 'hmm', on: -1, noticed: [], heat: heat(st) }, now);
    else listen(st, seat, kind, kind === 'defend' ? seat : target, now);
    return;
  }
  if (a.type === 'probe') {
    if (st.phase !== 'talk' || !s.probe) throw fail("You can't probe right now.");
    if (!valid(target)) throw fail('Pick someone at the table.');
    s.probe = false;
    const right = rnd(st) < .75, dirty = right ? target === st.rat : target !== st.rat;
    push(st, { k: 'probe', to: seat, on: target, dirty }, now);
    return;
  }
  if (a.type === 'wrap') {
    if (st.phase !== 'talk' || !s.wrap) throw fail("You can't wrap anyone right now.");
    if (!valid(target)) throw fail('Pick someone at the table.');
    s.wrap = false; st.silenced[target] = true;
    push(st, { k: 'wrap', by: seat, on: target, heat: heat(st) }, now);
    return;
  }
  if (a.type === 'done') {
    if (st.phase !== 'talk') return;
    st.done[seat] = true;
    if (alive(st).filter(i => st.seats[i].kind === 'human').every(i => st.done[i])) st.deadline = Math.min(st.deadline, now + 1500);
    return;
  }
  if (a.type === 'vote') {
    if (st.phase !== 'vote') throw fail("It's not time to vote.");
    if (target !== -1 && !valid(target)) throw fail('Pick someone at the table, or no vote.');
    st.votes[seat] = target;
    if (alive(st).filter(i => st.seats[i].kind === 'human').every(i => st.votes[i] != null)) st.deadline = Math.min(st.deadline, now + 1200);
    return;
  }
  if (a.type === 'kill') {
    if (st.phase !== 'night' || seat !== st.rat) throw fail('Only the rat works at night.');
    if (!valid(target)) throw fail('Pick someone at the table.');
    st.nightPick = target; st.deadline = Math.min(st.deadline, now + 1500);
    return;
  }
  throw fail('Unknown move.');
}

/* ---------- what one player is allowed to see ---------- */
function view(st, seat, since = 0, now = Date.now()) {
  const over = st.phase === 'end' || st.phase === 'over';
  const me = st.seats[seat];
  return {
    id: st.id, mode: st.mode, phase: st.phase, deadline: st.deadline, now, day: st.day, host: st.host, you: seat,
    isHost: !!(me && st.host && me.pid === st.host),
    role: st.rat >= 0 && seat >= 0 ? (seat === st.rat ? 'rat' : 'clean') : null,
    rat: over || seat === st.rat ? st.rat : -1, winner: over ? st.winner : null,
    seats: st.seats.map((s, i) => ({ name: s.name, look: s.look, token: s.token || null, px: s.px, type: s.type, style: s.style, kind: s.kind, alive: s.alive, you: i === seat })),
    ev: st.ev.filter(e => e.seq > since && (e.to == null || e.to === seat)),
    seq: st.seq,
    said: st.said[seat] || 0, maxSay: me ? talkLimit(st, seat) : 0, silenced: !!st.silenced[seat], done: !!st.done[seat],
    myVote: st.votes[seat] ?? null, votedCount: Object.keys(st.votes).length,
    knack: me ? { probe: !!me.probe && me.alive, wrap: !!me.wrap && me.alive } : {},
    nightPick: seat === st.rat ? st.nightPick : null,
  };
}

const api = { SEATS, T, createTable, join, leave, start, act, tick, needsTick, view, talkLimit, LINE_KIND };
if (typeof module !== 'undefined') module.exports = api; else root.Live = api;
})(this);
