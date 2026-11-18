// A treasury whose USDC account changed owner (a liquidated DAO) is explained from what the chain shows, not just "mismatch".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { KNOWN_PROBLEMS, TREASURY_MOVED } from '../src/invariants.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SIG = '4TfVvyzwC9CdPkDmNyUMnfDo2EGSovmtjdMAPTPd2bzbVBqgv1K3eGReKEBBdkJNCqp6NmddJZ6meyLuFdogHreL';
const ACCOUNT = 'HWiQ29jqE9VqsjAX4DCJawH8idz7bewbCLJbicEEo9Dg', OWNER = 'BVZJTpa7bJRbEzdBM2M2T4ZqZyoHbntHBVjgrNyYS9Ss';
const FULL = `31hoVYav: treasury USDC account mismatch (account ${ACCOUNT} now owned by ${OWNER}, holds 10157.509978 USDC; owner changed 2026-11-12T20:34:03.000Z in ${SIG} via VaultTransactionExecute+WithdrawLiquidity)`;

test('the scan report line with the new owner is a known problem; so is the plain one; anything else is not', () => {
  assert.ok(KNOWN_PROBLEMS.some((re) => re.test(FULL)));
  assert.ok(KNOWN_PROBLEMS.some((re) => re.test('ACCRUE: treasury USDC account mismatch')));
  assert.ok(KNOWN_PROBLEMS.some((re) => re.test(`ACCRUE: treasury USDC account mismatch (account ${ACCOUNT} now owned by ${OWNER}, holds 1.000000 USDC)`)));
  assert.ok(!KNOWN_PROBLEMS.some((re) => re.test('ACCRUE: treasury USDC account mismatch (and something else)')));
  const m = TREASURY_MOVED.exec(FULL)!;
  assert.deepEqual([m[1], m[2], m[3], m[5]], [ACCOUNT, OWNER, '10157.509978', SIG]);
});

test('the company page says the account changed owner, with the owner, the balance and the transaction, and passes the HTML checks', () => {
  const data = join(mkdtempSync(join(tmpdir(), 'rt-moved-')), 'data');
  cpSync(join(here, 'fixtures', '2026-11-16'), data, { recursive: true });
  const rp = join(data, 'treasury-report.md');
  const before = readFileSync(rp, 'utf8');
  assert.match(before, /- 31hoVYav: treasury USDC account mismatch/);
  writeFileSync(rp, before.replace('- 31hoVYav: treasury USDC account mismatch', `- ${FULL}`));
  const out = join(dirname(data), 'dist');
  const r = spawnSync(process.execPath, [join(here, '..', 'src', 'build.ts')], { env: { ...process.env, DATA_DIR: data, REGISTRY_DIR: join(here, 'fixtures', 'registry'), OUT_DIR: out, BASE_PATH: '/' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = readFileSync(join(out, 'company', '31hoVYavdrwYVcbWoZtXpUvf84D5Zroqai2wSnkAmeta', 'index.html'), 'utf8');
  const text = page.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /the USDC account changed owner/);
  assert.match(text, /an address we have not labeled/);
  assert.ok(page.includes(OWNER) && page.includes(SIG) && page.includes(ACCOUNT));
  assert.match(text, /\$10,157\.51/);
  assert.ok(readdirSync(out).length > 0);
});
