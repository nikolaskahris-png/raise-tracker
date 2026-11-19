// Read-only probe 4: which Meteora accounts the Star operator wallet touches, and where Star mints sit in them.
import { writeFileSync } from 'node:fs';
import { makeRpc } from './rpc.mjs';
const KEY = process.env.HELIUS_API_KEY;
const { rpc, stats } = makeRpc(`https://mainnet.helius-rpc.com/?api-key=${KEY}`);
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) { let n = 0n; for (const b of buf) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b) break; s = '1' + s; } return s; }
const OP = 'AjkDC1KdkgPaFRtrCbeSh6B6dhVX2JM4o2XhPSs2qu4b';
const L = ['# Star probe 4', ''];
for (const m of ['Fairr196TRbroavk2QhRb3RRDH1ZpdWC3yJDTDDestar']) {
  const a = await rpc('getAsset', { id: m });
  L.push(`- ${m}: ${a?.content?.metadata?.name} / ${a?.content?.metadata?.symbol}, authorities ${(a?.authorities ?? []).map((x) => x.address).join(',')}, supply ${a?.token_info?.supply}`);
}
const sigs = (await rpc('getSignaturesForAddress', [OP, { limit: 200 }])).filter((s) => !s.err);
const progCount = {}, acctUse = {};
for (const s of sigs.slice(0, 40)) {
  const tx = await rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
  const all = [...tx.transaction.message.instructions, ...(tx.meta?.innerInstructions ?? []).flatMap((g) => g.instructions)];
  for (const ix of all) {
    progCount[ix.programId] = (progCount[ix.programId] ?? 0) + 1;
    for (const k of ix.accounts ?? []) { const u = (acctUse[k] ??= { n: 0, progs: new Set() }); u.n++; u.progs.add(ix.programId); }
  }
}
L.push('', '## Programs in 40 recent operator transactions', ...Object.entries(progCount).sort((a, b) => b[1] - a[1]).map(([p, n]) => `- ${p}: ${n}`));
// Accounts that recur across transactions are configs/authorities; inspect the top ones.
const top = Object.entries(acctUse).filter(([k]) => k !== OP).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
L.push('', '## Most-used accounts (owner, size, first 8 bytes, pubkeys ending in "star" inside)');
const found = {};
for (const [k, u] of top) {
  const i = await rpc('getAccountInfo', [k, { encoding: 'base64' }]);
  const v = i?.value; if (!v) { L.push(`- ${k}: no account (used ${u.n}×)`); continue; }
  const d = Buffer.from(v.data[0], 'base64');
  const stars = [];
  for (let off = 0; off + 32 <= d.length; off++) { const s = b58(d.subarray(off, off + 32)); if (s.endsWith('star') && s.length >= 43) stars.push(`${off}:${s}`); }
  found[k] = { owner: v.owner, size: d.length };
  L.push(`- ${k} (used ${u.n}× by ${[...u.progs].join(',')}): owner ${v.owner}, size ${d.length}, disc ${d.subarray(0, 8).toString('hex')}${stars.length ? `, star pubkeys ${stars.join(' ')}` : ''}`);
}
writeFileSync('star-probe4.json', JSON.stringify({ progCount, found, rpcCalls: stats.calls }, null, 1));
L.push('', `RPC calls: ${stats.calls}`);
console.log(L.join('\n'));
