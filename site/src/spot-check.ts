// Before publishing, re-read a random sample from the chain and compare it with the data files (see chain-check.ts).
// If the RPC cannot be reached, this fails: nothing is published without the re-check.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, readInputs } from './model.ts';
import { USDC_MINT } from './constants.ts';
import { checkMovement, checkTreasury, SAMPLE_MOVEMENTS, SAMPLE_TREASURIES, type Rpc } from './chain-check.ts';

// RPC_URL (any mainnet RPC) or HELIUS_API_KEY. Without either, refuse: nothing is published without the re-check.
const key = process.env['HELIUS_API_KEY'];
const RPC = process.env['RPC_URL'] ?? (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : null);
if (!RPC) { console.error('spot-check: neither RPC_URL nor HELIUS_API_KEY is set; refusing to publish without the chain re-check'); process.exit(1); }

const rpc: Rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (r.status === 429 || r.status >= 500) { await new Promise((z) => setTimeout(z, 1000 * attempt)); continue; }
    const j = (await r.json()) as { result?: T; error?: unknown };
    if (j.error !== undefined || j.result === undefined) throw new Error(`${method}: ${JSON.stringify(j.error ?? 'no result')}`);
    return j.result;
  }
  throw new Error(`${method}: gave up after retries`);
};

function pick<T>(xs: readonly T[], n: number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j] as T, a[i] as T]; }
  return a.slice(0, n);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const site = buildSite(readInputs(process.env['DATA_DIR'] ?? join(root, 'data'), join(root, 'registry')));
const problems: string[] = [];

const withTreasury = site.companies.flatMap((c) => (c.treasury ? [{ c, t: c.treasury }] : []));
for (const { c, t } of pick(withTreasury, SAMPLE_TREASURIES)) {
  problems.push(...(await checkTreasury(rpc, { label: c.displayName, usdcAccount: t.row.usdcAccount, daoVault: t.row.daoVault, balanceSlot: t.row.balanceSlot, balanceAtScan: t.net }, USDC_MINT)));
}
const movements = withTreasury.flatMap(({ c, t }) => t.flows.map((f) => ({ label: c.displayName, signature: f.signature, account: t.row.usdcAccount, usdc: f.usdc })));
for (const m of pick(movements, SAMPLE_MOVEMENTS)) problems.push(...(await checkMovement(rpc, m)));

if (problems.length) {
  console.error(`spot-check: ${problems.length} difference(s) with the chain:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`spot-check: ${SAMPLE_TREASURIES} treasury balances (back to the scan's slot) and ${SAMPLE_MOVEMENTS} movements re-read from the chain; all match to the micro-USDC.`);
