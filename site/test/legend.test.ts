// Item 2: two different marks. "Declared onchain" (written onchain by whoever controls it: token names from metadata)
// is not "declared offchain" (a source outside the chain: a quoted article).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, read, visible, MINT } from './helpers.ts';

const dist = build();

test('the legend, on the Methodology page, explains both marks, and no longer calls onchain names "not onchain"', () => {
  const home = read(dist, 'methodology/index.html');
  assert.match(home, /<span class="mk mk-o"[^>]*><\/span>Declared onchain: written onchain by whoever controls it/);
  assert.match(home, /<span class="mk mk-d"[^>]*><\/span>Declared offchain: stated outside the chain/);
  assert.doesNotMatch(visible(home), /Declared: stated by someone, not onchain/);
});

test('a name from metadata carries the onchain mark; a quoted article the offchain mark', () => {
  const umbra = read(dist, `company/${MINT.UMBRA}/index.html`);
  assert.match(umbra, /class="badge b-od"[^>]*><span class="mk mk-o"[^>]*><\/span>Declared onchain/);
  // the name's own badge never uses the offchain mark
  const h1Block = /<h1[\s\S]*?<\/h1>\s*(<a class="badge[^"]*"[^>]*>[\s\S]*?<\/a>)/.exec(umbra)?.[1] ?? '';
  assert.match(h1Block, /mk-o/);
  assert.doesNotMatch(h1Block, /class="mk mk-d"/);
  const ranger = read(dist, `company/${MINT.RNGR}/index.html`);
  assert.match(ranger, /<span class="mk mk-o"/);
  assert.match(ranger, /<span class="badge b-d"><span class="mk mk-d"[^>]*><\/span>Declared offchain<\/span>/);
});

test('the methodology names both marks', () => {
  const m = visible(read(dist, 'methodology/index.html'));
  assert.match(m, /Declared onchain/);
  assert.match(m, /Declared offchain/);
});

test('the onchain-name badge fits a phone: short text, and it may wrap', () => {
  const umbra = read(dist, `company/${MINT.UMBRA}/index.html`);
  assert.match(umbra, /<span class="mk mk-o"[^>]*><\/span>Declared onchain · token metadata ↗<\/a>/);
  assert.match(read(dist, 'site.css'), /\.b-od\{[^}]*white-space:normal/);
});
