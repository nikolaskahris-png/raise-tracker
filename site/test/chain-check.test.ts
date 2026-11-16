// The chain re-check, offline: a fake RPC plays the chain. Balances are checked back to the slot the scan read them at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMovement, checkTreasury, deltaOf, signaturesAfter, type Rpc, type SigInfo, type Tx } from '../src/chain-check.ts';
import { parseScanReport, parseTreasury } from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, 'fixtures', '2026-11-16');
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ACC = '43GopUATK1nhWwmj1cm2mN1TocvaxdXgKg8VD64ZtviR';
const VAULT = '6VsC8PuKkXm5xo54c2vbrAaSfQipkpGHqNuKTxXFySx6';

/** A transaction moving `delta` base units into (or out of) ACC. */
const tx = (delta: bigint, err: unknown = null): Tx => ({
  transaction: { message: { accountKeys: [{ pubkey: 'Payer1111111111111111111111111111111111111' }, { pubkey: ACC }] } },
  meta: { err, preTokenBalances: [{ accountIndex: 1, mint: USDC, uiTokenAmount: { amount: '1000000000' } }], postTokenBalances: [{ accountIndex: 1, mint: USDC, uiTokenAmount: { amount: String(1_000_000_000n + delta) } }] },
});

/** A fake chain: the account holds `now` at slot `nowSlot`; `history` lists signatures newest first with their slot, delta and error. */
function chain(now: bigint, nowSlot: number, history: { sig: string; slot: number; delta: bigint; err?: unknown }[], owner = VAULT): Rpc {
  return (async (method: string, params: unknown[]) => {
    if (method === 'getAccountInfo') return { context: { slot: nowSlot }, value: { data: { parsed: { info: { mint: USDC, owner, tokenAmount: { amount: String(now) } } } } } };
    if (method === 'getSignaturesForAddress') return history.map((h): SigInfo => ({ signature: h.sig, slot: h.slot, err: h.err ?? null }));
    if (method === 'getTransaction') { const h = history.find((x) => x.sig === params[0]); return h ? tx(h.delta, h.err ?? null) : null; }
    throw new Error(method);
  }) as Rpc;
}
const t = { label: 'Umbra', usdcAccount: ACC, daoVault: VAULT, balanceSlot: 100, balanceAtScan: 989_308_398_318n };

test('a balance that moved after the scan is confirmed back to the scan slot', async () => {
  const rpc = chain(989_308_398_318n + 5_000_000n - 2_000_000n, 200, [
    { sig: 'c', slot: 250, delta: 7n },          // after "now": ignored
    { sig: 'b', slot: 180, delta: -2_000_000n }, // after the scan
    { sig: 'a', slot: 150, delta: 5_000_000n },  // after the scan
    { sig: 'z', slot: 100, delta: 9n },          // at the scan slot: already in the balance
    { sig: 'y', slot: 90, delta: 9n },
  ]);
  assert.deepEqual(await checkTreasury(rpc, t, USDC), []);
});

test('a balance off by one micro-USDC is refused', async () => {
  const rpc = chain(989_308_398_318n + 1n, 200, []);
  assert.equal((await checkTreasury(rpc, t, USDC)).length, 1);
});

test('a failed transaction after the scan is not counted', async () => {
  const rpc = chain(989_308_398_318n, 200, [{ sig: 'f', slot: 150, delta: 50n, err: { InstructionError: [0, 'Custom'] } }]);
  assert.deepEqual(await checkTreasury(rpc, t, USDC), []);
});

test('an account the vault does not own is refused', async () => {
  const rpc = chain(989_308_398_318n, 200, [], 'Someone1111111111111111111111111111111111111');
  assert.match((await checkTreasury(rpc, t, USDC))[0] ?? '', /not the vault's USDC account/);
});

test('only signatures after the scan slot and up to now are listed', async () => {
  const rpc = chain(0n, 200, [{ sig: 'c', slot: 201, delta: 1n }, { sig: 'b', slot: 200, delta: 1n }, { sig: 'a', slot: 101, delta: 1n }, { sig: 'z', slot: 100, delta: 1n }]);
  assert.deepEqual(await signaturesAfter(rpc, ACC, 100, 200), ['b', 'a']);
});

test('a movement must match the chain to the micro-USDC', async () => {
  const rpc = chain(0n, 200, [{ sig: 'm', slot: 150, delta: -250_000_000_000n }]);
  assert.deepEqual(await checkMovement(rpc, { label: 'Umbra', signature: 'm', account: ACC, usdc: -250_000_000_000n }), []);
  assert.equal((await checkMovement(rpc, { label: 'Umbra', signature: 'm', account: ACC, usdc: -250_000_000_001n })).length, 1);
  assert.equal(deltaOf(tx(5n), 'NotInTx11111111111111111111111111111111111'), null);
});

test('the data keeps the scan slot and every balance slot', () => {
  assert.equal(parseScanReport(readFileSync(join(FIX, 'scan-report.md'), 'utf8')).slot, 469_948_591);
  const rows = parseTreasury(readFileSync(join(FIX, 'treasury.csv'), 'utf8'));
  for (const r of rows) assert.ok(r.balanceSlot > 0 && r.balanceSlot <= 469_948_591, r.label);
});
