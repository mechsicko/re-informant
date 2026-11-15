import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { installFakeAlchemy, VAULT } from './fixtures.mjs';

const account = privateKeyToAccount('0x' + '11'.repeat(32));
const other = privateKeyToAccount('0x' + '22'.repeat(32));
const user = account.address.toLowerCase();
process.env.ALCHEMY_API_KEY = 'test';
process.env.SESSION_SECRET = 'test-secret-123';
process.env.REGEN_VAULTS = 'staked:' + VAULT;
installFakeAlchemy({ user, other: other.address.toLowerCase() });

const nonce = await import('../api/nonce.js');
const login = await import('../api/login.js');
const regens = await import('../api/regens.js');
const roster = await import('../api/roster.js');
const art = await import('../api/art.js');
const season = await import('../api/season.js');
const req = (path, init, host = 'regen.example') => new Request('https://' + host + path, init);
const post = (path, data, session, host) => req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { authorization: 'Bearer ' + session } : {}) }, body: JSON.stringify(data) }, host);

async function signIn(acct = account, host = 'regen.example', postHost = host) {
  const n = await (await nonce.GET(req('/api/nonce?address=' + acct.address.toLowerCase(), {}, host))).json();
  const signature = await acct.signMessage({ message: n.message });
  return login.POST(post('/api/login', { message: n.message, signature, ticket: n.ticket }, null, postHost));
}

let session;
test('sign-in message is standard and names the site', async () => {
  const n = await (await nonce.GET(req('/api/nonce?address=' + user))).json();
  assert.match(n.message, /^regen\.example wants you to sign in with your Ethereum account:\n0x/);
  assert.ok(n.message.includes(account.address), 'checksummed address');
  assert.ok(n.message.includes('Chain ID: 8453'));
});
test('signing in returns a session and every re:gen held, staked ones included', async () => {
  const r = await signIn();
  assert.equal(r.status, 200);
  const j = await r.json();
  session = j.session;
  assert.equal(j.address, user);
  assert.deepEqual(j.regens.map(x => [x.id, x.where, x.type, x.style]), [
    [5, 'staked', 'mummy', 'TRICKSTER'],     // deposited and never withdrawn
    [42, 'wallet', 'ape', 'TANK'],
    [1309, 'wallet', 'human', 'BRUISER'],
  ]);   // #9 was withdrawn, #7 was last deposited by someone else
});
test('a signature from another wallet is refused', async () => {
  const n = await (await nonce.GET(req('/api/nonce?address=' + user))).json();
  const signature = await other.signMessage({ message: n.message });
  const r = await login.POST(post('/api/login', { message: n.message, signature, ticket: n.ticket }));
  assert.equal(r.status, 401);
});
test('an edited message is refused', async () => {
  const n = await (await nonce.GET(req('/api/nonce?address=' + user))).json();
  const message = n.message.replace('Chain ID: 8453', 'Chain ID: 1');
  const r = await login.POST(post('/api/login', { message, signature: await account.signMessage({ message }), ticket: n.ticket }));
  assert.equal(r.status, 401);
});
test('a message made for another site is refused', async () => {
  const r = await signIn(account, 'evil.example', 'regen.example');
  assert.equal(r.status, 401);
});
test('holdings need a session', async () => {
  assert.equal((await regens.GET(req('/api/regens'))).status, 401);
  const r = await regens.GET(req('/api/regens', { headers: { authorization: 'Bearer ' + session } }));
  assert.equal((await r.json()).regens.length, 3);
});
test('roster: send in an owned re:gen, refuse one you do not hold, bench, retire', async () => {
  let r = await roster.POST(post('/api/roster', { action: 'enroll', token: 1309, name: 'big lou' }, session));
  assert.equal(r.status, 200);
  let j = await r.json();
  assert.equal(j.list[0].name, 'BIG LOU'); assert.equal(j.list[0].style, 'BRUISER'); assert.equal(j.list[0].log.length, 1);
  r = await roster.POST(post('/api/roster', { action: 'enroll', token: 5 }, session));
  assert.equal(r.status, 200, 'staked re:gens can fight');
  r = await roster.POST(post('/api/roster', { action: 'enroll', token: 777 }, session));
  assert.equal(r.status, 403);
  const id = j.list[0].id;
  j = await (await roster.POST(post('/api/roster', { action: 'toggle', id }, session))).json();
  assert.equal(j.list[0].log.at(-1)[1], 0);
  const all = await (await roster.GET(req('/api/roster'))).json();
  assert.equal(all.agents[user].length, 2);
  j = await (await roster.POST(post('/api/roster', { action: 'retire', id }, session))).json();
  assert.equal(j.list.length, 1);
  assert.equal((await roster.POST(post('/api/roster', { action: 'enroll', token: 42 }))).status, 401, 'no session, no writes');
});
test('art is served from the site', async () => {
  const r = await art.GET(req('/api/art?id=1309'));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /svg/);
});
test('a week is recorded once', async () => {
  const a = await (await season.POST(post('/api/season', { id: '2026-11-09', data: { xp: { abc123def: 400 }, booth: ['abc123def'] } }, session))).json();
  const b = await (await season.POST(post('/api/season', { id: '2026-11-09', data: { xp: { abc123def: 9999 } } }, session))).json();
  assert.deepEqual([a.wrote, b.wrote], [true, false]);
  const all = await (await roster.GET(req('/api/roster'))).json();
  assert.equal(all.seasons['2026-11-09'].xp.abc123def, 400);
});
