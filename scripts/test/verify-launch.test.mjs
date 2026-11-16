// verify-launch.mjs decodes a launch account read from the chain into the figures the site shows.
// Fixture: Umbra's launch account (launchpad v0.6), read from mainnet on 16 Nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeLaunch } from '../verify-launch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const umbra = Buffer.from(readFileSync(join(here, 'fixtures', 'umbra_launch.b64'), 'utf8').trim(), 'base64');

test('Umbra: the figures the site shows, decoded from the raw account', () => {
  const d = describeLaunch(umbra, 'v06', 6);
  assert.equal(d.token_mint, 'PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta');
  assert.equal(d.state, 'Complete');
  assert.equal(d.minimum_raise, '$750,000.000000');
  assert.equal(d.committed, '$154,943,746.000000');
  assert.equal(d.raised, '$3,000,000.000000');
  assert.equal(d.monthly_team_budget, '$34,091.000000');
  assert.equal(d.insider_lock_months, '18');
  assert.equal(d.performance_package, '13,500,000 tokens');
  assert.equal(d.dao_vault, '6VsC8PuKkXm5xo54c2vbrAaSfQipkpGHqNuKTxXFySx6');
});

test('token amounts follow the mint’s decimals, never an assumed 6', () => {
  assert.equal(describeLaunch(umbra, 'v06', 9).performance_package, '13,500 tokens');
  assert.match(describeLaunch(umbra, 'v06', null).performance_package, /base units \(decimals unknown\)/);
});
