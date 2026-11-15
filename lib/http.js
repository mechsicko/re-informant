import { config } from './config.js';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(), ...headers },
  });
}
export function cors() {
  const o = config().allowedOrigin;
  return o ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' } : {};
}
export const options = () => new Response(null, { status: 204, headers: cors() });

// wrap a handler so thrown errors become clean JSON
export function handle(fn) {
  return async request => {
    try { return await fn(request); }
    catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      return json({ error: status >= 500 && !e.expose ? (e.message.startsWith('Server is missing') ? e.message : 'Something went wrong on our side.') : e.message }, status);
    }
  };
}
export const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });

export async function body(request, max = 64_000) {
  const text = await request.text();
  if (text.length > max) throw fail(413, 'Request too large.');
  try { return JSON.parse(text || '{}'); } catch { throw fail(400, 'Bad JSON.'); }
}

// the site's own host, as the wallet will see it (used in the sign-in message)
// When the game page lives on another site (ALLOWED_ORIGIN, e.g. https://mechsicko.art), the wallet sees that
// site, so the sign-in message names it. Only that one allowed origin is trusted; anything else gets this server's own host.
export function siteOf(request) {
  const allowed = (config().allowedOrigin || '').replace(/\/$/, '');
  const from = request.headers.get('origin');
  if (allowed && allowed !== '*' && from === allowed) { const u = new URL(allowed); return { host: u.host, origin: u.origin }; }
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return { host, origin: `${proto}://${host}` };
}
