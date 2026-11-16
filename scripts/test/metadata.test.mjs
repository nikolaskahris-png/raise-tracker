// Offline tests for the onchain token-metadata decoder used by scan.mjs.
// Fixtures: the raw Metaplex metadata accounts of RNGR and PAYS, read from Solana mainnet on 16 Nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMetadata, metadataAddress, pda, b58d } from '../decode.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const raw = (name) => Buffer.from(readFileSync(join(here, 'fixtures', name), 'utf8').trim(), 'base64');

test('the PDA helper reproduces an address read from the chain', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.equal(pda([enc('launch'), b58d('CARSsxWPkpQWvfyRBwfGMGvysJBHdHGfE46X5MNgmeta')], 'moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM'), '8uMemVUT1ToSuda2jBVhcaPmJWq5C3bKe7DhrM5wkqZP');
});

test('decodes the onchain name and symbol of RNGR', () => {
  const m = decodeMetadata(raw('rngr_metadata.b64'));
  assert.equal(m.mint, 'RNGRtJMbCveqCp7AC6U95KmrdKecFckaJZiWbPGmeta');
  assert.equal(m.name, 'Ranger');
  assert.equal(m.symbol, 'RNGR');
});

test('decodes the onchain name and symbol of Paystream', () => {
  const m = decodeMetadata(raw('pays_metadata.b64'));
  assert.equal(m.mint, 'PAYZP1W3UmdEsNLJwmH61TNqACYJTvhXy8SCN4Tmeta');
  assert.equal(m.name, 'Paystream');
  assert.equal(m.symbol, 'PAYS');
});

test('the metadata address is derived from the mint', () => {
  assert.notEqual(metadataAddress('RNGRtJMbCveqCp7AC6U95KmrdKecFckaJZiWbPGmeta'), metadataAddress('PAYZP1W3UmdEsNLJwmH61TNqACYJTvhXy8SCN4Tmeta'));
});

test('refuses an account that is not MetadataV1', () => {
  const b = raw('rngr_metadata.b64');
  b[0] = 1;
  assert.throws(() => decodeMetadata(b), /not a MetadataV1/);
});
