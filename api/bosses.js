// GET /api/bosses  ->  { bosses: [{ token, name, family, type, style }] }   the eight family bosses, traits from the chain
import { config, requireConfig } from '../lib/config.js';
import { handle, json, options } from '../lib/http.js';
import { bosses } from '../lib/bosses.js';

export const GET = handle(async () => {
  const cfg = config(); requireConfig(cfg, 'alchemyKey');
  return json({ bosses: await bosses(cfg) }, 200, { 'cache-control': 'public, max-age=3600, s-maxage=21600' });
});
export const OPTIONS = options;
