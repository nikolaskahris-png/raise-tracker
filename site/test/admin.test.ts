// Admin-key movements are timed against the proposal's FinalizeProposal transaction (when it passed),
// never against the time it was opened, and every sentence about them is written from that order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { isAdmin, parseFlows } from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', '2026-11-16');
const REG = join(here, 'fixtures', 'registry');
const ZKFG = 'ZKFHiLAfAFMTcDAuCtjNW54VzpERvoe7PBF9mYgmeta';
const gate = (dir: string) => checkInvariants(buildSite(readInputs(dir, REG)));

function copy(): string {
  const d = mkdtempSync(join(tmpdir(), 'rt-admin-'));
  cpSync(FIX, d, { recursive: true });
  return d;
}
/** Rewrites one column of the first flow row of the given class (no quoted commas in those rows). */
function setCell(dir: string, cls: string, col: string, value: string): void {
  const p = join(dir, 'treasury-flows.csv');
  const lines = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const h = (lines[0] ?? '').split(',');
  const ic = h.indexOf('class'), i = h.indexOf(col);
  assert.ok(i >= 0, col);
  const n = lines.findIndex((l, k) => k > 0 && l.split(',')[ic] === cls);
  assert.ok(n > 0, `no ${cls} row`);
  const cells = (lines[n] ?? '').split(',');
  cells[i] = value;
  lines[n] = cells.join(',');
  writeFileSync(p, lines.join('\n'));
}
function build(dir: string): string {
  const out = join(mkdtempSync(join(tmpdir(), 'rt-admin-out-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: dir, REGISTRY_DIR: join(here, 'fixtures', 'registry'), OUT_DIR: out, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return out;
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('every admin-key movement in the frozen data is timed against a FinalizeProposal', () => {
  const flows = parseFlows(readFileSync(join(FIX, 'treasury-flows.csv'), 'utf8')).filter((f) => isAdmin(f.cls));
  assert.ok(flows.length > 0);
  for (const f of flows) {
    if (f.cls === 'admin_after_vote') assert.ok(f.prior?.finalizedAt && f.prior.finalizedAt <= f.time, f.signature);
    if (f.cls === 'admin_vote_passed_after') assert.ok(f.prior?.finalizedAt && f.prior.finalizedAt > f.time, f.signature);
  }
});

test('"after a vote" with a proposal that passed after the movement is refused', () => {
  const d = copy();
  setCell(d, 'admin_after_vote', 'prior_vote_finalized_utc', '2099-01-01T00:00:00.000Z');
  assert.ok(gate(d).some((f) => f.includes('is "after a vote"')));
});

test('"vote passed after" with a proposal that passed before the movement is refused', () => {
  const d = copy();
  setCell(d, 'admin_after_vote', 'class', 'admin_vote_passed_after');
  assert.ok(gate(d).some((f) => f.includes('is "vote passed after"') || f.includes('admin_vote_passed_after')));
});

test('an "after a vote" movement without its FinalizeProposal does not even parse', () => {
  const d = copy();
  setCell(d, 'admin_after_vote', 'prior_vote_finalize_signature', '');
  setCell(d, 'admin_after_vote', 'prior_vote_finalized_utc', '');
  assert.throws(() => gate(d), /needs the proposal and when it passed/);
});

test('ZKFG: the days are counted from when proposal #8 passed, not from when it was opened', () => {
  const html = text(readFileSync(join(build(FIX), 'company', ZKFG, 'index.html'), 'utf8'));
  assert.doesNotMatch(html, /8\.6 days/);
  assert.match(html, /Proposal #8/);
  assert.match(html, /FinalizeProposal/);
  assert.doesNotMatch(html, /enqueued/i);
});

test('the home note says only what the order shows, and changes when it does not hold', () => {
  const home = text(readFileSync(join(build(FIX), 'index.html'), 'utf8'));
  assert.match(home, /This is timing only: the chain does not tell us whether a proposal covers a payment\./);
  const d = copy();
  setCell(d, 'admin_after_vote', 'class', 'admin_vote_no_finalize');
  setCell(d, 'admin_vote_no_finalize', 'prior_vote_finalize_signature', '');
  setCell(d, 'admin_vote_no_finalize', 'prior_vote_finalized_utc', '');
  // the treasury columns must still add up for the gate to pass: move the amount between the two class columns
  const p = join(d, 'treasury-flows.csv');
  const lines = readFileSync(p, 'utf8').split('\n');
  const h = (lines[0] ?? '').split(',');
  const row = lines.find((l) => l.split(',')[h.indexOf('class')] === 'admin_vote_no_finalize')?.split(',') ?? [];
  const mint = row[h.indexOf('base_mint')] ?? '', amt = -Number(row[h.indexOf('usdc')]);
  const tp = join(d, 'treasury.csv');
  const tl = readFileSync(tp, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const th = (tl[0] ?? '').split(',');
  const k = tl.findIndex((l) => l.split(',')[th.indexOf('base_mint')] === mint);
  const cells = (tl[k] ?? '').split(',');
  const a = th.indexOf('admin_after_vote_usd'), b = th.indexOf('admin_vote_no_finalize_usd');
  cells[a] = (Number(cells[a]) - amt).toFixed(2);
  cells[b] = (Number(cells[b]) + amt).toFixed(2);
  tl[k] = cells.join(',');
  writeFileSync(tp, tl.join('\n'));
  assert.deepEqual(gate(d), []);
  const changed = text(readFileSync(join(build(d), 'index.html'), 'utf8'));
  assert.match(changed, /Not every admin-key movement came after a vote\./);
  assert.doesNotMatch(changed, /Every admin-key movement came after/);
});

test('every claim about MetaDAO’s code links a line at a fixed commit', () => {
  const m = readFileSync(join(build(FIX), 'methodology', 'index.html'), 'utf8');
  const commit = '74aec758b5c8b5363b94ecce0a45bcd426c9746e';
  for (const ref of ['admin_enqueue_multisig_proposal_approval.rs#L82', 'admin_enqueue_multisig_proposal_approval.rs#L6', 'execute_multisig_proposal_approval.rs#L85', 'admin_execute_multisig_proposal.rs#L64', 'initialize_dao.rs#L143', 'initialize_dao.rs#L169']) {
    assert.ok(m.includes(`programs/blob/${commit}/programs/futarchy/src/instructions/${ref}`), ref);
  }
  assert.ok(m.includes('Squads-Protocol/v4/blob/3a39735d0c56249bf2ce4b16b3229d7be87ad55f/programs/squads_multisig_program/src/state/spending_limit.rs#L104'));
  assert.doesNotMatch(m, /blob\/main\/programs\/futarchy/);
});
