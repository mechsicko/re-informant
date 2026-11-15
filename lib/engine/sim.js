/* =====================================================================
   re:BRAWL — simulation engine
   Pure and deterministic: the same week, roster and career XP always
   produce the same fights, on every device. No server decides anything;
   every viewer computes the arena from the shared roster.
   ===================================================================== */
(function (root) {
'use strict';

/* ---------- clock ---------- */
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const ROUND_MS = HOUR;                     // a bell every hour
const WEEK_MS = 7 * DAY;
const EPOCH = Date.UTC(2026, 0, 5);        // Monday 5 Jan 2026, 00:00 UTC
const OPEN_MS = 147 * HOUR;                // Mon 00:00 UTC -> Sun 03:00 UTC (Saturday night in Brooklyn)
const ROUNDS = Math.round(OPEN_MS / ROUND_MS);   // 147 rounds a week
const REST_ROUNDS = 8;                     // 8 hours at the Anvil
const MAX_SEATS = 200;
const HOUSE_FLOOR = 24;                    // house regulars fill the room up to this many fighters
const MAX_TURNS = 12;
const TAPE_ROUNDS = 3;                     // the tape keeps the last 3 hours
const MAX_LEVEL = 150;

const weekIndex = t => Math.floor((t - EPOCH) / WEEK_MS);
const weekOpen = w => EPOCH + w * WEEK_MS;
const weekClose = w => weekOpen(w) + OPEN_MS;
const roundAt = (w, r) => weekOpen(w) + r * ROUND_MS;
const weekId = w => new Date(weekOpen(w)).toISOString().slice(0, 10);
const weekFromId = id => Math.round((Date.parse(id + 'T00:00:00Z') - EPOCH) / WEEK_MS);
// rounds that have rung by time t (0..ROUNDS)
function roundsRung(w, t) {
  if (t < weekOpen(w)) return 0;
  return Math.min(ROUNDS, Math.floor((t - weekOpen(w)) / ROUND_MS) + 1);
}

/* ---------- rng ---------- */
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/* ---------- the book: styles, types, looks, gear ---------- */
// style = how a re:gen fights; personality = how its re:CALL brain leans
const STYLES = {
  BRUISER:   { hp: 112, pow: 12.0, def: .05, spd: 4, luck: 4,  agg: .80, cau: .20, cun: .40, cha: .20, blurb: 'Walks forward. Swings heavy. Asks questions never.' },
  COUNTER:   { hp: 100, pow: 10.2, def: .06, spd: 6, luck: 5,  agg: .38, cau: .45, cun: .95, cha: .08, blurb: 'Watches your hands. Remembers everything.' },
  HUSTLER:   { hp: 100, pow: 11.2, def: .04, spd: 9, luck: 5,  agg: .65, cau: .35, cun: .60, cha: .22, blurb: 'Quick jabs, quicker feet. Wins on volume.' },
  TRICKSTER: { hp: 102, pow: 11.0, def: .05, spd: 8, luck: 8,  agg: .50, cau: .35, cun: .60, cha: .55, blurb: 'Leans on the special. Hard to read.' },
  TANK:      { hp: 114, pow: 9.6,  def: .08, spd: 3, luck: 4,  agg: .40, cau: .55, cun: .50, cha: .12, blurb: 'Takes the hit. Takes the next one too.' },
  GAMBLER:   { hp: 104, pow: 12.0, def: .03, spd: 5, luck: 11, agg: .60, cau: .15, cun: .30, cha: .70, blurb: 'Lets it ride. Big crits, bad nights.' },
};
// type = what a re:gen is made of (from the collection's Type trait); sets its special
const TYPES = {
  human:     { hp: 1.00, pow: 1.00, def: 0,   spd: 0,  sp: 'HUSTLE',       spBlurb: 'Two quick shots in one beat.' },
  robot:     { hp: 1.02, pow: 1.02, def: .02, spd: -1, sp: 'OVERCLOCK',    spBlurb: 'Big hit, then runs hot: +30% power for 2 turns.' },
  gold:      { hp: 1.00, pow: 1.00, def: .02, spd: 0,  sp: 'BLING',        spBlurb: 'Catches the light. Blinds the other side for 2 turns.' },
  bones:     { hp: .94,  pow: 1.02, def: 0,   spd: 2,  sp: 'RATTLE',       spBlurb: 'Shakes them so hard they lose their next turn.' },
  zombie:    { hp: 1.06, pow: 1.00, def: 0,   spd: -1, sp: 'BITE',         spBlurb: 'Heavy bite. Heals half of what it deals.' },
  ghost:     { hp: .92,  pow: 1.00, def: 0,   spd: 2,  sp: 'PHASE',        spBlurb: 'Nothing lands this turn. Next hit is a sure crit.' },
  'rebot':   { hp: 1.04, pow: .98,  def: .03, spd: 0,  sp: 're:BOOT',      spBlurb: 'Restores 25% health and halves damage this turn.' },
  alien:     { hp: .96,  pow: 1.00, def: 0,   spd: 1,  sp: 'PROBE',        spBlurb: 'Reads the next move and makes it crit.' },
  demoness:  { hp: .98,  pow: 1.02, def: 0,   spd: 1,  sp: 'HEX',          spBlurb: 'Curses them: -30% power for 3 turns.' },
  celestial: { hp: 1.04, pow: 1.02, def: .02, spd: 0,  sp: 'SMITE',        spBlurb: 'A heavy that no guard can stop.' },
  ape:       { hp: 1.06, pow: 1.04, def: 0,   spd: -1, sp: 'GROUND POUND', spBlurb: 'Breaks guard and drains 2 stamina.' },
  mummy:     { hp: 1.04, pow: 1.00, def: .02, spd: -1, sp: 'WRAP',         spBlurb: 'Wraps them up. Their special is locked for 3 turns.' },
};
const TYPE_LABEL = { human: 'human', robot: 'robot', gold: 'gold', bones: 'bones', zombie: 'zombie', ghost: 'ghost', rebot: 're:bot', alien: 'alien', demoness: 'demoness', celestial: 'celestial', ape: 'ape', mummy: 'mummy' };
// the 30 fighters you can send in — sprite i of REGENS
const LOOKS = [
  { name: 'GUMSHOE',  type: 'robot',     style: 'COUNTER'   },
  { name: 'VOIDKID',  type: 'alien',     style: 'TRICKSTER' },
  { name: 'RED RAG',  type: 'human',     style: 'HUSTLER'   },
  { name: 'SMILES',   type: 'human',     style: 'GAMBLER'   },
  { name: 'ORANGE',   type: 'human',     style: 'HUSTLER'   },
  { name: 'SMOKEY',   type: 'human',     style: 'TANK'      },
  { name: 'LASERS',   type: 'robot',     style: 'BRUISER'   },
  { name: 'PRISM',    type: 'human',     style: 'TRICKSTER' },
  { name: 'GOLDIE',   type: 'gold',      style: 'COUNTER'   },
  { name: 'THE SUIT', type: 'human',     style: 'COUNTER'   },
  { name: 'HAPPY',    type: 'human',     style: 'GAMBLER'   },
  { name: 'LIPPY',    type: 'human',     style: 'HUSTLER'   },
  { name: 'POPS',     type: 'human',     style: 'TANK'      },
  { name: 'GOGGLES',  type: 'human',     style: 'BRUISER'   },
  { name: 'JOE',      type: 'human',     style: 'TANK'      },
  { name: 'RATTLES',  type: 'bones',     style: 'TRICKSTER' },
  { name: 'PINKY',    type: 'human',     style: 'HUSTLER'   },
  { name: 'BREW',     type: 'zombie',    style: 'BRUISER'   },
  { name: 'BULLION',  type: 'gold',      style: 'GAMBLER'   },
  { name: 'SCARLET',  type: 'demoness',  style: 'TRICKSTER' },
  { name: 'DEACON',   type: 'human',     style: 'TANK'      },
  { name: 'BUBBLES',  type: 'human',     style: 'HUSTLER'   },
  { name: 'WIRE',     type: 'rebot',     style: 'COUNTER'   },
  { name: 'GIGGLES',  type: 'ghost',     style: 'GAMBLER'   },
  { name: 'MOGGS',    type: 'human',     style: 'COUNTER'   },
  { name: 'MOHAWK',   type: 'human',     style: 'BRUISER'   },
  { name: 'SAINT',    type: 'celestial', style: 'TANK'      },
  { name: 'ROT',      type: 'zombie',    style: 'GAMBLER'   },
  { name: 'BRUNO',    type: 'ape',       style: 'BRUISER'   },
  { name: 'SPIRAL',   type: 'alien',     style: 'TRICKSTER' },
];
// gear unlocks at level milestones — named after collection traits
const GEAR = [
  { lvl: 10,  name: 'GOLD STUD',   fx: 'crit +4%' },
  { lvl: 25,  name: 'LOCZ',        fx: 'dodge +4%' },
  { lvl: 50,  name: 'BULLETPROOF', fx: 'damage taken -6%' },
  { lvl: 75,  name: 'BIKER JACKET',fx: 'health +10%' },
  { lvl: 100, name: 'VVS CHAIN',   fx: 'power +8%' },
  { lvl: 125, name: 'WINGS',       fx: 'speed +3' },
  { lvl: 150, name: 'HALO',        fx: 'once a fight, gets back up at 20%' },
];
const MOVES = ['S', 'H', 'G', 'X'];        // strike, heavy, guard, special
const MOVE_NAME = { S: 'STRIKE', H: 'HEAVY', G: 'GUARD', X: 'SPECIAL', '-': 'RATTLED' };
const COST = { S: 1, H: 2, G: -2, X: 3 };
const ST_MAX = 6, ST_START = 4, SP_COOLDOWN = 4;

/* ---------- levels ---------- */
// level 1 -> 150 from career XP. XP = PX earned in settled weeks.
// ~450 PX in an average week: level 17 after week one, 150 takes a long year at the top
const XP_K = 1.6;
const xpForLevel = L => Math.round(XP_K * (L - 1) * (L - 1));
const levelFromXp = xp => Math.min(MAX_LEVEL, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / XP_K)));

/* ---------- build a fighter for a week ---------- */
// a fighter is either one of the 30 sample looks (a.look) or a real re:gen (a.token, a.style, a.type, a.px)
function fighterKind(a) {
  const look = Number.isInteger(a.look) && a.look >= 0 ? LOOKS[a.look] : null;
  const style = STYLES[a.style] ? a.style : look ? look.style : 'COUNTER';
  const type = TYPES[a.type] ? a.type : look ? look.type : 'human';
  return { look, style, type };
}
const validAgentShape = a => !!(a && a.id && ((Number.isInteger(a.look) && a.look >= 0 && a.look < LOOKS.length) ||
  (Number.isInteger(a.token) && a.token > 0 && STYLES[a.style] && TYPES[a.type])));
function buildFighter(a, level) {
  const kind = fighterKind(a);
  const st = STYLES[kind.style], ty = TYPES[kind.type];
  const R = rng(hash('dna:' + a.id));
  const j = (s = .08) => 1 - s + R() * 2 * s;
  const m = 1 + (level - 1) / (MAX_LEVEL - 1) * 0.28;      // level is a head start, not a guarantee
  const f = {
    id: a.id, name: a.name, look: kind.look ? a.look : -1, token: Number.isInteger(a.token) ? a.token : null, art: a.px || null,   // art = 18x18 pixels; px = points
    house: !!a.house, owner: a.owner || null, level,
    style: kind.style, type: kind.type,
    maxHp: st.hp * ty.hp * j() * m,
    pow: st.pow * ty.pow * j() * m,
    def: st.def + ty.def,
    spd: st.spd + ty.spd + R() * 2,
    luck: st.luck + R() * 2,
    agg: clamp(st.agg + (R() - .5) * .3), cau: clamp(st.cau + (R() - .5) * .3),
    cun: clamp(st.cun + (R() - .5) * .3), cha: clamp(st.cha + (R() - .5) * .3),
    halo: false, gear: [],
  };
  for (const g of GEAR) if (level >= g.lvl) f.gear.push(g.name);
  f.crit = .05 + f.luck * .006; f.dodge = .03 + f.spd * .005;
  if (level >= 10) f.crit += .04;
  if (level >= 25) f.dodge += .04;
  if (level >= 50) f.def += .06;
  if (level >= 75) f.maxHp *= 1.10;
  if (level >= 100) f.pow *= 1.08;
  if (level >= 125) f.spd += 3;
  if (level >= 150) f.halo = true;
  f.maxHp = Math.round(f.maxHp);
  // week state
  f.hp = f.maxHp; f.px = 0; f.w = 0; f.l = 0; f.ko = 0; f.kod = 0; f.falls = 0;
  f.rest = -1; f.seated = false; f.lastOp = null; f.history = []; f.mem = {}; f.streak = 0; f.bestStreak = 0;
  return f;
}

/* ---------- the re:CALL brain ---------- */
// guess what the other side will throw: style habits + this fight + every past fight with them
function predict(me, op, mc, oc) {
  const p = [.40, .26, .24, .10];
  const mem = me.mem[op.id];
  const k = me.cun;
  if (mem) for (let i = 0; i < 4; i++) p[i] += mem.c[i] * .35 * k;
  for (let i = 0; i < 4; i++) p[i] += mc.seen[i] * 1.0 * k;     // mc.seen = what they've thrown at me this fight
  // what can they actually do right now
  if (oc.st < COST.S) p[0] = 0;
  if (oc.st < COST.H) p[1] = 0;
  if (oc.st < COST.X || oc.cd > 0) p[3] = 0;
  if (oc.stun) return [0, 0, 0, 0];
  const s = p.reduce((a, b) => a + b, 0) || 1;
  return p.map(v => v / s);
}
// damage I deal (in units of my power) when I throw m and they throw o
// strike beats heavy (gets in first), heavy beats guard (breaks it), guard beats strike (parry + counter)
const DEAL = {
  S: { S: .8, H: 1.0, G: .15, X: .8, '-': .8 },
  H: { S: .4, H: 1.4, G: 1.4, X: 1.4, '-': 1.4 },
  G: { S: .5, H: 0, G: 0, X: 0, '-': 0 },
  X: { S: 1.2, H: 1.2, G: .7, X: 1.2, '-': 1.2 },
};
const DMG = 0.5;      // global damage scale
function choose(me, op, mc, oc, R) {
  if (mc.stun) return '-';
  const legal = MOVES.filter(m => m === 'G' || (mc.st >= COST[m] && !(m === 'X' && mc.cd > 0)));
  let p = predict(me, op, mc, oc);
  if (mc.probe) { // alien PROBE: knows the next move
    const sure = oc.plan || 'S'; p = [0, 0, 0, 0]; if (sure !== '-') p[MOVES.indexOf(sure)] = 1;
  }
  const hpMe = mc.hp / me.maxHp, hpOp = oc.hp / op.maxHp;
  const fear = .6 + me.cau * (1.4 - hpMe);                     // how much damage taken hurts
  const opPow = op.pow * (oc.hex > 0 ? .7 : 1), myPow = me.pow * (mc.oc > 0 ? 1.3 : 1) * (mc.hex > 0 ? .7 : 1);
  let best = 'G', bestV = -1e9;
  for (const m of legal) {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      if (!p[i]) continue;
      const o = MOVES[i];
      v += p[i] * (DEAL[m][o] * myPow - fear * DEAL[o][m] * opPow) * DMG;
    }
    if (oc.stun) v = DEAL[m]['-'] * myPow * DMG;
    // personality
    if (m === 'H') v += me.agg * 1.2 - (mc.st <= 2 ? 1.5 : 0);
    if (m === 'S') v += me.agg * 1.0;
    if (m === 'G') v += me.cau * (1 - hpMe) * 4 + (mc.st <= 1 ? 3 : 0) - me.agg * 1.5;
    if (m === 'X') v += 2.5 + me.cha * 2.5 + specialBonus(me, mc, oc, op, hpMe, hpOp);
    if (hpOp < .2 && m !== 'G') v += me.agg * 3;               // smells the finish
    v += (R() - .5) * (2 + me.cha * 14);                         // temperament
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}
function specialBonus(me, mc, oc, op, hpMe, hpOp) {
  switch (TYPES[me.type].sp) {
    case 're:BOOT': return hpMe < .45 ? 6 : -4;
    case 'BITE': return hpMe < .6 ? 3 : 0;
    case 'PHASE': return hpMe < .5 ? 2 : 0;
    case 'SMITE': return mc.seen[2] > 1 ? 3 : 1;
    case 'GROUND POUND': return mc.seen[2] > 0 ? 2.5 : 0;
    case 'RATTLE': return hpOp < .4 ? 2.5 : 1;
    default: return 0;
  }
}

/* ---------- one fight ---------- */
// returns { win: 0|1, ko, turns:[...] } and mutates fighters' hp/memory
function fight(A, B, R, keepTape) {
  const F = [A, B];
  const C = F.map(f => ({ hp: f.hp, st: ST_START, cd: 0, seen: [0, 0, 0, 0], stun: false, oc: 0, hex: 0, blind: 0, phase: false, sure: false, probe: false, halo: f.halo, plan: null, moves: [0, 0, 0, 0] }));
  const turns = keepTape ? [] : null;
  let ko = -1;
  for (let t = 0; t < MAX_TURNS && ko < 0; t++) {
    // both decide at once (PROBE peeks at the other's plan first)
    const plan = [null, null];
    for (const i of [0, 1]) if (!C[i].probe) plan[i] = choose(F[i], F[1 - i], C[i], C[1 - i], R);
    for (const i of [0, 1]) if (C[i].probe) { C[1 - i].plan = plan[1 - i]; plan[i] = choose(F[i], F[1 - i], C[i], C[1 - i], R); C[i].probe = false; }
    const ev = { m: plan.slice(), hits: [], fx: [] };
    // pay stamina, cooldowns
    for (const i of [0, 1]) {
      const m = plan[i], c = C[i];
      if (m === '-') { c.stun = false; continue; }
      c.st = clamp(c.st - COST[m], 0, ST_MAX);
      if (m === 'X') c.cd = SP_COOLDOWN + 1;
      c.moves[MOVES.indexOf(m)]++;
    }
    // specials that happen before the swing
    const pre = [false, false];
    for (const i of [0, 1]) {
      if (plan[i] !== 'X') continue;
      const sp = TYPES[F[i].type].sp, c = C[i];
      if (sp === 'PHASE') { c.phase = true; ev.fx.push([i, 'PHASE']); }
      if (sp === 're:BOOT') { const h = Math.round(F[i].maxHp * .25); c.hp = Math.min(F[i].maxHp, c.hp + h); c.boot = true; pre[i] = true; ev.fx.push([i, 'BOOT', h]); }
    }
    // order of swings: strikes first, then specials, then heavies; speed breaks ties
    const pri = m => m === 'S' ? 3 : m === 'X' ? 2 : m === 'H' ? 1 : 0;
    const order = [0, 1].filter(i => plan[i] !== 'G' && plan[i] !== '-' && !pre[i])
      .sort((a, b) => (pri(plan[b]) - pri(plan[a])) || (F[b].spd + R() * 3 - F[a].spd - R() * 3));
    for (const i of order) {
      if (C[i].hp <= 0) continue;
      const j = 1 - i, me = F[i], op = F[j], mc = C[i], oc = C[j], m = plan[i], o = plan[j];
      const sp = TYPES[me.type].sp;
      let pow = me.pow * (mc.oc > 0 ? 1.3 : 1) * (mc.hex > 0 ? .7 : 1);
      let shots = [];
      if (m === 'S') shots = [DEAL.S[o]];
      else if (m === 'H') shots = [DEAL.H[o]];          // a heavy that eats a strike first only lands at half
      else if (m === 'X') {
        if (sp === 'PHASE') shots = [o === 'G' ? .3 : .6];
        else if (sp === 'HUSTLE') shots = o === 'G' ? [.35, .35] : [.7, .7];
        else if (sp === 'OVERCLOCK') shots = [o === 'G' ? .6 : 1.2];
        else if (sp === 'BLING') shots = [o === 'G' ? .4 : .8];
        else if (sp === 'RATTLE') shots = [o === 'G' ? .4 : .8];
        else if (sp === 'BITE') shots = [o === 'G' ? .65 : 1.3];
        else if (sp === 'PROBE') shots = [o === 'G' ? .5 : 1.0];
        else if (sp === 'HEX') shots = [o === 'G' ? .6 : 1.2];
        else if (sp === 'SMITE') shots = [1.8];
        else if (sp === 'GROUND POUND') shots = [1.5];
        else if (sp === 'WRAP') shots = [o === 'G' ? .45 : .9];
      }
      let landed = false;
      for (const mult of shots) {
        if (oc.hp <= 0) break;
        const hit = { by: i, k: m, dmg: 0, crit: false, miss: false };
        let acc = .9 - op.dodge - (mc.blind > 0 ? .35 : 0);
        if (m === 'X' && (sp === 'SMITE' || sp === 'GROUND POUND')) acc += .08;
        if ((oc.phase && plan[j] === 'X') || R() > acc) { hit.miss = true; ev.hits.push(hit); continue; }
        let d = mult * pow * DMG * (.88 + R() * .24);
        const critCh = mc.sure ? 1 : me.crit;
        if (R() < critCh) { d *= 1.6; hit.crit = true; mc.sure = false; }
        d *= 1 - op.def;
        if (oc.boot) d *= .5;
        d = Math.max(1, Math.round(d));
        hit.dmg = d; oc.hp -= d; landed = true;
        if (m === 'X' && sp === 'BITE') { const h = Math.round(d * .5); mc.hp = Math.min(me.maxHp, mc.hp + h); hit.heal = h; }
        if (oc.hp <= 0 && oc.halo) { oc.halo = false; oc.hp = Math.round(op.maxHp * .2); ev.fx.push([j, 'HALO']); }
        ev.hits.push(hit);
      }
      if (m === 'H' && o === 'G') { oc.st = Math.max(0, oc.st - 1); ev.fx.push([j, 'BREAK']); }
      if (m === 'S' && o === 'G') ev.fx.push([j, 'PARRY']);
      if (m === 'X' && landed) {
        if (sp === 'OVERCLOCK') mc.oc = 3;
        if (sp === 'BLING') oc.blind = 3;
        if (sp === 'RATTLE') oc.stun = true;
        if (sp === 'HEX') oc.hex = 4;
        if (sp === 'GROUND POUND') oc.st = Math.max(0, oc.st - 2);
        if (sp === 'WRAP') oc.cd = Math.max(oc.cd, 4);
      }
      if (m === 'X' && sp === 'PROBE') { mc.probe = true; mc.sure = true; }
      if (m === 'X') ev.fx.push([i, sp]);
    }
    // a guard that eats a strike throws a counter
    for (const i of [0, 1]) {
      const j = 1 - i;
      if (plan[i] === 'G' && plan[j] === 'S' && C[i].hp > 0 && C[j].hp > 0) {
        const d = Math.max(1, Math.round(DEAL.G.S * F[i].pow * DMG * (1 - F[j].def)));
        C[j].hp -= d; ev.hits.push({ by: i, k: 'C', dmg: d, crit: false, miss: false });
        if (C[j].hp <= 0 && C[j].halo) { C[j].halo = false; C[j].hp = Math.round(F[j].maxHp * .2); ev.fx.push([j, 'HALO']); }
      }
    }
    // end of turn upkeep
    for (const i of [0, 1]) {
      const c = C[i];
      if (c.phase && plan[i] === 'X') { c.phase = false; c.sure = true; }
      c.boot = false;
      if (c.cd > 0) c.cd--; if (c.oc > 0) c.oc--; if (c.hex > 0) c.hex--; if (c.blind > 0) c.blind--;
      if (plan[1 - i] !== '-') C[i].seen[MOVES.indexOf(plan[1 - i])] += 1;
    }
    for (const i of [0, 1]) if (C[i].hp <= 0) { C[i].hp = 0; if (ko < 0) ko = i; }
    if (C[0].hp <= 0 && C[1].hp <= 0) ko = R() < .5 ? 0 : 1;   // double knockout: coin flip who hit the floor first
    if (turns) { ev.hp = [C[0].hp, C[1].hp]; ev.st = [C[0].st, C[1].st]; turns.push(ev); }
  }
  let win;
  if (ko >= 0) win = 1 - ko;
  else {
    const pa = C[0].hp / A.maxHp, pb = C[1].hp / B.maxHp;
    win = pa === pb ? (A.spd >= B.spd ? 0 : 1) : (pa > pb ? 0 : 1);
  }
  // the re:CALL: every fight gets written down
  for (const i of [0, 1]) {
    const me = F[i], op = F[1 - i];
    const mem = me.mem[op.id] || (me.mem[op.id] = { c: [0, 0, 0, 0], w: 0, l: 0 });
    for (let k = 0; k < 4; k++) mem.c[k] += C[1 - i].moves[k];
    if (win === i) mem.w++; else mem.l++;
    me.hp = Math.max(0, C[i].hp);
  }
  return { win, ko: ko >= 0, turns, moves: [C[0].moves, C[1].moves] };
}

/* ---------- the house: regular re:gens keep the room busy ---------- */
function houseFighters(w, n) {
  const R = rng(hash('house:' + w));
  const out = [], seen = {};
  // a shuffled deck of the 30 looks, so names rarely repeat
  const deck = LOOKS.map((_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  for (let i = 0; i < n; i++) {
    const look = deck[i % deck.length];
    seen[look] = (seen[look] || 0) + 1;
    const name = LOOKS[look].name + (seen[look] > 1 ? ' ' + 'I'.repeat(seen[look]) : '');
    out.push({ id: 'house' + String(i + 1).padStart(2, '0'), name, look, house: true, level: 1 + Math.floor(R() * 20), on: true });
  }
  return out;
}

/* ---------- roster helpers ---------- */
// toggle log: [[t, 1|0], ...]. Counts from the next bell after t.
function isOn(a, t) {
  let on = false;
  for (const [ts, v] of a.log || []) { if (ts < t) on = !!v; else break; }
  return on;
}
function firstOn(a) {
  for (const [ts, v] of a.log || []) if (v) return ts;
  return Infinity;
}

/* ---------- a whole week ---------- */
// roster: agents [{id, look, name, owner, log}], xp: {agentId: careerXp before this week}
// opts.after = the Sunday after-hours exhibition: same rules, nothing counts
function Week(w, roster, xp, opts = {}) {
  this.w = w; this.after = !!opts.after;
  this.id = weekId(w) + (this.after ? 'x' : ''); this.round = 0;
  this.start = this.after ? weekClose(w) : weekOpen(w);
  this.N = this.after ? Math.round((weekOpen(w + 1) - weekClose(w)) / ROUND_MS) : ROUNDS;
  this.seed = hash('week:' + this.id);
  this.xp = xp || {};
  this.agents = roster.filter(validAgentShape)
    .slice().sort((a, b) => (firstOn(a) - firstOn(b)) || (a.id < b.id ? -1 : 1));
  this.F = new Map();
  this.house = houseFighters(this.id, HOUSE_FLOOR);
  for (const h of this.house) this.F.set(h.id, buildFighter(h, h.level));
  this.rounds = [];     // per round: { bouts:[...], byes:[], bar:[], resting:[] }
  this.tapeKeep = opts.tapeKeep ?? TAPE_ROUNDS;
}
Week.prototype.fighter = function (a) {
  let f = this.F.get(a.id);
  if (!f) { f = buildFighter(a, levelFromXp(this.xp[a.id] || 0)); this.F.set(a.id, f); }
  return f;
};
Week.prototype.step = function () {
  const r = this.round; if (r >= this.N) return false;
  const T = this.start + r * ROUND_MS;
  const R = rng(hash(this.id + ':r' + r));
  // seats: first come, first served; a seat is kept all week
  let seated = 0;
  for (const f of this.F.values()) if (f.seated && !f.house) seated++;
  const queue = [];
  for (const a of this.agents) {
    const f = this.fighter(a);
    f.on = isOn(a, T);
    if (!f.seated && f.on) {
      if (seated < MAX_SEATS) { f.seated = true; f.joined = r; seated++; }
      else queue.push(a.id);
    }
  }
  // house regulars step aside as players arrive
  const houseN = Math.max(0, HOUSE_FLOOR - seated);
  this.house.forEach((h, i) => { const f = this.F.get(h.id); f.on = i < houseN; if (f.on) f.seated = true; });
  // who's on the floor this bell
  const floor = [], bar = [], resting = [];
  for (const f of this.F.values()) {
    if (!f.seated || !f.on) continue;
    if (f.rest > r) { resting.push(f.id); continue; }
    if (f.rest === r) { f.rest = -1; f.hp = f.maxHp; }
    // the re:CALL decides whether to sit this one out at the bar
    const hpPct = f.hp / f.maxHp;
    if (hpPct < .18 + f.cau * .32 && R() < .55 + f.cau * .4) { bar.push(f.id); continue; }
    floor.push(f);
  }
  // matchmaking: similar PX, a little luck, no instant rematches
  floor.forEach(f => { f._k = f.px + R() * 30; });
  floor.sort((a, b) => b._k - a._k || (a.id < b.id ? -1 : 1));
  const bouts = [], byes = [];
  // odd one out: a random sit-out, never the same fighter two bells running
  if (floor.length % 2) {
    let k = Math.floor(R() * floor.length);
    if (floor[k].bye === r - 1 && floor.length > 1) k = (k + 1) % floor.length;
    const [f] = floor.splice(k, 1); f.bye = r; byes.push(f.id);
  }
  for (let i = 0; i + 1 < floor.length; i += 2) {
    if (floor[i].lastOp === floor[i + 1].id && i + 2 < floor.length) { const t = floor[i + 1]; floor[i + 1] = floor[i + 2]; floor[i + 2] = t; }
    bouts.push([floor[i], floor[i + 1]]);
  }
  const out = { r, t: T, bouts: [], byes, bar, resting, queue };
  bouts.forEach(([A, B], bi) => {
    const BR = rng(hash(this.id + ':r' + r + ':' + A.id + ':' + B.id));
    const hp0 = [A.hp, B.hp];
    const met = A.mem[B.id] ? A.mem[B.id].w + A.mem[B.id].l : 0;   // how many times the re:CALL has seen this before
    const res = fight(A, B, BR, true);
    const win = res.win ? B : A, lose = res.win ? A : B;
    const upset = Math.max(0, Math.floor((lose.level - win.level) / 10));
    const gain = (res.ko ? 18 : 8) + upset, lgain = res.ko ? 0 : 1;
    win.px += gain; lose.px += lgain; win.w++; lose.l++;
    win.streak++; win.bestStreak = Math.max(win.bestStreak, win.streak); lose.streak = 0;
    if (res.ko) { win.ko++; lose.kod++; lose.falls++; lose.rest = r + REST_ROUNDS + 1; lose.hp = 0; }
    A.lastOp = B.id; B.lastOp = A.id;
    const bout = { r, i: bi, a: A.id, b: B.id, win: res.win, ko: res.ko, px: res.win ? [lgain, gain] : [gain, lgain],
      hp0, hp1: [A.hp, B.hp], max: [A.maxHp, B.maxHp], n: res.turns.length, turns: res.turns, lv: [A.level, B.level], met };
    A.history.push({ r, op: B.id, win: res.win === 0, ko: res.ko, px: bout.px[0], i: bi });
    B.history.push({ r, op: A.id, win: res.win === 1, ko: res.ko, px: bout.px[1], i: bi });
    out.bouts.push(bout);
  });
  // between bells: patch up
  for (const f of this.F.values()) {
    if (!f.seated || f.rest > r) continue;
    const inBar = bar.includes(f.id), fought = out.bouts.some(b => b.a === f.id || b.b === f.id);
    const heal = inBar ? .25 : fought ? .12 : .18;
    f.hp = Math.min(f.maxHp, Math.round(f.hp + f.maxHp * heal));
  }
  this.rounds.push(out);
  // the tape only keeps the last few rounds
  const old = this.rounds[r - this.tapeKeep];
  if (old) for (const b of old.bouts) b.turns = null;
  this.round++;
  return true;
};
Week.prototype.advanceTo = function (n) { while (this.round < Math.min(n, this.N)) this.step(); return this; };
Week.prototype.rung = function (t) { return t < this.start ? 0 : Math.min(this.N, Math.floor((t - this.start) / ROUND_MS) + 1); };
Week.prototype.nextBell = function (t) { const r = this.rung(t); return r >= this.N ? null : this.start + r * ROUND_MS; };
Week.prototype.end = function () { return this.start + this.N * ROUND_MS; };
Week.prototype.standings = function () {
  return [...this.F.values()].filter(f => f.seated)
    .sort((a, b) => (b.px - a.px) || (b.w - a.w) || (a.l - b.l) || (a.id < b.id ? -1 : 1));
};
Week.prototype.boothSize = function () { return Math.max(1, Math.ceil(this.standings().length * .10)); };
Week.prototype.status = function (f, r = this.round) {
  if (!f.seated) return f.on ? 'QUEUED' : 'BENCHED';
  if (!f.on) return 'BENCHED';
  if (f.rest >= r) return 'ANVIL';
  return 'FLOOR';
};
// what goes into the settled record when the last bell rings
Week.prototype.settle = function () {
  const s = this.standings(), n = this.boothSize();
  const xp = {}, rec = {};
  for (const f of s) if (!f.house) { xp[f.id] = f.px; rec[f.id] = [f.w, f.l, f.ko]; }
  return { week: this.id, xp, rec, booth: s.slice(0, n).map(f => f.id), champ: s[0] ? s[0].id : null, fighters: s.length };
};

const api = {
  ROUND_MS, WEEK_MS, EPOCH, OPEN_MS, ROUNDS, REST_ROUNDS, MAX_SEATS, HOUSE_FLOOR, MAX_TURNS, TAPE_ROUNDS, MAX_LEVEL,
  STYLES, TYPES, TYPE_LABEL, LOOKS, GEAR, MOVES, MOVE_NAME, ST_MAX,
  weekIndex, weekOpen, weekClose, roundAt, weekId, weekFromId, roundsRung,
  hash, rng, xpForLevel, levelFromXp, buildFighter, fighterKind, validAgentShape, fight, isOn, firstOn, Week,
};
if (typeof module !== 'undefined') module.exports = api; else root.Brawl = api;
})(this);
