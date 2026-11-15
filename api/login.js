// POST /api/login { message, signature, ticket }  ->  { session, address, regens }
import { config, requireConfig } from '../lib/config.js';
import { handle, json, body, siteOf, options } from '../lib/http.js';
import { verifyLogin, newSession } from '../lib/auth.js';
import { rpcUrl } from '../lib/alchemy.js';
import { holdings } from '../lib/holdings.js';

export const POST = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'secret', 'alchemyKey');
  const { message, signature, ticket } = await body(request);
  const address = await verifyLogin({ message, signature, ticket, host: siteOf(request).host, secret: cfg.secret, rpcUrl: rpcUrl(cfg.alchemyKey) });
  const [session, regens] = await Promise.all([newSession(address, cfg.secret), holdings(address, cfg, { fresh: true })]);
  return json({ session, address, regens });
});
export const OPTIONS = options;
