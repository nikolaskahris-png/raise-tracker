// Item 4: the gate proves the treasury step ran on the very data the scan wrote, by sha256 and slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { FIX, REG } from './helpers.ts';

const gate = (dir: string) => checkInvariants(buildSite(readInputs(dir, REG)));
function copyWith(file: string, fn: (s: string) => string): string {
  const d = mkdtempSync(join(tmpdir(), 'rt-same-'));
  cpSync(FIX, d, { recursive: true });
  const p = join(d, file);
  const before = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
  const after = fn(before);
  assert.notEqual(after, before, `tamper did not change ${file}`);
  writeFileSync(p, after);
  return d;
}

test('the frozen data: treasury read the scan\'s raises.json, and raises.csv is the scan\'s file', () => {
  const site = buildSite(readInputs(FIX, REG));
  assert.equal(site.inputs.treasuryReport.read.sha256, site.inputs.scanReport.raisesJsonSha);
  assert.equal(site.inputs.treasuryReport.read.slot, site.inputs.scanReport.slot);
  assert.equal(site.inputs.raisesCsvSha, site.inputs.scanReport.raisesCsvSha);
  assert.deepEqual(gate(FIX), []);
});

test('a treasury report that read another raises.json is refused', () => {
  const d = copyWith('treasury-report.md', (s) => s.replace(/(Read raises\.json sha256: )([0-9a-f])/, (_m, a: string, c: string) => a + (c === '0' ? '1' : '0')));
  assert.ok(gate(d).some((f) => f.includes('not the one the scan wrote')));
});

test('a treasury report from another scan slot is refused', () => {
  const d = copyWith('treasury-report.md', (s) => s.replace(/from the scan at slot (\d+)/, (_m, n: string) => `from the scan at slot ${Number(n) - 1}`));
  assert.ok(gate(d).some((f) => f.includes('read the scan of slot')));
});

test('a raises.csv that is not the scan\'s file is refused', () => {
  // change only the trailing newline: every row still parses, only the bytes differ
  const d = copyWith('raises.csv', (s) => s + '\n');
  assert.ok(gate(d).some((f) => f.includes('raises.csv is not the file the scan wrote')));
});
