// Local test server: serves public/ and runs api/*.js the same way Vercel does.
//   npm run dev   ->  http://localhost:3000
import './env.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = +process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
        const file = path.join(root, 'api', name + '.js');
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end('{"error":"not found"}'); }
        const mod = await import(pathToFileURL(file).href);
        const fn = mod[req.method];
        if (!fn) { res.writeHead(405); return res.end(); }
        const chunks = []; for await (const c of req) chunks.push(c);
        const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
        const response = await fn(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      let p = path.join(root, 'public', decodeURIComponent(url.pathname));
      if (!p.startsWith(path.join(root, 'public'))) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    } catch (e) { console.error(e); res.writeHead(500); res.end('{"error":"server error"}'); }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createServer().listen(PORT, () => console.log(`re:informant running at http://localhost:${PORT}`));
}
