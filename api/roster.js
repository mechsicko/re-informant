// GET  /api/roster  ->  { agents: { address: [fighter...] }, seasons: { weekId: record } }
// POST /api/roster  (Authorization: Bearer <session>)  { action: 'enroll', token, name, px } | { action: 'toggle'|'retire', id }
import { config, requireConfig } from '../lib/config.js';
import { handle, json, body, options } from '../lib/http.js';
import { sessionFrom } from '../lib/auth.js';
import { readRoster, act } from '../lib/roster.js';

export const GET = handle(async () => json(await readRoster(config())));
export const POST = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'secret', 'alchemyKey');
  const address = await sessionFrom(request, cfg.secret);
  const list = await act(cfg, address, await body(request));
  return json({ address, list });
});
export const OPTIONS = options;
