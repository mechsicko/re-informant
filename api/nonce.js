// GET /api/nonce?address=0x...  ->  { message, ticket }   (the exact text the wallet will sign)
import { config, requireConfig } from '../lib/config.js';
import { handle, json, siteOf, options } from '../lib/http.js';
import { loginMessage } from '../lib/auth.js';

export const GET = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'secret');
  const { host, origin } = siteOf(request);
  const address = new URL(request.url).searchParams.get('address');
  return json(await loginMessage({ address, host, origin, secret: cfg.secret }));
});
export const OPTIONS = options;
