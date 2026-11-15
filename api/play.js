// Live tables.
// POST /api/play { op: 'quick' | 'create' | 'join', pid, name, look | token+px, code }  ->  { id, k, view }
// POST /api/play { op: 'act', k, action: { type, line, on, since } }                   ->  view
// GET  /api/play?k=<seat ticket>&since=<n>                                            ->  view (moves the table forward)
import { config, requireConfig } from '../lib/config.js';
import { handle, json, body, options } from '../lib/http.js';
import { unseal } from '../lib/auth.js';
import { quickJoin, createFriends, joinFriends, move, poll } from '../lib/play.js';

async function walletOf(request, cfg) {
  const s = await unseal((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), cfg.secret);
  return s && /^0x[0-9a-f]{40}$/.test(s.a || '') ? s.a : null;
}
export const GET = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'secret');
  const q = new URL(request.url).searchParams;
  return json(await poll(cfg, q.get('k'), Number(q.get('since')) || 0));
});
export const POST = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'secret');
  const b = await body(request), address = await walletOf(request, cfg);
  if (b.op === 'quick') return json(await quickJoin(cfg, b, address));
  if (b.op === 'create') return json(await createFriends(cfg, b, address));
  if (b.op === 'join') return json(await joinFriends(cfg, b, address));
  if (b.op === 'act') return json(await move(cfg, b.k, b.action || {}));
  return json({ error: 'Unknown request.' }, 400);
});
export const OPTIONS = options;
