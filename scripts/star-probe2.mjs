// Read-only probe 2: the program that created the STAR mint (9L1qq…). Accounts by size, where Star mints sit, recent instructions.
import { writeFileSync } from 'node:fs';
import { makeRpc } from './rpc.mjs';
const KEY = process.env.HELIUS_API_KEY;
if (!KEY) { console.error('HELIUS_API_KEY is not set'); process.exit(1); }
const { rpc, stats } = makeRpc(`https://mainnet.helius-rpc.com/?api-key=${KEY}`);
const PROG = '9L1qqo7q7vq7sKuMsBGKPF81z6GK7N4orWGgGFwwqqDF';
const STAR = 'StargWr5r6r8gZSjmEKGZ1dmvKWkj79r2z1xqjFstar';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(buf) { let n = 0n; for (const b of buf) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b) break; s = '1' + s; } return s; }
function unb58(s) { let n = 0n; for (const c of s) n = n * 58n + BigInt(A.indexOf(c)); const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const c of s) { if (c !== '1') break; out.unshift(0); } while (out.length < 32) out.unshift(0); return Buffer.from(out); }
const L = ['# Star probe 2', ''];
const o = {};
// 1. program account
const pi = await rpc('getAccountInfo', [PROG, { encoding: 'jsonParsed' }]);
o.program = { owner: pi?.value?.owner, executable: pi?.value?.executable, programData: pi?.value?.data?.parsed?.info?.programData };
if (o.program.programData) { const pd = await rpc('getAccountInfo', [o.program.programData, { encoding: 'jsonParsed', dataSlice: { offset: 0, length: 0 } }]); o.program.upgradeAuthority = pd?.value?.data?.parsed?.info?.authority ?? null; o.program.slot = pd?.value?.data?.parsed?.info?.slot ?? null; }
L.push(`program ${PROG}: owner ${o.program.owner}, programData ${o.program.programData}, upgrade authority ${o.program.upgradeAuthority}, deployed slot ${o.program.slot}`);
// 2. accounts owned by the program, grouped by size + 8-byte discriminator
const accs = await rpc('getProgramAccounts', [PROG, { encoding: 'base64' }]);
const starB = unb58(STAR), usdcB = unb58(USDC);
const groups = {};
for (const a of accs) {
  const d = Buffer.from(a.account.data[0], 'base64');
  const k = `${d.length}:${d.subarray(0, 8).toString('hex')}`;
  const g = (groups[k] ??= { n: 0, lamports: 0, starAt: null, usdcAt: null, sample: a.pubkey, accounts: [] });
  g.n++; g.accounts.push({ pubkey: a.pubkey, d });
  const si = d.indexOf(starB); if (si >= 0 && g.starAt === null) { g.starAt = si; g.starAcc = a.pubkey; }
  const ui = d.indexOf(usdcB); if (ui >= 0 && g.usdcAt === null) g.usdcAt = ui;
}
L.push('', `## ${accs.length} accounts owned by the program`, '| size | discriminator | count | STAR mint at offset | USDC mint at offset | sample |', '|---|---|---|---|---|---|');
for (const [k, g] of Object.entries(groups).sort((a, b) => b[1].n - a[1].n)) { const [size, disc] = k.split(':'); L.push(`| ${size} | ${disc} | ${g.n} | ${g.starAt ?? ''} ${g.starAcc ?? ''} | ${g.usdcAt ?? ''} | ${g.sample} |`); }
// 3. for the group that holds STAR: the pubkey at the same offset in every account (candidate list of Star mints)
o.mints = [];
for (const [k, g] of Object.entries(groups)) {
  if (g.starAt === null) continue;
  L.push('', `## Group ${k}: pubkey at offset ${g.starAt} in each account`);
  for (const a of g.accounts) {
    const m = b58(a.d.subarray(g.starAt, g.starAt + 32));
    o.mints.push({ group: k, account: a.pubkey, mint: m });
    L.push(`- ${a.pubkey} → ${m}${m.endsWith('star') ? ' ✓star' : ''}`);
  }
}
// 4. recent transactions: instruction names
const sigs = await rpc('getSignaturesForAddress', [PROG, { limit: 1000 }]);
o.sigCount = sigs.length; o.oldestRecent = sigs.at(-1)?.blockTime ? new Date(sigs.at(-1).blockTime * 1000).toISOString() : null;
const names = {};
for (const s of sigs.filter((x) => !x.err).slice(0, 60)) {
  const tx = await rpc('getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }]);
  const logs = tx?.meta?.logMessages ?? []; let inProg = false;
  for (const l of logs) {
    if (l.startsWith(`Program ${PROG} invoke`)) inProg = true;
    else if (l.startsWith('Program ') && / invoke /.test(l)) inProg = false;
    const m = inProg && /Program log: Instruction: (\w+)/.exec(l); if (m) names[m[1]] = (names[m[1]] ?? 0) + 1;
  }
}
L.push('', `## Recent transactions: ${sigs.length} signatures (oldest of these: ${o.oldestRecent}); instruction names in the last 60 successful`, ...Object.entries(names).sort((a, b) => b[1] - a[1]).map(([n, c]) => `- ${n}: ${c}`));
writeFileSync('star-probe2.json', JSON.stringify({ ...o, groups: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { n: g.n, starAt: g.starAt, usdcAt: g.usdcAt, sample: g.sample }])), names, rpcCalls: stats.calls }, null, 1));
L.push('', `RPC calls: ${stats.calls}`);
console.log(L.join('\n'));
