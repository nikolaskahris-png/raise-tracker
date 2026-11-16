// The scan's RPC client retries network failures, rate limits and server errors, but not JSON-RPC errors.
// (The 16 Nov 2026 scan on fix/7-sources lost Zinc's treasury to one "fetch failed".)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRpc } from '../rpc.mjs';

const ok = (result) => ({ status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result }) });
const opts = (fetchImpl) => ({ fetchImpl, minGapMs: 0, backoffMs: 0 });

test('a network failure ("fetch failed") is retried', async () => {
  let n = 0;
  const { rpc } = makeRpc('x', opts(async () => { if (++n < 3) throw new TypeError('fetch failed'); return ok(42); }));
  assert.equal(await rpc('getSlot', []), 42);
  assert.equal(n, 3);
});

test('rate limits and server errors are retried', async () => {
  const seq = [{ status: 429 }, { status: 503 }, ok('done')];
  const { rpc, stats } = makeRpc('x', opts(async () => seq.shift()));
  assert.equal(await rpc('getSlot', []), 'done');
  assert.equal(stats.calls, 3);
});

test('a JSON-RPC error is not retried, and giving up says why', async () => {
  let n = 0;
  const { rpc } = makeRpc('x', opts(async () => { n++; return { status: 200, text: async () => JSON.stringify({ error: { code: -32602, message: 'bad' } }) }; }));
  await assert.rejects(rpc('getSlot', []), /-32602/);
  assert.equal(n, 1);
  const { rpc: down } = makeRpc('x', { ...opts(async () => { throw new TypeError('fetch failed'); }), attempts: 2 });
  await assert.rejects(down('getSlot', []), /gave up after 2 attempts \(fetch failed\)/);
});
