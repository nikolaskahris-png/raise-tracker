// Item 1: titles promise only what is measured: the USDC of the treasuries, not every dollar raised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { build, read, visible, MINT } from './helpers.ts';

const dist = build();

test('no page claims to follow every dollar; titles say treasury dollars', () => {
  const home = read(dist, 'index.html'), umbra = read(dist, `company/${MINT.UMBRA}/index.html`);
  for (const [name, html] of [['home', home], ['umbra', umbra]] as const) {
    assert.doesNotMatch(html, /every dollar(?! of)/i, `${name} still says "every dollar"`);
  }
  assert.match(visible(home), /What teams raised on MetaDAO, what they have left, and what their public code shows/);
  assert.match(visible(read(dist, 'raises/index.html')), /Where the treasuries' USDC went/);
  assert.match(visible(umbra), /Where the treasury's USDC went/);
  assert.doesNotMatch(visible(umbra), /every treasury dollar/);
  assert.equal(/<title>([^<]*)<\/title>/.exec(home)?.[1], 'raise-tracker: what teams raised on MetaDAO, what they have left, and what their public code shows');
});

test('"every dollar", "every treasury dollar" and "every transaction" appear nowhere in the built site: not in a page, a title, a description or a list', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(html|csv|css|md)$/.test(n) ? [p] : []; });
  const files = walk(dist);
  assert.ok(files.length > 100, `only ${files.length} files built`);
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /every\s+(treasury\s+dollar|dollar|transaction)/i, f);
});

test('the home-page badge names the publisher taken from registry/names.json, not a hand-written source', () => {
  const home = read(dist, 'index.html');
  assert.match(home, /<span class="badge">Name from SolanaFloor<\/span>/);
  assert.doesNotMatch(home, /<span class="badge">Project name quoted/);
});
