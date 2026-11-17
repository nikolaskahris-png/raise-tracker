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
  for (const fam of ["'Newsreader'", "'IBM Plex Sans'", "'IBM Plex Mono'"]) assert.ok(css.includes(`font-family:${fam}`), fam);
  assert.ok(existsSync(join(dist, 'fonts', 'LICENSE-Newsreader.txt')) && existsSync(join(dist, 'fonts', 'LICENSE-IBMPlex.txt')));
  assert.doesNotMatch(css, /Inter|JetBrains/, 'the old typefaces are gone');
  for (const u of urls) assert.match(u, /\.woff2$/);
});

test('DECISIONS.md no longer lists Google Fonts as in use', () => {
  const d = readFileSync(join(ROOT, 'DECISIONS.md'), 'utf8');
  assert.match(d, /Google Fonts[^\n]*❌ \*\*removed/);
});

test('no page, stylesheet or font rule asks any host that DECISIONS.md does not list', () => {
  const decisions = readFileSync(join(ROOT, 'DECISIONS.md'), 'utf8');
  const own = new Set(['localhost']);
  for (const f of files(dist).filter((p) => /\.(html|css)$/.test(p))) {
    const text = readFileSync(f, 'utf8');
    // what the browser fetches by itself: stylesheets, scripts, images, fonts, frames (links the reader clicks are not requests)
    const loaded = [...text.matchAll(/<(?:link|script|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"/g)].filter((m) => !/<a\b/.test(m[0])).map((m) => m[1] ?? '');
    const imports = [...text.matchAll(/(?:url\(|@import\s+(?:url\()?['"]?)(https?:\/\/[^)'" ]+)/g)].map((m) => m[1] ?? '');
    for (const u of [...loaded, ...imports]) {
      const host = new URL(u).host;
      assert.ok(own.has(host) || decisions.includes(host), `${f}: loads ${host}, which DECISIONS.md does not list`);
    }
  }
});

test('every font file the stylesheet names is a woff2 on this site, and the page asks for no other file type', () => {
  for (const f of files(dist).filter((p) => p.endsWith('.html'))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)) assert.match(m[1] ?? '', /^(?:\/|\.\.?\/)?[^:]*site\.css$/, `${f}: stylesheet ${m[1]}`);
    assert.doesNotMatch(text, /<script\b[^>]*\bsrc=/, `${f}: a script is loaded from a file`);
  }
});
