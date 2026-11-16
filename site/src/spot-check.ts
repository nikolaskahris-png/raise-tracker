// Before publishing, re-read a random sample from the chain and compare it with the data files.
// Transactions are immutable, so each sampled movement must match the chain to the micro-USDC.
// If the RPC cannot be reached, this fails: nothing is published without the re-check.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, readInputs } from './model.ts';
import { USDC_MINT } from './constants.ts';

const SAMPLE_FLOWS = 10;
const SAMPLE_ACCOUNTS = 3;

type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };
type Tx = { transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } }; meta: { preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[]; loadedAddresses?: { writable: string[]; readonly: string[] } } };

const key = process.env['HELIUS_API_KEY'];
if (!key) { console.error('spot-check: HELIUS_API_KEY is not set; refusing to publish without the chain re-check'); process.exit(1); }
const RPC = `https://mainnet.helius-rpc.com/?api-key=${key}`;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (r.status === 429 || r.status >= 500) { await new Promise((z) => setTimeout(z, 1000 * attempt)); continue; }
    const j = (await r.json()) as { result?: T; error?: unknown };
    if (j.error !== undefined || j.result === undefined) throw new Error(`${method}: ${JSON.stringify(j.error ?? 'no result')}`);
    return j.result;
  }
  throw new Error(`${method}: gave up after retries`);
}

function pick<T>(xs: readonly T[], n: number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j] as T, a[i] as T]; }
  return a.slice(0, n);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const site = buildSite(readInputs(process.env['DATA_DIR'] ?? join(root, 'data'), join(root, 'registry')));
const problems: string[] = [];

const withTreasury = site.companies.filter((c) => c.treasury);
for (const c of pick(withTreasury, SAMPLE_ACCOUNTS)) {
  const t = c.treasury!;
  const a = await rpc<{ value: { data: { parsed: { info: { mint: string; owner: string } } } } | null }>('getAccountInfo', [t.row.usdcAccount, { encoding: 'jsonParsed' }]);
  const info = a.value?.data.parsed.info;
  if (!info || info.mint !== USDC_MINT || info.owner !== t.row.daoVault) problems.push(`${c.displayName}: treasury account ${t.row.usdcAccount} is not the vault's USDC account`);
}

const flows = withTreasury.flatMap((c) => (c.treasury?.flows ?? []).map((f) => ({ f, account: c.treasury!.row.usdcAccount })));
for (const { f, account } of pick(flows, SAMPLE_FLOWS)) {
  const tx = await rpc<Tx | null>('getTransaction', [f.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' }]);
  if (!tx) { problems.push(`${f.signature}: transaction not found`); continue; }
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey)).concat(tx.meta.loadedAddresses ? [...tx.meta.loadedAddresses.writable, ...tx.meta.loadedAddresses.readonly] : []);
  const idx = keys.indexOf(account);
  const bal = (xs?: TokenBalance[]) => BigInt(xs?.find((b) => b.accountIndex === idx)?.uiTokenAmount.amount ?? '0');
  const delta = bal(tx.meta.postTokenBalances) - bal(tx.meta.preTokenBalances);
  if (idx < 0 || delta !== f.usdc) problems.push(`${f.label} ${f.signature}: chain says ${delta} micro-USDC, data says ${f.usdc}`);
}

if (problems.length) {
  console.error(`spot-check: ${problems.length} difference(s) with the chain:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`spot-check: ${SAMPLE_ACCOUNTS} treasury accounts and ${SAMPLE_FLOWS} movements re-read from the chain; all match.`);
