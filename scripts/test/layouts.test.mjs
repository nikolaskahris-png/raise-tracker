// decode.mjs reads every launchpad version's Launch account in exactly the field order of the published layout,
// recorded (names and line numbers only) in scripts/layouts/launch.json at a fixed commit of metaDAOproject/programs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeLaunch } from '../decode.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '..', 'layouts', 'launch.json'), 'utf8'));

test('the manifest is pinned to a full commit', () => {
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  for (const v of ['v06', 'v07', 'v08']) assert.ok(manifest.versions[v].fields.length > 20, v);
});

for (const v of ['v06', 'v07', 'v08']) {
  test(`${v}: the decoder reads the published fields, in order`, () => {
    // An all-zero account decodes for every version (None options, empty vec, false bools, state 0), so the order of
    // the fields the decoder fills can be compared even for v0.8, which has no account onchain yet.
    const d = decodeLaunch(new Uint8Array(2000), v);
    const read = Object.keys(d).filter((k) => k !== 'version' && !k.startsWith('_'));
    assert.deepEqual(read, manifest.versions[v].fields.map((f) => f.name));
  });
}

test('the real Umbra account (v0.6) still decodes with the pinned layout', () => {
  const raw = Buffer.from(readFileSync(join(here, 'fixtures', 'umbra_launch.b64'), 'utf8').trim(), 'base64');
  const d = decodeLaunch(new Uint8Array(raw), 'v06');
  // the account is allocated larger than its fields (697 bytes); everything after the last field must be zero
  assert.ok(d._bytes_used <= raw.length);
  assert.equal(d._trailing_nonzero, false);
  assert.equal(d.final_raise_amount, 3_000_000_000_000n);
});
