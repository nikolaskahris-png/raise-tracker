// Files checked out on Windows can arrive with CRLF line endings. Every parser must read them exactly like LF files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { parseScanReport, parseTreasuryReport } from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', '2026-11-16');
const REG = join(here, '..', '..', 'registry');
const lf = (s: string) => s.replace(/\r\n?/g, '\n');
const crlf = (s: string) => lf(s).replace(/\n/g, '\r\n');

function crlfCopy(): string {
  const d = mkdtempSync(join(tmpdir(), 'rt-crlf-'));
  cpSync(FIX, d, { recursive: true });
  for (const f of readdirSync(d)) writeFileSync(join(d, f), crlf(readFileSync(join(d, f), 'utf8')));
  return d;
}

test('the scan report parses the same with CRLF line endings', () => {
  const md = readFileSync(join(FIX, 'scan-report.md'), 'utf8');
  assert.deepEqual(parseScanReport(crlf(md)), parseScanReport(lf(md)));
});

test('the treasury report parses the same with CRLF line endings', () => {
  const md = readFileSync(join(FIX, 'treasury-report.md'), 'utf8');
  assert.deepEqual(parseTreasuryReport(crlf(md)), parseTreasuryReport(lf(md)));
});

test('the whole frozen data set passes the gate when every file has CRLF line endings', () => {
  const d = crlfCopy();
  assert.deepEqual(checkInvariants(buildSite(readInputs(d, REG))), []);
  assert.equal(buildSite(readInputs(d, REG)).companies.length, 33);
});
