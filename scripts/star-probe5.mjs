// Read-only probe 5: are Star tokens Meteora DBC launches? Find their pool, then every pool on the same config.
import { writeFileSync } from 'node:fs';
import { makeRpc } from './rpc.mjs';
const KEY = process.env.HELIUS_API_KEY;
const { rpc, stats } = makeRpc(`https://mainnet.helius-rpc.com/?api-key=${KEY}`, { attempts: 4 });
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) { let n = 0n; for (const b of buf) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b) break; s = '1' + s; } return s; }
const PROGS = { DBC: 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', DAMM2: 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG' };
const MINTS = { STAR: 'StargWr5r6r8gZSjmEKGZ1dmvKWkj79r2z1xqjFstar', FAIR: 'Fairr196TRbroavk2QhRb3RRDH1ZpdWC3yJDTDDestar' };
const OFFS = [8, 40, 72, 104, 136, 168, 200, 232];
const L = ['# Star probe 5', ''];
const hits = [];
for (const [pn, prog] of Object.entries(PROGS)) for (const [mn, mint] of Object.entries(MINTS)) for (const off of OFFS) {
  let r; try { r = await rpc('getProgramAccounts', [prog, { encoding: 'base64', filters: [{ memcmp: { offset: off, bytes: mint } }] }]); } catch (e) { L.push(`- ${pn} ${mn} @${off}: error ${e.message.slice(0, 120)}`); continue; }
  if (r.length) { for (const a of r) { const d = Buffer.from(a.account.data[0], 'base64'); hits.push({ pn, prog, mn, off, pubkey: a.pubkey, size: d.length, d }); } L.push(`- ${pn} ${mn} @${off}: ${r.length} account(s) ${r.map((a) => a.pubkey).join(', ')}`); }
}
if (!hits.length) L.push('No DBC or DAMM v2 account holds either mint at the tried offsets.');
// For each hit: print every pubkey field, so the config/creator fields can be read.
const configs = new Set();
for (const h of hits) {
  L.push('', `## ${h.pn} account ${h.pubkey} (size ${h.size}, disc ${h.d.subarray(0, 8).toString('hex')}), mint at ${h.off}`);
  for (let off = 8; off + 32 <= Math.min(h.size, 8 + 32 * 8); off += 32) L.push(`- @${off}: ${b58(h.d.subarray(off, off + 32))}`);
  if (h.pn === 'DBC') for (const off of [8, 40, 72, 104]) { const k = b58(h.d.subarray(off, off + 32)); if (k !== MINTS[h.mn]) configs.add(`${off}:${k}`); }
}
// Candidate configs: an account owned by DBC whose pubkey appears in the pool. Every pool sharing it is a Star pool.
const pools = {};
for (const c of configs) {
  const [off, key] = c.split(':');
  const i = await rpc('getAccountInfo', [key, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]);
  if (i?.value?.owner !== PROGS.DBC) continue;
  const r = await rpc('getProgramAccounts', [PROGS.DBC, { encoding: 'base64', filters: [{ memcmp: { offset: Number(off), bytes: key } }] }]);
  L.push('', `## Config candidate ${key} (field @${off}): ${r.length} pools share it`);
  for (const a of r) {
    const d = Buffer.from(a.account.data[0], 'base64');
    const fields = []; for (let o = 8; o + 32 <= Math.min(d.length, 8 + 32 * 8); o += 32) fields.push(b58(d.subarray(o, o + 32)));
    const mint = fields.find((f) => f.endsWith('star')) ?? '';
    pools[a.pubkey] = { config: key, mint, fields };
    L.push(`- pool ${a.pubkey}: star mint ${mint || '(none at 32-byte steps)'}`);
  }
}
writeFileSync('star-probe5.json', JSON.stringify({ hits: hits.map(({ d, ...h }) => h), pools, rpcCalls: stats.calls }, null, 1));
L.push('', `RPC calls: ${stats.calls}`);
console.log(L.join('\n'));
