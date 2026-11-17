// Build: read data → check every invariant → render pages → write dist/. Any failure exits non-zero and nothing is written.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSite, readInputs } from './model.ts';
import { checkInvariants } from './invariants.ts';
import { CSS, type Ctx } from './layout.ts';
import { homePage } from './pages/home.ts';
import { companyPage, movementsCsv } from './pages/company.ts';
import { methodologyPage, notFoundPage } from './pages/methodology.ts';
import { checkHtmlDir } from './check-html.ts';
import { allLists, resetLists } from './lists.ts';
import { listPage } from './pages/list.ts';
import { CONSTANT_TEXT } from './constants.ts';
import { identifiersOf } from './model.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dataDir = process.env['DATA_DIR'] ?? join(root, 'data');
const registryDir = process.env['REGISTRY_DIR'] ?? join(root, 'registry');
const out = resolve(process.env['OUT_DIR'] ?? join(here, '..', 'dist'));

// The commit the data was read from: the checked-out HEAD (in a workflow_run, GITHUB_SHA is the scan's commit, before its data commit).
function commitOf(): string | null {
  try { return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { return process.env['GITHUB_SHA'] ?? null; }
}

const site = buildSite(readInputs(dataDir, registryDir));
const failures = checkInvariants(site);
if (failures.length) {
  console.error(`Publication gate: ${failures.length} check(s) failed. Nothing was built.`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const ctx: Ctx = {
  base: process.env['BASE_PATH'] ?? '/raise-tracker/',
  scanAt: site.inputs.scanReport.at,
  scanSlot: site.inputs.scanReport.slot,
  builtAt: process.env['SITE_NOW'] ? new Date(process.env['SITE_NOW']) : new Date(),
  siteTrigger: process.env['SITE_TRIGGER'] || null,
  scanTrigger: process.env['SCAN_TRIGGER'] || null,
  commit: commitOf(),
  repo: process.env['GITHUB_REPOSITORY'] ?? 'nikolaskahris-png/raise-tracker',
};

resetLists(ctx.base);
rmSync(out, { recursive: true, force: true });
const write = (rel: string, content: string) => {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
// Typefaces are served by the site itself (assets/fonts, SIL Open Font License): no request goes to Google.
const FONTS = join(here, '..', 'assets', 'fonts');
for (const f of readdirSync(FONTS)) if (f !== 'fonts.css') copyFileSync(join(FONTS, f), (mkdirSync(join(out, 'fonts'), { recursive: true }), join(out, 'fonts', f)));
write('site.css', readFileSync(join(FONTS, 'fonts.css'), 'utf8') + CSS);
write('index.html', homePage(ctx, site));
write('404.html', notFoundPage(ctx));
for (const c of site.companies) {
  write(`company/${c.raise.mint}/index.html`, companyPage(ctx, site, c));
  if (c.treasury) write(`company/${c.raise.mint}/movements.csv`, movementsCsv(c.treasury));
}
mkdirSync(join(out, 'data'), { recursive: true });
for (const f of ['raises.csv', 'treasury.csv', 'treasury-flows.csv', 'commits-monthly.csv', 'scan-report.md', 'treasury-report.md']) copyFileSync(join(dataDir, f), join(out, 'data', f));
write('methodology/index.html', methodologyPage(ctx, site)); // last: lists every formula the other pages used
// One page per Σ figure. Writing a list page can register no new list (its totals open itself), but loop to be sure.
const written = new Set<string>();
for (let pending = allLists(); pending.length; pending = allLists().filter((e) => !written.has(e.id))) {
  for (const e of pending) {
    const p = listPage(ctx, site, e);
    write(`lists/${e.id}/index.html`, p.html);
    write(`lists/${e.id}/list.csv`, p.csv);
    written.add(e.id);
  }
}
writeFileSync(join(out, '.nojekyll'), '');

const htmlProblems = checkHtmlDir(out, site.companies.map((c) => c.raise.mint), {
  quotes: new Set([...site.inputs.names.values()].map((n) => n.quote)),
  identifiers: identifiersOf(site),
  constants: CONSTANT_TEXT,
});
if (htmlProblems.length) {
  console.error(`Built pages failed ${htmlProblems.length} check(s):`);
  for (const p of htmlProblems.slice(0, 50)) console.error(`  - ${p}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
console.log(`Built ${site.companies.length} company pages, home, methodology and 404 into ${out}. All checks passed.`);
