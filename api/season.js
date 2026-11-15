// POST /api/season (Authorization: Bearer <session>) { id, data }  ->  records a finished week once
import { config, requireConfig } from '../lib/config.js';
import { handle, json, body, options } from '../lib/http.js';
import { sessionFrom } from '../lib/auth.js';
import { settle } from '../lib/roster.js';

export const POST = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'secret');
  await sessionFrom(request, cfg.secret);
  const { id, data } = await body(request);
  return json(await settle(cfg, id, data));
});
export const OPTIONS = options;
