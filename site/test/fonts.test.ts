// Item 12: the typefaces are served by the site itself, so no visitor's IP address goes to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { build, read, ROOT } from './helpers.ts';

const dist = build();
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });

test('no page or stylesheet loads anything from Google', () => {
  for (const f of files(dist).filter((p) => /\.(html|css)$/.test(p))) assert.doesNotMatch(readFileSync(f, 'utf8'), /googleapis|gstatic/, f);
});

test('every @font-face points at a font file the site publishes, with its licence', () => {
  const css = read(dist, 'site.css');
  const urls = [...css.matchAll(/@font-face\{[^}]*src:url\(([^)]+)\)/g)].map((m) => m[1] ?? '');
  assert.ok(urls.length >= 12, `only ${urls.length} @font-face rules`);
  for (const u of urls) assert.ok(existsSync(join(dist, u)), `missing ${u}`);
  for (const fam of ["'Inter'", "'Inter Tight'", "'JetBrains Mono'"]) assert.ok(css.includes(`font-family:${fam}`), fam);
  assert.ok(existsSync(join(dist, 'fonts', 'LICENSE-Inter.txt')) && existsSync(join(dist, 'fonts', 'LICENSE-JetBrainsMono.txt')));
});

test('DECISIONS.md no longer lists Google Fonts as in use', () => {
  const d = readFileSync(join(ROOT, 'DECISIONS.md'), 'utf8');
  assert.match(d, /Google Fonts[^\n]*❌ \*\*removed/);
});
