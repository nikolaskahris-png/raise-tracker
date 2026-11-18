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
import { b58d, USDC, pda } from './decode.mjs';
import { makeRpc } from './rpc.mjs';
import { SQUADS, TOKEN, ATA, FUTARCHY, PROPOSAL_DISCRIMINATOR, indexProposals, decodeSpendingLimit, makeClassifier } from './classify.mjs';
// Fixed rules of the method, shared with scan.mjs and the site.
const C = JSON.parse(readFileSync(new URL('../constants.json', import.meta.url), 'utf8'));
const DAY_S = 86400;
const PERIOD_S = C.spending_limit_period_days * DAY_S;

const KEY = process.env.HELIUS_API_KEY;
if (!KEY) { console.error('HELIUS_API_KEY is not set'); process.exit(1); }
const RPC = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;

const { rpc, stats: rpcStats } = makeRpc(RPC); // retries network failures too (scripts/rpc.mjs)

const enc = s => new TextEncoder().encode(s);
const usdcAta = owner => pda([b58d(owner), b58d(TOKEN), b58d(USDC)], ATA);
const squadsMultisig = dao => pda([enc('multisig'), enc('multisig'), b58d(dao)], SQUADS);
// self-test against an address read from the chain earlier (Rip Cars treasury USDC account owner check is done at runtime)
if (pda([enc('launch'), b58d('CARSsxWPkpQWvfyRBwfGMGvysJBHdHGfE46X5MNgmeta')], 'moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM') !== '8uMemVUT1ToSuda2jBVhcaPmJWq5C3bKe7DhrM5wkqZP') throw new Error('PDA self-test failed');

// Every futarchy Proposal account, indexed by its Squads proposal and by DAO.
const proposals = indexProposals(await rpc('getProgramAccounts', [FUTARCHY, { encoding: 'base64', filters: [{ memcmp: { offset: 0, bytes: PROPOSAL_DISCRIMINATOR } }] }]));
const proposalBySquads = proposals.bySquads, proposalDecodeErrors = proposals.errors;
console.log(`futarchy proposals indexed: ${proposalBySquads.size}, decode errors: ${proposalDecodeErrors}`);

const ADMIN_VOTE_WINDOW_S = C.admin_vote_window_days * DAY_S; // a proposal that passed up to this long before an admin-key movement is shown with it
// The classification itself lives in classify.mjs, tested offline against stored real transactions.
const { allSignatures, getTx, classify, flowColumns, spendingLimitChanges } = makeClassifier({ rpc, proposals, adminVoteWindowS: ADMIN_VOTE_WINDOW_S });
const microStr = v => `${v < 0n ? '-' : ''}${(v < 0n ? -v : v) / 1000000n}.${((v < 0n ? -v : v) % 1000000n).toString().padStart(6, '0')}`;

// The exact raises.json this step read: its sha256 and scan slot go into the report, and the site checks them against the scan's.
const raisesText = readFileSync('data/raises.json', 'utf8');
const raisesRead = { sha256: createHash('sha256').update(raisesText).digest('hex'), slot: JSON.parse(raisesText).scanned_slot };
const raises = JSON.parse(raisesText).rows
  .filter(r => r.decoded === 'yes' && r.state === 'Complete' && Number(r.minimum_raise_usd) >= C.min_real_raise_usd && r.dao_vault && r.dao);
const summary = [], flows = [], seen = {}, problems = [];
const now = Date.now();

for (const r of raises) {
  const label = r.metadata_symbol || r.base_mint.slice(0, 8); // the onchain symbol, else the mint prefix
  try {
    const ata = usdcAta(r.dao_vault), multisig = squadsMultisig(r.dao);
    const acct = await rpc('getAccountInfo', [ata, { encoding: 'jsonParsed' }]);
    const info = acct.value?.data?.parsed?.info;
    if (!info || info.mint !== USDC || info.owner !== r.dao_vault) {
      // Say what the chain shows instead of only "mismatch": the account at the expected address exists but another address
      // owns it now. Find the transaction that changed the owner (a SetAuthority of type accountOwner on this account).
      let detail = '';
      if (info && info.mint === USDC) {
        detail = ` (account ${ata} now owned by ${info.owner}, holds ${(Number(info.tokenAmount.amount) / 1e6).toFixed(6)} USDC`;
        try {
          for (const s of await allSignatures(ata)) {
            if (s.err) continue;
            const tx = await getTx(s.signature); if (!tx) continue;
            const ixs = [...tx.transaction.message.instructions, ...(tx.meta?.innerInstructions ?? []).flatMap(g => g.instructions)];
            if (ixs.some(i => i.parsed?.type === 'setAuthority' && i.parsed.info?.authorityType === 'accountOwner' && i.parsed.info?.account === ata && i.parsed.info?.newAuthority === info.owner)) {
              const names = [...new Set((tx.meta?.logMessages ?? []).map(l => /^Program log: Instruction: (\w+)$/.exec(l)?.[1]).filter(Boolean))];
              detail += `; owner changed ${new Date(tx.blockTime * 1000).toISOString()} in ${s.signature}${names.length ? ` via ${names.join('+')}` : ''}`;
              break;
            }
          }
        } catch (e) { /* the change is then simply not located; the owner and balance above are still true */ }
        detail += ')';
      }
      problems.push(`${label}: treasury USDC account mismatch${detail}`); continue;
    }
    const balanceNow = Number(info.tokenAmount.amount) / 1e6;
    const sums = { launch_funding: 0, inflow_other: 0, team_budget: 0, market_approved: 0, admin_after_vote: 0, admin_vote_passed_after: 0, admin_vote_no_finalize: 0, admin_no_vote_found: 0, admin_against_market: 0, liquidation: 0, other_out: 0 };
    const teamUses = [];
    const mine = []; // this treasury's movements, kept only if the whole treasury is read
    let net = 0;
    // The launch transaction: where the raised USDC went besides this treasury (exact base units, read from the transaction).
    let launch = { signature: '', others: [] };
    for (const s of await allSignatures(ata)) {
      if (s.err) continue;
      const tx = await getTx(s.signature); if (!tx) { problems.push(`${label}: missing tx ${s.signature}`); continue; }
      const m = await classify({ tx, ata, multisig, dao: r.dao });
      if (!m) continue;
      net += m.delta;
      for (const n of m.names) seen[n] = (seen[n] || 0) + 1;
      for (const p of m.problems) problems.push(`${label}: ${p}`);
      if (m.cls === 'launch_funding') launch = { signature: s.signature, others: m.launchOthers };
      sums[m.cls] += Math.abs(m.delta);
      if (m.cls === 'team_budget') teamUses.push({ t: tx.blockTime, amt: -m.delta });
      mine.push({ ticker: label, base_mint: r.base_mint, track: r.track || '', ...flowColumns(m, tx, s.signature) });
    }
    // Starting treasury = the USDC the launchpad actually deposited (CompleteLaunch), read from the chain.
    // Not raised x 0.8: e.g. Ranger raised 8,000,000 but its treasury received 6,000,000.
    const start = sums.launch_funding;
    const months = (now - Date.parse(r.completed_utc || r.closed_utc)) / (C.average_month_days * DAY_S * 1000);
    // Squads resets a monthly limit every 30 days, so a team can draw a full month at the start of each period.
    const periods = Math.max(1, Math.ceil((now - Date.parse(r.completed_utc || r.closed_utc)) / (PERIOD_S * 1000)));
    const allowed = Number(r.monthly_budget_usd) * periods;
    let slNow = null; let slAddr = '';
    try {
      slAddr = pda([enc('multisig'), b58d(multisig), enc('spending_limit'), b58d(r.dao)], SQUADS);
      const sl = await rpc('getAccountInfo', [slAddr, { encoding: 'base64' }]);
      if (sl.value) { const d = decodeSpendingLimit(Buffer.from(sl.value.data[0], 'base64')); if (d.multisig === multisig && d.create_key === r.dao && d.mint === USDC) slNow = d; else problems.push(`${label}: spending limit account did not match`); }
    } catch (e) { problems.push(`${label}: spending limit read failed: ${e.message}`); }
    // Every transaction that set the limit after launch, with the amount it set and the path that approved it.
    // A failure here fails the whole treasury (its movements are not kept either).
    const slChanges = slAddr ? await spendingLimitChanges({ account: slAddr, dao: r.dao, multisig, launchSignature: launch.signature, skip: new Set(mine.filter(f => f.class === 'team_budget').map(f => f.signature)) }) : [];
    // Largest amount drawn in any single 30-day window, compared with the launch limit.
    teamUses.sort((x, y) => x.t - y.t); let maxWindow = 0;
    for (let i = 0, j = 0, run = 0; j < teamUses.length; j++) { run += teamUses[j].amt; while (teamUses[j].t - teamUses[i].t >= PERIOD_S) run -= teamUses[i++].amt; maxWindow = Math.max(maxWindow, run); }
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
      team_budget_used_pct: allowed > 0 ? (100 * sums.team_budget / allowed).toFixed(1) : '', reconciles: reconciles ? 'yes' : 'NO', treasury_usdc_account: ata, squads_multisig: multisig, spending_limit_account: slAddr, balance_slot: acct.context.slot,
      launch_signature: launch.signature, launch_other_usdc: microStr(launch.others.reduce((a, o) => a + o.amount, 0n)),
      launch_other_recipients: launch.others.map(o => `${o.owner}:${o.account}:${microStr(o.amount)}`).join(' '),
      spending_limit_changes: slChanges.map(c => `${c.time}|${c.signature}|${c.path}|${c.action}|${c.amount === null ? '' : microStr(c.amount)}|${c.period}`).join(' ') });
    flows.push(...mine);
  } catch (e) { problems.push(`${label}: ${e.message}`); }
}

const csv = (rows) => { if (!rows.length) return ''; const cols = Object.keys(rows[0]); const esc = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n') + '\n'; };
writeFileSync('data/treasury.csv', csv(summary));
writeFileSync('data/treasury-flows.csv', csv(flows));
const tot = k => summary.reduce((a, s) => a + Number(s[k]), 0).toFixed(0);
const report = [
  `# Treasury report — ${new Date().toISOString()}`, '', `Read raises.json sha256: ${raisesRead.sha256}, from the scan at slot ${raisesRead.slot}`, '', `Treasuries: ${summary.length} of ${raises.length}. RPC calls: ${rpcStats.calls}.`,
  `Reconciled (history sums exactly to today's balance): ${summary.filter(s => s.reconciles === 'yes').length}/${summary.length}`, '',
  `Futarchy proposals indexed: ${proposalBySquads.size} (decode errors: ${proposalDecodeErrors})`, '',
  '## Outflows, all treasuries (USD)', `- team_budget: ${tot('team_budget_usd')}`, `- market_approved (linked proposal Passed): ${tot('market_approved_usd')}`, `- admin_after_vote (admin key; a proposal on this DAO finalized as Passed in the 60 days before): ${tot('admin_after_vote_usd')}`, `- admin_vote_passed_after (admin key; a proposal enqueued before the movement finalized as Passed after it): ${tot('admin_vote_passed_after_usd')}`, `- admin_vote_no_finalize (admin key; a Passed proposal whose FinalizeProposal was not found): ${tot('admin_vote_no_finalize_usd')}`,`- admin_no_vote_found (admin key; no passed proposal on this DAO in the 60 days before): ${tot('admin_no_vote_found_usd')}`, `- admin_against_market (admin key, linked proposal not Passed): ${tot('admin_against_market_usd')}`, `- liquidation: ${tot('liquidation_usd')}`, `- other_out: ${tot('other_out_usd')}`, '',
  '## Every movement approved through an admin key', ...flows.filter(f => /admin_approved/.test(f.approval)).map(f => `- ${f.time_utc} ${f.ticker} ${f.usdc} USDC to ${f.counterparty || '?'} — class ${f.class}${f.prior_vote_number !== '' ? `, proposal #${f.prior_vote_number} ${f.prior_vote_address}${f.prior_vote_finalized_utc ? ` finalized ${f.prior_vote_finalized_utc} (${f.prior_vote_finalize_signature})` : ' (FinalizeProposal not found)'}` : ''} — ${f.approval}`), '',
  '## Team budget', ...summary.map(x => `- ${x.ticker}: drew ${Number(x.team_budget_usd).toFixed(0)} over ${x.periods_started} period(s) of ${x.monthly_budget_usd}/month at launch (allowed ${Number(x.budget_allowed_usd).toFixed(0)}); limit now ${x.spending_limit_now_usd || '?'} ${x.spending_limit_period}; changed: ${x.limit_changed}${x.spending_limit_changes ? ` (by ${x.spending_limit_changes})` : ''}; largest 30-day draw ${Number(x.max_30day_team_draw_usd).toFixed(0)}`), '',
  '## Unclassified outflows', ...flows.filter(f => f.class === 'other_out').map(f => `- ${f.time_utc} ${f.ticker} ${f.usdc} USDC to ${f.counterparty || '?'} — ${f.approval || f.instructions}`), '',
  '## Instruction names seen on treasury movements (for review)', ...Object.entries(seen).sort((a, b) => b[1] - a[1]).map(([n, c]) => `- ${n}: ${c}`), '',
  `## Problems: ${problems.length}`, ...problems.map(p => `- ${p}`), '',
];
writeFileSync('data/treasury-report.md', report.join('\n'));
console.log(report.join('\n'));
