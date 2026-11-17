// Names: every name comes from the token's onchain metadata; press is quoted only to add a project name,
// verbatim, with its dates, and must name the token's onchain symbol. Nothing from a source is paraphrased into a claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { parseNames } from '../src/schema.ts';
import { unsourcedDigits } from '../src/check-html.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', '2026-11-16');
const REG = join(here, 'fixtures', 'registry');
const RNGR = 'RNGRtJMbCveqCp7AC6U95KmrdKecFckaJZiWbPGmeta';
const ZKFG = 'ZKFHiLAfAFMTcDAuCtjNW54VzpERvoe7PBF9mYgmeta';
const PAYS = 'PAYZP1W3UmdEsNLJwmH61TNqACYJTvhXy8SCN4Tmeta';

let built: string | null = null;
function build(): string {
  if (built) return built;
  const out = join(mkdtempSync(join(tmpdir(), 'rt-names-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: FIX, REGISTRY_DIR: join(here, 'fixtures', 'registry'), OUT_DIR: out, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  built = out;
  return out;
}
const pageOf = (mint: string) => readFileSync(join(build(), 'company', mint, 'index.html'), 'utf8');
const h1 = (html: string) => (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();

test('every company has a name from its onchain metadata', () => {
  const site = buildSite(readInputs(FIX, REG));
  for (const c of site.companies) assert.equal(c.name.kind, 'onchain', c.raise.mint);
});

test('Ranger: onchain name, press project name with a verbatim quote, no figure taken from the press', () => {
  const html = pageOf(RNGR);
  assert.equal(h1(html), 'Ranger Finance (RNGR)');
  assert.match(html, /<q data-quote[^>]*>In March 2026, \$RNGR token holders voted to liquidate Ranger Finance’s treasury via MetaDAO’s futarchy-based governance system\.<\/q>/);
  assert.doesNotMatch(html, /5,047,250/);
  assert.doesNotMatch(html, /Press reports/);
});

test('ZKFG keeps its onchain name; the Solana Compass article is only a link to read, never quoted', () => {
  const html = pageOf(ZKFG);
  assert.equal(h1(html), 'ZKFG');
  assert.doesNotMatch(html, /Zinc/);
  assert.doesNotMatch(html, /<q data-quote/);
  assert.match(html, /Further reading: <a href="https:\/\/solanacompass\.com\/news\/metadaos-futarchy-just-executed-its-first-onchain-take-private-as-zkfg-008-passes" rel="noopener">an article by Solana Compass<\/a>, published <time[^>]*>20 Jun 2026<\/time>\. It is not used for the name or any figure\./);
});

test('a reading entry in names.json can never change a name', () => {
  const site = buildSite(readInputs(FIX, REG));
  const z = site.companies.find((c) => c.raise.mint === ZKFG);
  assert.equal(z?.displayName, 'ZKFG');
  assert.equal(z?.name.kind === 'onchain' ? z.name.press : 'x', null);
});

test('Paystream comes from the chain, not from personal notes', () => {
  const html = pageOf(PAYS);
  assert.equal(h1(html), 'Paystream');
  assert.doesNotMatch(html, /defi-kai/);
  assert.match(html, /onchain metadata/);
});

test('no page claims a press confirmation', () => {
  const pages = ['index.html', 'methodology/index.html', `company/${RNGR}/index.html`, `company/${ZKFG}/index.html`];
  for (const p of pages) assert.doesNotMatch(readFileSync(join(build(), p), 'utf8'), /confirmed by press/i, p);
});

test('names.json entries need a verbatim quote, publisher and both dates', () => {
  const ok = { project: 'X', quote: 'q', source: 'https://example.com/a', publisher: 'P', published: '2026-01-02', read: '2026-11-16' };
  assert.equal(parseNames(JSON.stringify({ [RNGR]: ok })).size, 1);
  for (const k of ['quote', 'publisher', 'published', 'read'] as const) {
    const bad: Record<string, string> = { ...ok };
    delete bad[k];
    assert.throws(() => parseNames(JSON.stringify({ [RNGR]: bad })), /names\.json/, k);
  }
  assert.throws(() => parseNames(JSON.stringify({ [RNGR]: { ...ok, published: '15 May' } })), /names\.json/);
});

test('a press quote that does not name the token’s onchain symbol is refused by the gate', () => {
  const reg = mkdtempSync(join(tmpdir(), 'rt-reg-'));
  cpSync(REG, reg, { recursive: true });
  const p = join(reg, 'names.json');
  const j = JSON.parse(readFileSync(p, 'utf8')) as Record<string, Record<string, string>>;
  const e = j[RNGR];
  assert.ok(e);
  e['quote'] = 'Ranger Finance wound down.';
  writeFileSync(p, JSON.stringify(j));
  assert.ok(checkInvariants(buildSite(readInputs(FIX, reg))).some((f) => f.includes('does not name the onchain symbol')));
});

test('digits inside a quote pass only when the quote is in names.json', () => {
  const quotes = new Set(['In 2026 the vote passed.']);
  const page = (q: string) => `<html><body><main><p><q data-quote cite="https://example.com">${q}</q></p></main></body></html>`;
  assert.deepEqual(unsourcedDigits(page('In 2026 the vote passed.'), quotes), []);
  assert.equal(unsourcedDigits(page('5,047,250 USDC returned on 5 Mar 2026.'), quotes).length, 1);
});

test('the build output exists', () => { assert.ok(existsSync(join(build(), 'index.html'))); });
