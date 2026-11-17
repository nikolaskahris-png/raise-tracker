// The new home page (erevna/09): the companies table first; Public code in four values; On record tags; the five check
// numbers on the Methodology page; the same publication gate and the same fig() rule as every other page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, read, visible, FIX, REG, MINT } from './helpers.ts';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { parseProjects, SchemaError } from '../src/schema.ts';
import { unsourcedDigits } from '../src/check-html.ts';
import { CONSTANT_TEXT } from '../src/constants.ts';

const here = dirname(fileURLToPath(import.meta.url));
void here;
const dist = build();
const home = read(dist, 'index.html');
const T = {
  LOYAL: 'LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta', // public commits, recent
  AVICI: 'BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta', // repo found, last commit long ago
  ORDR: 'FgVcn25UXf4MoNf4coaz2o5xDGPK1goMbUBfyUgrmeta', // the team's filing says private
  RAWR: '4K1m7gAMDKzrxQn68yuZAd767w57Fw7Ykw69dG3umeta', // the filing says open source, no repo
  SUPER: '5TbDn1dFEcUTJp69Fxnu5wbwNec6LmoK42Sr5mmNmeta', // searched, nothing found
  ...MINT,
} as const;
const PAYS = 'PAYZP1W3UmdEsNLJwmH61TNqACYJTvhXy8SCN4Tmeta';
const FUTARDIO = 'Cbjr1Nvcay3QWDriyRKtokJ7V4PMknesGxeK8z7Zmeta';

/** The <tr> of one company in the home table, as visible text. */
function rowText(html: string, mint: string): string {
  const tr = new RegExp(`<tr data-track="[^"]*" data-search="[^"]*">(?:(?!</tr>)[\\s\\S])*?company/${mint}/[\\s\\S]*?</tr>`).exec(html)?.[0];
  assert.ok(tr, `no row for ${mint}`);
  return tr.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([:,)])/g, '$1').replace(/\( /g, '(').trim();
}

test('1. the first <h2> of the home page is the companies table, and no other heading comes before the table', () => {
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(home)?.[1] ?? '';
  const h2 = main.indexOf('<h2'), table = main.indexOf('id="cotbl"');
  assert.ok(h2 >= 0 && table > h2, 'the table must follow the first <h2>');
  assert.match(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(main)?.[1] ?? '', /^Companies$/);
  assert.ok(main.indexOf('<h2', h2 + 3) > table, 'a second <h2> comes before the end of the table');
  assert.equal((main.slice(0, table).match(/<h2/g) ?? []).length, 1);
  assert.match(visible(home), /^ Every team that raised on MetaDAO: what they raised, what is left, and what their public code shows\. Every number links to the chain\./);
});

test('1b. the sections that follow, in order: the legend line, How the raises went, Where the money went, Still being verified', () => {
  const at = (s: string) => { const i = home.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = [at('id="cotbl"'), at('class="legend1"'), at('How the raises went'), at('Where every treasury dollar went'), at('Still being verified')];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(visible(home), /Every number opens its source\. On company pages: Σ = a total \(click for the list\) · [^·]*= read from one transaction or account · = = calculated \(click for the formula\) · [^.]*= amount is onchain, purpose not identified yet\./);
  assert.match(visible(home), /No public commits does not mean no work: some teams keep their code private\./);
});

test('2. every number in the table comes through fig(): the page passes the post-build check, and a hand-typed number in a row does not', () => {
  const allowed = { constants: CONSTANT_TEXT, identifiers: new Set<string>() };
  const rows = /<tbody>([\s\S]*?)<\/tbody>/.exec(home)?.[1] ?? '';
  assert.ok(rows.length > 1000);
  const wrap = (x: string) => `<html><body><main>${x}</main></body></html>`;
  assert.equal(unsourcedDigits(wrap(rows.replace(/<td class="co"[\s\S]*?<\/td>/g, '')), allowed).length, 0, 'a number in a table cell is outside fig()');
  assert.ok(unsourcedDigits(wrap(rows.replace('Treasury empty', 'Treasury empty 12')), allowed).length > 0);
  assert.ok(unsourcedDigits(wrap(rows.replace(/<a class="fig[^>]*>\$989,308\.40[\s\S]*?<\/a>/, '$989,308.40')), allowed).length > 0 || !rows.includes('$989,308.40'));
});

test('3. Public code, value 1: Active, with the days since the last commit and a chart', () => {
  const t = rowText(home, T.LOYAL);
  assert.match(t, /Active · last commit 0 = days ago/);
  assert.match(/<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?company\/LYLik[\s\S]*?<\/tr>/.exec(home)?.[0] ?? '', /<svg class="spark"/);
});

test('3. Public code, value 1b: a repository with no commit in 90 days says so, and shows no chart', () => {
  const html = /<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?company\/BANKJ[\s\S]*?<\/tr>/.exec(home)?.[0] ?? '';
  assert.match(rowText(home, T.AVICI), /No public commits in 90 days/);
  assert.doesNotMatch(html, /<svg class="spark"/);
});

test('3. Public code, value 2: Private, as the team states, with the link to the filing', () => {
  assert.match(rowText(home, T.ORDR), /Private, as the team states filing/);
  assert.match(home, /Private, as the team states<\/b> <a href="https:\/\/blockworks\.com\/token-transparency\/filing\/ordr-trade" rel="noopener">filing<\/a>/);
});

test('3. Public code, value 3: the team states open source; no repository found, with the link to the filing', () => {
  assert.match(rowText(home, T.RAWR), /Team states open source; no repository found filing/);
  assert.match(home, /no repository found<\/b> <a href="https:\/\/blockworks\.com\/token-transparency\/filing\/jurassic-finance"/);
});

test('3. Public code, value 4: No public repository found; a company nobody has searched is "Not checked yet", never "not found"', () => {
  assert.match(rowText(home, T.SUPER), /No public repository found/);
  assert.match(rowText(home, T.ZKFG), /Not checked yet/);
  assert.doesNotMatch(rowText(home, T.ZKFG), /No public repository found/);
});

test('3. On record: Admin-key transfer with its amount and count, linked to the company page', () => {
  const t = rowText(home, T.UMBRA);
  assert.match(t, /Admin-key transfer: \$250,000 Σ \(1 Σ\)/);
  assert.match(home, new RegExp(`<a href="/company/${T.UMBRA}/#decisions">Admin-key transfer</a>`));
});

test('3. On record: Spending limit removed (ZKFG, PAYS), changed (Umbra, Laso, LFOWN, Futardio), and never both', () => {
  for (const m of [T.ZKFG, PAYS]) { const t = rowText(home, m); assert.match(t, /Spending limit removed/); assert.doesNotMatch(t, /Spending limit changed/); }
  for (const m of [T.UMBRA, T.LASO, 'LFOWNLQXgfC8thhRC5xSj58YzuUhXQ2mtZ1CqP8mmeta', FUTARDIO]) {
    if (!home.includes(`company/${m}/`)) continue;
    const t = rowText(home, m); assert.match(t, /Spending limit changed/); assert.doesNotMatch(t, /Spending limit removed/);
  }
  assert.equal((home.match(/Spending limit removed<\/a>/g) ?? []).length, 2);
  assert.ok((home.match(/Spending limit changed<\/a>/g) ?? []).length >= 3);
});

test('3. On record: at launch, money went to accounts not identified (Ranger $400,000), linked to the launch transaction', () => {
  assert.match(rowText(home, T.RNGR), /At launch, \$400,000 went to accounts not identified/);
  assert.match(home, new RegExp(`<a href="/company/${T.RNGR}/#launch">At launch</a>`));
});

test('3. On record: Unclassified movement (Futardio), and a company with nothing to record has an empty cell', () => {
  assert.match(rowText(home, FUTARDIO), /Unclassified movement: \$2,976 Σ/);
  const cells = [...home.matchAll(/<td class="rec"><span class="ml">On record<\/span>([\s\S]*?)<\/td>/g)].map((m) => m[1] ?? '');
  assert.ok(cells.some((c) => c === ''), 'some company has no tag');
  assert.ok(cells.some((c) => c.includes('class="tag')));
  assert.equal(new Set(['admin', 'removed', 'changed', 'launch', 'unclassified'].filter((k) => home.includes(`tag tag-${k}`))).size, 5);
});

test('limit column: the limit, and months at the limit rounded down; removed limit and empty treasury are said in words', () => {
  assert.match(rowText(home, T.UMBRA), /\$150,000 [^ ]* ?≈ 6 = months at this limit/);
  const z = rowText(home, T.ZKFG);
  assert.match(z, /No limit \(removed\)/);
  assert.match(z, /Treasury empty/);
  assert.match(rowText(home, T.RNGR), /Treasury empty/);
});

test('the table starts sorted by Raised, largest first, every column can be sorted, and the three filters exist', () => {
  const raised = [...home.matchAll(/<td class="r m1" data-v="(\d+)"/g)].map((m) => BigInt(m[1] ?? '0'));
  assert.equal(raised.length, 33);
  assert.deepEqual(raised, [...raised].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));
  assert.equal((home.match(/class="sortbtn"/g) ?? []).length, 5);
  assert.match(home, /<input type="radio" name="trk" id="t-all" checked>/);
  for (const l of ['All', 'Other authorities', 'Permissionless']) assert.match(home, new RegExp(`<label for="t-[a-z]+">${l}</label>`));
  assert.ok((home.match(/data-track="curated"/g) ?? []).length > 5 && (home.match(/data-track="permissionless"/g) ?? []).length > 5);
});

test('the five check numbers moved to the top of the Methodology page and are gone from the home page', () => {
  const m = visible(read(dist, 'methodology/index.html'));
  for (const s of ['Raises decoded from the chain', 'Treasury movements, each linked', 'Treasuries read and reconciled', 'The checks behind the figures']) {
    assert.match(m, new RegExp(s)); assert.doesNotMatch(visible(home), new RegExp(s));
  }
  assert.match(m, /31 Σ of 33 Σ read; all 31 Σ add up to the cent/);
  assert.match(m, /Declared onchain: written onchain by whoever controls it/);
  assert.ok(m.indexOf('Raises decoded from the chain') < m.indexOf('Declared offchain'));
});

test('the Methodology says how public commits are counted', () => {
  const m = visible(read(dist, 'methodology/index.html'));
  assert.match(m, /default branch/);
  assert.match(m, /forks are left out/i);
  assert.match(m, /No public commits does not mean no work/);
});

test('the commits file is published beside the other data', () => {
  assert.match(readFileSync(join(dist, 'data', 'commits-monthly.csv'), 'utf8'), /^ticker,base_mint,repo,month,commits,last_commit,read_at\n/);
});

// ---- the gate ----------------------------------------------------------------------------------------

function variant(edit: (reg: string, data: string) => void): string[] {
  const root = mkdtempSync(join(tmpdir(), 'rt-home-'));
  const reg = join(root, 'registry'), data = join(root, 'data');
  cpSync(REG, reg, { recursive: true });
  cpSync(FIX, data, { recursive: true });
  edit(reg, data);
  return checkInvariants(buildSite(readInputs(data, reg)));
}

test('gate: a repository in the registry with no commits in commits-monthly.csv stops the build', () => {
  const fails = variant((_r, data) => {
    const p = join(data, 'commits-monthly.csv');
    writeFileSync(p, readFileSync(p, 'utf8').split('\n').filter((l, i) => i === 0 || !l.startsWith('LOYAL,')).join('\n'));
  });
  assert.ok(fails.some((f) => /registry lists a repository but commits-monthly\.csv has none/.test(f)), fails.join('\n'));
});

test('gate: commits for a project the registry does not list with a repository stop the build', () => {
  const fails = variant((reg) => {
    const p = join(reg, 'projects.json');
    const j = JSON.parse(readFileSync(p, 'utf8')) as { projects: { ticker: string; status: string; github: string[]; source: unknown }[] };
    const a = j.projects.find((x) => x.ticker === 'LOYAL');
    assert.ok(a);
    a.status = 'not_found'; a.github = []; a.source = null;
    writeFileSync(p, JSON.stringify(j));
  });
  assert.ok(fails.some((f) => /not a project with a repository/.test(f)), fails.join('\n'));
});

test('registry schema: an unknown status, a repo without an owner, and a declaration without its filing are refused', () => {
  const p = (o: object) => JSON.stringify({ projects: [{ name: 'X', ticker: 'X', base_mint: 'RNGRtJMbCveqCp7AC6U95KmrdKecFckaJZiWbPGmeta', github: [], status: 'not_found', source: null, ...o }] });
  assert.equal(parseProjects(p({}))[0]?.status, 'not_found');
  assert.throws(() => parseProjects(p({ status: 'δεν βρέθηκε' })), SchemaError);
  assert.throws(() => parseProjects(p({ status: 'found' })), /found without a GitHub owner/);
  assert.throws(() => parseProjects(p({ status: 'private_declared', source: { kind: 'github-api', page: 'https://github.com/x' } })), /needs a filing/);
  assert.throws(() => parseProjects(p({ github: ['x'] })), /lists a GitHub owner/);
});
