// GET /api/setup  ->  a plain page that checks your settings and finds the staking vault for you.
// It shows nothing secret: only whether each setting is there.
import { config, REGENS_CONTRACT, ANVIL_MARKET } from '../lib/config.js';
import { store } from '../lib/store.js';
import { ownersForContract, rpc } from '../lib/alchemy.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export async function GET() {
  const cfg = config(), rows = [];
  const ok = (good, label, fix) => rows.push(`<li class="${good ? 'ok' : 'no'}">${good ? '✓' : '✗'} ${label}${good ? '' : `<div class="fix">${fix}</div>`}</li>`);
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
  ok(!!cfg.alchemyKey, 'ALCHEMY_API_KEY is set', 'Add it in Vercel → Settings → Environment Variables, then redeploy.');
  ok(cfg.secret && cfg.secret.length >= 16, 'SESSION_SECRET is set', `Add it in Vercel → Settings → Environment Variables. You can use this one: <code>${secret}</code>`);
  let dbOk = false;
  if (cfg.redisUrl && cfg.redisToken) { try { await store(cfg).hgetall('informant:ping'); dbOk = true; } catch {} }
  ok(dbOk, 'The roster database is connected', 'In Vercel → Storage, create an Upstash for Redis database and connect it to this project, then redeploy.');
  let vaultHtml = '';
  if (cfg.alchemyKey) {
    try {
      const owners = (await ownersForContract(cfg.alchemyKey, REGENS_CONTRACT)).sort((a, b) => b.count - a.count).slice(0, 8);
      const list = [];
      for (const o of owners) { const code = await rpc(cfg.alchemyKey, 'eth_getCode', [o.address, 'latest']); list.push({ ...o, contract: !!code && code !== '0x' }); }
      const vaults = list.filter(o => o.contract && o.address !== ANVIL_MARKET);
      vaultHtml = `<h2>Staked re:gens</h2><p>The biggest holders of re:gens on Base:</p><table>${list.map(o => `<tr><td>${o.count}</td><td><code>${esc(o.address)}</code></td><td>${o.address === ANVIL_MARKET ? 'Anvil market (for sale, skip)' : o.contract ? '<b>vault</b>' : 'wallet'}</td></tr>`).join('')}</table>`;
      if (vaults.length) {
        const line = 'staked:' + vaults[0].address + (vaults[1] ? ',borrowed:' + vaults[1].address : '');
        vaultHtml += cfg.vaults.length ? `<p class="ok">✓ REGEN_VAULTS is set.</p>` : `<p>To count staked re:gens, add this environment variable and redeploy:</p><p><b>REGEN_VAULTS</b> = <code>${esc(line)}</code></p><p class="fix">The bigger vault is usually staking and the smaller one loans. If the numbers look off, ask before guessing.</p>`;
      } else vaultHtml += '<p>No vault contracts found. Staked re:gens probably stay in wallets, which already count.</p>';
    } catch (e) { vaultHtml = `<h2>Staked re:gens</h2><p class="no">Couldn't reach Alchemy: ${esc(e.message)}. Check the API key is for Base Mainnet.</p>`; }
  }
  const allGood = rows.every(r => r.includes('class="ok"'));
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>re:informant setup</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#0D1814;color:#F1F5EE;max-width:640px;margin:0 auto;padding:20px}h1,h2{font-weight:700}li{list-style:none;margin:10px 0}.ok{color:#9CC4B4}.no{color:#FF8A3D}.fix{color:#c9d6d0;font-size:14px;margin:4px 0 0 22px}code{background:#21362C;padding:2px 5px;border-radius:3px;word-break:break-all;color:#FFC531}table{border-collapse:collapse;font-size:14px}td{padding:4px 8px;border-bottom:1px solid #21362C}a{color:#FFC531}</style></head>
<body><h1>re:informant setup</h1><ul>${rows.join('')}</ul>${allGood ? '<p class="ok"><b>All set.</b> <a href="/">Open the game →</a></p>' : ''}${vaultHtml}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
