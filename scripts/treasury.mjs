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
import { b58e, b58d, USDC, pda } from './decode.mjs';

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
const FUTARCHY = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq';
const PROPOSAL_STATES = ['Draft', 'Pending', 'Passed', 'Failed', 'Removed'];
const SL_PERIODS = ['OneTime', 'Day', 'Week', 'Month'];
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

// Futarchy Proposal accounts (state/proposal.rs). Only the prefix up to squads_proposal is decoded;
// state is a Borsh enum where Draft carries a u64, so the offset after it varies.
function decodeProposalPrefix(d) {
  let o = 8; const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const number = dv.getUint32(o, true); o += 4;
  o += 32; // proposer
  const enqueued = Number(dv.getBigInt64(o, true)); o += 8;
  const tag = d[o++]; if (tag > 4) throw new Error('bad proposal state ' + tag); if (tag === 0) o += 8;
  o += 32 + 32; // base_vault, quote_vault
  const dao = b58e(d.subarray(o, o + 32)); o += 32;
  o += 1 + 32 + 4; // pda_bump, question, duration_in_seconds
  const squads_proposal = b58e(d.subarray(o, o + 32));
  return { number, enqueued, state: PROPOSAL_STATES[tag], dao, squads_proposal };
}
// Squads v4 SpendingLimit account.
function decodeSpendingLimit(d) {
  let o = 8; const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); const pk = () => { const x = b58e(d.subarray(o, o + 32)); o += 32; return x; };
  const multisig = pk(), create_key = pk(); o += 1; const mint = pk();
  const amount = Number(dv.getBigUint64(o, true)) / 1e6; o += 8;
  const period = SL_PERIODS[d[o++]]; const remaining = Number(dv.getBigUint64(o, true)) / 1e6; o += 8;
  const last_reset = Number(dv.getBigInt64(o, true));
  return { multisig, create_key, mint, amount, period, remaining, last_reset };
}
const proposalBySquads = new Map(), proposalsByDao = {}; let proposalDecodeErrors = 0;
{
  const disc = b58e(createHash('sha256').update('account:Proposal').digest().subarray(0, 8));
  const accts = await rpc('getProgramAccounts', [FUTARCHY, { encoding: 'base64', filters: [{ memcmp: { offset: 0, bytes: disc } }] }]);
  for (const a of accts) {
    try { const p = { ...decodeProposalPrefix(Buffer.from(a.account.data[0], 'base64')), address: a.pubkey }; proposalBySquads.set(p.squads_proposal, p); (proposalsByDao[p.dao] ??= []).push(p); }
    catch { proposalDecodeErrors++; }
  }
  console.log(`futarchy proposals indexed: ${proposalBySquads.size}, decode errors: ${proposalDecodeErrors}`);
}

const approvalCache = new Map();
async function approvalOf(proposal) {
  if (approvalCache.has(proposal)) return approvalCache.get(proposal);
  // Read the whole history of the Squads proposal and decide how it was approved.
  // Market path: futarchy FinalizeProposal (a passed decision market) approves it.
  // Admin paths (names differ across futarchy versions): any futarchy instruction whose name starts with "Admin",
  // or ExecuteMultisigProposalApproval, which consumes an approval enqueued by the admin or a liquidator.
  let finalize = false, admin = false, approvers = new Set(), names = new Set();
  for (const s of await allSignatures(proposal)) {
    if (s.err) continue;
    const tx = await getTx(s.signature); const n = ixNames(tx.meta.logMessages);
    n.filter(x => x.startsWith('futarchy:') || x.startsWith('squads:Proposal')).forEach(x => names.add(x));
    if (n.includes('futarchy:FinalizeProposal')) finalize = true;
    if (n.some(x => /^futarchy:Admin/.test(x)) || n.includes('futarchy:ExecuteMultisigProposalApproval')) { admin = true; if (n.some(x => /^futarchy:Admin/.test(x))) signersOf(tx).forEach(k => approvers.add(k)); }
  }
  const how = admin ? 'admin_approved' : finalize ? 'market_approved' : 'unknown';
  const linked = proposalBySquads.get(proposal);
  const res = { how, approver: [...approvers].join(' '), names: [...names].join(' '), decision: linked ? linked.state : 'none', decision_number: linked ? linked.number : '', decision_address: linked ? linked.address : '' };
  approvalCache.set(proposal, res); return res;
}

// When a futarchy proposal passed: the block time of the FinalizeProposal transaction in the proposal account's history.
// Its "enqueued" time is when trading started, not when it passed, so it is never used as the time of a decision.
const finalizeCache = new Map();
async function finalizeOf(address) {
  if (finalizeCache.has(address)) return finalizeCache.get(address);
  let found = null;
  for (const s of await allSignatures(address)) {
    if (s.err) continue;
    const tx = await getTx(s.signature);
    if (tx && ixNames(tx.meta.logMessages).includes('futarchy:FinalizeProposal')) { found = { time: tx.blockTime, signature: s.signature }; break; }
  }
  finalizeCache.set(address, found); return found;
}
const ADMIN_VOTE_WINDOW_S = 60 * 86400; // a proposal that passed up to 60 days before an admin-key movement is shown with it
const iso = t => new Date(t * 1000).toISOString();

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
    const sums = { launch_funding: 0, inflow_other: 0, team_budget: 0, market_approved: 0, admin_after_vote: 0, admin_vote_passed_after: 0, admin_vote_no_finalize: 0, admin_no_vote_found: 0, admin_against_market: 0, liquidation: 0, other_out: 0 };
    const teamUses = [];
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
      let cls, approval = '', decision = '', decisionRef = '', prior = null;
      if (delta > 0) cls = names.some(n => n.startsWith('launchpad')) ? 'launch_funding' : 'inflow_other';
      else if (names.includes('squads:SpendingLimitUse')) cls = 'team_budget';
      else if (names.some(n => n.startsWith('liquidation:'))) cls = 'liquidation';
      else if (names.includes('squads:VaultTransactionExecute')) {
        const ix = allIxs(tx).find(i => i.programId === SQUADS && i.accounts && i.accounts[0] === multisig && i.accounts.length >= 4);
        const proposal = ix ? ix.accounts[1] : null;
        const a = proposal ? await approvalOf(proposal) : { how: 'unknown', approver: '' };
        // A movement counts as market-decided when the exact Squads transaction had a futarchy proposal that Passed,
        // whichever key approved it in the end. Otherwise the admin path is reported separately.
        if (a.decision === 'Passed') cls = 'market_approved';
        else if (a.how === 'admin_approved') {
          // MetaDAO's key often carries out a broader vote (for example a liquidation) as a separate transaction.
          // Find the proposals on the same DAO that are Passed and were enqueued before the movement, and when each one
          // passed (its FinalizeProposal). Three outcomes, never merged:
          //   admin_after_vote        a proposal passed before the movement, within the window (the most recent one is shown)
          //   admin_vote_passed_after none had passed yet; a proposal enqueued before the movement passed after it
          //   admin_vote_no_finalize  a proposal is marked Passed but its FinalizeProposal transaction was not found
          if (a.decision !== 'none') cls = 'admin_against_market';
          else {
            const cands = (proposalsByDao[r.dao] || []).filter(p => p.state === 'Passed' && p.enqueued <= tx.blockTime && tx.blockTime - p.enqueued <= ADMIN_VOTE_WINDOW_S + 30 * 86400);
            const withF = []; for (const p of cands) withF.push({ p, f: await finalizeOf(p.address) });
            const before = withF.filter(x => x.f && x.f.time <= tx.blockTime && tx.blockTime - x.f.time <= ADMIN_VOTE_WINDOW_S).sort((x, y) => y.f.time - x.f.time)[0];
            const after = withF.filter(x => x.f && x.f.time > tx.blockTime).sort((x, y) => x.f.time - y.f.time)[0];
            const noF = withF.filter(x => !x.f).sort((x, y) => y.p.enqueued - x.p.enqueued)[0];
            const pick = before ? ['admin_after_vote', before] : after ? ['admin_vote_passed_after', after] : noF ? ['admin_vote_no_finalize', noF] : null;
            if (!pick) cls = 'admin_no_vote_found';
            else {
              cls = pick[0];
              const x = pick[1];
              prior = { number: x.p.number, address: x.p.address, finalize_signature: x.f ? x.f.signature : '', finalized_utc: x.f ? iso(x.f.time) : '' };
            }
          }
        }
        else cls = 'other_out';
        if (proposal && proposalBySquads.has(proposal) && proposalBySquads.get(proposal).dao !== r.dao) problems.push(`${label}: linked proposal belongs to another DAO (${proposal})`);
        decision = a.decision; decisionRef = a.decision_address ? `#${a.decision_number} ${a.decision_address}` : '';
        approval = `${a.how}${a.approver ? ' by ' + a.approver : ''}${a.how === 'unknown' ? ' [' + (a.names || 'no futarchy instructions') + ']' : ''}${names.includes('futarchy:AdminExecuteMultisigProposal') ? ' (executed via admin key)' : ''} proposal=${proposal || '?'}`;
      } else cls = 'other_out';
      sums[cls] += Math.abs(delta);
      if (cls === 'team_budget') teamUses.push({ t: tx.blockTime, amt: -delta });
      // counterparty: the other USDC account whose balance moved the opposite way
      const others = (tx.meta.postTokenBalances || []).filter(b => b.mint === USDC && b.accountIndex !== idx).map(b => {
        const pre = (tx.meta.preTokenBalances || []).find(x => x.accountIndex === b.accountIndex);
        return { owner: b.owner, d: Number(b.uiTokenAmount.amount) / 1e6 - (pre ? Number(pre.uiTokenAmount.amount) / 1e6 : 0) };
      }).filter(o => Math.sign(o.d) === -Math.sign(delta));
      flows.push({ ticker: label, base_mint: r.base_mint, track: r.track || '', time_utc: new Date(tx.blockTime * 1000).toISOString(), usdc: delta.toFixed(6), class: cls, approval, market_decision: decision, decision_ref: decisionRef,
        prior_vote_number: prior ? prior.number : '', prior_vote_address: prior ? prior.address : '', prior_vote_finalize_signature: prior ? prior.finalize_signature : '', prior_vote_finalized_utc: prior ? prior.finalized_utc : '',
        counterparty: others.map(o => o.owner).join(' '), signature: s.signature, instructions: [...new Set(names)].join(' ') });
    }
    // Starting treasury = the USDC the launchpad actually deposited (CompleteLaunch), read from the chain.
    // Not raised x 0.8: e.g. Ranger raised 8,000,000 but its treasury received 6,000,000.
    const start = sums.launch_funding;
    const months = (now - Date.parse(r.completed_utc || r.closed_utc)) / (30.4375 * 864e5);
    // Squads resets a monthly limit every 30 days, so a team can draw a full month at the start of each period.
    const periods = Math.max(1, Math.ceil((now - Date.parse(r.completed_utc || r.closed_utc)) / (30 * 864e5)));
    const allowed = Number(r.monthly_budget_usd) * periods;
    let slNow = null; let slAddr = '';
    try {
      slAddr = pda([enc('multisig'), b58d(multisig), enc('spending_limit'), b58d(r.dao)], SQUADS);
      const sl = await rpc('getAccountInfo', [slAddr, { encoding: 'base64' }]);
      if (sl.value) { const d = decodeSpendingLimit(Buffer.from(sl.value.data[0], 'base64')); if (d.multisig === multisig && d.create_key === r.dao && d.mint === USDC) slNow = d; else problems.push(`${label}: spending limit account did not match`); }
    } catch (e) { problems.push(`${label}: spending limit read failed: ${e.message}`); }
    // Largest amount drawn in any single 30-day window, compared with the launch limit.
    teamUses.sort((x, y) => x.t - y.t); let maxWindow = 0;
    for (let i = 0, j = 0, run = 0; j < teamUses.length; j++) { run += teamUses[j].amt; while (teamUses[j].t - teamUses[i].t >= 30 * 86400) run -= teamUses[i++].amt; maxWindow = Math.max(maxWindow, run); }
    const reconciles = Math.abs(net - balanceNow) < 0.01;
    if (!reconciles) problems.push(`${label}: history sums to ${net.toFixed(2)} but balance is ${balanceNow.toFixed(2)}`);
    summary.push({ ticker: label, base_mint: r.base_mint, launch: r.launch, dao: r.dao, dao_vault: r.dao_vault, track: r.track || '', raised_usd: r.raised_usd, start_treasury_usd: start.toFixed(2), balance_now_usd: balanceNow.toFixed(2),
      launch_funding_usd: sums.launch_funding.toFixed(2), inflow_other_usd: sums.inflow_other.toFixed(2),
      team_budget_usd: sums.team_budget.toFixed(2), market_approved_usd: sums.market_approved.toFixed(2),
      admin_after_vote_usd: sums.admin_after_vote.toFixed(2), admin_vote_passed_after_usd: sums.admin_vote_passed_after.toFixed(2), admin_vote_no_finalize_usd: sums.admin_vote_no_finalize.toFixed(2), admin_no_vote_found_usd: sums.admin_no_vote_found.toFixed(2), admin_against_market_usd: sums.admin_against_market.toFixed(2),
      liquidation_usd: sums.liquidation.toFixed(2), other_out_usd: sums.other_out.toFixed(2),
      months_since_raise: months.toFixed(2), periods_started: periods, monthly_budget_usd: r.monthly_budget_usd, budget_allowed_usd: allowed.toFixed(2),
      spending_limit_now_usd: slNow ? slNow.amount.toFixed(2) : '', spending_limit_period: slNow ? slNow.period : '', limit_changed: slNow ? (Math.abs(slNow.amount - Number(r.monthly_budget_usd)) > 0.005 ? 'yes' : 'no') : 'unknown',
      max_30day_team_draw_usd: maxWindow.toFixed(2),
      team_budget_used_pct: allowed > 0 ? (100 * sums.team_budget / allowed).toFixed(1) : '', reconciles: reconciles ? 'yes' : 'NO', treasury_usdc_account: ata, squads_multisig: multisig, spending_limit_account: slAddr });
  } catch (e) { problems.push(`${label}: ${e.message}`); }
}

const csv = (rows) => { if (!rows.length) return ''; const cols = Object.keys(rows[0]); const esc = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n') + '\n'; };
writeFileSync('data/treasury.csv', csv(summary));
writeFileSync('data/treasury-flows.csv', csv(flows));
const tot = k => summary.reduce((a, s) => a + Number(s[k]), 0).toFixed(0);
const report = [
  `# Treasury report — ${new Date().toISOString()}`, '', `Treasuries: ${summary.length} of ${raises.length}. RPC calls: ${calls}.`,
  `Reconciled (history sums exactly to today's balance): ${summary.filter(s => s.reconciles === 'yes').length}/${summary.length}`, '',
  `Futarchy proposals indexed: ${proposalBySquads.size} (decode errors: ${proposalDecodeErrors})`, '',
  '## Outflows, all treasuries (USD)', `- team_budget: ${tot('team_budget_usd')}`, `- market_approved (linked proposal Passed): ${tot('market_approved_usd')}`, `- admin_after_vote (admin key; a proposal on this DAO finalized as Passed in the 60 days before): ${tot('admin_after_vote_usd')}`, `- admin_vote_passed_after (admin key; a proposal enqueued before the movement finalized as Passed after it): ${tot('admin_vote_passed_after_usd')}`, `- admin_vote_no_finalize (admin key; a Passed proposal whose FinalizeProposal was not found): ${tot('admin_vote_no_finalize_usd')}`,`- admin_no_vote_found (admin key; no passed proposal on this DAO in the 60 days before): ${tot('admin_no_vote_found_usd')}`, `- admin_against_market (admin key, linked proposal not Passed): ${tot('admin_against_market_usd')}`, `- liquidation: ${tot('liquidation_usd')}`, `- other_out: ${tot('other_out_usd')}`, '',
  '## Every movement approved through an admin key', ...flows.filter(f => /admin_approved/.test(f.approval)).map(f => `- ${f.time_utc} ${f.ticker} ${f.usdc} USDC to ${f.counterparty || '?'} — class ${f.class}${f.prior_vote_number !== '' ? `, proposal #${f.prior_vote_number} ${f.prior_vote_address}${f.prior_vote_finalized_utc ? ` finalized ${f.prior_vote_finalized_utc} (${f.prior_vote_finalize_signature})` : ' (FinalizeProposal not found)'}` : ''} — ${f.approval}`), '',
  '## Team budget', ...summary.map(x => `- ${x.ticker}: drew ${Number(x.team_budget_usd).toFixed(0)} over ${x.periods_started} period(s) of ${x.monthly_budget_usd}/month at launch (allowed ${Number(x.budget_allowed_usd).toFixed(0)}); limit now ${x.spending_limit_now_usd || '?'} ${x.spending_limit_period}; changed: ${x.limit_changed}; largest 30-day draw ${Number(x.max_30day_team_draw_usd).toFixed(0)}`), '',
  '## Unclassified outflows', ...flows.filter(f => f.class === 'other_out').map(f => `- ${f.time_utc} ${f.ticker} ${f.usdc} USDC to ${f.counterparty || '?'} — ${f.approval || f.instructions}`), '',
  '## Instruction names seen on treasury movements (for review)', ...Object.entries(seen).sort((a, b) => b[1] - a[1]).map(([n, c]) => `- ${n}: ${c}`), '',
  `## Problems: ${problems.length}`, ...problems.map(p => `- ${p}`), '',
];
writeFileSync('data/treasury-report.md', report.join('\n'));
console.log(report.join('\n'));
