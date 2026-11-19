// Read-only probe 3: who controls the STAR mint, and which "…star" mints the fee payer of its oldest seen tx has touched.
import { writeFileSync } from 'node:fs';
import { makeRpc } from './rpc.mjs';
const KEY = process.env.HELIUS_API_KEY;
const { rpc, stats } = makeRpc(`https://mainnet.helius-rpc.com/?api-key=${KEY}`);
const ADDRS = { mintAuthority: '5bv6cH6Bn9KtnfnAdQNVmdv5QiEGQWmXwysVTVhkupA2', updateAuthority: '8jfVtDM7tbgkWXa8FAVMiDhPMshtSViSYDvTuqSknWeZ', feePayer: 'AjkDC1KdkgPaFRtrCbeSh6B6dhVX2JM4o2XhPSs2qu4b' };
const L = ['# Star probe 3', ''];
for (const [k, a] of Object.entries(ADDRS)) {
  const i = await rpc('getAccountInfo', [a, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]);
  L.push(`- ${k} ${a}: owner ${i?.value?.owner ?? '(no account)'}, executable ${i?.value?.executable ?? ''}, lamports ${i?.value?.lamports ?? ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function enhanced(addr, pages) {
  const all = []; let before = '';
  for (let p = 0; p < pages; p++) {
    const u = `https://api.helius.xyz/v0/addresses/${addr}/transactions?api-key=${KEY}&limit=100${before ? `&before=${before}` : ''}`;
    let r; for (let t = 0; t < 5; t++) { r = await fetch(u); if (r.status !== 429 && r.status < 500) break; await sleep(1500 * (t + 1)); }
    if (!r.ok) { L.push(`enhanced ${addr} page ${p}: HTTP ${r.status}`); break; }
    const j = await r.json(); if (!j.length) break; all.push(...j); before = j.at(-1).signature; await sleep(150);
  }
  return all;
}
const out = {};
for (const who of ['feePayer', 'updateAuthority', 'mintAuthority']) {
  const txs = await enhanced(ADDRS[who], 30);
  const types = {}, mints = {};
  for (const t of txs) {
    const k = `${t.source}/${t.type}`; types[k] = (types[k] ?? 0) + 1;
    for (const tt of t.tokenTransfers ?? []) if (tt.mint?.endsWith('star')) { const m = (mints[tt.mint] ??= { n: 0, first: t.timestamp, last: t.timestamp }); m.n++; m.first = Math.min(m.first, t.timestamp); m.last = Math.max(m.last, t.timestamp); }
    for (const ad of t.accountData ?? []) for (const c of ad.tokenBalanceChanges ?? []) if (c.mint?.endsWith('star')) { const m = (mints[c.mint] ??= { n: 0, first: t.timestamp, last: t.timestamp }); m.n++; }
  }
  out[who] = { txs: txs.length, from: txs.at(-1)?.timestamp, to: txs[0]?.timestamp, types, mints };
  L.push('', `## ${who} ${ADDRS[who]}: ${txs.length} transactions (${txs.at(-1) ? new Date(txs.at(-1).timestamp * 1000).toISOString() : ''} → ${txs[0] ? new Date(txs[0].timestamp * 1000).toISOString() : ''})`, '### source/type', ...Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `- ${k}: ${n}`), `### mints ending in "star": ${Object.keys(mints).length}`, ...Object.entries(mints).sort((a, b) => a[1].first - b[1].first).slice(0, 80).map(([m, v]) => `- ${m}: ${v.n} transfers, first ${new Date(v.first * 1000).toISOString().slice(0, 10)}`));
}
writeFileSync('star-probe3.json', JSON.stringify({ out, rpcCalls: stats.calls }, null, 1));
console.log(L.join('\n'));
