// The eight family bosses (see FAMILIES in engine/rat.js). Their traits come from the chain like any re:gen's,
// so their role and knack match the real art. Names are reserved: only the holder of a boss's re:gen may use it.
import { createRequire } from 'module';
import { REGENS_CONTRACT } from './config.js';
import { metadataBatch } from './alchemy.js';
import { fighterFromTraits } from './traits.js';
import { fail } from './http.js';

const require = createRequire(import.meta.url);
const { FAMILIES } = require('./engine/rat.js');
const TTL = 6 * 3600e3;
let cache = null;   // { at, promise }

async function lookup(cfg) {
  const ids = FAMILIES.map(f => f.token);
  const meta = await metadataBatch(cfg.alchemyKey, REGENS_CONTRACT, ids);
  const byId = new Map(meta.map(m => [m.id, m]));
  return FAMILIES.map(f => {
    const m = byId.get(f.token);
    if (!m) return null;
    return { token: f.token, name: f.name, family: f.family, ...fighterFromTraits(m.attributes || {}, f.token) };
  }).filter(Boolean);
}
export function bosses(cfg) {
  if (cache && Date.now() - cache.at < TTL) return cache.promise;
  const promise = lookup(cfg).catch(e => { cache = null; throw e; });
  cache = { at: Date.now(), promise };
  return promise;
}
// a boss's name belongs to its family: anyone else using it gets turned away
export function checkName(name, token) {
  const f = FAMILIES.find(x => x.name === name);
  if (f && f.token !== token) throw fail(400, `${f.name} runs ${f.family}. That name is taken. Pick another.`);
}
