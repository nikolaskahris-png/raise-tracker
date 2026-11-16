// Item 7: a "market vote" movement was approved by its own proposal's FinalizeProposal, never by an admin key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { parseFlows } from '../src/schema.ts';
import { FIX, REG } from './helpers.ts';

test('every market-vote movement in the frozen data was approved by its proposal', () => {
  const flows = parseFlows(readFileSync(join(FIX, 'treasury-flows.csv'), 'utf8')).filter((f) => f.cls === 'market_approved');
  assert.equal(flows.length, 22);
  for (const f of flows) assert.equal(f.approvalHow, 'market_approved', f.signature);
});

test('a market-vote movement approved by an admin key is refused by the gate', () => {
  const d = mkdtempSync(join(tmpdir(), 'rt-mv-'));
  cpSync(FIX, d, { recursive: true });
  const p = join(d, 'treasury-flows.csv');
  const text = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes(',market_approved,market_approved '));
  assert.ok(i > 0, 'no market-approved row to tamper');
  lines[i] = (lines[i] ?? '').replace(',market_approved,market_approved ', ',market_approved,admin_approved by CWGawadYU8CzRVBecnJymNw97H7E3ndDinV5sMzesgY2 ');
  writeFileSync(p, lines.join('\n'));
  const fails = checkInvariants(buildSite(readInputs(d, REG)));
  assert.ok(fails.some((f) => f.includes('is a market vote but was approved by an admin key')), fails.join('\n'));
});

test('the treasury script only calls a movement a market vote when FinalizeProposal approved it', () => {
  const src = readFileSync(join(FIX, '..', '..', '..', '..', 'scripts', 'treasury.mjs'), 'utf8');
  assert.match(src, /if \(a\.decision === 'Passed' && a\.how === 'market_approved'\) cls = 'market_approved';/);
  assert.doesNotMatch(src, /if \(a\.decision === 'Passed'\) cls = 'market_approved';/);
});
