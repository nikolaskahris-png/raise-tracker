// What the top bar says about freshness and rebuilding is decided by what actually happened, never assumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', '2026-11-16');
const SCAN = Date.parse('2026-11-16T01:33:40.161Z');

function banner(env: Record<string, string>): string {
  const out = join(mkdtempSync(join(tmpdir(), 'rt-sched-')), 'dist');
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['SITE_TRIGGER', 'SCAN_TRIGGER', 'SITE_NOW'].includes(k)));
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...clean, DATA_DIR: FIX, OUT_DIR: out, BASE_PATH: '/', ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  return /<div class="banner">([\s\S]*?)<main/.exec(html)?.[1] ?? '';
}
const text = (s: string) => s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const at = (hours: number) => new Date(SCAN + hours * 3_600_000).toISOString();

test('"rebuilt automatically" only when a scheduled scan started this build', () => {
  assert.match(text(banner({ SITE_TRIGGER: 'workflow_run', SCAN_TRIGGER: 'schedule', SITE_NOW: at(1) })), /Rebuilt automatically after the scheduled scan\./);
  for (const env of [{ SITE_TRIGGER: 'workflow_run', SCAN_TRIGGER: 'workflow_dispatch' }, { SITE_TRIGGER: 'workflow_dispatch' }, { SITE_TRIGGER: 'push' }, { SITE_TRIGGER: 'schedule' }, {}]) {
    assert.doesNotMatch(text(banner({ ...env, SITE_NOW: at(1) })), /automatically/, JSON.stringify(env));
  }
});

test('data older than 36 hours shows the warning; newer data hides it, and the browser re-checks', () => {
  const fresh = banner({ SITE_NOW: at(35) });
  assert.match(fresh, /<span class="stale"[^>]*hidden>/);
  assert.match(fresh, /<script>/);
  const old = banner({ SITE_NOW: at(37) });
  assert.match(old, /<span class="stale"[^>]*data-hours="36">/);
  assert.doesNotMatch(old, /<span class="stale"[^>]*hidden>/);
  assert.match(text(old), /This data is more than 36 hours old\./);
});

test('the workflows keep a second scan time, one data writer at a time, and only main rebuilds the site', () => {
  const wf = (f: string) => readFileSync(join(here, '..', '..', '.github', 'workflows', f), 'utf8');
  const crons = [...wf('scan.yml').matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(crons.length >= 2, 'scan.yml needs a backup schedule');
  for (const f of ['scan.yml', 'collect.yml']) {
    assert.match(wf(f), /concurrency:\s*\n\s*group: data-writes/, f);
    assert.match(wf(f), /git pull --rebase\s*\n\s*git push/, f);
  }
  const site = wf('site.yml');
  assert.match(site, /workflows: \[scan-raises\]\s*\n\s*types: \[completed\]\s*\n\s*branches: \[main\]/);
  assert.match(site, /schedule:\s*\n\s*- cron:/);
  assert.match(site, /SCAN_TRIGGER: \$\{\{ github\.event\.workflow_run\.event \}\}/);
});

test('the methodology states the times that scan.yml schedules', () => {
  const crons = [...readFileSync(join(here, '..', '..', '.github', 'workflows', 'scan.yml'), 'utf8').matchAll(/- cron: '(\d+) (\d+) \* \* \*'/g)]
    .map((m) => `${String(m[2]).padStart(2, '0')}:${String(m[1]).padStart(2, '0')}`);
  const out = join(mkdtempSync(join(tmpdir(), 'rt-sched-m-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: FIX, OUT_DIR: out, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const m = text(readFileSync(join(out, 'methodology', 'index.html'), 'utf8'));
  for (const c of crons) assert.ok(m.includes(c), `methodology does not state ${c}`);
});
