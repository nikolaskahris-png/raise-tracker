// The publication gate on the frozen data of 16 Nov 2026, and tamper tests:
// each test changes one thing in a copy of the data and proves the gate refuses to publish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', '2026-11-16');
const REG = join(here, '..', '..', 'registry');

function copy(): string {
  const d = mkdtempSync(join(tmpdir(), 'rt-'));
  cpSync(FIX, d, { recursive: true });
  return d;
}
function edit(dir: string, file: string, fn: (s: string) => string): void {
  const p = join(dir, file);
  const before = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'); // tamper on LF text whatever the checkout did
  const after = fn(before);
  assert.notEqual(after, before, `tamper did not change ${file}`);
  writeFileSync(p, after);
}
const gate = (dir: string) => checkInvariants(buildSite(readInputs(dir, REG)));

/** Changes the n-th data line's column `col` of a CSV with a function. */
function editCell(dir: string, file: string, line: number, col: string, fn: (v: string) => string): void {
  edit(dir, file, (s) => {
    const lines = s.split('\n');
    const header = (lines[0] ?? '').split(',');
    const i = header.indexOf(col);
    assert.ok(i >= 0, `no column ${col}`);
    const cells = (lines[line] ?? '').split(','); // the edited lines hold no quoted commas
    cells[i] = fn(cells[i] ?? '');
    lines[line] = cells.join(',');
    return lines.join('\n');
  });
}
const plusCent = (v: string) => (Number(v) + 0.01).toFixed(v.split('.')[1]?.length ?? 2);

test('the frozen data passes every check', () => {
  assert.deepEqual(gate(FIX), []);
});

test('the frozen data gives the published headline figures', () => {
  const site = buildSite(readInputs(FIX, REG));
  assert.equal(site.decoded.length, 214);
  assert.equal(site.undecoded.length, 13);
  assert.equal(site.real.length, 147);
  assert.equal(site.companies.length, 33);
  assert.equal(site.companies.filter((c) => c.treasury).length, 31);
  const umbra = site.companies.find((c) => c.raise.ticker === 'UMBRA');
  assert.equal(umbra?.treasury?.net, 989_308_398_318n); // the exact balance; the CSV shows it rounded to 989,308.40
  const avici = site.companies.find((c) => c.raise.ticker === 'AVICI');
  assert.equal(avici?.treasury?.net, 1_600_000_595_000n); // exactly half a cent, the case floats round down
});

test('a treasury total changed by one cent is refused', () => {
  const d = copy();
  editCell(d, 'treasury.csv', 1, 'team_budget_usd', plusCent);
  assert.ok(gate(d).some((f) => f.includes('team_budget')));
});

test('a balance changed by one cent is refused', () => {
  const d = copy();
  editCell(d, 'treasury.csv', 1, 'balance_now_usd', plusCent);
  assert.ok(gate(d).some((f) => f.includes('balance')));
});

test('a single movement changed by one cent is refused', () => {
  const d = copy();
  editCell(d, 'treasury-flows.csv', 5, 'usdc', (v) => (Number(v) + (Number(v) < 0 ? -0.01 : 0.01)).toFixed(6));
  assert.ok(gate(d).length > 0);
});

test('a duplicated movement is refused', () => {
  const d = copy();
  edit(d, 'treasury-flows.csv', (s) => { const l = s.trimEnd().split('\n'); return [...l, l[3]].join('\n') + '\n'; });
  assert.ok(gate(d).some((f) => f.includes('listed twice')));
});

test('a raised amount that differs between files is refused', () => {
  const d = copy();
  editCell(d, 'treasury.csv', 1, 'raised_usd', (v) => String(Number(v) + 1));
  assert.ok(gate(d).some((f) => f.includes('raised')));
});

test('a treasury the script could not reconcile is refused', () => {
  const d = copy();
  editCell(d, 'treasury.csv', 1, 'reconciles', () => 'NO');
  assert.ok(gate(d).some((f) => f.includes('reconcile')));
});

test('a failed check in the scan is refused', () => {
  const d = copy();
  edit(d, 'scan-report.md', (s) => s.replace('## Rows failing a check: 0', '## Rows failing a check: 1'));
  assert.ok(gate(d).some((f) => f.includes('failed a check')));
});

test('track counts that disagree with the scan report are refused', () => {
  const d = copy();
  edit(d, 'scan-report.md', (s) => s.replace(/- curated: (\d+) raises/, (_m, n: string) => `- curated: ${Number(n) + 1} raises`));
  assert.ok(gate(d).some((f) => f.startsWith('track curated')));
});

test('an unknown problem in the treasury report is refused', () => {
  const d = copy();
  edit(d, 'treasury-report.md', (s) => s.replace(/## Problems: (\d+)\n/, (_m, n: string) => `## Problems: ${Number(n) + 1}\n- XYZ: something new\n`));
  assert.ok(gate(d).some((f) => f.includes('unknown problem')));
});

test('a treasury scan older than the raise scan is refused', () => {
  const d = copy();
  edit(d, 'treasury-report.md', (s) => s.replace(/^# Treasury report — \S+/m, '# Treasury report — 2020-01-01T00:00:00.000Z'));
  assert.ok(gate(d).some((f) => f.includes('older')));
});

test('a malformed address stops the build before the gate', () => {
  const d = copy();
  editCell(d, 'treasury.csv', 1, 'treasury_usdc_account', () => 'not-an-address');
  assert.throws(() => gate(d), /base58/);
});

test('the build publishes nothing when the gate fails', () => {
  const d = copy();
  editCell(d, 'treasury.csv', 1, 'team_budget_usd', plusCent);
  const out = join(mkdtempSync(join(tmpdir(), 'rt-out-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: d, OUT_DIR: out, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /Publication gate/);
  assert.equal(existsSync(out), false);
});

test('the build succeeds on the frozen data and every page passes the HTML checks', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'rt-out-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: FIX, OUT_DIR: out, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(out, 'company', 'PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta', 'index.html')));
  const home = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(home, /\$9,905,370\.\d\d/); // still in the treasuries, the exact sum of 31 balances
});
