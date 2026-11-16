// Section 6: Σ opens exactly its rows; one constants file; no hand-typed numbers in labels; "31 of 33";
// raise → launch transaction → treasury; balances dated "at the scan"; token decimals from the mint; v0.5/v0.4.1 wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sumLinks, unsourcedDigits } from '../src/check-html.ts';
import { CONSTANT_TEXT, C } from '../src/constants.ts';
import { parseRaises } from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const FIX = join(here, 'fixtures', '2026-11-16');
const UMBRA = 'PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta';
const RNGR = 'RNGRtJMbCveqCp7AC6U95KmrdKecFckaJZiWbPGmeta';

let out: string | null = null;
function built(): string {
  if (out) return out;
  const o = join(mkdtempSync(join(tmpdir(), 'rt-medium-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: FIX, OUT_DIR: o, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return (out = o);
}
const html = (rel: string) => readFileSync(join(built(), rel), 'utf8');
const text = (h: string) => (/<main\b[^>]*>([\s\S]*)<\/main>/.exec(h)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pages = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? pages(p) : n === 'index.html' ? [p] : []; });

test('every Σ on every page opens a list under lists/, never a whole file or another page', () => {
  let n = 0;
  for (const p of pages(built())) {
    for (const m of readFileSync(p, 'utf8').matchAll(/<a\b[^>]*data-figure="sum"[^>]*href="([^"]+)"/g)) { n++; assert.match(m[1] ?? '', /^\/lists\/[a-z0-9-]+\/$/, p); }
  }
  assert.ok(n > 100, `only ${n} Σ figures`);
});

test('a Σ whose number differs from its list is caught', () => {
  const home = html('index.html');
  const m = /<a\b[^>]*data-figure="sum"[^>]*href="\/lists\/([a-z0-9-]+)\/"[^>]*>([^<]+)</.exec(home);
  assert.ok(m);
  assert.deepEqual(sumLinks(home.slice(m.index, m.index + m[0].length + 200).replace(/<a\b[^>]*>$/, ''), built()).length, 0);
  const tampered = m[0].replace(/>([^<]+)<$/, (_x, v: string) => `>${v.replace(/\d/, (d) => String((Number(d) + 1) % 10))}<`) + '</a>';
  assert.equal(sumLinks(tampered, built()).length, 1);
});

test('the list behind a figure holds exactly its rows (Umbra: 4 market votes, $805,000.00)', () => {
  const page = html(`company/${UMBRA}/index.html`);
  const href = /<a\b[^>]*data-figure="sum"[^>]*href="(\/lists\/umbra-movements-approved-by-market-vote-[a-z0-9]+\/)"[^>]*>\$805,000\.00/.exec(page)?.[1];
  assert.ok(href, 'no Σ for $805,000.00 with its list');
  const list = text(html(`${href.slice(1)}index.html`));
  assert.match(list, /4 Σ movements · total \$805,000\.00/);
  assert.equal((html(`${href.slice(1)}index.html`).match(/<tr><td><time/g) ?? []).length, 4);
});

test('one constants file: the scripts and the site keep no copy of a rule', () => {
  const scripts = ['scan.mjs', 'treasury.mjs'].map((f) => readFileSync(join(ROOT, 'scripts', f), 'utf8'));
  for (const s of scripts) {
    assert.match(s, /constants\.json/);
    assert.doesNotMatch(s, /\b10000\b|30\.4375|60 \* 86400|30 \* 864e5|30 \* 86400/);
    assert.doesNotMatch(s, new RegExp(`'${C.permissionless_authority}'`));
  }
  const src = (f: string) => readFileSync(join(here, '..', 'src', f), 'utf8');
  for (const f of ['model.ts', 'invariants.ts', 'layout.ts', 'stats.ts', 'chain-check.ts', 'pages/company.ts', 'pages/home.ts', 'pages/methodology.ts']) {
    assert.doesNotMatch(src(f), /10_000_000_000n|1_000_000_000n|30\.4375|60 \* 86_400_000|30 \* 86_400_000|= 36;|= 0\.95;|LRrTQLqFzAPxjschuAKQAqH1XHBuBgHqwhybENStARt/, f);
  }
  const crons = [...readFileSync(join(ROOT, '.github', 'workflows', 'scan.yml'), 'utf8').matchAll(/- cron: '(\d+) (\d+) \* \* \*'/g)].map((m) => `${String(m[2]).padStart(2, '0')}:${String(m[1]).padStart(2, '0')}`);
  assert.deepEqual(crons, [...C.scan_times_utc]);
});

test('the methodology quotes the rules from constants.json', () => {
  const m = html('methodology/index.html');
  for (const k of ['min_real_raise_usd', 'admin_vote_window_days', 'spending_limit_period_days', 'confidence', 'stale_hours', 'sample_treasuries', 'sample_movements', 'scan_times_utc.0', 'scan_times_utc.1']) {
    assert.ok(m.includes(`data-constant="${k}"`), k);
  }
});

test('no number typed by hand, not even in a label', () => {
  const page = (inner: string) => `<html><body><main>${inner}</main></body></html>`;
  assert.equal(unsourcedDigits(page('<span data-label>5,047,250 USDC</span>'), { identifiers: new Set(['P2P']) }).length, 1);
  assert.equal(unsourcedDigits(page('<span data-label>P2P</span>'), { identifiers: new Set(['P2P']) }).length, 0);
  assert.equal(unsourcedDigits(page('<span data-constant="admin_vote_window_days">90</span>'), { constants: CONSTANT_TEXT }).length, 1);
  assert.equal(unsourcedDigits(page(`<span data-constant="admin_vote_window_days">${CONSTANT_TEXT['admin_vote_window_days']}</span>`), { constants: CONSTANT_TEXT }).length, 0);
});

test('home: 31 of 33 treasuries read, and all 31 add up', () => {
  assert.match(text(html('index.html')), /31 Σ of 33 Σ read; all 31 Σ add up to the cent/);
  assert.doesNotMatch(text(html('index.html')), /31 \/ 31/);
});

test('Umbra: $3,000,000 raised = $2,400,000 to the treasury + $600,000 as liquidity to its own market', () => {
  const u = text(html(`company/${UMBRA}/index.html`));
  // each row reads: label, note, figure
  assert.match(u, /Raised read from the launch account \$3,000,000\.00/);
  assert.match(u, /To this treasury the DAO vault's USDC account \$2,400,000\.00/);
  assert.match(u, /To the DAO's own market, as liquidity \S+ · the same transaction runs futarchy ProvideLiquidity \$600,000\.00/);
  assert.doesNotMatch(u, /Not traced in this transaction/);
});

test('Ranger: the $400,000 that went to another owner is shown as not identified', () => {
  const r = text(html(`company/${RNGR}/index.html`));
  assert.match(r, /To an account owned by HCRPFN…h87A \S+ · not identified yet Pending verification \$400,000\.00/);
});

test('treasury balances are dated at the scan, not "now"', () => {
  const u = text(html(`company/${UMBRA}/index.html`));
  assert.match(u, /In the treasury at the scan \$989,308\.40/);
  assert.doesNotMatch(u, /In the treasury now/);
  assert.doesNotMatch(text(html('index.html')), /In treasury now/);
});

test('token amounts use the decimals read from the mint', () => {
  const csv = readFileSync(join(FIX, 'raises.csv'), 'utf8');
  const rows = parseRaises(csv).filter((r) => r.decoded);
  assert.ok(rows.every((r) => r.decoded && r.tokenDecimals === 6));
  const lines = csv.split('\n');
  const h = (lines[0] ?? '').split(',');
  const i = h.indexOf('performance_package_tokens'), j = h.indexOf('token_decimals');
  const k = lines.findIndex((l, n) => n > 0 && l.split(',')[j] === '6');
  const cells = (lines[k] ?? '').split(',');
  cells[i] = '1.1234567';
  lines[k] = cells.join(',');
  assert.throws(() => parseRaises(lines.join('\n')), /at most 6 decimals/);
});

test('v0.5 and v0.4.1: "not in the current version of the repository", never "no longer published"', () => {
  for (const p of ['index.html', 'methodology/index.html']) {
    const t = text(html(p));
    assert.doesNotMatch(t, /no longer published|source not published/, p);
  }
  assert.match(text(html('methodology/index.html')), /not in the current version of the repository/);
});
