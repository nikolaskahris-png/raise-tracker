// Read-only probe 6: the creation transaction of smaller Star mints, to see which program launched them.
import { makeRpc } from './rpc.mjs';
const KEY = process.env.HELIUS_API_KEY;
const { rpc, stats } = makeRpc(`https://mainnet.helius-rpc.com/?api-key=${KEY}`);
const MINTS = ['Fairr196TRbroavk2QhRb3RRDH1ZpdWC3yJDTDDestar', 'BmauxgRrMwpbSuK8MAK8KLvE8fGGuW8dhVDzU3WUstar'];
const L = ['# Star probe 6', ''];
for (const m of MINTS) {
  const a = await rpc('getAsset', { id: m });
  L.push(`## ${m}: ${a?.content?.metadata?.name} / ${a?.content?.metadata?.symbol}, authority ${(a?.authorities ?? []).map((x) => x.address).join(',')}, mint authority ${a?.token_info?.mint_authority}`);
  let before, last = null, pages = 0, total = 0;
  for (;;) { const p = await rpc('getSignaturesForAddress', [m, { limit: 1000, ...(before ? { before } : {}) }]); pages++; total += p.length; if (!p.length) break; last = p.at(-1); before = last.signature; if (p.length < 1000 || pages >= 300) break; }
  L.push(`- ${total} signatures over ${pages} pages; reached the oldest: ${pages < 300}`);
  if (!last) continue;
  const tx = await rpc('getTransaction', [last.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey ?? k);
  L.push(`- oldest ${last.signature} at ${new Date(last.blockTime * 1000).toISOString()}, fee payer ${keys[0]}`);
  L.push(`- top-level programs: ${tx.transaction.message.instructions.map((i) => i.programId).join(', ')}`);
  L.push('```', ...(tx.meta?.logMessages ?? []).slice(0, 60), '```');
  L.push('- accounts:', ...keys.map((k, i) => `  ${i}: ${k}`));
}
L.push('', `RPC calls: ${stats.calls}`);
console.log(L.join('\n'));
