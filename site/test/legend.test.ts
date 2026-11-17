// Item 2: two different marks. "Declared onchain" (written onchain by whoever controls it: token names from metadata)
// is not "declared offchain" (a source outside the chain: a quoted article).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, read, MINT } from './helpers.ts';

const dist = build();

test('the Methodology says what the two kinds of declaration are, in words, and no page draws a mark beside a figure', () => {
  const m = read(dist, 'methodology/index.html').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  assert.match(m, /Declared onchain: written onchain, so anyone can read it, but chosen by whoever controls it/);
  assert.match(m, /Declared offchain: stated outside the chain/);
  assert.doesNotMatch(m, /Declared: stated by someone, not onchain/);
});

test('a name from metadata says "Declared onchain"; a quoted article says "Declared offchain"; neither has a mark', () => {
  const umbra = read(dist, `company/${MINT.UMBRA}/index.html`);
  assert.match(umbra, /class="badge b-od"[^>]*>Declared onchain · token metadata ↗<\/a>/);
  const h1Block = /<h1[\s\S]*?<\/h1>\s*(<a class="badge[^"]*"[^>]*>[\s\S]*?<\/a>)/.exec(umbra)?.[1] ?? '';
  assert.doesNotMatch(h1Block, /Declared offchain/);
  const ranger = read(dist, `company/${MINT.RNGR}/index.html`);
  assert.match(ranger, /<span class="badge b-d">Declared offchain<\/span>/);
  for (const html of [umbra, ranger, read(dist, 'index.html')]) assert.doesNotMatch(html, /class="mk /);
});

test('badges are plain text: no fill, no border, no rounded corners', () => {
  const css = read(dist, 'site.css');
  const badge = /\.badge\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(badge.length > 0);
  assert.doesNotMatch(badge, /background|border|radius|padding/);
});
