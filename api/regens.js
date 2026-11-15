// GET /api/regens   (Authorization: Bearer <session>)  ->  { address, regens }
import { config, requireConfig } from '../lib/config.js';
import { handle, json, options } from '../lib/http.js';
import { sessionFrom } from '../lib/auth.js';
import { holdings } from '../lib/holdings.js';

export const GET = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'secret', 'alchemyKey');
  const address = await sessionFrom(request, cfg.secret);
  const fresh = new URL(request.url).searchParams.has('fresh');
  return json({ address, regens: await holdings(address, cfg, { fresh }) });
});
export const OPTIONS = options;
