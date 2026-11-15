// A fake Alchemy so the server can be tested without network access.
export const VAULT = '0x' + 'aa'.repeat(20);
export function installFakeAlchemy({ user, other }) {
  const calls = [];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" shape-rendering="crispEdges"><rect width="18" height="18" fill="#639685"/><rect x="5" y="4" width="8" height="10" fill="#ffddcf"/></svg>';
  const attrsFor = id => ({ 1309: { type: 'type 3', eyes: 'evil' }, 42: { type: 'ape', eyes: 'sleep' }, 5: { type: 'mummy', eyes: 'sus' } }[id] || {});
  const nft = id => ({ tokenId: String(id), raw: { metadata: { attributes: Object.entries(attrsFor(id)).map(([trait_type, value]) => ({ trait_type, value })), image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') } }, image: {} });
  const tx = (from, to, id, block) => ({ from, to, erc721TokenId: '0x' + id.toString(16), blockNum: '0x' + block.toString(16) });
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); calls.push(url);
    const ok = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    if (url.includes('/getNFTsForOwner')) {
      const owner = new URL(url).searchParams.get('owner').toLowerCase();
      return ok({ ownedNfts: owner === user ? [nft(1309), nft(42)] : [], pageKey: null });
    }
    if (url.includes('/getNFTMetadataBatch')) {
      const { tokens } = JSON.parse(init.body);
      return ok({ nfts: tokens.map(t => nft(Number(t.tokenId))) });
    }
    if (url.includes('/getNFTMetadata?')) return ok(nft(Number(new URL(url).searchParams.get('tokenId'))));
    if (url.includes('/getOwnersForContract')) return ok({ owners: [{ ownerAddress: VAULT, tokenBalances: [{}, {}, {}] }, { ownerAddress: user, tokenBalances: [{}, {}] }, { ownerAddress: '0xb1792babd1b8e02f14dd0bf915c6de2958905864', tokenBalances: [{}, {}, {}, {}] }] });
    if (url.includes('/v2/')) {
      const { method, params } = JSON.parse(init.body);
      if (method === 'alchemy_getAssetTransfers') {
        const p = params[0];
        if (p.toAddress === VAULT) return ok({ result: { transfers: [tx(other, VAULT, 7, 300), tx(user, VAULT, 9, 200), tx(user, VAULT, 5, 150), tx(user, VAULT, 7, 100)] } });
        if (p.fromAddress === VAULT) return ok({ result: { transfers: [tx(VAULT, user, 9, 250), tx(VAULT, user, 7, 120)] } });
        return ok({ result: { transfers: [] } });
      }
      if (method === 'eth_getCode') return ok({ result: [VAULT, '0xb1792babd1b8e02f14dd0bf915c6de2958905864'].includes(params[0]) ? '0x6080' : '0x' });
      return ok({ result: '0x' });
    }
    return new Response('not found', { status: 404 });
  };
  return calls;
}
