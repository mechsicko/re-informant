// Which re:gens does a wallet hold? Two places to look:
//  1. the wallet itself (this also covers soft staking, where the NFT never leaves the wallet)
//  2. vault contracts (Anvil staking, loans): a re:gen counts as yours if the last deposit of it
//     into the vault came from your wallet and it hasn't come back out since.
import { REGENS_CONTRACT } from './config.js';
import { nftsForOwner, metadataBatch, transfers } from './alchemy.js';
import { fighterFromTraits } from './traits.js';

const LEDGER_TTL = 60e3, HOLD_TTL = 60e3;
const ledgers = new Map();   // vault -> { at, promise }
const held = new Map();      // address -> { at, promise }

async function buildLedger(key, vault) {
  const [ins, outs] = await Promise.all([
    transfers(key, { contract: REGENS_CONTRACT, toAddress: vault }),
    transfers(key, { contract: REGENS_CONTRACT, fromAddress: vault }),
  ]);
  const lastIn = new Map(), lastOut = new Map();
  for (const t of ins) if (!lastIn.has(t.id)) lastIn.set(t.id, t);          // newest first, so the first one wins
  for (const t of outs) if (!lastOut.has(t.id)) lastOut.set(t.id, t.block);
  return { lastIn, lastOut };
}
function ledger(key, vault) {
  const c = ledgers.get(vault);
  if (c && Date.now() - c.at < LEDGER_TTL) return c.promise;
  const promise = buildLedger(key, vault).catch(e => { ledgers.delete(vault); throw e; });
  ledgers.set(vault, { at: Date.now(), promise });
  return promise;
}
export async function vaultTokensOf(key, vault, address) {
  const { lastIn, lastOut } = await ledger(key, vault);
  const out = [];
  for (const [id, t] of lastIn) if (t.from === address && t.block > (lastOut.get(id) ?? -1)) out.push(id);
  return out;
}

async function lookup(address, cfg) {
  const key = cfg.alchemyKey;
  const wallet = await nftsForOwner(key, address, REGENS_CONTRACT);
  const inVaults = [];
  for (const v of cfg.vaults) for (const id of await vaultTokensOf(key, v.address, address)) inVaults.push({ id, where: v.label });
  const meta = inVaults.length ? await metadataBatch(key, REGENS_CONTRACT, inVaults.map(x => x.id)) : [];
  const metaById = new Map(meta.map(m => [m.id, m]));
  const list = [
    ...wallet.map(n => ({ id: n.id, where: 'wallet', attributes: n.attributes })),
    ...inVaults.map(x => ({ id: x.id, where: x.where, attributes: (metaById.get(x.id) || {}).attributes || {} })),
  ].filter(x => Number.isInteger(x.id) && x.id > 0);
  const seen = new Set();
  return list.filter(x => !seen.has(x.id) && seen.add(x.id))
    .map(x => ({ ...x, ...fighterFromTraits(x.attributes, x.id) }))
    .sort((a, b) => a.id - b.id);
}
export function holdings(address, cfg, { fresh = false } = {}) {
  address = address.toLowerCase();
  const c = held.get(address);
  if (!fresh && c && Date.now() - c.at < HOLD_TTL) return c.promise;
  const promise = lookup(address, cfg).catch(e => { held.delete(address); throw e; });
  held.set(address, { at: Date.now(), promise });
  return promise;
}
export function clearCaches() { ledgers.clear(); held.clear(); }
