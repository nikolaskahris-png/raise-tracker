// Shared by the tests: build the frozen data once per test file and read pages as visible text.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
export const FIX = join(here, 'fixtures', '2026-11-16');
export const REG = join(here, '..', '..', 'registry');
export const ROOT = join(here, '..', '..');
export const MINT = { UMBRA: 'PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta', RNGR: 'RNGRtJMbCveqCp7AC6U95KmrdKecFckaJZiWbPGmeta', ZKFG: 'ZKFHiLAfAFMTcDAuCtjNW54VzpERvoe7PBF9mYgmeta', LASO: 'LASocYgQAo8GfypSjedNQgLft8y8DVGg1kSqR3smeta' } as const;

/** Builds `dataDir` (default: the frozen fixture) into a fresh directory and returns it. */
export function build(dataDir = FIX, env: Record<string, string> = {}): string {
  const out = join(mkdtempSync(join(tmpdir(), 'rt-build-')), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: dataDir, OUT_DIR: out, BASE_PATH: '/', ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return out;
}
export const read = (dist: string, rel: string): string => readFileSync(join(dist, rel), 'utf8');
/** The visible text of <main> (scripts and svg removed, tags as spaces). */
export const visible = (html: string): string => (/<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1] ?? '')
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
