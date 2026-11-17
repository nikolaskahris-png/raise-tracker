// How one USDC movement of a DAO treasury is classified. Used by treasury.mjs, and tested offline in
// scripts/test/classify.test.mjs against real transactions stored as fixtures.
// Every chain read goes through the `rpc(method, params)` passed in, so a test can replay stored answers.
import { createHash } from 'node:crypto';
import { b58e, USDC } from './decode.mjs';

export const SQUADS = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf';
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const FUTARCHY = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq';
const PROGRAM_NAMES = {
  [SQUADS]: 'squads', [FUTARCHY]: 'futarchy', LiQnowFbFQdYyZhF4pUbpsrZCjxRTQ1upKJxZ2VXjde: 'liquidation',
  WALL8ucBuUyL46QYxwYJjidaFYhdvxUFrgvBxPshERx: 'bid_wall', moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n: 'launchpad_v08',
  moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM: 'launchpad_v07', MooNyh4CBUYEKyXVnjGYQ8mEiJDpGvJMdvrZx1iGeHV: 'launchpad_v06',
  [TOKEN]: 'spl_token', [ATA]: 'ata', JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'jupiter',
};
const PROPOSAL_STATES = ['Draft', 'Pending', 'Passed', 'Failed', 'Removed'];
const SL_PERIODS = ['OneTime', 'Day', 'Week', 'Month'];
export const PROPOSAL_DISCRIMINATOR = b58e(createHash('sha256').update('account:Proposal').digest().subarray(0, 8));

// Attribute "Instruction: X" log lines to the program that emitted them.
export function ixNames(logs) {
  const stack = [], out = [];
  for (const l of logs || []) {
    let m;
    if ((m = l.match(/^Program (\w+) invoke \[\d+\]/))) stack.push(m[1]);
    else if ((m = l.match(/^Program (\w+) (success|failed)/))) stack.pop();
    else if ((m = l.match(/^Program log: Instruction: (\w+)/)) && stack.length) out.push(`${PROGRAM_NAMES[stack.at(-1)] || stack.at(-1).slice(0, 8)}:${m[1]}`);
  }
  return out;
}
// The instructions that called Squads ProposalApprove in a transaction, as program:Instruction of the caller
// ('top-level' when a member signed it directly).
export function approvedBy(logs) {
  const stack = [], out = [];
  for (const l of logs || []) {
    let m;
    if ((m = l.match(/^Program (\w+) invoke \[\d+\]/))) stack.push({ program: m[1], ix: '' });
    else if ((m = l.match(/^Program (\w+) (success|failed)/))) stack.pop();
    else if ((m = l.match(/^Program log: Instruction: (\w+)/)) && stack.length) {
      const top = stack.at(-1); top.ix = m[1];
      if (top.program === SQUADS && m[1] === 'ProposalApprove') {
        const caller = stack.at(-2);
        out.push(caller ? `${PROGRAM_NAMES[caller.program] || caller.program.slice(0, 8)}:${caller.ix}` : 'top-level');
      }
    }
  }
  return out;
}
export const keysOf = tx => tx.transaction.message.accountKeys.map(k => (typeof k === 'string' ? k : k.pubkey)).concat(tx.meta.loadedAddresses ? [...tx.meta.loadedAddresses.writable, ...tx.meta.loadedAddresses.readonly] : []);
const signersOf = tx => tx.transaction.message.accountKeys.filter(k => k.signer).map(k => k.pubkey);
const allIxs = tx => [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions || []).flatMap(i => i.instructions)];

// Futarchy Proposal accounts (state/proposal.rs). Only the prefix up to squads_proposal is decoded;
// state is a Borsh enum where Draft carries a u64, so the offset after it varies.
export function decodeProposalPrefix(d) {
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
// Index getProgramAccounts results ({pubkey, account: {data: [base64]}}) by Squads proposal and by DAO.
export function indexProposals(accts) {
  const bySquads = new Map(), byDao = {}; let errors = 0;
  for (const a of accts) {
    try { const p = { ...decodeProposalPrefix(Buffer.from(a.account.data[0], 'base64')), address: a.pubkey }; bySquads.set(p.squads_proposal, p); (byDao[p.dao] ??= []).push(p); }
    catch { errors++; }
  }
  return { bySquads, byDao, errors };
}
// Squads v4 SpendingLimit account.
export function decodeSpendingLimit(d) {
  let o = 8; const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); const pk = () => { const x = b58e(d.subarray(o, o + 32)); o += 32; return x; };
  const multisig = pk(), create_key = pk(); o += 1; const mint = pk();
  const amount = Number(dv.getBigUint64(o, true)) / 1e6; o += 8;
  const period = SL_PERIODS[d[o++]]; const remaining = Number(dv.getBigUint64(o, true)) / 1e6; o += 8;
  const last_reset = Number(dv.getBigInt64(o, true));
  return { multisig, create_key, mint, amount, period, remaining, last_reset };
}
export const iso = t => new Date(t * 1000).toISOString();

/**
 * @param {{ rpc: (method: string, params: unknown[]) => Promise<any>, proposals: ReturnType<typeof indexProposals>, adminVoteWindowS: number }} o
 */
export function makeClassifier({ rpc, proposals, adminVoteWindowS }) {
  const { bySquads: proposalBySquads, byDao: proposalsByDao } = proposals;
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
    // Read the whole history of the Squads proposal and decide how it was approved: by the instruction that called
    // Squads ProposalApprove. Executing an approved proposal (e.g. futarchy AdminExecuteMultisigProposal, which only
    // runs vault_transaction_execute) is not an approval.
    // Market path: futarchy FinalizeProposal (a passed decision market) calls ProposalApprove.
    // Admin paths (names differ across futarchy versions): a futarchy instruction whose name starts with "Admin",
    // or ExecuteMultisigProposalApproval, which consumes an approval enqueued by the admin or a liquidator.
    let finalize = false, admin = false; const approvers = new Set(), names = new Set();
    for (const s of await allSignatures(proposal)) {
      if (s.err) continue;
      const tx = await getTx(s.signature); const n = ixNames(tx.meta.logMessages);
      n.filter(x => x.startsWith('futarchy:') || x.startsWith('squads:Proposal')).forEach(x => names.add(x));
      for (const by of approvedBy(tx.meta.logMessages)) {
        if (by === 'futarchy:FinalizeProposal') finalize = true;
        else if (/^futarchy:Admin/.test(by) || by === 'futarchy:ExecuteMultisigProposalApproval') admin = true;
      }
      // the keys that signed an admin-path transaction in its history (shown as the admin keys involved)
      if (n.some(x => /^futarchy:Admin/.test(x))) signersOf(tx).forEach(k => approvers.add(k));
    }
    const how = admin ? 'admin_approved' : finalize ? 'market_approved' : 'unknown';
    if (how !== 'admin_approved') approvers.clear();
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

  /**
   * Classify one transaction that touched a treasury's USDC account `ata`.
   * Returns null when the account's balance did not change; otherwise the movement, with `delta` in USDC
   * (positive in, negative out), `names` (the instructions it ran) and `problems` found on the way.
   */
  async function classify({ tx, ata, multisig, dao }) {
    const keys = keysOf(tx), idx = keys.indexOf(ata);
    const bal = (arr) => { const b = (arr || []).find(x => x.accountIndex === idx); return b ? Number(b.uiTokenAmount.amount) / 1e6 : 0; };
    const delta = bal(tx.meta.postTokenBalances) - bal(tx.meta.preTokenBalances);
    if (Math.abs(delta) < 1e-9) return null;
    const names = ixNames(tx.meta.logMessages);
    const problems = [];
    let cls, approval = '', decision = '', decisionRef = '', prior = null;
    if (delta > 0) cls = names.some(n => n.startsWith('launchpad')) ? 'launch_funding' : 'inflow_other';
    else if (names.includes('squads:SpendingLimitUse')) cls = 'team_budget';
    else if (names.some(n => n.startsWith('liquidation:'))) cls = 'liquidation';
    else if (names.includes('squads:VaultTransactionExecute')) {
      const ix = allIxs(tx).find(i => i.programId === SQUADS && i.accounts && i.accounts[0] === multisig && i.accounts.length >= 4);
      const proposal = ix ? ix.accounts[1] : null;
      const a = proposal ? await approvalOf(proposal) : { how: 'unknown', approver: '' };
      // A movement counts as market-decided only when its own futarchy proposal Passed AND that proposal's
      // FinalizeProposal approved it (no admin instruction in its history). If the admin key approved a transaction
      // whose own proposal passed, it is an admin-key movement, timed against that same proposal.
      if (a.decision === 'Passed' && a.how === 'market_approved') cls = 'market_approved';
      else if (a.how === 'admin_approved' && a.decision === 'Passed') {
        const own = proposalBySquads.get(proposal);
        const f = own ? await finalizeOf(own.address) : null;
        cls = !f ? 'admin_vote_no_finalize' : f.time <= tx.blockTime ? 'admin_after_vote' : 'admin_vote_passed_after';
        if (own) prior = { number: own.number, address: own.address, finalize_signature: f ? f.signature : '', finalized_utc: f ? iso(f.time) : '' };
      }
      else if (a.how === 'admin_approved') {
        // MetaDAO's key often carries out a broader vote (for example a liquidation) as a separate transaction.
        // Find the proposals on the same DAO that are Passed and were enqueued before the movement, and when each one
        // passed (its FinalizeProposal). Three outcomes, never merged:
        //   admin_after_vote        a proposal passed before the movement, within the window (the most recent one is shown)
        //   admin_vote_passed_after none had passed yet; a proposal enqueued before the movement passed after it
        //   admin_vote_no_finalize  a proposal is marked Passed but its FinalizeProposal transaction was not found
        if (a.decision !== 'none') cls = 'admin_against_market';
        else {
          const cands = (proposalsByDao[dao] || []).filter(p => p.state === 'Passed' && p.enqueued <= tx.blockTime && tx.blockTime - p.enqueued <= 2 * adminVoteWindowS);
          const withF = []; for (const p of cands) withF.push({ p, f: await finalizeOf(p.address) });
          const before = withF.filter(x => x.f && x.f.time <= tx.blockTime && tx.blockTime - x.f.time <= adminVoteWindowS).sort((x, y) => y.f.time - x.f.time)[0];
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
      if (proposal && proposalBySquads.has(proposal) && proposalBySquads.get(proposal).dao !== dao) problems.push(`linked proposal belongs to another DAO (${proposal})`);
      decision = a.decision; decisionRef = a.decision_address ? `#${a.decision_number} ${a.decision_address}` : '';
      approval = `${a.how}${a.approver ? ' by ' + a.approver : ''}${a.how === 'unknown' ? ' [' + (a.names || 'no futarchy instructions') + ']' : ''}${names.includes('futarchy:AdminExecuteMultisigProposal') ? ' (executed via admin key)' : ''} proposal=${proposal || '?'}`;
    } else cls = 'other_out';
    // The launch transaction: where the raised USDC went besides this treasury (exact base units, read from the transaction).
    let launchOthers = null;
    if (cls === 'launch_funding') {
      const pre = i => BigInt((tx.meta.preTokenBalances || []).find(x => x.accountIndex === i)?.uiTokenAmount.amount ?? '0');
      launchOthers = (tx.meta.postTokenBalances || []).filter(b => b.mint === USDC && b.accountIndex !== idx)
        .map(b => ({ owner: b.owner, account: keys[b.accountIndex], amount: BigInt(b.uiTokenAmount.amount) - pre(b.accountIndex) }))
        .filter(o => o.amount > 0n);
    }
    // counterparty: the other USDC account whose balance moved the opposite way
    const counterparty = (tx.meta.postTokenBalances || []).filter(b => b.mint === USDC && b.accountIndex !== idx).map(b => {
      const pre = (tx.meta.preTokenBalances || []).find(x => x.accountIndex === b.accountIndex);
      return { owner: b.owner, d: Number(b.uiTokenAmount.amount) / 1e6 - (pre ? Number(pre.uiTokenAmount.amount) / 1e6 : 0) };
    }).filter(o => Math.sign(o.d) === -Math.sign(delta)).map(o => o.owner);
    return { delta, names, cls, approval, decision, decisionRef, prior, launchOthers, counterparty, problems };
  }

  /** The columns of one treasury-flows.csv row that this module decides. */
  const flowColumns = (m, tx, signature) => ({
    time_utc: new Date(tx.blockTime * 1000).toISOString(), usdc: m.delta.toFixed(6), class: m.cls, approval: m.approval, market_decision: m.decision, decision_ref: m.decisionRef,
    prior_vote_number: m.prior ? m.prior.number : '', prior_vote_address: m.prior ? m.prior.address : '', prior_vote_finalize_signature: m.prior ? m.prior.finalize_signature : '', prior_vote_finalized_utc: m.prior ? m.prior.finalized_utc : '',
    counterparty: m.counterparty.join(' '), signature, instructions: [...new Set(m.names)].join(' '),
  });

  return { allSignatures, getTx, approvalOf, finalizeOf, classify, flowColumns };
}
