// Adds the spending_limit_changes column to the frozen site fixture (site/test/fixtures/2026-11-16/treasury.csv),
// read from the chain with the same function treasury.mjs uses, and stores the chain answers for two treasuries
// (Umbra: admin key; LFOWN: futarchy proposal; PAYS: removed, set, removed) so scripts/test/classify.test.mjs can replay them offline.
// Run once from the repo root:  node scripts/test/record-limit-changes.mjs
// Uses the public RPC (or Helius when HELIUS_API_KEY is set; the key is never written).
import { readFileSync, writeFileSync } from 'node:fs';
import { makeRpc } from '../rpc.mjs';
import { indexProposals, makeClassifier } from '../classify.mjs';

const FIX = 'site/test/fixtures/2026-11-16/';
const url = process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com';
const { rpc: live } = makeRpc(url, { minGapMs: 250, attempts: 10, backoffMs: 3000 });
const KEEP = new Set(['UMBRA', 'LFOWN', 'PAYZP1W3']);

const lines = readFileSync(FIX + 'treasury.csv', 'utf8').replace(/\r/g, '').trimEnd().split('\n');
const cols = lines[0].split(',');
if (cols.includes('spending_limit_changes')) throw new Error('column already there');
const col = (row, name) => row[cols.indexOf(name)];
const flows = readFileSync(FIX + 'treasury-flows.csv', 'utf8').replace(/\r/g, '').trim().split('\n');
const fcols = flows[0].split(',');
const draws = flows.slice(1).map((l) => l.split(',')).filter((r) => r[fcols.indexOf('class')] === 'team_budget');
// the frozen data was read at the treasury report's time: later changes are not part of it
const readAt = Date.parse(/^# Treasury report — (\S+)$/m.exec(readFileSync(FIX + 'treasury-report.md', 'utf8'))[1]);

const micro = (v) => `${v / 1000000n}.${(v % 1000000n).toString().padStart(6, '0')}`;
const kept = {};
const out = [lines[0] + ',spending_limit_changes'];
for (const line of lines.slice(1)) {
  const row = line.split(',');
  const label = col(row, 'ticker'), account = col(row, 'spending_limit_account');
  const answers = {};
  const rpc = async (m, p) => { const r = await live(m, p); answers[`${m} ${JSON.stringify(p)}`] = r; return r; };
  const k = makeClassifier({ rpc, proposals: indexProposals([]), adminVoteWindowS: 0 });
  const skip = new Set(draws.filter((r) => r[fcols.indexOf('base_mint')] === col(row, 'base_mint')).map((r) => r[fcols.indexOf('signature')]));
  const ch = account ? (await k.spendingLimitChanges({ account, dao: col(row, 'dao'), multisig: col(row, 'squads_multisig'), launchSignature: col(row, 'launch_signature'), skip })).filter((c) => Date.parse(c.time) <= readAt) : [];
  const value = ch.map((c) => `${c.time}|${c.signature}|${c.path}|${c.action}|${c.amount === null ? '' : micro(c.amount)}|${c.period}`).join(' ');
  console.log(label, ch.map((c) => `${c.time.slice(0, 10)} ${c.path} ${c.action} ${c.amount === null ? '' : micro(c.amount)}`).join('; ') || '-');
  if (KEEP.has(label)) kept[label] = { account, dao: col(row, 'dao'), multisig: col(row, 'squads_multisig'), launch_signature: col(row, 'launch_signature'), skip: [...skip], expect: value, answers };
  out.push(line + ',' + value);
}
writeFileSync(FIX + 'treasury.csv', out.join('\n') + '\n');
writeFileSync('scripts/test/fixtures/classify/limits.json', JSON.stringify(kept) + '\n');
console.log('done');
