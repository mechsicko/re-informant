// GET /api/art?id=1309  ->  the re:gen's image, served from this site so the game can read its pixels
import { config, requireConfig, REGENS_CONTRACT } from '../lib/config.js';
import { handle, json, cors } from '../lib/http.js';
import { nftMetadata } from '../lib/alchemy.js';

const gateway = u => u.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + u.slice(7).replace(/^ipfs\//, '') : u;
export const GET = handle(async request => {
  const cfg = config(); requireConfig(cfg, 'alchemyKey');
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1 || id > 6666) return json({ error: 'No such re:gen.' }, 404);
  const meta = await nftMetadata(cfg.alchemyKey, REGENS_CONTRACT, id);
  const img = meta.image || {};
  const raw = (meta.raw && meta.raw.metadata && (meta.raw.metadata.image || meta.raw.metadata.image_data)) || '';
  const src = img.originalUrl || raw || img.pngUrl || img.cachedUrl;
  if (!src) return json({ error: 'No art for this re:gen.' }, 404);
  const headers = { 'cache-control': 'public, max-age=86400, s-maxage=604800, immutable', ...cors() };
  if (src.startsWith('data:')) {   // art stored on-chain
    const [head, data] = src.slice(5).split(',', 2);
    const type = head.split(';')[0] || 'image/svg+xml';
    const bytes = head.includes(';base64') ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8');
    return new Response(bytes, { headers: { 'content-type': type, ...headers } });
  }
  if (src.trim().startsWith('<svg')) return new Response(src, { headers: { 'content-type': 'image/svg+xml', ...headers } });
  const r = await fetch(gateway(src));
  if (!r.ok) return json({ error: "Couldn't load the art." }, 502);
  return new Response(await r.arrayBuffer(), { headers: { 'content-type': r.headers.get('content-type') || 'image/png', ...headers } });
});
