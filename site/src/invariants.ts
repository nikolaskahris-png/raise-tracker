// The publication gate. Every check here must pass or nothing is published.
// The same function runs in the build and in the tests (including the tamper tests).
import { fmtUsd, matchesCents, ratio, toCents } from './money.ts';
import { FLOW_CLASSES, TRACKS } from './schema.ts';
import { ADMIN_VOTE_WINDOW_MS } from './constants.ts';
import type { Site } from './model.ts';

/** Problems the treasury script reports that the site knows how to show ("not read"). Anything else stops the build. */
export const KNOWN_PROBLEMS = [/^\S+: treasury USDC account mismatch$/];
export const MAX_REPORT_GAP_MS = 2 * 60 * 60 * 1000;

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
  }

  // 5. Movements: unique signatures per treasury, and every movement belongs to a treasury row.
  //    An admin-key movement's class must agree with the order of the two transactions it compares.
  const sigs = new Set<string>();
  for (const f of inputs.flows) {
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

  // 7. The treasury report ran after the scan, on the same data.
  const gap = inputs.treasuryReport.at.getTime() - sr.at.getTime();
  if (gap < 0) fail.push('treasury-report is older than scan-report (the treasury step ran on old data)');
  if (gap > MAX_REPORT_GAP_MS) fail.push('treasury-report is more than 2 hours after scan-report');

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

  return fail;
}
