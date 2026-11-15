import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'test-secret-123';
process.env.ALCHEMY_API_KEY = '';
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
const play = await import('../api/play.js');
const post = data => new Request('https://x.example/api/play', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const get = (k, since = 0) => new Request('https://x.example/api/play?k=' + encodeURIComponent(k) + '&since=' + since);
const call = async r => { const res = await (r.method === 'GET' ? play.GET(r) : play.POST(r)); return { status: res.status, j: await res.json() }; };

test('friends: host creates, a friend joins by code, host starts, bots fill', async () => {
  const a = await call(post({ op: 'create', pid: 'aaaaaaaa1', name: 'host', look: 3 }));
  assert.equal(a.status, 200); assert.equal(a.j.view.phase, 'lobby'); assert.equal(a.j.view.isHost, true);
  const b = await call(post({ op: 'join', code: a.j.id.toLowerCase(), pid: 'bbbbbbbb2', name: 'pal', look: 7 }));
  assert.equal(b.status, 200); assert.equal(b.j.view.seats.length, 2);
  const nope = await call(post({ op: 'act', k: b.j.k, action: { type: 'start' } }));
  assert.equal(nope.status, 400, 'only the host starts');
  const s = await call(post({ op: 'act', k: a.j.k, action: { type: 'start' } }));
  assert.equal(s.j.phase, 'deal'); assert.equal(s.j.seats.length, 7);
  const va = (await call(get(a.j.k))).j, vb = (await call(get(b.j.k))).j;
  assert.ok(va.role && vb.role);
  assert.ok(!(va.role === 'clean' && va.rat >= 0) && !(vb.role === 'clean' && vb.rat >= 0), 'clean players never see the rat');
  const late = await call(post({ op: 'join', code: a.j.id, pid: 'cccccccc3', name: 'late', look: 1 }));
  assert.equal(late.status, 400);
});
test('public: quick join puts strangers at the same table', async () => {
  const x = await call(post({ op: 'quick', pid: 'xxxxxxxx1', name: 'x', look: 1 }));
  const y = await call(post({ op: 'quick', pid: 'yyyyyyyy2', name: 'y', look: 2 }));
  assert.equal(x.j.id, y.j.id); assert.equal(y.j.view.seats.length, 2); assert.equal(y.j.view.phase, 'lobby');
  assert.ok(y.j.view.deadline > Date.now());
});
test('a bad seat ticket and a stranger playing your re:gen are refused', async () => {
  assert.equal((await call(get('nonsense'))).status, 401);
  assert.equal((await call(post({ op: 'quick', pid: 'zzzzzzzz1', token: 1309 }))).status, 401);
});
