// Read-only probe: how do Star (star.fun) raises appear onchain? Writes nothing to data/.
// Needs env HELIUS_API_KEY. Prints a markdown report to stdout and writes star-probe.json.
// Seeds are token mints that public listings attribute to Star; everything else is found from the chain.
import { writeFileSync } from 'node:fs';
import { makeRpc } from './rpc.mjs';

const KEY = process.env.HELIUS_API_KEY;
if (!KEY) { console.error('HELIUS_API_KEY is not set'); process.exit(1); }
const { rpc, stats } = makeRpc(`https://mainnet.helius-rpc.com/?api-key=${KEY}`);

const SEEDS = [
  'StargWr5r6r8gZSjmEKGZ1dmvKWkj79r2z1xqjFstar', // STAR (dexrabbit, phantom listing)
  '2dPkLQi1WLkrbQbBAS9d8GHARF4oWQXFXrUbMq7bstar', // oSTAR "Star (Deprecated)" (solanacompass)
];
const KNOWN = {
  '11111111111111111111111111111111': 'System', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'SPL Token',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022', 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s': 'Metaplex Token Metadata', 'ComputeBudget111111111111111111111111111111': 'Compute Budget',
  'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN': 'Meteora Dynamic Bonding Curve', 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG': 'Meteora DAMM v2',
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': 'Meteora DAMM v1', 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'Meteora DLMM',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo', 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf': 'Squads v4',
};
const name = (p) => KNOWN[p] ?? 'unknown';
const out = { seeds: {}, programs: {}, authorities: {}, assets: {} };

async function oldestSig(addr) {
  let before, last = null, pages = 0;
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [addr, { limit: 1000, ...(before ? { before } : {}) }]);
    pages++;
    if (!page.length) break;
    last = page[page.length - 1]; before = last.signature;
    if (page.length < 1000 || pages >= 50) break;
  }
  return { last, pages };
}
function programsOf(tx) {
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const ps = new Set();
  for (const ix of tx.transaction.message.instructions) ps.add(ix.programId ?? keys[ix.programIdIndex]);
  for (const g of tx.meta?.innerInstructions ?? []) for (const ix of g.instructions) ps.add(ix.programId ?? keys[ix.programIdIndex]);
  return { keys, programs: [...ps] };
}

for (const mint of SEEDS) {
  const s = (out.seeds[mint] = {});
  try {
    const a = await rpc('getAsset', { id: mint });
    s.name = a?.content?.metadata?.name; s.symbol = a?.content?.metadata?.symbol;
    s.authorities = (a?.authorities ?? []).map((x) => x.address);
    s.creators = (a?.creators ?? []).map((x) => x.address);
    s.mintAuthority = a?.token_info?.mint_authority ?? null;
    for (const x of s.authorities) out.authorities[x] = (out.authorities[x] ?? 0) + 1;
  } catch (e) { s.assetError = e.message; }
  try {
    const { last, pages } = await oldestSig(mint);
    s.sigPages = pages; s.oldest = last?.signature; s.oldestTime = last?.blockTime ? new Date(last.blockTime * 1000).toISOString() : null;
    if (last) {
      const tx = await rpc('getTransaction', [last.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
      const { keys, programs } = programsOf(tx);
      s.createProgs = programs.map((p) => `${p} (${name(p)})`);
      s.feePayer = keys[0];
      s.logs = (tx.meta?.logMessages ?? []).filter((l) => /Program log: Instruction|invoke \[1\]/.test(l)).slice(0, 25);
      for (const p of programs) if (name(p) === 'unknown' || /Meteora/.test(name(p))) out.programs[p] = name(p);
    }
  } catch (e) { s.sigError = e.message; }
}

// Every fungible asset under each update authority found on the seeds.
for (const auth of Object.keys(out.authorities)) {
  const list = (out.assets[auth] = []);
  for (let page = 1; page <= 10; page++) {
    let r;
    try { r = await rpc('getAssetsByAuthority', { authorityAddress: auth, page, limit: 1000 }); } catch (e) { list.push({ error: e.message }); break; }
    for (const a of r.items ?? []) list.push({ id: a.id, name: a.content?.metadata?.name, symbol: a.content?.metadata?.symbol, iface: a.interface, supply: a.token_info?.supply ?? null });
    if (!r.items || r.items.length < 1000) break;
  }
}

writeFileSync('star-probe.json', JSON.stringify({ ...out, rpcCalls: stats.calls }, null, 1));
const L = ['# Star probe', '', `RPC calls: ${stats.calls}`, '', '## Seeds'];
for (const [m, s] of Object.entries(out.seeds)) {
  L.push(`### ${m}`, `- name/symbol: ${s.name} / ${s.symbol}`, `- update authorities: ${(s.authorities ?? []).join(', ')}`, `- creators: ${(s.creators ?? []).join(', ')}`, `- mint authority: ${s.mintAuthority}`,
    `- oldest tx: ${s.oldest} (${s.oldestTime}), pages ${s.sigPages}`, `- fee payer: ${s.feePayer}`, `- programs in oldest tx: ${(s.createProgs ?? []).join('; ')}`, `- errors: ${s.assetError ?? ''} ${s.sigError ?? ''}`, '```', ...(s.logs ?? []), '```');
}
L.push('', '## Programs to look at', ...Object.entries(out.programs).map(([p, n]) => `- ${p} (${n})`));
L.push('', '## Assets by authority');
for (const [a, list] of Object.entries(out.assets)) {
  const star = list.filter((x) => x.id?.endsWith('star'));
  L.push(`### ${a}: ${list.length} assets, ${star.length} with a mint ending in "star"`);
  for (const x of star.slice(0, 80)) L.push(`- ${x.id} ${x.symbol ?? ''} ${x.name ?? ''} (${x.iface})`);
}
console.log(L.join('\n'));
