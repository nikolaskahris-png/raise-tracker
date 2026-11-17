// Raise outcomes by launch authority: no implied curation, every rate with its 95% Wilson interval and n,
// and a title that only states what the intervals support.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSite, readInputs } from '../src/model.ts';
import { wilson, pct1, Z95 } from '../src/stats.ts';
import { byAuthority, outcomes, trackHeadline, trackOutcomes } from '../src/tracks.ts';
import type { Raise } from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', '2026-11-16');
const REG = join(here, 'fixtures', 'registry');
const site = buildSite(readInputs(FIX, REG));

let out: string | null = null;
function built(): string {
  if (out) return out;
  const o = join(mkdtempSync(join(tmpdir(), 'rt-tracks-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: FIX, REGISTRY_DIR: join(here, 'fixtures', 'registry'), OUT_DIR: o, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return (out = o);
}
const visible = (html: string) => (/<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** The Wilson interval is the set of p with |k/n - p| <= z*sqrt(p(1-p)/n). Found here by bisection, independently of stats.ts. */
function bisect(k: number, n: number): [number, number] {
  const inside = (p: number) => Math.abs(k / n - p) <= Z95 * Math.sqrt((p * (1 - p)) / n);
  const edge = (lo: number, hi: number) => { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (inside(m)) hi = m; else lo = m; } return (lo + hi) / 2; };
  const p = k / n;
  const low = k === 0 ? 0 : edge(0, p);
  let hi = 1;
  if (k !== n) { let a = p, b = 1; for (let i = 0; i < 200; i++) { const m = (a + b) / 2; if (inside(m)) a = m; else b = m; } hi = (a + b) / 2; }
  return [low, hi];
}

test('the Wilson interval agrees with an independent bisection', () => {
  for (const [k, n] of [[14, 17], [19, 120], [0, 5], [5, 5], [8, 10], [1, 1]] as const) {
    const w = wilson(k, n), [lo, hi] = bisect(k, n);
    assert.ok(Math.abs(w.low - lo) < 1e-9 && Math.abs(w.high - hi) < 1e-9, `${k}/${n}`);
  }
  assert.equal(`${pct1(wilson(14, 17).low)} to ${pct1(wilson(14, 17).high)}`, '59.0% to 93.8%');
  assert.equal(`${pct1(wilson(19, 120).low)} to ${pct1(wilson(19, 120).high)}`, '10.4% to 23.4%');
  assert.throws(() => wilson(3, 2));
});

test('the frozen data: other authorities 14 of 17, permissionless 19 of 120', () => {
  const o = trackOutcomes(site, 'curated'), p = trackOutcomes(site, 'permissionless');
  assert.deepEqual([o.complete.length, o.finished, p.complete.length, p.finished], [14, 17, 19, 120]);
});

test('the title names a direction only when the intervals do not overlap, and never a multiple', () => {
  const mk = (c: number, f: number) => outcomes([...Array(c).fill({ state: 'Complete', raised: 1n }), ...Array(f).fill({ state: 'Refunding', raised: null })] as Raise[]);
  assert.equal(trackHeadline(mk(14, 3), mk(19, 101)), 'Raises from other launch authorities completed more often than permissionless ones.');
  assert.equal(trackHeadline(mk(3, 2), mk(4, 4)), 'How often raises completed, by launch authority.'); // 60% vs 50%: intervals overlap
  assert.equal(trackHeadline(mk(1, 9), mk(18, 2)), 'Permissionless raises completed more often than raises from other launch authorities.');
  for (const t of [trackHeadline(mk(14, 3), mk(19, 101)), trackHeadline(mk(3, 2), mk(4, 4))]) assert.doesNotMatch(t, /times|curated/i);
});

test('one row per launch authority, adding up to the group totals', () => {
  const rows = byAuthority(site);
  assert.equal(rows.filter((r) => r.track === 'permissionless').length, 1);
  for (const t of ['curated', 'permissionless'] as const) {
    const g = trackOutcomes(site, t);
    const rs = rows.filter((r) => r.track === t);
    assert.equal(rs.reduce((a, r) => a + r.o.raises.length, 0), g.raises.length, t);
    assert.equal(rs.reduce((a, r) => a + r.o.complete.length, 0), g.complete.length, t);
    assert.equal(rs.reduce((a, r) => a + r.o.refunded.length, 0), g.refunded.length, t);
  }
  assert.equal(new Set(rows.map((r) => r.authority)).size, rows.length);
});

test('the home page shows each rate with its interval and n, and never says curated or a multiple', () => {
  const home = visible(readFileSync(join(built(), 'index.html'), 'utf8'));
  // each figure is followed by its mark (= computed, Σ sum) as a separate word
  assert.match(home, /82\.4% = 95% interval 59\.0% = to 93\.8% = · n = 17 Σ finished raises/);
  assert.match(home, /15\.8% = 95% interval 10\.4% = to 23\.4% = · n = 120 Σ finished raises/);
  assert.match(home, /Raises from other launch authorities completed more often than permissionless ones\./);
  assert.match(home, /Every launch authority, with its raises/);
  assert.doesNotMatch(home, /curated/i);
  assert.doesNotMatch(home, /times as often/);
});

test('no company page calls a raise curated', () => {
  for (const c of site.companies) {
    const html = visible(readFileSync(join(built(), 'company', c.raise.mint, 'index.html'), 'utf8'));
    assert.doesNotMatch(html, /curated/i, c.displayName);
  }
});
