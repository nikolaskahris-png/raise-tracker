// Classifies every USDC movement in and out of each MetaDAO DAO treasury.
// Reads data/raises.json (written by scan.mjs). Needs env HELIUS_API_KEY.
// Writes data/treasury.csv (one row per raise), data/treasury-flows.csv (one row per movement), data/treasury-report.md
//
// How money can leave a treasury (from github.com/MetaDAOProject/programs, futarchy program):
//   team_budget      Squads SpendingLimitUse: the team's monthly allowance, set at launch
//   market_approved  Squads VaultTransactionExecute of a proposal approved by FinalizeProposal (a passed decision market)
//   admin_approved   same, but approved via AdminEnqueueMultisigProposalApproval + ExecuteMultisigProposalApproval
//                    (MetaDAO admin key, or a liquidator on a liquidated DAO) — no market vote
//   other            anything else (reported with the instruction names seen, so it can be reviewed)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { b58e, b58d, USDC } from './decode.mjs';

const KEY = process.env.HELIUS_API_KEY;
if (!KEY) { console.error('HELIUS_API_KEY is not set'); process.exit(1); }
const RPC = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const SQUADS = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const ADMIN_ENQUEUE = '6awyHMshBGVjJ3ozdSJdyyDE1CTAXUwrpNMaRGMsb4sf'; // futarchy admin_enqueue_multisig_proposal_approval
const ADMIN_EXECUTE = 'CWGawadYU8CzRVBecnJymNw97H7E3ndDinV5sMzesgY2'; // futarchy admin_execute_multisig_proposal
const PROGRAM_NAMES = {
  [SQUADS]: 'squads', FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq: 'futarchy', LiQnowFbFQdYyZhF4pUbpsrZCjxRTQ1upKJxZ2VXjde: 'liquidation',
  WALL8ucBuUyL46QYxwYJjidaFYhdvxUFrgvBxPshERx: 'bid_wall', moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n: 'launchpad_v08',
  moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM: 'launchpad_v07', MooNyh4CBUYEKyXVnjGYQ8mEiJDpGvJMdvrZx1iGeHV: 'launchpad_v06',
  [TOKEN]: 'spl_token', [ATA]: 'ata', JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'jupiter',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

let calls = 0;
async function rpc(method, params) {
  for (let a = 1; a <= 6; a++) {
    calls++; await sleep(110); // free plan: 10 requests/second
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * a); continue; }
    const text = await r.text(); let j;
    try { j = JSON.parse(text); } catch { throw new Error(`${method}: HTTP ${r.status} ${text.slice(0, 80)}`); }
    if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
    return j.result;
  }
  throw new Error(`${method}: gave up after retries`);
}

// Program-derived address (same algorithm as Solana's findProgramAddress).
const P = 2n ** 255n - 19n;
const mp = (b, e) => { let r = 1n; b %= P; while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; };
const D = ((-121665n * mp(121666n, P - 2n)) % P + P) % P;
function onCurve(h) { let y = 0n; for (let i = 31; i >= 0; i--) y = y * 256n + BigInt(h[i]); const s = y >> 255n; y &= (1n << 255n) - 1n; if (y >= P) return false; const u = (y * y - 1n + P) % P, v = (D * y % P * y + 1n) % P; const x2 = u * mp(v, P - 2n) % P; if (x2 === 0n) return s === 0n; return mp(x2, (P - 1n) / 2n) === 1n; }
function pda(seeds, prog) { const pid = b58d(prog); for (let bump = 255; bump >= 0; bump--) { const h = createHash('sha256').update(Buffer.concat([...seeds.map(s => Buffer.from(s)), Buffer.from([bump]), Buffer.from(pid), Buffer.from('ProgramDerivedAddress')])).digest(); if (!onCurve(h)) return b58e(h); } throw new Error('no pda'); }
const enc = s => new TextEncoder().encode(s);
const usdcAta = owner => pda([b58d(owner), b58d(TOKEN), b58d(USDC)], ATA);
const squadsMultisig = dao => pda([enc('multisig'), enc('multisig'), b58d(dao)], SQUADS);
// self-test against an address read from the chain earlier (Rip Cars treasury USDC account owner check is done at runtime)
if (pda([enc('launch'), b58d('CARSsxWPkpQWvfyRBwfGMGvysJBHdHGfE46X5MNgmeta')], 'moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM') !== '8uMemVUT1ToSuda2jBVhcaPmJWq5C3bKe7DhrM5wkqZP') throw new Error('PDA self-test failed');

// Attribute "Instruction: X" log lines to the program that emitted them.
function ixNames(logs) {
  const stack = [], out = [];
  for (const l of logs || []) {
    let m;
    if ((m = l.match(/^Program (\w+) invoke \[\d+\]/))) stack.push(m[1]);
    else if ((m = l.match(/^Program (\w+) (success|failed)/))) stack.pop();
    else if ((m = l.match(/^Program log: Instruction: (\w+)/)) && stack.length) out.push(`${PROGRAM_NAMES[stack.at(-1)] || stack.at(-1).slice(0, 8)}:${m[1]}`);
  }
  return out;
}
const keysOf = tx => tx.transaction.message.accountKeys.map(k => (typeof k === 'string' ? k : k.pubkey)).concat(tx.meta.loadedAddresses ? [...tx.meta.loadedAddresses.writable, ...tx.meta.loadedAddresses.readonly] : []);
const signersOf = tx => tx.transaction.message.accountKeys.filter(k => k.signer).map(k => k.pubkey);
const allIxs = tx => [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions || []).flatMap(i => i.instructions)];

async function allSignatures(address) {
  const out = []; let before;
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [address, { limit: 1000, ...(before ? { before } : {}) }]);
    out.push(...page); if (page.length < 1000) break; before = page.at(-1).signature;
  }
  return out.reverse(); // oldest first
}
const getTx = sig => rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);

const approvalCache = new Map();
async function approvalOf(proposal) {
  if (approvalCache.has(proposal)) return approvalCache.get(proposal);
  let res = { how: 'unknown', approver: '' };
  for (const s of await allSignatures(proposal)) {
    if (s.err) continue;
    const tx = await getTx(s.signature); const names = ixNames(tx.meta.logMessages);
    if (names.includes('futarchy:FinalizeProposal') && names.includes('squads:ProposalApprove')) { res = { how: 'market_approved', approver: '' }; break; }
    if (names.includes('futarchy:AdminEnqueueMultisigProposalApproval')) res = { how: 'admin_approved', approver: signersOf(tx).join(' ') };
    if (names.includes('futarchy:ExecuteMultisigProposalApproval') && res.how === 'unknown') res = { how: 'admin_approved', approver: '(enqueue tx not seen)' };
  }
  approvalCache.set(proposal, res); return res;
}

const raises = JSON.parse(readFileSync('data/raises.json', 'utf8')).rows
  .filter(r => r.decoded === 'yes' && r.state === 'Complete' && Number(r.minimum_raise_usd) >= 10000 && r.dao_vault && r.dao);
const summary = [], flows = [], seen = {}, problems = [];
const now = Date.now();

for (const r of raises) {
  const label = r.ticker || r.base_mint.slice(0, 8);
  try {
    const ata = usdcAta(r.dao_vault), multisig = squadsMultisig(r.dao);
    const acct = await rpc('getAccountInfo', [ata, { encoding: 'jsonParsed' }]);
    const info = acct.value?.data?.parsed?.info;
    if (!info || info.mint !== USDC || info.owner !== r.dao_vault) { problems.push(`${label}: treasury USDC account mismatch`); continue; }
    const balanceNow = Number(info.tokenAmount.amount) / 1e6;
    const sums = { launch_funding: 0, inflow_other: 0, team_budget: 0, market_approved: 0, admin_approved: 0, liquidation: 0, other_out: 0 };
    let net = 0;
    for (const s of await allSignatures(ata)) {
      if (s.err) continue;
      const tx = await getTx(s.signature); if (!tx) { problems.push(`${label}: missing tx ${s.signature}`); continue; }
      const keys = keysOf(tx), idx = keys.indexOf(ata);
      const bal = (arr) => { const b = (arr || []).find(x => x.accountIndex === idx); return b ? Number(b.uiTokenAmount.amount) / 1e6 : 0; };
      const delta = bal(tx.meta.postTokenBalances) - bal(tx.meta.preTokenBalances);
      if (Math.abs(delta) < 1e-9) continue;
      net += delta;
      const names = ixNames(tx.meta.logMessages);
      for (const n of names) seen[n] = (seen[n] || 0) + 1;
      let cls, approval = '';
      if (delta > 0) cls = names.some(n => n.startsWith('launchpad')) ? 'launch_funding' : 'inflow_other';
      else if (names.includes('squads:SpendingLimitUse')) cls = 'team_budget';
      else if (names.some(n => n.startsWith('liquidation:'))) cls = 'liquidation';
      else if (names.includes('squads:VaultTransactionExecute')) {
        const ix = allIxs(tx).find(i => i.programId === SQUADS && i.accounts && i.accounts[0] === multisig && i.accounts.length >= 4);
        const proposal = ix ? ix.accounts[1] : null;
        const a = proposal ? await approvalOf(proposal) : { how: 'unknown', approver: '' };
        cls = a.how === 'market_approved' ? 'market_approved' : a.how === 'admin_approved' ? 'admin_approved' : 'other_out';
        approval = `${a.how}${a.approver ? ' by ' + a.approver : ''}${names.includes('futarchy:AdminExecuteMultisigProposal') ? ' (executed via admin key)' : ''} proposal=${proposal || '?'}`;
      } else cls = 'other_out';
      sums[cls] += Math.abs(delta);
      // counterparty: the other USDC account whose balance moved the opposite way
      const others = (tx.meta.postTokenBalances || []).filter(b => b.mint === USDC && b.accountIndex !== idx).map(b => {
        const pre = (tx.meta.preTokenBalances || []).find(x => x.accountIndex === b.accountIndex);
        return { owner: b.owner, d: Number(b.uiTokenAmount.amount) / 1e6 - (pre ? Number(pre.uiTokenAmount.amount) / 1e6 : 0) };
      }).filter(o => Math.sign(o.d) === -Math.sign(delta));
      flows.push({ ticker: label, track: r.track || '', time_utc: new Date(tx.blockTime * 1000).toISOString(), usdc: delta.toFixed(6), class: cls, approval,
        counterparty: others.map(o => o.owner).join(' '), signature: s.signature, instructions: [...new Set(names)].join(' ') });
    }
    const start = Number(r.raised_usd) * 0.8; // 20% to liquidity; no completed raise had a bid wall at time of writing
    const months = (now - Date.parse(r.completed_utc || r.closed_utc)) / (30.4375 * 864e5);
    const allowed = Number(r.monthly_budget_usd) * months;
    const reconciles = Math.abs(net - balanceNow) < 0.01;
    if (!reconciles) problems.push(`${label}: history sums to ${net.toFixed(2)} but balance is ${balanceNow.toFixed(2)}`);
    summary.push({ ticker: label, track: r.track || '', raised_usd: r.raised_usd, start_treasury_usd: start.toFixed(2), balance_now_usd: balanceNow.toFixed(2),
      launch_funding_usd: sums.launch_funding.toFixed(2), inflow_other_usd: sums.inflow_other.toFixed(2),
      team_budget_usd: sums.team_budget.toFixed(2), market_approved_usd: sums.market_approved.toFixed(2), admin_approved_usd: sums.admin_approved.toFixed(2),
      liquidation_usd: sums.liquidation.toFixed(2), other_out_usd: sums.other_out.toFixed(2),
      months_since_raise: months.toFixed(2), monthly_budget_usd: r.monthly_budget_usd, budget_allowed_usd: allowed.toFixed(2),
      team_budget_used_pct: allowed > 0 ? (100 * sums.team_budget / allowed).toFixed(1) : '', reconciles: reconciles ? 'yes' : 'NO', treasury_usdc_account: ata, squads_multisig: multisig });
  } catch (e) { problems.push(`${label}: ${e.message}`); }
}

const csv = (rows) => { if (!rows.length) return ''; const cols = Object.keys(rows[0]); const esc = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n') + '\n'; };
writeFileSync('data/treasury.csv', csv(summary));
writeFileSync('data/treasury-flows.csv', csv(flows));
const tot = k => summary.reduce((a, s) => a + Number(s[k]), 0).toFixed(0);
const report = [
  `# Treasury report — ${new Date().toISOString()}`, '', `Treasuries: ${summary.length} of ${raises.length}. RPC calls: ${calls}.`,
  `Reconciled (history sums exactly to today's balance): ${summary.filter(s => s.reconciles === 'yes').length}/${summary.length}`, '',
  '## Outflows, all treasuries (USD)', `- team_budget: ${tot('team_budget_usd')}`, `- market_approved: ${tot('market_approved_usd')}`, `- admin_approved: ${tot('admin_approved_usd')}`, `- liquidation: ${tot('liquidation_usd')}`, `- other_out: ${tot('other_out_usd')}`, '',
  '## Admin-approved movements', ...flows.filter(f => f.class === 'admin_approved').map(f => `- ${f.time_utc} ${f.ticker} ${f.usdc} USDC — ${f.approval}`), '',
  '## Instruction names seen on treasury movements (for review)', ...Object.entries(seen).sort((a, b) => b[1] - a[1]).map(([n, c]) => `- ${n}: ${c}`), '',
  `## Problems: ${problems.length}`, ...problems.map(p => `- ${p}`), '',
];
writeFileSync('data/treasury-report.md', report.join('\n'));
console.log(report.join('\n'));
