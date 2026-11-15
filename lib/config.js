// Everything the server needs, read from environment variables.
export const REGENS_CONTRACT = '0x26c42724eba22f2d1a2ac5d35b0344bf2f3f8188';   // re:generates on Base
export const ANVIL_MARKET = '0xb1792babd1b8e02f14dd0bf915c6de2958905864';      // Anvil re:gens market (re:gens for sale, not owned)
export const CHAIN_ID = 8453;                                                   // Base

const env = name => (globalThis.process && process.env && process.env[name]) || '';

// REGEN_VAULTS="staked:0xabc...,borrowed:0xdef..."  (run `npm run find-vaults` to find them)
export function parseVaults(s) {
  return String(s || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const [label, addr] = x.includes(':') ? x.split(':') : ['staked', x];
    return { label: (label || 'staked').toLowerCase().replace(/[^a-z]/g, '') || 'staked', address: (addr || '').toLowerCase() };
  }).filter(v => /^0x[0-9a-f]{40}$/.test(v.address));
}

export function config() {
  return {
    alchemyKey: env('ALCHEMY_API_KEY'),
    secret: env('SESSION_SECRET'),
    vaults: parseVaults(env('REGEN_VAULTS')),
    redisUrl: env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL'),
    redisToken: env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN'),
    allowedOrigin: env('ALLOWED_ORIGIN'),     // only if the game is hosted on a different domain than the API
  };
}

export function requireConfig(cfg, ...keys) {
  const missing = keys.filter(k => !cfg[k]);
  if (missing.length) {
    const names = { alchemyKey: 'ALCHEMY_API_KEY', secret: 'SESSION_SECRET' };
    throw Object.assign(new Error('Server is missing ' + missing.map(k => names[k] || k).join(', ')), { status: 500 });
  }
}
