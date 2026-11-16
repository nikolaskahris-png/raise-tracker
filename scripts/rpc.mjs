// One JSON-RPC client for scan.mjs and treasury.mjs. Retries rate limits, server errors and network failures
// (fetch throwing, e.g. "fetch failed"), with a growing pause; a JSON-RPC error is not retried.
export function makeRpc(url, { fetchImpl = fetch, attempts = 6, minGapMs = 110, backoffMs = 1000 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stats = { calls: 0 };
  async function rpc(method, params) {
    let last = '';
    for (let a = 1; a <= attempts; a++) {
      stats.calls++;
      if (minGapMs) await sleep(minGapMs);
      let r;
      try {
        r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      } catch (e) { last = e.message; await sleep(backoffMs * a); continue; }
      if (r.status === 429 || r.status >= 500) { last = `HTTP ${r.status}`; await sleep(backoffMs * a); continue; }
      const text = await r.text(); let j;
      try { j = JSON.parse(text); } catch { throw new Error(`${method}: HTTP ${r.status} ${text.slice(0, 80)}`); }
      if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
      return j.result;
    }
    throw new Error(`${method}: gave up after ${attempts} attempts (${last})`);
  }
  return { rpc, stats };
}
