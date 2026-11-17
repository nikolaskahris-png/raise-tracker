// Item 1: titles promise only what is measured: the USDC of the treasuries, not every dollar raised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, read, visible, MINT } from './helpers.ts';

const dist = build();

test('no page claims to follow every dollar; titles say treasury dollars', () => {
  const home = read(dist, 'index.html'), umbra = read(dist, `company/${MINT.UMBRA}/index.html`);
  for (const [name, html] of [['home', home], ['umbra', umbra]] as const) {
    assert.doesNotMatch(html, /every dollar(?! of)/i, `${name} still says "every dollar"`);
  }
  assert.match(visible(home), /What teams raised on MetaDAO, what they have left, and what their public code shows/);
  assert.match(visible(read(dist, 'raises/index.html')), /Where every treasury dollar went/);
  assert.match(visible(umbra), /Where every treasury dollar went/);
  assert.match(/<title>([^<]*)<\/title>/.exec(home)?.[1] ?? '', /every treasury dollar/);
});
