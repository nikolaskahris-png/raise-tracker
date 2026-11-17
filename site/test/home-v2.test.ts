// The home page (erevna/09 and the mockup in erevna/10): the companies table first (one line per company on a phone);
// Public code in its values; On record lines; rounded amounts with the exact one in the title; durations in words;
// the same publication gate and the same fig() rule as every other page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, read, visible, FIX, REG, MINT } from './helpers.ts';
import { buildSite, readInputs } from '../src/model.ts';
import { checkInvariants } from '../src/invariants.ts';
import { parseProjects, SchemaError } from '../src/schema.ts';
import { unsourcedDigits } from '../src/check-html.ts';
import { CONSTANT_TEXT } from '../src/constants.ts';
import { fmtCompact, pctWhole, parseMicro } from '../src/money.ts';
import { runway } from '../src/pages/home.ts';

const dist = build();
const home = read(dist, 'index.html');
const T = {
  LOYAL: 'LYLikzBQtpa9ZgVrJsqYGQpR3cC1WMJrBHaXGrQmeta', // public commits, recent
  AVICI: 'BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta', // repo found, last commit long ago
  ORDR: 'FgVcn25UXf4MoNf4coaz2o5xDGPK1goMbUBfyUgrmeta', // the team's filing says private
  RAWR: '4K1m7gAMDKzrxQn68yuZAd767w57Fw7Ykw69dG3umeta', // the filing says open source, no repo
  SUPER: '5TbDn1dFEcUTJp69Fxnu5wbwNec6LmoK42Sr5mmNmeta', // searched, nothing found
  CARS: 'CARSsxWPkpQWvfyRBwfGMGvysJBHdHGfE46X5MNgmeta', // balance above the raise
  ...MINT,
} as const;
const PAYS = 'PAYZP1W3UmdEsNLJwmH61TNqACYJTvhXy8SCN4Tmeta';
const FUTARDIO = 'Cbjr1Nvcay3QWDriyRKtokJ7V4PMknesGxeK8z7Zmeta';
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const squash = (html: string): string => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([:,;).])/g, '$1').replace(/&lt;/g, '<').trim();

/** The table row of one company, as text. */
function rowHtml(html: string, mint: string): string {
  const tr = new RegExp(`<tr data-track="[^"]*" data-search="[^"]*">(?:(?!</tr>)[\\s\\S])*?company/${mint}/[\\s\\S]*?</tr>`).exec(html)?.[0];
  assert.ok(tr, `no row for ${mint}`);
  return tr;
}
const rowText = (mint: string): string => squash(rowHtml(home, mint));
/** The phone's <details> of one company. */
function detailsHtml(mint: string): string {
  const d = new RegExp(`<details data-track="[^"]*" data-search="[^"]*">(?:(?!</details>)[\\s\\S])*?company/${mint}/[\\s\\S]*?</details>`).exec(home)?.[0];
  assert.ok(d, `no <details> for ${mint}`);
  return d;
}

test('1. the first <h2> of the home page is the companies table, and nothing but the title and one sentence comes before it', () => {
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(home)?.[1] ?? '';
  const h2 = main.indexOf('<h2'), table = main.indexOf('id="cotbl"');
  assert.ok(h2 >= 0 && table > h2, 'the table must follow the first <h2>');
  assert.match(/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(main)?.[1] ?? '', /^Companies$/);
  assert.equal((main.slice(0, table).match(/<h2/g) ?? []).length, 1);
  assert.equal((main.slice(0, table).match(/<h1/g) ?? []).length, 1);
  assert.match(squash(/<h1[\s\S]*?<\/h1>/.exec(main)?.[0] ?? ''), /^What teams raised on MetaDAO, what they have left, and what their public code shows$/);
});

test('7. the sentence under the title is computed from the data: raises, total raised, total left', () => {
  const site = buildSite(readInputs(FIX, REG));
  const raised = site.companies.reduce((a, c) => a + (c.raise.raised ?? 0n), 0n);
  const left = site.companies.reduce((a, c) => a + (c.treasury?.net ?? 0n), 0n);
  const read = site.companies.filter((c) => c.treasury).length;
  const s = squash(/<div class="hero">[\s\S]*?<\/div>/.exec(home)?.[0] ?? '');
  assert.match(s, new RegExp(`${site.companies.length} raises through MetaDAO's launchpad\\. Together they raised ${fmtCompact(raised).replace('$', '\\$').replace('.', '\\.')}; ${fmtCompact(left).replace('$', '\\$').replace('.', '\\.')} is still in the ${read} treasuries we could read\\. ${site.companies.length - read} could not be read in the latest scan\\.`));
});

test('A3. the grey line says when the data was updated and where it was read; slot and commit are on the Methodology page only', () => {
  const banner = squash(/<div class="banner">([\s\S]*?)<main/.exec(home)?.[1] ?? '');
  assert.match(banner, /^Updated 16 Nov 2026, 01:33 UTC · read directly from Solana · every figure links to its source/);
  assert.doesNotMatch(banner, /slot|data [0-9a-f]{7}/i);
  const m = squash(read(dist, 'methodology/index.html'));
  assert.match(m, /This build Every page shows the data of the scan of 16 Nov 2026, 01:33 UTC, which started at slot 469,948,591\./);
});

test('2. every number in the table comes through fig(): the page passes the post-build check, and a hand-typed number in a row does not', () => {
  const allowed = { constants: CONSTANT_TEXT, identifiers: new Set<string>() };
  const rows = /<tbody>([\s\S]*?)<\/tbody>/.exec(home)?.[1] ?? '';
  assert.ok(rows.length > 1000);
  const wrap = (x: string) => `<html><body><main>${x}</main></body></html>`;
  const noNames = rows.replace(/<td class="co"[\s\S]*?<\/td>/g, '');
  assert.equal(unsourcedDigits(wrap(noNames), allowed).length, 0, 'a number in a table cell is outside fig()');
  assert.ok(unsourcedDigits(wrap(noNames.replace('treasury empty', 'treasury empty 12')), allowed).length > 0);
  assert.ok(unsourcedDigits(wrap(noNames.replace(/<a class="fig"[^>]*>\$989K<\/a>/, '$989K')), allowed).length > 0);
});

test('A5. amounts are rounded in the table, and the exact amount is in the figure\'s title', () => {
  const t = rowText(T.UMBRA);
  assert.match(t, /\$3\.0M/);
  assert.match(t, /\$989K 33%/);
  assert.match(t, /\$150K \/ month/);
  assert.match(rowHtml(home, T.UMBRA), /title="Exact: \$989,308\.40\. Verified onchain: opens the account it is read from"/);
  assert.match(rowHtml(home, T.UMBRA), /title="Exact: \$3,000,000\.00\./);
});

test('A5. fmtCompact rounds exactly: $3.0M, $989K, $9.6K, $50, and never shows a thousand thousands', () => {
  const f = (s: string) => fmtCompact(parseMicro(s));
  assert.equal(f('3000000'), '$3.0M');
  assert.equal(f('989308.40'), '$989K');
  assert.equal(f('9600'), '$9.6K');
  assert.equal(f('50'), '$50');
  assert.equal(f('0'), '$0');
  assert.equal(f('10000'), '$10K');
  assert.equal(f('9999'), '$10K');
  assert.equal(f('1000'), '$1.0K');
  assert.equal(f('999.60'), '$1.0K');
  assert.equal(f('999499.99'), '$999K');
  assert.equal(f('999500'), '$1.0M');
  assert.equal(f('5047249.68'), '$5.0M');
  assert.equal(f('2976'), '$3.0K');
  assert.equal(f('-1500000'), '−$1.5M');
});

test('9. how long the balance lasts: whole months, "under 1 month", "over 5 years", "treasury empty", "no limit"', () => {
  const ctx = { base: '/' } as Parameters<typeof runway>[0];
  const t = (net: string, limit: string | null, removed = false) => ({ net: parseMicro(net), row: { spendingLimitNow: limit === null ? null : parseMicro(limit), limitChanges: removed ? [{ action: 'removed' }] : [] } }) as unknown as Parameters<typeof runway>[1];
  const words = (x: string) => x.replace(/<[^>]+>/g, '');
  assert.equal(words(runway(ctx, t('989308.40', '150000'))), '≈ 6 months');
  assert.equal(words(runway(ctx, t('100000.05', '100000'))), '≈ 1 month');
  assert.equal(words(runway(ctx, t('2', '5000'))), 'under 1 month');
  assert.equal(words(runway(ctx, t('149999.99', '150000'))), 'under 1 month');
  assert.equal(words(runway(ctx, t('300000', '5000'))), '≈ 60 months');
  assert.equal(words(runway(ctx, t('305000', '5000'))), 'over 5 years');
  assert.equal(words(runway(ctx, t('17074', '50'))), 'over 5 years');
  assert.equal(runway(ctx, t('0', '5000')), 'treasury empty');
  assert.equal(runway(ctx, t('0', null, true)), 'treasury empty');
  assert.equal(runway(ctx, t('5000', null, true)), 'no limit');
  assert.equal(runway(ctx, t('5000', null)), 'no limit');
  assert.match(runway(ctx, t('2', '5000')), /^<a class="fig" data-figure="formula"/);
});

test('9. on the page: Superclaw under 1 month, Futardio over 5 years, Ranger treasury empty, Umbra 6 months', () => {
  assert.match(rowText(T.SUPER), /under 1 month/);
  assert.match(rowText(FUTARDIO), /over 5 years/);
  assert.match(rowText(T.RNGR), /treasury empty/);
  assert.match(rowText(T.ZKFG), /treasury empty/);
  assert.match(rowText(T.UMBRA), /≈ 6 months/);
});

test('10. a balance above the raise says "more than raised" and fills the bar; otherwise a whole percentage and a bar of that width', () => {
  assert.match(rowText(T.CARS), /\$685K more than raised/);
  assert.match(rowHtml(home, T.CARS), /<div class="lbar"><i style="width:100%"><\/i><\/div>/);
  assert.doesNotMatch(rowText(T.CARS), /274%/);
  assert.match(rowHtml(home, T.UMBRA), /<i style="width:32%"><\/i>/); // 33% shown, bar cut at the whole percent below
  assert.match(rowText(T.UMBRA), /\$989K 33%/);
  assert.match(rowText(T.SUPER), /\$2 <1%|\$2 0%|\$2 <1%/);
  assert.equal(pctWhole(parseMicro('2'), parseMicro('50000')), '<1%');
  assert.equal(pctWhole(0n, parseMicro('50000')), '0%');
  assert.equal(pctWhole(parseMicro('989308.40'), parseMicro('3000000')), '33%');
});

test('B8. Public code, value 1: Active, with the days since the last commit, and bars', () => {
  assert.match(rowText(T.LOYAL), /Active · last commit (today|yesterday)/);
  assert.match(rowHtml(home, T.LOYAL), /<svg class="spark"/);
  assert.match(rowText(T.UMBRA), /Active · last commit 25 days ago/);
});

test('B8. Public code, value 2: a repository with no commit in 90 days says so (and keeps its bars)', () => {
  assert.match(rowText(T.AVICI), /No public commits in 90 days/);
  assert.match(rowHtml(home, T.AVICI), /<svg class="spark"/);
});

test('B8. Public code, value 3: Private, as the team states, with the link to the filing', () => {
  assert.match(rowText(T.ORDR), /Private, as the team states · filing/);
  assert.match(home, /Private, as the team states · <a href="https:\/\/blockworks\.com\/token-transparency\/filing\/ordr-trade" rel="noopener">filing<\/a>/);
});

test('B8. Public code, value 4: Says open source; no repo found, with the link to the filing', () => {
  assert.match(rowText(T.RAWR), /Says open source; no repo found · filing/);
  assert.match(home, /no repo found · <a href="https:\/\/blockworks\.com\/token-transparency\/filing\/jurassic-finance"/);
});

test('B8. Public code, value 5: No public repo found (we looked); a company nobody has searched is "Not checked yet", never "not found"', () => {
  assert.match(rowText(T.SUPER), /No public repo found/);
  assert.match(rowText(T.ZKFG), /No public repo found/);
  const reg = mkdtempSync(join(tmpdir(), 'rt-unchecked-'));
  cpSync(REG, reg, { recursive: true });
  const p = join(reg, 'projects.json');
  const j = JSON.parse(readFileSync(p, 'utf8')) as { projects: { ticker: string }[] };
  j.projects = j.projects.filter((x) => x.ticker !== 'ZKFG');
  writeFileSync(p, JSON.stringify(j));
  const other = read(build(FIX, { REGISTRY_DIR: reg }), 'index.html');
  const row = squash(rowHtml(other, T.ZKFG));
  assert.match(row, /Not checked yet/);
  assert.doesNotMatch(row, /No public repo found/);
});

test('B8. On record: Admin-key transfer(s) with its rounded amount, linked to the company page', () => {
  assert.match(rowText(T.UMBRA), /Admin-key transfer \$250K/);
  assert.match(rowText(FUTARDIO), /Admin-key transfers \$2\.6K/);
  assert.match(rowText(PAYS), /Admin-key transfers \$205K/);
  assert.match(home, new RegExp(`<a href="/company/${T.UMBRA}/#decisions">Admin-key transfer</a>`));
});

test('B8. On record: Spending limit removed (ZKFG, PAYS), changed (Umbra, Laso, LFOWN, Futardio), and never both', () => {
  for (const m of [T.ZKFG, PAYS]) { const t = rowText(m); assert.match(t, /Spending limit removed/); assert.doesNotMatch(t, /Spending limit changed/); }
  for (const m of [T.UMBRA, T.LASO, FUTARDIO]) { const t = rowText(m); assert.match(t, /Spending limit changed/); assert.doesNotMatch(t, /Spending limit removed/); }
});

test('B8. On record: money that went to accounts not identified at launch (Ranger $400K), and an unclassified movement (Futardio $3.0K)', () => {
  assert.match(rowText(T.RNGR), /\$400K at launch to unidentified accounts/);
  assert.match(home, new RegExp(`<a href="/company/${T.RNGR}/#launch">at launch</a>`));
  assert.match(rowText(FUTARDIO), /Unclassified movement \$3\.0K/);
  const cells = [...home.matchAll(/<td class="rec">([\s\S]*?)<\/td>/g)].map((m) => m[1] ?? '');
  assert.ok(cells.some((c) => c === ''), 'a company with nothing to record has an empty cell');
});

test('B8/A1. the table starts sorted by Raised, largest first; five sortable columns; no other-authority or identification label in any row', () => {
  const raised = [...home.matchAll(/<td class="r num" data-v="(\d+)"/g)].map((m) => BigInt(m[1] ?? '0'));
  assert.equal(raised.length, 33);
  assert.deepEqual(raised, [...raised].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));
  assert.equal((home.match(/class="sortbtn"/g) ?? []).length, 5);
  for (const h of ['Company', 'Raised', 'Left in treasury', 'Team can spend', 'Public code', 'On record']) assert.match(home, new RegExp(`>${h}(</button>)?</th>`));
  const rows = /<tbody>([\s\S]*?)<\/tbody>/.exec(home)?.[1] ?? '';
  assert.doesNotMatch(squash(rows), /Other authority|our identification/);
});

test('B11. the filters: All N, Permissionless, Not permissionless', () => {
  assert.match(home, /<input type="radio" name="trk" id="t-all" checked>/);
  assert.match(squash(/<div class="tabbar"[\s\S]*?<\/div>/.exec(home)?.[0] ?? ''), /^All 33 Permissionless Not permissionless$/);
  assert.match(read(dist, 'site.css'), /#t-perm:checked~\.panels \[data-track=curated\],#t-not:checked~\.panels \[data-track=permissionless\]\{display:none\}/);
  assert.ok((home.match(/data-track="curated"/g) ?? []).length >= 2 * 5 && (home.match(/data-track="permissionless"/g) ?? []).length >= 2 * 5);
});

test('B12. two notes under the table: no public repo does not mean no work; the four names not in the table, with their link', () => {
  const notes = squash(/<div class="notes2">[\s\S]*?<\/div>/.exec(home)?.[0] ?? '');
  assert.match(notes, /Public code\. “No public repo found” does not mean no work: some teams keep their code private\./);
  assert.match(notes, /Not in this table: MetaDAO, Omnipair, Sanctum and Flash\.Trade\./);
  assert.match(home, /<a href="\/methodology\/#not-in-table">How we check →<\/a>/);
  const m = read(dist, 'methodology/index.html');
  assert.match(m, /<h2 id="not-in-table">/);
  assert.match(squash(/<h2 id="not-in-table">[\s\S]*?<\/p>/.exec(m)?.[0] ?? ''), /MetaDAO, Omnipair, Sanctum and Flash\.Trade[^.]*no launch account/);
  assert.match(m, /<h2 id="public-code">/);
});

test('B13. on a phone: one <details> per company, name and code status on the left, raised and left on the right; the rest opens below; no JavaScript', () => {
  const colist = /<div class="colist" id="colist">[\s\S]*?<\/details><\/div>/.exec(home)?.[0] ?? '';
  assert.equal((colist.match(/<details /g) ?? []).length, 33);
  assert.doesNotMatch(colist, /<script/);
  const d = detailsHtml(T.UMBRA);
  const summary = squash(/<summary>[\s\S]*?<\/summary>/.exec(d)?.[0] ?? '');
  assert.match(summary, /^Umbra Active · last commit 25 days ago \$3\.0M \$989K left$/);
  const more = squash(/<div class="more">[\s\S]*?<\/details>/.exec(d)?.[0] ?? '');
  assert.match(more, /Team can spend \$150K \/ month ≈ 6 months/);
  assert.match(more, /Public code Active · last commit 25 days ago/);
  assert.match(more, /On record Admin-key transfer \$250K Spending limit changed/);
  assert.match(d, /<a class="open" href="\/company\/PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta\/">Open <span data-label[^>]*>Umbra<\/span>’s page →<\/a>/);
  assert.match(d, /<svg class="spark"/);
});

test('B13. the phone layout: the table is hidden, the list shows, tap targets are at least 44px, nothing is wider than the screen', () => {
  const css = read(dist, 'site.css');
  const mobile = /@media \(max-width:720px\)\{([\s\S]*?)\n\}\n/.exec(css)?.[1] ?? '';
  assert.match(mobile, /\.cotbl-d\{display:none\}/);
  assert.match(mobile, /\.colist\{display:block/);
  assert.match(mobile, /\.colist summary\{[^}]*min-height:44px/);
  assert.match(mobile, /\.colist \.open\{[^}]*min-height:44px/);
  assert.match(mobile, /\.topnav a\{[^}]*min-height:44px/);
  assert.match(css, /\.colist\{display:none\}/);
  // "Open Umbra’s page": no gap between the name and the apostrophe, in the markup or from the layout
  assert.match(css, /\.colist \.open\{display:inline-block;/);
  assert.doesNotMatch(/\.colist \.open\{([^}]*)\}/.exec(css)?.[1] ?? '', /gap|flex/);
  for (const m of home.matchAll(/<a class="open"[^>]*>(.*?)<\/a>/g)) assert.match(m[1] ?? '', /^Open <span data-label[^>]*>[^<]*<\/span>’s page →$/);
  assert.match(css, /\.tabbar label\{[^}]*min-height:44px/);
});

test('A1/A2. the style: white page, black text, one blue; no shadows, no rounded corners over 2px, no gray page; the three typefaces', () => {
  const css = read(dist, 'site.css');
  assert.match(css, /body\{[^}]*background:#fff;color:#111;font-family:'IBM Plex Sans'/);
  assert.match(css, /h1,h2,h3\{font-family:Newsreader/);
  assert.match(css, /\.mono\{font-family:'IBM Plex Mono'/);
  assert.doesNotMatch(css, /box-shadow/);
  assert.doesNotMatch(css, /border-radius:(?!0|2px)/);
  assert.doesNotMatch(css, /F6F7F9|FBFBFC|#EEF1FF|(?<![0-9])999px/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
  for (const f of files(dist).filter((p) => p.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    assert.doesNotMatch(html, /border-radius|box-shadow|Inter Tight/, f);
    assert.doesNotMatch(html, /class="mk[ "]/, `${f}: a mark beside a figure`);
    assert.doesNotMatch(html, /<span class="banner-lead"|class="srcbtn"/, f);
  }
});

test('A4. a figure is a link with a dotted underline whose title says the kind of source; no glyph is drawn beside it', () => {
  const css = read(dist, 'site.css');
  assert.match(css, /\.fig\{[^}]*border-bottom:1px dotted/);
  const figs = [...home.matchAll(/<a class="fig"[^>]*data-figure="(\w+)"[^>]*title="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  assert.ok(figs.length > 200);
  for (const [, kind, title, text] of figs) {
    assert.match(title ?? '', kind === 'sum' ? /Opens the list/ : kind === 'formula' ? /Computed/ : /Verified onchain|Declared by/, `${kind}: ${title}`);
    assert.doesNotMatch(text ?? '', /[✓Σ=🕒]/, `a mark in the figure text: ${text}`);
  }
});

test('the raises page keeps what the home page used to hold: how the raises went, where the money went, what is still being verified', () => {
  const raises = read(dist, 'raises/index.html');
  const h = visible(raises);
  assert.match(h, /Where the treasuries' USDC went/);
  assert.match(h, /Still being verified/);
  assert.match(h, /Every launch authority, with its raises/);
  assert.match(raises, /<a href="\/raises\/" class="nav on" aria-current="page">All raises<\/a>/);
});

test('the Methodology page carries the five check numbers and says how the table is read', () => {
  const m = visible(read(dist, 'methodology/index.html'));
  for (const s of ['Raises decoded from the chain', 'Treasury movements, each linked', 'Treasuries read and reconciled', 'The checks behind the figures']) {
    assert.match(m, new RegExp(s)); assert.doesNotMatch(visible(home), new RegExp(s));
  }
  assert.match(m, /31 of 33 read; all 31 add up to the cent/);
  assert.match(m, /How to read the companies table/);
  assert.match(m, /Permissionless is our identification, not something declared onchain/);
  assert.match(m, /default branch/);
  assert.match(m, /forks are left out/i);
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
