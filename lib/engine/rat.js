/* =====================================================================
   re:informant — Who's the rat at DeStefano's?
   Every bell, the room splits into tables. One re:gen at each table is
   secretly a rat. By day they share tips, talk and vote someone out.
   By night the rat takes someone out back. Nobody steers.
   Pure and deterministic, like re:BRAWL's engine, which it builds on.
   ===================================================================== */
(function (root) {
'use strict';
const B = typeof module !== 'undefined' ? require('./sim.js') : root.Brawl;
const { hash, rng, LOOKS, TYPES, ROUND_MS, ROUNDS, MAX_SEATS, TAPE_ROUNDS, MAX_LEVEL, weekId, weekOpen, weekClose, isOn, firstOn, levelFromXp } = B;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const HOUSE_FLOOR = 21;     // three full tables when the room is quiet
const MAX_DAYS = 5;

// the six fighting styles, read as the six kinds of people at a table
const ROLES = {
  BRUISER:   { label: 'MUSCLE',    per: .35, pers: .75, dec: .35, res: .55, talk: 1, agg: .80, cha: .15, blurb: 'Points first. Asks questions never.' },
  COUNTER:   { label: 'DETECTIVE', per: .80, pers: .50, dec: .45, res: .60, talk: 1, agg: .40, cha: .05, blurb: 'Watches hands. Catches tells.' },
  HUSTLER:   { label: 'TALKER',    per: .50, pers: .70, dec: .55, res: .40, talk: 2, agg: .60, cha: .15, blurb: 'Never stops talking. Sometimes says something.' },
  TRICKSTER: { label: 'GRIFTER',   per: .48, pers: .55, dec: .80, res: .45, talk: 1, agg: .50, cha: .30, blurb: 'Lies like breathing. A nightmare when it draws the rat.' },
  TANK:      { label: 'ROCK',      per: .58, pers: .48, dec: .48, res: .85, talk: 1, agg: .30, cha: .05, blurb: 'Says little. Moves for nobody.' },
  GAMBLER:   { label: 'WILDCARD',  per: .45, pers: .55, dec: .55, res: .40, talk: 1, agg: .60, cha: .60, blurb: 'Plays hunches. Right more often than it should be.' },
};
// what each type brings to the table
const KNACKS = {
  human:     { name: 'HUSTLE',     blurb: 'Gets an extra word in every day.' },
  robot:     { name: 'LOGS',       blurb: 'Keeps a record. Stops trusting a bad accuser twice as fast.' },
  gold:      { name: 'BLING',      blurb: 'People listen when gold talks: +40% persuasion.' },
  bones:     { name: 'RATTLE',     blurb: 'Accusations slide off it: they land 30% lighter.' },
  zombie:    { name: 'COMES BACK', blurb: 'Taken out back once, it walks back in the next day.' },
  ghost:     { name: 'OVERHEAR',   blurb: 'Picks up an extra tip every day.' },
  rebot:     { name: 're:BOOT',    blurb: 'Shrugs off pressure. Hard to talk out of a read.' },
  alien:     { name: 'PROBE',      blurb: "Once a game, reads one player's role. Right 3 times in 4." },
  demoness:  { name: 'HEX',        blurb: 'Its vote counts one and a half.' },
  celestial: { name: 'HALO',       blurb: 'Everyone starts out trusting it a little more.' },
  ape:       { name: 'SHOUT',      blurb: 'Accusations hit twice as hard. A wrong one costs twice the trust.' },
  mummy:     { name: 'WRAP',       blurb: 'Once a game, wraps someone up. No talking for a day.' },
};

// the families: eight bosses run the rackets around DeStefano's. Their real re:gens' traits (type, eyes) come from
// the chain at runtime; this list is who they are, with their art (18x18, from the holders' own pictures). Players can't sit down as them or take their names.
// If the wallet that holds a boss's re:gen plays it, the house's boss steps aside and the real one plays instead.
const FAMILIES = [
  { token: 967, name: "JED", family: "The House", turf: "DeStefano's, at the head of every table",
    motto: "Smile now. Cry later.",
    bio: "JED owns DeStefano's, and every family in this book eats there on JED's word. Laser eyes, the chair at the head of the table, and the last word at every sit-down. Monday nights the bosses come in for JED Talk and walk out with their orders. JED starts each morning buying up smiles on the cheap, because somebody always cries later.",
    px: { p: "262626,323232,2f2f2f,2a2a2a,515151,131313,191919,00afff,00de68,0083bf,00ff00,00f716,00ce9b,14e71b,3cbf51,37ba4c,51ac6c,00a6f2,008dcd,ffff00,353637,333334,37383a,2b2b2c,2e2e2f,afafaf", d: "............................................................011111...........01111111.........011122221.........011111111.........033113314441......566778778.........97678abcadefg.....977778hh8..........97777777...........i777hh7...........9i7777............j799.............kljmnj...........kokojjp...........97mlmpm......." } },
  { token: 589, name: "MECH", family: "The Mint", turf: "the studio where every face in town gets drawn",
    motto: "Every face in this town, I drew.",
    bio: "Orange beanie, gold chain. MECH drew all 6,666 faces in this town, eighteen pixels square, and brought back the ones everybody else forgot. MECH writes the songs on the jukebox too. The Mint don't forge papers. They forge faces, and every one of them is signed.",
    px: { p: "bf3e00,ff5200,b63a00,f34e00,b8b800,f5f500,d9d2c8,ffffff,424242,585858,000000,ccc6bc,474747,ffff00,a39e96,353637,333334,37383a,2b2b2c,2e2e2f,afafaf", d: "............................................................011111...........01111111..........01111111.........2333333333........0313131313........455667667.........89566a66a.........896666bb9..........89666669...........c666bb9...........8c6999............d9e8.............fgdhid...........fjfjddk...........86hghkh......." } },
  { token: 3326, name: "LYSS", family: "The Switchboard", turf: "every radio in Brooklyn, every day at noon",
    motto: "Spread kindness. Be loyal. Embody consistency.",
    bio: "On DeStefano's books LYSS is listed as the intern. Nobody believes it. LYSS runs the Switchboard: every day at noon the whole town tunes in, three hundred broadcasts and counting, and LYSS hears everything said on every one of them. Kind to everyone, loyal to the family, consistent enough to scare you. Bills Mafia on Sundays.",
    px: { p: "1a1a1a,232323,e6e6e6,ffffff,202020,ae8b61,393939,ffff00,a1815a,d3d300,bfbf00,836849,8c704e,262626,2d2d2d,323232,ffc7c7", d: "........................................................00...............01.1211111........01.31111111.......01.311411110......01..1454441.......0...11165116.........001161116..........70168016.........9.755555...........a.b5885.............cc55..............b5...............d555.............deffef............b5dfgf......." } },
  { token: 1794, name: "CEELOS", family: "The Roasters", turf: "the roasting warehouse by the Navy Yard",
    motto: "Twenty-three years over the fire.",
    bio: "Rainbow shades, a blue cap and a mustache you can hear across the room. CEELOS has roasted coffee for twenty-three years, and the Roasters move every bean that comes into Brooklyn. At five o'clock every day CEELOS calls the crews in to Re:Building Together, and every deal gets made over a cup. CEELOS can tell when a bean is burnt, and when you are.",
    px: { p: "003ebf,0052fe,ffffc8,0064ff,005fff,f1f1bd,004ef0,0055f1,0046d7,276cfe,bf0000,ff0000,00ff96,00ffff,ffff00,ff9600,836849,ae8b61,bfbf00,a1815a,00bf71,191919,00bfbf,8c704e,a90000,e10000", d: "............................................................012222...........01223422.........011256752.........011222222.........088118819991.....abbcdefbbfe.......aghcdefabfe........ghcdifjjfe.........gkdhllllm..........nhhljjl...........gnhlhhl...........ohgg.............oppppp...........oppoppp...........ghooppp......." } },
  { token: 1821, name: "BAKED", family: "The Haze", turf: "the Gulf run, Florida to the Brooklyn docks",
    motto: "Lunch money is still money.",
    bio: "Black beanie, rainbow shades and smoke where a face should be. BAKED works the Gulf run out of Florida and sits at CEELOS's right hand at five, scalping the market quietly while everybody else talks. BAKED won't trust a wallet BAKED can't hold, and eats ramen dry like chips. By the time you notice the fog, your lunch money is gone.",
    px: { p: "262626,323232,242424,303030,bf0000,ff0000,00ff96,00ffff,ffff00,ff9600,4d7366,4e7468,bfbf00,476d60,00bf71,00bfbf,527b6e,466c5f,50796b,282828,2a2a2a,496f62", d: "............................................................011111...........01111111..........01111111.........2333333333........0313131313.......45567895598.......4a.67894598........b.67c9..98.........de7.....f..........g................0hi..............jjk1llk..........jj111111..........0j110111...........0110111......." } },
  { token: 6460, name: "SLICKRICK", family: "The Re:Aligned", turf: "the card rooms after midnight",
    motto: "Bad company corrupts good character.",
    bio: "Brown hood up, gold glasses, gold chain. SLICKRICK once took fifty grand in a single hand and still calls it the best night of a long career at the tables. Spun records up in NorCal, quit the leverage game cold, and holds one of the town's 1 of 1s. Wednesdays at midnight the Re:Aligned come in to get their heads straight. They call SLICKRICK the light in the dark, which is how SLICKRICK sees your cards.",
    px: { p: "352c1c,362b18,423723,3b301e,473c28,2b2313,2e2414,d8d800,543f2a,000000,001600,001b00,ffff00,a1a100,ffffff,bfbf00,382f1e,57412c,644b32,4a3825,2e2514,292012,38291c,4b3826,413624,32291a,4c422f", d: ".............................................................................0123412..........012123414.........5212121214.......521267787792......0126abbcbb96......526dbbefbb9g......01gdbefhfe96......5268ffiiif9g......0126jiihhi9k.......gl26jiii9k.........gc2mn99k..........lgcgock..........l21pcco...........p12l21q......." } },
  { token: 4453, name: "WOOF", family: "The Woof Army", turf: "the arcades and diners, doors open at nine",
    motto: "Old school fun needs a comeback.",
    bio: "Green skin, cap on backwards, and a habit of getting up after being buried. Every morning at nine WOOF opens the doors for Re:Invigorate and the Woof Army files in for coffee and orders. WOOF runs the arcades and the diners: good food, bad choices, full plates. Put WOOF in the ground and WOOF is back at nine the next morning.",
    px: { p: "262626,323232,644b00,2a2a2a,4b3800,647d00,3c4b00,4b5e00,000000,506400,003d00", d: "...........................................................011111...........01111111..........011111111.........011112221.........033333333......000422566566.........752589589.........755555aa5..........75555555...........9555aa5...........795555............7577.............75555............755a555...........755a555......." } },
  { token: 1858, name: "CK", family: "The Nightshade", turf: "the warehouses across the river in South Jersey",
    motto: "Don't turn into a community member. You'll go broke.",
    bio: "A bowler hat, a purple face and eyes like stoplights. CK runs the Nightshade out of South Jersey, in the warehouses where the techno goes until sunrise. CK used to deal in pictures and now deals in coins that are gone by morning. Loves the old rubber-hose cartoons, and keeps a real rubber hose for anyone who doesn't. CK's advice to every new face: don't get attached to anybody at this table.",
    px: { p: "262626,323232,242424,303030,4b3800,644b00,4b004b,960096,ff0000,000000,2e463e,ff00ff,2f463f,3e5d52,2b423a,3f5e54,324b43,3f5e53,2a413a,3c5b50,3a594f,9b0d31,2c433c,294038,ce1141,324a42,2d443c,ffffff", d: "............................................................011111...........01111111..........01111111.........2333333333........0313131313........455678698.........a957b8698.........c967bb69d..........e967769f...........g96699h...........i969jk............l99m.............nloooo...........p96l999...........q96loro......." } },
];
// Family Night: six bells on Friday night in Brooklyn (Saturday 01:00 to 07:00 UTC). One boss sits in at every table.
const FAMILY_NIGHT = { from: 121, to: 127 };
const isFamilyNight = r => r >= FAMILY_NIGHT.from && r < FAMILY_NIGHT.to;
const bossNames = () => FAMILIES.map(f => f.name);

function buildPlayer(a, level) {
  const f = B.buildFighter(a, level);
  const r = ROLES[f.style];
  const R = rng(hash('mind:' + a.id));
  const lv = (level - 1) / (MAX_LEVEL - 1) * .15;       // levels sharpen every sense a little
  const j = () => (R() - .5) * .12;
  Object.assign(f, {
    per: clamp(r.per + lv + j(), .05, .98), pers: clamp(r.pers + lv + j(), .05, .98),
    dec: clamp(r.dec + lv + j(), .05, .98), res: clamp(r.res + lv + j(), .05, .98),
    agg: clamp(r.agg + j()), cha: clamp(r.cha + j()), talk: r.talk,
    px: 0, w: 0, l: 0, games: 0, ratGames: 0, ratWins: 0, calls: 0, reads: 0, wrongOuts: 0, survived: 0,
    history: [], mem: {}, seated: false, streak: 0, bestStreak: 0,
  });
  return f;
}

// a boss: level 150 and near-perfect senses. b = { token, name, type, style, px } (traits from the chain)
function buildBoss(b) {
  const fam = FAMILIES.find(f => f.token === b.token) || {};
  const f = buildPlayer({ id: 'boss' + b.token, name: b.name || fam.name, token: b.token, type: b.type, style: b.style, px: b.px || fam.px || null }, MAX_LEVEL);
  Object.assign(f, { boss: true, family: fam.family || '', per: Math.max(f.per, .93), pers: Math.max(f.pers, .9), dec: Math.max(f.dec, .96), res: Math.max(f.res, .92), agg: Math.max(f.agg, .55), talk: Math.max(f.talk, 2) });
  return f;
}

function shuffle(a, R) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- one table, one game ---------- */
function playTable(fs, R, keep) {
  const n = fs.length, ratI = Math.floor(R() * n);
  const P = fs.map((f, i) => ({ i, f, rat: i === ratI, alive: true, sus: new Array(n).fill(0), trust: new Array(n).fill(1),
    tip: -1, accusedToday: -1, silent: false, back: f.type === 'zombie', probe: f.type === 'alien', wrap: f.type === 'mummy', lies: 0 }));
  // the re:CALL: last games color who you trust tonight
  for (const p of P) for (const q of P) {
    if (p === q) continue;
    const m = p.f.mem[q.f.id];
    if (m) { p.trust[q.i] = clamp(Math.pow(.82, m.lied) * Math.pow(1.12, m.called), .3, 1.7); p.sus[q.i] += .2 * Math.min(3, m.lied); }
    if (q.f.type === 'celestial') p.trust[q.i] *= 1.3;
  }
  const ev = [], push = e => { if (keep) ev.push(e); };
  const living = () => P.filter(p => p.alive);
  const liveInno = () => P.filter(p => p.alive && !p.rat);
  // what the table thinks of each seat, for the heat bars
  const heat = () => P.map(q => {
    if (!q.alive) return 0;
    const ls = liveInno().filter(l => l !== q);
    return ls.length ? Math.round(ls.reduce((s, l) => s + l.sus[q.i], 0) / ls.length * 100) / 100 : 0;
  });
  const argmax = (arr, score) => { let best = null, bv = -1e9; for (const x of arr) { const v = score(x); if (v > bv) { bv = v; best = x; } } return best; };
  let winner = null, day = 0, firstCall = -1;
  const calls = [];      // [by, on, day]

  function listen(A, kind, T, w) {
    const noticed = [];
    const lying = A.rat && T !== ratI && ['accuse', 'tipaccuse', 'deflect', 'probe'].includes(kind);
    if (A.rat && lying) A.lies++;
    let pers = A.f.pers * (A.f.type === 'gold' ? 1.4 : 1) * (A.f.type === 'ape' && w > 0 ? 1.6 : 1);
    if (A.rat) pers = Math.max(pers, A.f.dec * 1.15);     // a good liar sells it
    for (const L of living()) {
      if (L === A || L.rat) continue;
      if (lying && R() < clamp((L.f.per - A.f.dec) * .5 + .03, .01, .4)) {      // caught a tell
        L.sus[A.i] += 1.2; L.trust[A.i] *= .8; noticed.push(L.i);
      }
      if (kind === 'defend') { L.sus[A.i] -= .35 * pers * L.trust[A.i] * (1 - .5 * L.f.res); continue; }
      if (L.i === T) {                         // you know you're clean, so the accuser looks shady
        if (w > 0) { L.sus[A.i] += .4; L.trust[A.i] *= .88; L.accusedToday = A.i; }
        continue;
      }
      if (w > 0 && L.sus[A.i] > L.sus[T] + 1) { L.sus[A.i] += .2; continue; }   // sees it as deflection
      const resist = 1 - .55 * L.f.res * (L.f.type === 'rebot' ? 1.4 : 1);
      L.sus[T] += w * pers * L.trust[A.i] * Math.max(.1, resist) * (P[T].f.type === 'bones' && w > 0 ? .7 : 1);
    }
    if (w > 0) {
      calls.push([A.i, T, day]);
      if (T === ratI && firstCall < 0 && !A.rat) firstCall = A.i;
    }
    push({ k: 'say', by: A.i, kind, on: T, noticed, heat: heat() });
  }

  function speak(p) {
    const others = living().filter(q => q !== p);
    if (!others.length) return;
    if (p.f.boss) return bossSpeak(p, others);
    if (!p.rat) {
      if (p.probe) {                                             // alien: read someone
        const t = argmax(others, q => p.sus[q.i]);
        const right = R() < .75, dirty = right ? t.rat : !t.rat;
        p.sus[t.i] += dirty ? 3 : -1.5; p.probe = false;
        push({ k: 'probe', by: p.i, on: t.i });
        return listen(p, dirty ? 'probe' : 'clear', t.i, dirty ? 1.4 : -.6);
      }
      const t = argmax(others, q => p.sus[q.i]);
      if (p.wrap && p.sus[t.i] > 1.2) { p.wrap = false; P[t.i].silent = true; push({ k: 'wrap', by: p.i, on: t.i, heat: heat() }); return; }
      if (p.accusedToday >= 0 && P[p.accusedToday].alive && R() < .6) {
        const acc = P[p.accusedToday]; p.accusedToday = -1;
        if (p.sus[acc.i] > 1) return listen(p, 'counter', acc.i, .5);
        return listen(p, 'defend', p.i, 0);
      }
      const bar = .9 - p.f.agg * .6;
      if (p.sus[t.i] > bar) return listen(p, p.tip === t.i ? 'tipaccuse' : 'accuse', t.i, p.tip === t.i ? .65 : .5);
      if (p.tip >= 0 && P[p.tip].alive) { const tp = p.tip; p.tip = -1; return listen(p, 'share', tp, .6); }
      const clean = argmax(others, q => -p.sus[q.i]);
      if (p.sus[clean.i] < -.3 && R() < .6) return listen(p, 'vouch', clean.i, -.45);
      return push({ k: 'say', by: p.i, kind: 'hmm', on: -1, noticed: [], heat: heat() });
    }
    // the rat: steer the table toward someone clean
    const inn = others.filter(q => !q.rat);
    if (!inn.length) return;
    const h = heat();
    const threat = argmax(inn, q => q.sus[p.i] + q.f.per * .5);
    const goat = argmax(inn, q => h[q.i] + (q === threat ? .3 : 0));
    if (p.wrap && threat.sus[p.i] > .8) { p.wrap = false; threat.silent = true; push({ k: 'wrap', by: p.i, on: threat.i, heat: h }); return; }
    if (p.accusedToday >= 0 && P[p.accusedToday].alive) {
      const acc = P[p.accusedToday]; p.accusedToday = -1;
      // cornered: swear it saw the accuser by the back door, or play it cool
      return R() < .6 ? listen(p, R() < .5 ? 'tipaccuse' : 'deflect', acc.i, .65) : listen(p, 'defend', p.i, 0);
    }
    if (day === 1 && R() < .5) {                                   // lie low on the first day
      if (R() < .5) { const v = argmax(inn, q => -h[q.i]); return listen(p, 'vouch', v.i, -.45); }
      return push({ k: 'say', by: p.i, kind: 'hmm', on: -1, noticed: [], heat: h });
    }
    if (p.probe && R() < .5) { p.probe = false; push({ k: 'probe', by: p.i, on: goat.i }); return listen(p, 'probe', goat.i, 1.4); }
    if (R() < .45) return listen(p, 'tipaccuse', goat.i, .65);      // a made-up tip
    if (R() < .2) { const v = argmax(inn, q => -h[q.i]); return listen(p, 'vouch', v.i, -.45); }
    return listen(p, 'accuse', goat.i, .55);
  }

  // a boss plays it cold. Clean: turns on a bad accuser at once and pushes hard on its read.
  // The rat: lies low on day one, then frames whoever is closest to the truth with a story nobody can check.
  function bossSpeak(p, others) {
    if (!p.rat) {
      if (p.accusedToday >= 0 && P[p.accusedToday].alive) { const acc = P[p.accusedToday]; p.accusedToday = -1; return listen(p, 'counter', acc.i, .7); }
      if (p.probe) { const t = argmax(others, q => p.sus[q.i]); const dirty = R() < .75 ? t.rat : !t.rat; p.sus[t.i] += dirty ? 3 : -1.5; p.probe = false; push({ k: 'probe', by: p.i, on: t.i }); return listen(p, dirty ? 'probe' : 'clear', t.i, dirty ? 1.4 : -.6); }
      const t = argmax(others, q => p.sus[q.i]);
      if (p.wrap && p.sus[t.i] > .9) { p.wrap = false; P[t.i].silent = true; push({ k: 'wrap', by: p.i, on: t.i, heat: heat() }); return; }
      if (p.sus[t.i] > .35) return listen(p, p.tip === t.i ? 'tipaccuse' : 'accuse', t.i, p.tip === t.i ? .75 : .65);
      if (p.tip >= 0 && P[p.tip].alive) { const tp = p.tip; p.tip = -1; return listen(p, 'share', tp, .7); }
      const clean = argmax(others, q => -p.sus[q.i]);
      if (p.sus[clean.i] < -.2) return listen(p, 'vouch', clean.i, -.5);
      return push({ k: 'say', by: p.i, kind: 'hmm', on: -1, noticed: [], heat: heat() });
    }
    const inn = others.filter(q => !q.rat); if (!inn.length) return;
    const h = heat();
    const threat = argmax(inn, q => q.sus[p.i] * 1.5 + q.f.per * .6 + calls.filter(c => c[0] === q.i && c[1] === p.i).length);
    if (p.accusedToday >= 0 && P[p.accusedToday].alive) { const acc = P[p.accusedToday]; p.accusedToday = -1; return listen(p, 'tipaccuse', acc.i, .75); }
    if (p.wrap && threat.sus[p.i] > .5) { p.wrap = false; threat.silent = true; push({ k: 'wrap', by: p.i, on: threat.i, heat: h }); return; }
    if (day === 1) {          // day one: be everybody's friend
      const v = argmax(inn, q => -h[q.i] + (q === threat ? .5 : 0));
      return R() < .7 ? listen(p, 'vouch', v.i, -.5) : push({ k: 'say', by: p.i, kind: 'hmm', on: -1, noticed: [], heat: h });
    }
    // after that: whoever is onto it gets framed; if nobody is, pile onto whoever the table already doubts
    const mark = threat.sus[p.i] > .4 ? threat : argmax(inn, q => h[q.i] + (q === threat ? .4 : 0));
    if (p.probe) { p.probe = false; push({ k: 'probe', by: p.i, on: mark.i }); return listen(p, 'probe', mark.i, 1.4); }
    return listen(p, R() < .6 ? 'tipaccuse' : 'accuse', mark.i, .75);
  }

  push({ k: 'deal', n });
  while (!winner && day < MAX_DAYS) {
    day++;
    for (const p of P) { p.silent = false; p.accusedToday = -1; }
    push({ k: 'day', d: day, alive: P.map(p => p.alive), heat: heat() });
    // tips: somebody saw something
    for (const p of liveInno()) {
      let tips = R() < .32 ? 1 : 0; if (p.f.type === 'ghost') tips++;
      for (let t = 0; t < tips; t++) {
        const pool = liveInno().filter(q => q !== p);
        const truth = R() < .12 + .38 * p.f.per || !pool.length;
        const on = truth ? ratI : pool[Math.floor(R() * pool.length)].i;
        p.sus[on] += .6 * (.4 + p.f.per); p.tip = on;
        push({ k: 'tip', by: p.i, on, heat: heat() });
      }
    }
    // talk
    for (const p of shuffle(living(), R)) {
      const turns = p.f.talk + (p.f.type === 'human' ? 1 : 0);
      for (let t = 0; t < turns && p.alive && !p.silent; t++) speak(p);
    }
    // the accused who haven't answered get one word back
    for (const p of living()) if (p.accusedToday >= 0 && !p.silent) speak(p);
    // vote
    const tally = new Array(n).fill(0), votes = [];
    for (const p of shuffle(living(), R)) {
      const others = living().filter(q => q !== p);
      let t;
      if (p.rat) { const h = heat(); t = argmax(others.filter(q => !q.rat), q => tally[q.i] * .8 + h[q.i] + (p.f.boss ? q.sus[p.i] * .6 : 0)); }
      else if (p.f.boss) t = argmax(others, q => p.sus[q.i] + .15 * tally[q.i]);
      else {
        t = argmax(others, q => p.sus[q.i] + (p.f.style === 'TANK' ? 0 : .25 * tally[q.i]) + (R() - .5) * (.5 + p.f.cha * 2));
        // not sure enough? keep your hand down (wildcards always vote)
        if (p.sus[t.i] < .55 - p.f.cha * .5 && tally[t.i] < 2) { votes.push([p.i, -1, 0]); continue; }
      }
      if (!t) continue;
      const wv = p.f.type === 'demoness' ? 1.5 : 1;
      tally[t.i] += wv; votes.push([p.i, t.i, wv]);
    }
    const max = Math.max(...tally), tops = tally.map((v, i) => v === max ? i : -1).filter(i => i >= 0);
    // someone goes out only on a clear plurality: more than a third of the votes cast
    const cast = votes.reduce((a, v) => a + v[2], 0);
    const out = tops.length === 1 && max >= 2 && max > cast / 3 ? tops[0] : -1;
    push({ k: 'vote', votes, tally, out, heat: heat() });
    if (out >= 0) {
      P[out].alive = false;
      if (out === ratI) { winner = 'town'; break; }
      // a clean one went out: the table remembers who pushed for it
      for (const L of liveInno()) for (const [by, on] of calls) if (on === out && by !== L.i) {
        const hit = (P[by].f.type === 'ape' ? .8 : .9);
        L.trust[by] *= L.f.type === 'robot' ? hit * hit : hit;
      }
    }
    if (living().length <= 3) { winner = 'rat'; break; }
    // night: the rat takes someone out back
    const victim = argmax(liveInno(), q => q.sus[ratI] + q.f.per * .5 + (P[ratI].f.boss ? calls.filter(c => c[0] === q.i && c[1] === ratI).length : 0) + R() * .3);
    if (!victim) { winner = 'rat'; break; }
    if (victim.back) { victim.back = false; push({ k: 'night', on: victim.i, back: true }); }
    else { victim.alive = false; push({ k: 'night', on: victim.i, back: false }); }
    if (living().length <= 3) { winner = 'rat'; break; }
  }
  if (!winner) winner = 'rat';
  push({ k: 'end', winner, rat: ratI, firstCall });

  // pay out
  const px = new Array(n).fill(0), lastVote = ev.filter(e => e.k === 'vote').pop();
  const finalVoters = new Set();
  if (winner === 'town') for (const [v, t] of (lastVote ? lastVote.votes : [])) if (t === ratI) finalVoters.add(v);
  for (const p of P) {
    if (p.rat) px[p.i] = winner === 'rat' ? 25 + 3 * P.filter(q => !q.rat && !q.alive).length : 1;
    else if (winner === 'town') px[p.i] = (p.alive ? 10 : 5) + (finalVoters.has(p.i) ? 4 : 0) + (p.i === firstCall ? 5 : 0);
    else px[p.i] = 2 + (p.i === firstCall ? 3 : 0);
  }
  // the re:CALL writes it all down
  const rat = P[ratI];
  for (const L of P) {
    if (L.rat) continue;
    const m = L.f.mem[rat.f.id] || (L.f.mem[rat.f.id] = { lied: 0, called: 0, games: 0 });
    if (rat.lies) m.lied++;
    if (firstCall >= 0 && firstCall !== L.i) { const c = L.f.mem[P[firstCall].f.id] || (L.f.mem[P[firstCall].f.id] = { lied: 0, called: 0, games: 0 }); c.called++; }
  }
  for (const p of P) for (const q of P) if (p !== q) { const m = p.f.mem[q.f.id] || (p.f.mem[q.f.id] = { lied: 0, called: 0, games: 0 }); m.games++; }
  return { n, ids: fs.map(f => f.id), rat: ratI, winner, days: day, px, firstCall, finalVoters: [...finalVoters],
    alive: P.map(p => p.alive), events: keep ? ev : null, lv: fs.map(f => f.level) };
}

/* ---------- the house regulars ---------- */
function houseRegulars(id, n) {
  const R = rng(hash('house:' + id));
  const deck = shuffle(LOOKS.map((_, i) => i), R), seen = {}, out = [];
  for (let i = 0; i < n; i++) {
    const look = deck[i % deck.length]; seen[look] = (seen[look] || 0) + 1;
    out.push({ id: 'house' + String(i + 1).padStart(2, '0'), name: LOOKS[look].name + (seen[look] > 1 ? ' ' + 'I'.repeat(seen[look]) : ''), look, house: true, level: 1 + Math.floor(R() * 20) });
  }
  return out;
}
function tableSizes(count) {
  if (count < 5) return [];
  let k = Math.ceil(count / 8);
  while (k > 1 && count / k < 6) k--;
  const base = Math.floor(count / k), extra = count % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/* ---------- a week of nights ---------- */
function RatWeek(w, roster, xp, opts = {}) {
  this.w = w; this.after = !!opts.after;
  this.id = 'rat:' + weekId(w) + (this.after ? 'x' : ''); this.round = 0;
  this.start = this.after ? weekClose(w) : weekOpen(w);
  this.N = this.after ? Math.round((weekOpen(w + 1) - weekClose(w)) / ROUND_MS) : ROUNDS;
  this.xp = xp || {};
  this.agents = roster.filter(B.validAgentShape).slice().sort((a, b) => (firstOn(a) - firstOn(b)) || (a.id < b.id ? -1 : 1));
  this.F = new Map();
  this.house = houseRegulars(this.id, HOUSE_FLOOR);
  for (const h of this.house) this.F.set(h.id, buildPlayer(h, h.level));
  this.rounds = [];
  this.tapeKeep = opts.tapeKeep ?? TAPE_ROUNDS;
  // the bosses: kept off the board (never seated), so they never touch the standings or the Gold Booth.
  // A boss whose real re:gen has been sent in by its holder steps aside for the week.
  const held = new Set(this.agents.map(a => a.token).filter(Number.isInteger));
  this.bosses = this.after ? [] : (opts.bosses || []).filter(b => b && FAMILIES.some(f => f.token === b.token) && TYPES[b.type] && ROLES[b.style] && !held.has(b.token))
    .slice().sort((a, b) => a.token - b.token).map(buildBoss);
  for (const f of this.bosses) this.F.set(f.id, f);
}
RatWeek.prototype.player = function (a) {
  let f = this.F.get(a.id);
  if (!f) { f = buildPlayer(a, levelFromXp(this.xp[a.id] || 0)); this.F.set(a.id, f); }
  return f;
};
RatWeek.prototype.step = function () {
  const r = this.round; if (r >= this.N) return false;
  const T = this.start + r * ROUND_MS;
  const R = rng(hash(this.id + ':r' + r));
  let seated = 0;
  for (const f of this.F.values()) if (f.seated && !f.house) seated++;
  const queue = [];
  for (const a of this.agents) {
    const f = this.player(a);
    f.on = isOn(a, T);
    if (!f.seated && f.on) { if (seated < MAX_SEATS) { f.seated = true; seated++; } else queue.push(a.id); }
  }
  let playing = 0; for (const f of this.F.values()) if (!f.house && f.seated && f.on) playing++;
  const houseN = Math.max(0, HOUSE_FLOOR - playing);
  this.house.forEach((h, i) => { const f = this.F.get(h.id); f.on = i < houseN; if (f.on) f.seated = true; });
  const room = shuffle([...this.F.values()].filter(f => f.seated && f.on), R);
  const sizes = tableSizes(room.length);
  const out = { r, t: T, tables: [], queue, family: false };
  // Family Night: a boss sits in at every table, taking turns so every family gets its seats
  const bosses = isFamilyNight(r) && this.bosses.length ? this.bosses.map((_, k) => this.bosses[(k + r) % this.bosses.length]) : [];
  if (bosses.length) out.family = true;
  let at = 0;
  sizes.forEach((sz, ti) => {
    const fs = room.slice(at, at + sz); at += sz;
    if (ti < bosses.length) fs.splice(Math.floor(R() * (fs.length + 1)), 0, bosses[ti]);
    const g = playTable(fs, rng(hash(this.id + ':r' + r + ':t' + ti)), true);
    g.r = r; g.i = ti;
    fs.forEach((f, k) => {
      const rat = k === g.rat, won = (g.winner === 'rat') === rat;
      f.px += g.px[k]; f.games++; if (won) { f.w++; f.streak++; f.bestStreak = Math.max(f.bestStreak, f.streak); } else { f.l++; f.streak = 0; }
      if (rat) { f.ratGames++; if (won) f.ratWins++; }
      if (k === g.firstCall) f.calls++;
      if (g.finalVoters.includes(k)) f.reads++;
      if (g.alive[k]) f.survived++;
      f.history.push({ r, i: ti, rat, won, px: g.px[k] });
    });
    out.tables.push(g);
  });
  this.rounds.push(out);
  const old = this.rounds[r - this.tapeKeep];
  if (old) for (const g of old.tables) g.events = null;
  this.round++;
  return true;
};
RatWeek.prototype.advanceTo = function (n) { while (this.round < Math.min(n, this.N)) this.step(); return this; };
RatWeek.prototype.rung = function (t) { return t < this.start ? 0 : Math.min(this.N, Math.floor((t - this.start) / ROUND_MS) + 1); };
RatWeek.prototype.nextBell = function (t) { const r = this.rung(t); return r >= this.N ? null : this.start + r * ROUND_MS; };
RatWeek.prototype.isFamilyNight = function (r) { return !this.after && isFamilyNight(r) && this.bosses.length > 0; };
RatWeek.prototype.standings = function () {
  return [...this.F.values()].filter(f => f.seated && !f.boss).sort((a, b) => (b.px - a.px) || (b.w - a.w) || (a.id < b.id ? -1 : 1));
};
RatWeek.prototype.boothSize = function () { return Math.max(1, Math.ceil(this.standings().length * .10)); };
RatWeek.prototype.status = function (f) { if (!f.seated) return f.on ? 'QUEUED' : 'BENCHED'; return f.on ? 'TABLE' : 'BENCHED'; };
RatWeek.prototype.settle = function () {
  const s = this.standings(), n = this.boothSize(), xp = {};
  for (const f of s) if (!f.house) xp[f.id] = f.px;
  return { week: weekId(this.w), xp, booth: s.slice(0, n).map(f => f.id), champ: s[0] ? s[0].id : null, fighters: s.length };
};

const api = { ROLES, KNACKS, HOUSE_FLOOR, MAX_DAYS, FAMILIES, FAMILY_NIGHT, isFamilyNight, bossNames, buildBoss, playTable, buildPlayer, tableSizes, RatWeek };
if (typeof module !== 'undefined') module.exports = api; else root.Rat = api;
})(this);
