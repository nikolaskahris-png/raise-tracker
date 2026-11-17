// Shipped work: releases since the raise and how many people committed, as numbers only, on each company's page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, read, FIX, REG, MINT } from './helpers.ts';
import { buildSite, readInputs, shippedOf } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { parseShipped, SchemaError } from '../src/schema.ts';

const dist = build();
const LOYAL = 'LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta';
const HIVEBITS = 'CMFmrTNfNEYNnauug1mi2LMkghaVT3Sx6CxJ8xLcmeta';
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const squash = (html: string): string => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([:,;).])/g, '$1').trim();
const section = (mint: string): string => /<section id="public-code"[\s\S]*?<\/section>/.exec(read(dist, `company/${mint}/index.html`))?.[0] ?? '';
const HEADER = 'ticker,base_mint,repo,releases_since_raise,prereleases_since_raise,latest_release_tag,latest_release_date,latest_release_url,contributors_since_raise,contributors_project_since_raise,read_at';
const UMBRA_MINT = MINT.UMBRA;

test('a company with repositories: releases since the raise with the latest one (tag, date, link), pre-releases apart, and the people count', () => {
  const s = squash(section(LOYAL));
  assert.match(s, /Public code What the public repositories show Active · last commit/);
  assert.match(s, /Releases since the raise 13 latest: ext-v0\.5\.13 · 22 Oct 2026 · [^ ]+/);
  assert.match(s, /Pre-releases since the raise 0/);
  assert.match(s, /People who committed since the raise 9 different people on the default branch, bots left out; no names are kept/);
  assert.match(section(LOYAL), /<a class="chip" href="https:\/\/github\.com\/loyal-labs\/[^"]+\/releases\/tag\/ext-v0\.5\.13" rel="noopener">ext-v0\.5\.13<\/a>/);
});

test('every number is a link to the GitHub page it comes from, and a total over several repositories says so', () => {
  const sec = section(LOYAL);
  const figs = [...sec.matchAll(/<a class="fig"[^>]*data-figure="(\w+)"[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  assert.ok(figs.length >= 20, `only ${figs.length} figures`);
  for (const [, kind, href, , text] of figs) {
    assert.equal(kind === 'formula' || kind === 'sum', true);
    if (/^\d+$/.test(text ?? '')) assert.match(href ?? '', /^https:\/\/github\.com\/loyal-labs(\/[\w.-]+\/(releases|commits))?$/, `${text}: ${href}`);
  }
  assert.match(sec, /title="Computed: published releases since the raise, pre-releases and drafts not counted; the total of the per-repository counts in the table below"/);
  assert.match(sec, /one person in several repositories counts once/);
  assert.match(squash(sec), /By repository Repository Releases Pre-releases People who committed Latest release/);
});

test('a company with a single repository links straight to its repository pages', () => {
  const root = mkdtempSync(join(tmpdir(), 'rt-single-'));
  const data = join(root, 'data');
  cpSync(FIX, data, { recursive: true });
  const AVICI = 'BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta';
  const NL = String.fromCharCode(10);
  const repos = [...new Set(readFileSync(join(data, 'shipped.csv'), 'utf8').split(NL).filter((l) => l.startsWith('AVICI,')).map((l) => l.split(',')[2] ?? ''))];
  assert.equal(repos.length, 2);
  const keep = repos[0] ?? '';
  for (const f of ['shipped.csv', 'commits-monthly.csv']) {
    const p = join(data, f);
    writeFileSync(p, readFileSync(p, 'utf8').split(NL).filter((l) => !l.startsWith('AVICI,') || l.split(',')[2] === keep).join(NL));
  }
  const out = build(data);
  const sec = /<section id="public-code"[\s\S]*?<\/section>/.exec(read(out, `company/${AVICI}/index.html`))?.[0] ?? '';
  assert.ok(sec.includes(`href="https://github.com/${keep}/releases"`), sec.slice(0, 600));
  assert.ok(sec.includes(`href="https://github.com/${keep}/commits"`));
  assert.doesNotMatch(sec, /By repository/);
  assert.match(squash(sec), /Releases since the raise 0 no release published since the raise/);
});

test('a team without a repository shows what the table shows, and no zero', () => {
  const sec = section(HIVEBITS);
  const s = squash(sec);
  assert.match(s, /^Public code What the public repositories show No public repo found$/);
  assert.doesNotMatch(sec, /Releases since the raise|People who committed|data-figure/);
  assert.match(squash(read(dist, `company/${MINT.ZKFG}/index.html`)), /No public repo found/);
});

test('a team that says its code is private, or open without a repo, shows only that, with its filing', () => {
  for (const [mint, words] of [['FgVcn25UXf4MoNf4coaz2o5xDGPK1goMbUBfyUgrmeta', /Private, as the team states · filing/], ['4K1m7gAMDKzrxQn68yuZAd767w57Fw7Ykw69dG3umeta', /Says open source; no repo found · filing/]] as const) {
    const s = squash(section(mint));
    assert.match(s, words);
    assert.doesNotMatch(s, /Releases since the raise|People who committed/);
  }
});

test('the home page gets no new column and no number from these counts', () => {
  const home = read(dist, 'index.html');
  assert.equal((home.match(/class="sortbtn"/g) ?? []).length, 5);
  assert.doesNotMatch(home, /Releases since the raise|People who committed|Pre-releases|Contributors/i);
  assert.match(home, /<th scope="col">On record<\/th>/);
});

test('neutral wording: no verdict is drawn from these numbers', () => {
  const m = squash(read(dist, 'methodology/index.html'));
  assert.match(m, /Publishing releases is optional/);
  assert.match(m, /zero releases does not mean that nothing was shipped/);
  assert.match(m, /Only the counts are stored[\s\S]*?no account name and no email is kept/);
  assert.match(m, /make no judgement about a team/);
  assert.match(m, /Accounts whose name ends in \[bot\] are left out/);
  assert.match(m, /not the sum of the per-repository numbers/);
  for (const f of [section(LOYAL), section(UMBRA_MINT)]) {
    assert.doesNotMatch(squash(f), /\b(inactive|dead|abandoned|good|bad|healthy|stalled|slow|fast|only \d)\b/i);
    assert.doesNotMatch(squash(f), /Active · last commit[^.]*(inactive)/i);
  }
});

test('no username and no email in shipped.csv, in the other published data, or in any built page', () => {
  const site = buildSite(readInputs(FIX, REG));
  assert.ok(site.inputs.shipped.length > 10);
  for (const f of files(dist).filter((p) => /data[\\/](shipped|commits-monthly)\.csv$/.test(p))) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /@/, f);
    assert.doesNotMatch(text, /\b[\w.+-]+@[\w-]+\.[\w.-]+/, f);
  }
  const html = files(dist).filter((p) => p.endsWith('.html')).map((p) => readFileSync(p, 'utf8')).join('\n');
  assert.doesNotMatch(html, /mailto:|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i);
  // owners are the organisations of the registry; a release URL is its repository's page. Nothing else from GitHub is on a page.
  const orgs = new Set(site.inputs.projects.flatMap((p) => p.github.map((g) => g.toLowerCase())));
  for (const m of html.matchAll(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)/g)) {
    const owner = (m[1] ?? '').toLowerCase();
    assert.ok(orgs.has(owner) || ['metadaoproject', 'squads-protocol', 'nikolaskahris-png'].includes(owner), `a page links github.com/${owner}, which is not an organisation of the registry`);
  }
});

test('the schema refuses an @ anywhere, a half-given release, a release page of another repository, and a repo given twice', () => {
  const line = (o: Record<string, string> = {}) => {
    const base: Record<string, string> = { ticker: 'T', base_mint: MINT.UMBRA, repo: 'acme/app', releases_since_raise: '1', prereleases_since_raise: '0', latest_release_tag: 'v1.0.0', latest_release_date: '2026-10-01', latest_release_url: 'https://github.com/acme/app/releases/tag/v1.0.0', contributors_since_raise: '2', contributors_project_since_raise: '2', read_at: '2026-11-16', ...o };
    return HEADER.split(',').map((h) => base[h]).join(',');
  };
  const file = (...rows: string[]) => `${HEADER}\n${rows.join('\n')}\n`;
  assert.equal(parseShipped(file(line()))[0]?.contributors, 2);
  assert.throws(() => parseShipped(file(line({ latest_release_tag: 'alice@example.org' }))), /@/);
  assert.throws(() => parseShipped(file(line({ ticker: 'bob@x' }))), /numbers only/);
  assert.throws(() => parseShipped(file(line({ latest_release_date: '', latest_release_url: '' }))), /all given or all empty/);
  assert.throws(() => parseShipped(file(line({ latest_release_url: 'https://github.com/other/app/releases/tag/v1.0.0' }))), /not a release page of acme\/app/);
  assert.throws(() => parseShipped(file(line(), line())), /appears twice/);
  assert.throws(() => parseShipped(file(line({ releases_since_raise: '-1' }))), SchemaError);
  assert.equal(parseShipped(file(line({ latest_release_tag: '', latest_release_date: '', latest_release_url: '' })))[0]?.latestTag, null);
});

test('shippedOf: the project count is the file\'s own number (a person in two repositories is one), totals are sums, latest is the newest date', () => {
  const rows = parseShipped(`${HEADER}\n` + [
    `T,${MINT.UMBRA},acme/b,2,1,v1.1.0,2026-10-05,https://github.com/acme/b/releases/tag/v1.1.0,1,3,2026-11-16`,
    `T,${MINT.UMBRA},acme/a,1,0,v2.0.0,2026-11-01,https://github.com/acme/a/releases/tag/v2.0.0,3,3,2026-11-16`,
    `T,${MINT.UMBRA},acme/c,0,0,,,,0,3,2026-11-16`,
  ].join('\n') + '\n');
  const s = shippedOf(MINT.UMBRA, rows);
  assert.deepEqual([s?.releases, s?.prereleases, s?.people, s?.latest?.repo, s?.repos.map((r) => r.repo)], [3, 1, 3, 'acme/a', ['acme/a', 'acme/b', 'acme/c']]);
  assert.equal(shippedOf('nothing', rows), null);
});

// ---- the gate ----------------------------------------------------------------------------------------

function variant(edit: (data: string) => void): string[] {
  const root = mkdtempSync(join(tmpdir(), 'rt-shipped-'));
  const data = join(root, 'data');
  cpSync(FIX, data, { recursive: true });
  edit(data);
  return checkInvariants(buildSite(readInputs(data, REG)));
}
const rewrite = (data: string, keep: (line: string) => boolean) => {
  const p = join(data, 'shipped.csv');
  writeFileSync(p, readFileSync(p, 'utf8').split('\n').filter((l, i) => i === 0 || keep(l)).join('\n'));
};

test('gate: a repository with no row in shipped.csv stops the build (a missing read is never shown as zero)', () => {
  const fails = variant((d) => rewrite(d, (l) => !l.startsWith('LOYAL,')));
  assert.ok(fails.some((f) => /has a repository but shipped\.csv has no row for it/.test(f)), fails.join('\n'));
});

test('gate: one repository missing from shipped.csv, or one only there, stops the build', () => {
  let dropped = false;
  const fails = variant((d) => rewrite(d, (l) => { if (!dropped && l.startsWith('LOYAL,')) { dropped = true; return false; } return true; }));
  assert.ok(fails.some((f) => /is in commits-monthly\.csv but not in shipped\.csv/.test(f)), fails.join('\n'));
  const extra = variant((d) => {
    const p = join(d, 'shipped.csv');
    writeFileSync(p, readFileSync(p, 'utf8').trimEnd() + `\nLOYAL,${LOYAL},loyal-labs/ghost-repo,0,0,,,,0,9,2026-11-16\n`);
  });
  assert.ok(extra.some((f) => /ghost-repo is in shipped\.csv but not in commits-monthly\.csv/.test(f)), extra.join('\n'));
});

test('gate: shipped.csv for a project the registry does not list with a repository stops the build', () => {
  const fails = variant((d) => {
    const p = join(d, 'shipped.csv');
    writeFileSync(p, readFileSync(p, 'utf8').trimEnd() + `\nHB,${HIVEBITS},someone/else,1,0,v1.0.0,2026-10-01,https://github.com/someone/else/releases/tag/v1.0.0,1,1,2026-11-16\n`);
  });
  assert.ok(fails.some((f) => /shipped\.csv: .* is not a project with a repository/.test(f)), fails.join('\n'));
});

test('the data files are valid UTF-8 without a BOM', () => {
  for (const f of ['shipped.csv', 'commits-monthly.csv']) {
    const raw = readFileSync(join(FIX, f));
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
    assert.notEqual(raw.subarray(0, 3).toString('hex'), 'efbbbf', f);
    const real = readFileSync(join(FIX, '..', '..', '..', '..', 'data', f));
    new TextDecoder('utf-8', { fatal: true }).decode(real);
  }
});

test('the published data folder holds shipped.csv', () => {
  assert.match(readFileSync(join(dist, 'data', 'shipped.csv'), 'utf8'), /^ticker,base_mint,repo,releases_since_raise,/);
});
