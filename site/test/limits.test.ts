// Item 8: every team-budget limit that changed after launch links the transaction that changed it, the amount it
// set, and who approved it; the gate checks the last change against the limit account today.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { FIX, REG, MINT, build, read, visible } from './helpers.ts';

const LFOWN = '5gDnzAC4EEFmTjFzFjHUXS7wx5Cdvi2NTKGZT61meta';
const FUTARDIO = 'Cbjr1Nvcay3QWDriyRKtokJ7V4PMknesGxeK8z7Zmeta';
const PAYS = 'PAYZP1W3UmdEsNLJwmH61TNqACYJTvhXy8SCN4Tmeta';
const site = buildSite(readInputs(FIX, REG));
const row = (mint: string) => { const t = site.inputs.treasury.find((x) => x.mint === mint); assert.ok(t); return t; };
const gate = (dir: string) => checkInvariants(buildSite(readInputs(dir, REG)));
function tamper(fn: (line: string) => string, mint: string): string {
  const d = mkdtempSync(join(tmpdir(), 'rt-limit-'));
  cpSync(FIX, d, { recursive: true });
  const p = join(d, 'treasury.csv');
  const lines = readFileSync(p, 'utf8').replace(/\r/g, '').split('\n');
  const i = lines.findIndex((l) => l.includes(`,${mint},`));
  const after = fn(lines[i] ?? '');
  assert.notEqual(after, lines[i], 'tamper changed nothing');
  lines[i] = after;
  writeFileSync(p, lines.join('\n'));
  return d;
}

test('every limit that differs from launch has the transactions that changed it', () => {
  const changed = site.inputs.treasury.filter((t) => t.spendingLimitNow !== null && t.spendingLimitNow !== site.companies.find((c) => c.raise.mint === t.mint)?.raise.monthlyBudget);
  assert.deepEqual(changed.map((t) => t.label).sort(), ['FUTARDIO', 'LASO', 'LFOWN', 'UMBRA']);
  for (const t of changed) {
    assert.ok(t.limitChanges.length > 0, `${t.label}: no change transaction`);
    assert.equal(t.limitChanges.at(-1)?.amount, t.spendingLimitNow, `${t.label}: last change is not the limit today`);
  }
  // Zinc and PAYS have no limit account today: their last change removed it, through the admin key.
  for (const m of [MINT.ZKFG, PAYS]) { assert.equal(row(m).spendingLimitNow, null); assert.equal(row(m).limitChanges.at(-1)?.action, 'removed'); }
  assert.deepEqual(row(MINT.ZKFG).limitChanges.map((x) => `${x.path} ${x.action}`), ['admin set', 'admin removed']);
  assert.deepEqual(row(PAYS).limitChanges.map((x) => `${x.path} ${x.action}`), ['admin removed', 'admin set', 'admin removed']);
  assert.deepEqual(row(MINT.UMBRA).limitChanges.map((x) => x.path), ['admin', 'proposal']);
  assert.deepEqual(row(MINT.LASO).limitChanges.map((x) => x.path), ['proposal']); // a market vote, only executed by the admin key
  assert.deepEqual(row(FUTARDIO).limitChanges.map((x) => x.path), ['admin']);
  assert.deepEqual(row(LFOWN).limitChanges.map((x) => x.path), ['proposal']);
  assert.deepEqual(gate(FIX), []);
});

test('the company page links each change and says who approved it; nothing is left pending', () => {
  const dist = build();
  for (const mint of [MINT.UMBRA, MINT.LASO, FUTARDIO, LFOWN, MINT.ZKFG, PAYS]) {
    const html = read(dist, `company/${mint}/index.html`);
    for (const x of row(mint).limitChanges) if (x.action === 'set') assert.match(html, new RegExp(`data-figure[^>]*href="https://explorer\\.solana\\.com/tx/${x.signature}"|href="https://explorer\\.solana\\.com/tx/${x.signature}"[^>]*data-figure`), `${mint}: change ${x.signature} is not a linked figure`);
    assert.doesNotMatch(visible(html), /The transaction that changed it is not linked yet/, mint);
    for (const x of row(mint).limitChanges) assert.ok(html.includes(`/tx/${x.signature}`), `${mint}: ${x.signature} not linked`);
  }
  assert.match(visible(read(dist, `company/${PAYS}/index.html`)), /removed the limit , leaving no limit account/);
  assert.match(visible(read(dist, `company/${MINT.UMBRA}/index.html`)), /approved through MetaDAO's admin key, not a market vote/);
  assert.match(visible(read(dist, `company/${LFOWN}/index.html`)), /approved by a passed futarchy proposal/);
});

test('a last change that set another amount than the limit today is refused', () => {
  const d = tamper((l) => l.replace(/\|(admin|proposal)\|set\|(\d+)\.(\d{6})\|Month$/, (_m, p: string, a: string, b: string) => `|${p}|set|${Number(a) + 1}.${b}|Month`), MINT.UMBRA);
  assert.ok(gate(d).some((f) => f.includes('UMBRA: the last limit change')), gate(d).join('\n'));
});

test('the launch transaction listed as a limit change is refused', () => {
  const launch = row(LFOWN).launchSignature;
  const d = tamper((l) => l.replace(/,(\d{4}-\d\d-\d\dT[^|]+)\|[1-9A-HJ-NP-Za-km-z]+\|/, `,$1|${launch}|`), LFOWN);
  assert.ok(gate(d).some((f) => f.includes('is listed as a limit change but is the launch or a team draw')), gate(d).join('\n'));
});

test('a last change that does not match the chain today is refused (a removal dropped)', () => {
  // PAYS without its last removal: its last change would be a "set", but there is no limit account today
  const d = tamper((l) => l.replace(/ \S+\|admin\|removed\|\|$/, ''), PAYS);
  assert.ok(gate(d).some((f) => f.includes('PAYZP1W3: the last limit change')), gate(d).join('\n'));
});
