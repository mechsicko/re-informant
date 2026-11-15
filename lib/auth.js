// Sign-in with Ethereum (EIP-4361), with no database:
//  - the server writes the message and hands back a sealed ticket for it
//  - the wallet signs the exact message
//  - the server checks the ticket, the message and the signature, then issues a sealed session
import { createSiweMessage, generateSiweNonce, parseSiweMessage } from 'viem/siwe';
import { getAddress, verifyMessage, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CHAIN_ID } from './config.js';
import { fail } from './http.js';

const enc = new TextEncoder();
const b64url = buf => Buffer.from(buf).toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url');
const keys = new Map();
async function hmacKey(secret) {
  if (!keys.has(secret)) keys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  return keys.get(secret);
}
export async function seal(obj, secret) {
  const body = b64url(enc.encode(JSON.stringify(obj)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64url(sig);
}
export async function unseal(token, secret) {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64(sig), enc.encode(body));
  if (!ok) return null;
  try {
    const obj = JSON.parse(unb64(body).toString('utf8'));
    if (!obj || typeof obj.exp !== 'number' || obj.exp < Date.now()) return null;
    return obj;
  } catch { return null; }
}
const sha256 = async s => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));

export const STATEMENT = "Sign in to re:informant. This proves you hold your re:gens. It's free and doesn't move anything.";

export async function loginMessage({ address, host, origin, secret }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) throw fail(400, 'That is not a wallet address.');
  const now = new Date();
  const message = createSiweMessage({
    address: getAddress(address), chainId: CHAIN_ID, domain: host, uri: origin, version: '1',
    nonce: generateSiweNonce(), statement: STATEMENT, issuedAt: now,
    expirationTime: new Date(now.getTime() + 10 * 60e3),
  });
  const ticket = await seal({ h: await sha256(message), exp: now.getTime() + 10 * 60e3 }, secret);
  return { message, ticket };
}

export async function verifyLogin({ message, signature, ticket, host, secret, rpcUrl }) {
  if (typeof message !== 'string' || typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) throw fail(400, 'Missing signature.');
  const t = await unseal(ticket, secret);
  if (!t || t.h !== await sha256(message)) throw fail(401, 'This sign-in request expired. Try again.');
  const m = parseSiweMessage(message);
  if (m.domain !== host) throw fail(401, 'This message was made for a different site.');
  if (m.chainId !== CHAIN_ID) throw fail(401, 'Wrong network in the message.');
  if (m.expirationTime && m.expirationTime.getTime() < Date.now()) throw fail(401, 'This sign-in request expired. Try again.');
  const address = getAddress(m.address);
  // regular wallets: check the signature locally
  let ok = false;
  try { ok = await verifyMessage({ address, message, signature }); } catch {}
  // smart wallets (Coinbase Smart Wallet and friends) sign through their contract: ask Base
  if (!ok && rpcUrl) {
    try { ok = await createPublicClient({ chain: base, transport: http(rpcUrl) }).verifyMessage({ address, message, signature }); } catch {}
  }
  if (!ok) throw fail(401, "That signature doesn't match the wallet.");
  return address.toLowerCase();
}

export async function newSession(address, secret) {
  return seal({ a: address, exp: Date.now() + 7 * 24 * 3600e3 }, secret);
}
export async function sessionFrom(request, secret) {
  const h = request.headers.get('authorization') || '';
  const s = await unseal(h.replace(/^Bearer\s+/i, ''), secret);
  if (!s || !/^0x[0-9a-f]{40}$/.test(s.a || '')) throw fail(401, 'Sign in with your wallet first.');
  return s.a;
}
