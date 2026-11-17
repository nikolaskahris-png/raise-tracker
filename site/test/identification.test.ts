// Item 6: which authority is MetaDAO's permissionless platform is our identification from the chain, not a fact
// declared onchain. Every place that names it says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, read, visible, MINT } from './helpers.ts';

const dist = build();

test('the All raises page presents the permissionless authority as our identification', () => {
  const home = visible(read(dist, 'raises/index.html'));
  assert.doesNotMatch(home, /The authority of MetaDAO's permissionless platform/);
  assert.match(home, /Our identification from the chain: the authority of MetaDAO's permissionless platform \(Futardio, now Backable\)\. It is not declared onchain\./);
  assert.match(home, /LRrTQL…tARt Permissionless \(our identification\)/);
});

test('company pages mark it too', () => {
  const futardio = read(dist, 'company/Cbjr1Nvcay3QWDriyRKtokJ7V4PMknesGxeK8z7Zmeta/index.html');
  assert.match(futardio, /<span class="badge b-n" title="[^"]*">Permissionless \(our identification\)<\/span>/);
  assert.doesNotMatch(read(dist, `company/${MINT.UMBRA}/index.html`), /our identification/);
});
