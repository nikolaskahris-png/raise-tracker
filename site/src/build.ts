// Build: read data → check every invariant → render pages → write dist/. Any failure exits non-zero and nothing is written.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dataDir = process.env['DATA_DIR'] ?? join(root, 'data');
const out = resolve(process.env['OUT_DIR'] ?? join(here, '..', 'dist'));

// The commit the data was read from: the checked-out HEAD (in a workflow_run, GITHUB_SHA is the scan's commit, before its data commit).
function commitOf(): string | null {
  try { return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(); } catch { return process.env['GITHUB_SHA'] ?? null; }
}

const site = buildSite(readInputs(dataDir, join(root, 'registry')));
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
  commit: commitOf(),
  repo: process.env['GITHUB_REPOSITORY'] ?? 'nikolaskahris-png/raise-tracker',
};

rmSync(out, { recursive: true, force: true });
const write = (rel: string, content: string) => {
  const p = join(out, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
write('site.css', CSS);
write('index.html', homePage(ctx, site));
write('methodology/index.html', methodologyPage(ctx, site));
write('404.html', notFoundPage(ctx));
for (const c of site.companies) {
  write(`company/${c.raise.mint}/index.html`, companyPage(ctx, site, c));
  if (c.treasury) write(`company/${c.raise.mint}/movements.csv`, movementsCsv(c.treasury));
}
mkdirSync(join(out, 'data'), { recursive: true });
for (const f of ['raises.csv', 'treasury.csv', 'treasury-flows.csv', 'scan-report.md', 'treasury-report.md']) copyFileSync(join(dataDir, f), join(out, 'data', f));
writeFileSync(join(out, '.nojekyll'), '');

const htmlProblems = checkHtmlDir(out, site.companies.map((c) => c.raise.mint), new Set([...site.inputs.names.values()].map((n) => n.quote)));
if (htmlProblems.length) {
  console.error(`Built pages failed ${htmlProblems.length} check(s):`);
  for (const p of htmlProblems.slice(0, 50)) console.error(`  - ${p}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
console.log(`Built ${site.companies.length} company pages, home, methodology and 404 into ${out}. All checks passed.`);
