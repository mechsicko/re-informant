// Thin wrappers over the Alchemy NFT API and RPC on Base.
import { fail } from './http.js';

const nftBase = key => `https://base-mainnet.g.alchemy.com/nft/v3/${key}`;
export const rpcUrl = key => key ? `https://base-mainnet.g.alchemy.com/v2/${key}` : '';

async function getJson(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw fail(502, `Couldn't reach the NFT index (${r.status}). Try again in a moment.`);
  return r.json();
}
const toId = v => { try { return Number(BigInt(v)); } catch { return NaN; } };

// every re:gen sitting in an address
export async function nftsForOwner(key, owner, contract) {
  const out = [];
  let pageKey = '';
  for (let page = 0; page < 80; page++) {
    const q = new URLSearchParams({ owner, withMetadata: 'true', pageSize: '100' });
    q.append('contractAddresses[]', contract);
    if (pageKey) q.set('pageKey', pageKey);
    const r = await getJson(`${nftBase(key)}/getNFTsForOwner?${q}`);
    for (const n of r.ownedNfts || []) out.push({ id: toId(n.tokenId), attributes: attrs(n), image: n.image || null });
    pageKey = r.pageKey; if (!pageKey) break;
  }
  return out;
}
export async function metadataBatch(key, contract, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await getJson(`${nftBase(key)}/getNFTMetadataBatch`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokens: ids.slice(i, i + 100).map(id => ({ contractAddress: contract, tokenId: String(id) })) }),
    });
    for (const n of r.nfts || r || []) out.push({ id: toId(n.tokenId), attributes: attrs(n), image: n.image || null });
  }
  return out;
}
export async function nftMetadata(key, contract, id) {
  const q = new URLSearchParams({ contractAddress: contract, tokenId: String(id) });
  return getJson(`${nftBase(key)}/getNFTMetadata?${q}`);
}
export async function ownersForContract(key, contract) {
  const out = [];
  let pageKey = '';
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ contractAddress: contract, withTokenBalances: 'true' });
    if (pageKey) q.set('pageKey', pageKey);
    const r = await getJson(`${nftBase(key)}/getOwnersForContract?${q}`);
    for (const o of r.owners || []) out.push({ address: (o.ownerAddress || '').toLowerCase(), count: (o.tokenBalances || []).length });
    pageKey = r.pageKey; if (!pageKey) break;
  }
  return out;
}
// ERC-721 transfers of one contract into or out of an address, newest first
export async function transfers(key, { contract, toAddress, fromAddress, maxPages = 25 }) {
  const out = [];
  let pageKey;
  for (let page = 0; page < maxPages; page++) {
    const params = { fromBlock: '0x0', toBlock: 'latest', contractAddresses: [contract], category: ['erc721'], order: 'desc', maxCount: '0x3e8', excludeZeroValue: false, withMetadata: false };
    if (toAddress) params.toAddress = toAddress;
    if (fromAddress) params.fromAddress = fromAddress;
    if (pageKey) params.pageKey = pageKey;
    const r = await getJson(rpcUrl(key), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }) });
    if (r.error) throw fail(502, 'NFT index error: ' + (r.error.message || 'unknown'));
    for (const t of r.result.transfers || []) {
      out.push({ from: (t.from || '').toLowerCase(), to: (t.to || '').toLowerCase(), id: toId(t.erc721TokenId ?? t.tokenId), block: parseInt(t.blockNum, 16) });
    }
    pageKey = r.result.pageKey; if (!pageKey) break;
  }
  return out;
}
export async function rpc(key, method, params) {
  const r = await getJson(rpcUrl(key), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return r.result;
}
function attrs(n) {
  const a = (n.raw && n.raw.metadata && n.raw.metadata.attributes) || (n.metadata && n.metadata.attributes) || [];
  const out = {};
  if (Array.isArray(a)) for (const t of a) if (t && t.trait_type) out[String(t.trait_type).toLowerCase()] = String(t.value ?? '').toLowerCase();
  return out;
}
