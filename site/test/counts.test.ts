// Item 5: the permissionless authority started 128 raises; 4 were test launches, so counts and rates use 124.
// Every page says it the same way, with the same three numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, read, visible } from './helpers.ts';

const dist = build();
// visible() turns tags into spaces, so a space may sit before the comma that follows the constant
const SENTENCE = /started 128 raises; 4 of them were test launches with a minimum under \$10,000 ?, so the counts and rates here use 124/;

test('home explains 128 - 4 = 124 for the permissionless authority, and the same for other authorities', () => {
  const home = visible(read(dist, 'raises/index.html'));
  assert.match(home, SENTENCE);
  assert.match(home, /started 86 raises; 63 of them were test launches with a minimum under \$10,000 ?, so the counts and rates here use 23/);
});

test('the methodology says it in the same words', () => {
  assert.match(visible(read(dist, 'methodology/index.html')), SENTENCE);
});

test('the authority table shows test launches next to the raises it counts', () => {
  const home = read(dist, 'raises/index.html');
  assert.match(home, /<th scope="col" class="r">Raises counted<\/th><th scope="col" class="r">Test launches<\/th>/);
  const row = /LRrTQL…tARt[\s\S]*?<\/tr>/.exec(home)?.[0] ?? '';
  assert.match(visible(`<main>${row}</main>`), /124 4/);
});
