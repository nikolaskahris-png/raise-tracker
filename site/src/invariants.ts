// The publication gate. Every check here must pass or nothing is published.
// The same function runs in the build and in the tests (including the tamper tests).
import { fmtUsd, matchesCents, ratio, toCents } from './money.ts';
import { FLOW_CLASSES, TRACKS, isAdmin } from './schema.ts';
import { ADMIN_VOTE_WINDOW_MS, C } from './constants.ts';
import type { Site } from './model.ts';

/** Problems the treasury script reports that the site knows how to show ("not read"). Anything else stops the build. */
export const TREASURY_MOVED = /^\S+: treasury USDC account mismatch(?: \(account ([1-9A-HJ-NP-Za-km-z]{32,44}) now owned by ([1-9A-HJ-NP-Za-km-z]{32,44}), holds (\d+\.\d{6}) USDC(?:; owner changed (\d{4}-\d\d-\d\dT[\d:.]+Z) in ([1-9A-HJ-NP-Za-km-z]{64,90})(?: via (\w+(?:\+\w+)*))?)?\))?$/;
export const KNOWN_PROBLEMS = [TREASURY_MOVED];
export const MAX_REPORT_GAP_MS = C.max_report_gap_hours * 3_600_000;

export function checkInvariants(site: Site): string[] {
  const fail: string[] = [];
  const { inputs } = site;
  const sr = inputs.scanReport;

  // 1. The scan itself reported no failed check and no decode error.
  if (sr.failingChecks !== 0) fail.push(`scan-report: ${sr.failingChecks} rows failed a check`);
  if (sr.decodeErrors !== 0) fail.push(`scan-report: ${sr.decodeErrors} decode errors`);
  for (const r of site.decoded) if (r.checks !== 'OK') fail.push(`raises.csv ${r.launch}: checks "${r.checks}"`);

  // 2. Counts per track recomputed from raises.csv equal the report.
  for (const t of TRACKS) {
    const rs = site.decoded.filter((r) => r.track === t);
    const c = rs.filter((r) => r.state === 'Complete').length;
    const f = rs.filter((r) => r.state === 'Refunding').length;
    const want = sr.tracks[t];
    if (rs.length !== want.raises || c !== want.complete || f !== want.refunding || rs.length - c - f !== want.other) {
      fail.push(`track ${t}: raises.csv gives ${rs.length}/${c}/${f}, report says ${want.raises}/${want.complete}/${want.refunding}`);
    }
  }

  // 3. Raised amounts and oversubscription are consistent.
  for (const r of site.decoded) {
    if (r.state === 'Complete' && r.raised === null) fail.push(`raises.csv ${r.launch}: complete without a raised amount`);
    if (r.raised !== null && r.raised > 0n) {
      if (r.oversubscription !== ratio(r.committed, r.raised, 2)) {
        fail.push(`raises.csv ${r.launch}: oversubscription ${r.oversubscription} != committed/raised ${ratio(r.committed, r.raised, 2)}`);
      }
    }
  }

  // 4. Treasury rows: unique, joined to a raise, reconciled, and every column equals the sum of its movements.
  const seen = new Set<string>();
  for (const t of inputs.treasury) {
    if (seen.has(t.mint)) fail.push(`treasury.csv: ${t.mint} appears twice`);
    seen.add(t.mint);
    const company = site.companies.find((c) => c.raise.mint === t.mint);
    if (!company) { fail.push(`treasury.csv: ${t.label} has no completed raise`); continue; }
    if (company.raise.raised !== t.raised) fail.push(`${t.label}: raised ${fmtUsd(t.raised)} in treasury.csv, ${company.raise.raised === null ? 'none' : fmtUsd(company.raise.raised)} in raises.csv`);
    if (company.raise.dao !== t.dao || company.raise.daoVault !== t.daoVault || company.raise.launch !== t.launch) fail.push(`${t.label}: DAO, vault or launch differs between files`);
    if (!t.reconciles) fail.push(`${t.label}: the script says the history does not reconcile`);
    const tr = company.treasury;
    if (!tr) { fail.push(`${t.label}: no treasury model`); continue; }
    for (const c of FLOW_CLASSES) {
      if (!matchesCents(tr.byClass[c], t.cols[c])) fail.push(`${t.label}: ${c} movements sum to ${fmtUsd(tr.byClass[c], { decimals: 2 })}, treasury.csv says ${fmtUsd(t.cols[c], { decimals: 2 })}`);
    }
    if (!matchesCents(tr.net, t.balanceNow)) fail.push(`${t.label}: movements net to ${fmtUsd(tr.net, { decimals: 2 })}, balance is ${fmtUsd(t.balanceNow, { decimals: 2 })}`);
    const launch = tr.flows.filter((f) => f.cls === 'launch_funding');
    if (launch.length !== 1) fail.push(`${t.label}: expected exactly one launch deposit`);
    else if (launch[0]?.signature !== t.launchSignature) fail.push(`${t.label}: launch_signature is not the launch deposit's transaction`);
    if (t.launchRecipients.reduce((a, x) => a + x.amount, 0n) !== t.launchOther) fail.push(`${t.label}: launch_other_usdc is not the sum of its recipients`);
    if (t.launchRecipients.some((x) => x.amount <= 0n)) fail.push(`${t.label}: a launch recipient with no USDC`);
    // The team-budget limit: the last change must match the chain today. A last "set" must have set the amount the
    // limit account holds; a last "removed" means there is no limit account. None can be the launch or a team draw.
    const lastChange = t.limitChanges.at(-1);
    if (lastChange?.action === 'set' && lastChange.amount !== t.spendingLimitNow) fail.push(`${t.label}: the last limit change (${lastChange.signature}) set ${lastChange.amount} base units, the limit account holds ${t.spendingLimitNow ?? 'nothing'}`);
    if (lastChange?.action === 'removed' && t.spendingLimitNow !== null) fail.push(`${t.label}: the last limit change (${lastChange.signature}) removed the limit, but the limit account holds ${t.spendingLimitNow}`);
    const draws = new Set(inputs.flows.filter((f) => f.mint === t.mint && f.cls === 'team_budget').map((f) => f.signature));
    for (const x of t.limitChanges) if (x.signature === t.launchSignature || draws.has(x.signature)) fail.push(`${t.label}: ${x.signature} is listed as a limit change but is the launch or a team draw`);
  }

  // 5. Movements: unique signatures per treasury, and every movement belongs to a treasury row.
  //    An admin-key movement's class must agree with the order of the two transactions it compares.
  //    A "market vote" movement was approved by its own proposal's FinalizeProposal, never by an admin key;
  //    an admin-key movement was approved by an admin key.
  const sigs = new Set<string>();
  for (const f of inputs.flows) {
    if (f.cls === 'market_approved' && (f.approvalHow !== 'market_approved' || f.adminKeys.length > 0)) fail.push(`treasury-flows.csv: ${f.signature} is a market vote but was approved by an admin key or by no proposal (${f.approvalHow || 'none'})`);
    if (isAdmin(f.cls) && f.approvalHow !== 'admin_approved') fail.push(`treasury-flows.csv: ${f.signature} is an admin-key movement but its approval is ${f.approvalHow || 'none'}`);
    const passed = f.prior?.finalizedAt ?? null;
    if (f.cls === 'admin_after_vote' && passed && (passed.getTime() > f.time.getTime() || f.time.getTime() - passed.getTime() > ADMIN_VOTE_WINDOW_MS)) fail.push(`treasury-flows.csv: ${f.signature} is "after a vote" but proposal #${f.prior?.number} finalized at ${passed.toISOString()}`);
    if (f.cls === 'admin_vote_passed_after' && passed && passed.getTime() <= f.time.getTime()) fail.push(`treasury-flows.csv: ${f.signature} is "vote passed after" but proposal #${f.prior?.number} finalized before it`);
    const key = `${f.mint}:${f.signature}`;
    if (sigs.has(key)) fail.push(`treasury-flows.csv: ${f.signature} listed twice for ${f.label}`);
    sigs.add(key);
    if (!seen.has(f.mint)) fail.push(`treasury-flows.csv: ${f.label} has movements but no treasury row`);
  }

  // 6. Every company without a treasury has a known, shown problem.
  for (const c of site.companies) if (!c.treasury && !c.problem) fail.push(`${c.displayName}: no treasury and no reported problem`);
  for (const p of inputs.treasuryReport.problems) if (!KNOWN_PROBLEMS.some((re) => re.test(p))) fail.push(`treasury-report: unknown problem "${p}"`);

  // 7. The treasury step ran on the very data the scan wrote: the raises.json it read has the scan's sha256 and slot,
  //    and the raises.csv the site reads has the scan's sha256. It also ran after the scan, and soon after.
  if (inputs.treasuryReport.read.sha256 !== sr.raisesJsonSha) fail.push('treasury-report read a raises.json that is not the one the scan wrote (sha256 differs)');
  if (inputs.treasuryReport.read.slot !== sr.slot) fail.push(`treasury-report read the scan of slot ${inputs.treasuryReport.read.slot}, scan-report is slot ${sr.slot}`);
  if (inputs.raisesCsvSha !== sr.raisesCsvSha) fail.push('raises.csv is not the file the scan wrote (sha256 differs)');
  const gap = inputs.treasuryReport.at.getTime() - sr.at.getTime();
  if (gap < 0) fail.push('treasury-report is older than scan-report (the treasury step ran on old data)');
  if (gap > MAX_REPORT_GAP_MS) fail.push(`treasury-report is more than ${C.max_report_gap_hours} hours after scan-report`);

  // 8a. Names. Every press name belongs to a company on the site, and its verbatim quote names the token's onchain symbol,
  //     so a quote can never be attached to the wrong token.
  for (const [mint, press] of inputs.names) {
    const c = site.companies.find((x) => x.raise.mint === mint);
    if (!c) { fail.push(`names.json: ${mint} is not a company on the site`); continue; }
    if (c.name.kind !== 'onchain') { fail.push(`names.json: ${mint} has no onchain metadata to match the quote against`); continue; }
    const sym = c.name.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(^|[^A-Za-z0-9])\\$?${sym}([^A-Za-z0-9]|$)`).test(press.quote)) fail.push(`names.json: the quote for ${mint} does not name the onchain symbol ${c.name.symbol}`);
  }

  for (const mint of inputs.readings.keys()) if (!site.companies.some((x) => x.raise.mint === mint)) fail.push(`names.json: reading for ${mint}, which is not a company on the site`);

  // 8. Totals are not empty (a silent empty file must never publish as zeros).
  if (site.companies.length === 0 || inputs.flows.length === 0) fail.push('no companies or no movements');
  if (toCents(site.companies.reduce((a, c) => a + (c.treasury?.totalIn ?? 0n), 0n)) <= 0n) fail.push('total inflow is zero');

  // 5. Public code: every project with a repo that is a company on the site has its commits in commits-monthly.csv, from the
  //    raise to the day they were read, and no commit file row belongs to a project that has no repo in the registry.
  const foundMints = new Set(inputs.projects.filter((p) => p.status === 'found').map((p) => p.mint));
  for (const row of inputs.commits) if (!foundMints.has(row.mint)) { fail.push(`commits-monthly.csv: ${row.ticker} ${row.repo} is not a project with a repository in registry/projects.json`); break; }
  for (const c of site.companies) {
    if (c.code.kind !== 'active' && c.code.kind !== 'quiet') continue;
    if (c.code.repos.length === 0) fail.push(`${c.displayName}: the registry lists a repository but commits-monthly.csv has none`);
    else if (c.code.months.length === 0) fail.push(`${c.displayName}: commits-monthly.csv has no months`);
  }
  // 6. Shipped work: every repository the commits file lists has its releases and contributor counts in shipped.csv, with the same
  //    number of contributors for the project in both files; shipped.csv holds nothing for a project without a repository.
  const commitRepos = (mint: string) => new Set(inputs.commits.filter((c) => c.mint === mint).map((c) => c.repo));
  for (const m of new Set(inputs.shipped.map((s) => s.mint))) if (!foundMints.has(m)) { fail.push(`shipped.csv: ${m} is not a project with a repository in registry/projects.json`); break; }
  for (const c of site.companies) {
    if (c.code.kind !== 'active' && c.code.kind !== 'quiet') continue;
    const want = commitRepos(c.raise.mint), have = new Set((c.shipped?.repos ?? []).map((r) => r.repo));
    if (!c.shipped) { fail.push(`${c.displayName}: has a repository but shipped.csv has no row for it`); continue; }
    for (const repo of want) if (!have.has(repo)) fail.push(`${c.displayName}: ${repo} is in commits-monthly.csv but not in shipped.csv`);
    for (const repo of have) if (!want.has(repo)) fail.push(`${c.displayName}: ${repo} is in shipped.csv but not in commits-monthly.csv`);
  }
  return fail;
}
