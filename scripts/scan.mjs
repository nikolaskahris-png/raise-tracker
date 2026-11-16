// Full scan of every MetaDAO launchpad raise, including failed and refunded ones.
// Needs env HELIUS_API_KEY (GitHub Actions secret). Writes data/raises.csv, data/raises.json, data/scan-report.md
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { b58e, b58d, PROGRAMS, DECODABLE, decodeLaunch, raisedAmount, checks, metadataAddress, decodeMetadata } from './decode.mjs';

const KEY = process.env.HELIUS_API_KEY;
if (!KEY) { console.error('HELIUS_API_KEY is not set'); process.exit(1); }
const RPC = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function rpc(method, params) {
  for (let a = 1; a <= 5; a++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * a); continue; }
    const j = await r.json();
    if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
    return j.result;
  }
  throw new Error(`${method}: gave up after retries`);
}

const disc = createHash('sha256').update('account:Launch').digest().subarray(0, 8);
const discB58 = b58e(disc);

// Ticker names from MetaDAO's public market API (only tokens that still trade are listed there).
let tickers = {};
try {
  const t = await (await fetch('https://market-api.metadao.fi/api/tickers')).json();
  for (const x of t) tickers[x.base_currency] = { ticker: x.base_symbol, name: x.base_name };
} catch (e) { console.warn('tickers unavailable:', e.message); }

// Launch authority used by MetaDAO's permissionless platform (Futardio, renamed Backable on 5 Oct 2026).
// Identified from the chain: 124 of 147 raises with minimum >= $10k, first seen 2026-02-17, includes the FUTARDIO token itself.
const PERMISSIONLESS_AUTHORITY = 'LRrTQLqFzAPxjschuAKQAqH1XHBuBgHqwhybENStARt';
const MIN_REAL_RAISE_USD = 10000; // below this: test launches (many have $0.10-$20 minimums)
const usd = x => (x === null || x === undefined) ? '' : (Number(x) / 1e6).toString();
const iso = x => (x === null || x === undefined) ? '' : new Date(Number(x) * 1000).toISOString();
const rows = []; const counts = {}; const problems = [];

for (const [v, prog] of Object.entries(PROGRAMS)) {
  const accts = await rpc('getProgramAccounts', [prog, { encoding: 'base64', commitment: 'confirmed', filters: [{ memcmp: { offset: 0, bytes: discB58 } }] }]);
  counts[v] = accts.length;
  for (const a of accts) {
    const data = Buffer.from(a.account.data[0], 'base64');
    const discOk = data.subarray(0, 8).equals(disc);
    if (!DECODABLE.has(v)) { rows.push({ version: v, launch: a.pubkey, bytes: data.length, decoded: 'no' }); continue; }
    let d;
    try { d = decodeLaunch(new Uint8Array(data), v); }
    catch (e) { problems.push(`${v} ${a.pubkey}: ${e.message}`); rows.push({ version: v, launch: a.pubkey, bytes: data.length, decoded: 'error' }); continue; }
    const c = checks(d, discOk);
    const raised = raisedAmount(d);
    const tk = tickers[d.base_mint] || {};
    rows.push({
      version: v, launch: a.pubkey, decoded: 'yes', ticker: tk.ticker || '', name: tk.name || '', still_trading: tk.ticker ? 'yes' : 'no',
      base_mint: d.base_mint, state: d.state,
      launch_authority: d.launch_authority,
      track: Number(d.minimum_raise_amount) / 1e6 < MIN_REAL_RAISE_USD ? 'test' : (d.launch_authority === PERMISSIONLESS_AUTHORITY ? 'permissionless' : 'curated'),
      started_utc: iso(d.unix_timestamp_started), closed_utc: iso(d.unix_timestamp_closed), completed_utc: iso(d.unix_timestamp_completed),
      duration_days: d.seconds_for_launch / 86400,
      minimum_raise_usd: usd(d.minimum_raise_amount), committed_usd: usd(d.total_committed_amount), raised_usd: usd(raised),
      oversubscription: raised ? (Number(d.total_committed_amount) / Number(raised)).toFixed(2) : '',
      monthly_budget_usd: usd(d.monthly_spending_limit_amount), budget_wallets: d.monthly_spending_limit_members.length,
      budget_wallet_list: d.monthly_spending_limit_members.join(' '),
      performance_package_tokens: usd(d.performance_package_token_amount), insider_lock_months: d.months_until_insiders_can_unlock,
      dao: d.dao || '', dao_vault: d.dao_vault || '', team_address: d.team_address,
      bytes: data.length, checks: c.join(' ') || 'OK',
    });
  }
  await sleep(400); // free plan: getProgramAccounts is limited to 5/sec
}

// Onchain token metadata (Metaplex): the name and symbol the token itself declares. Read for every decoded raise.
{
  const dec = rows.filter(r => r.decoded === 'yes');
  for (let i = 0; i < dec.length; i += 100) {
    const batch = dec.slice(i, i + 100);
    const addrs = batch.map(r => metadataAddress(r.base_mint));
    const res = await rpc('getMultipleAccounts', [addrs, { encoding: 'base64', commitment: 'confirmed' }]);
    batch.forEach((r, j) => {
      const acct = res.value[j];
      r.metadata_account = acct ? addrs[j] : '';
      if (!acct) { r.metadata_name = ''; r.metadata_symbol = ''; return; }
      try {
        const m = decodeMetadata(Buffer.from(acct.data[0], 'base64'));
        if (m.mint !== r.base_mint) throw new Error('metadata names another mint');
        r.metadata_name = m.name; r.metadata_symbol = m.symbol;
      } catch (e) { problems.push(`${r.launch}: token metadata: ${e.message}`); r.metadata_name = ''; r.metadata_symbol = ''; }
    });
    await sleep(150);
  }
}

rows.sort((x, y) => (x.started_utc || '').localeCompare(y.started_utc || ''));
const cols = ['version', 'launch', 'decoded', 'ticker', 'name', 'still_trading', 'metadata_account', 'metadata_name', 'metadata_symbol', 'base_mint', 'state', 'launch_authority', 'track', 'started_utc', 'closed_utc', 'completed_utc', 'duration_days', 'minimum_raise_usd', 'committed_usd', 'raised_usd', 'oversubscription', 'monthly_budget_usd', 'budget_wallets', 'budget_wallet_list', 'performance_package_tokens', 'insider_lock_months', 'dao', 'dao_vault', 'team_address', 'bytes', 'checks'];
const esc = s => { s = s === undefined || s === null ? '' : String(s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
mkdirSync('data', { recursive: true });
writeFileSync('data/raises.csv', [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n') + '\n');
writeFileSync('data/raises.json', JSON.stringify({ scanned_at: new Date().toISOString(), programs: PROGRAMS, counts, rows }, null, 1));

const dec = rows.filter(r => r.decoded === 'yes');
const byState = {}; for (const r of dec) byState[r.state] = (byState[r.state] || 0) + 1;
const trackStats = t => { const set = dec.filter(r => r.track === t); const c = set.filter(r => r.state === 'Complete').length, f = set.filter(r => r.state === 'Refunding').length; return `- ${t}: ${set.length} raises, ${c} complete, ${f} refunding, ${set.length - c - f} other${c + f ? `, success ${(100 * c / (c + f)).toFixed(1)}% of finished` : ''}`; };
const failedChecks = dec.filter(r => r.checks !== 'OK');
const report = [
  `# Scan report — ${new Date().toISOString()}`, '',
  '## Launch accounts per program', ...Object.entries(counts).map(([v, n]) => `- ${v} (${PROGRAMS[v]}): ${n}${DECODABLE.has(v) ? '' : ' — not decoded (older layout)'}`), '',
  '## By track', trackStats('curated'), trackStats('permissionless'), trackStats('test'), '',
  '## Decoded raises by state', ...Object.entries(byState).map(([s, n]) => `- ${s}: ${n}`), '',
  `## Not in MetaDAO's ticker list (likely failed, refunded or delisted): ${dec.filter(r => r.still_trading === 'no').length}`, '',
  `## Rows failing a check: ${failedChecks.length}`, ...failedChecks.map(r => `- ${r.launch} ${r.ticker}: ${r.checks}`), '',
  `## Decode errors: ${problems.length}`, ...problems.map(p => `- ${p}`), '',
];
writeFileSync('data/scan-report.md', report.join('\n'));
console.log(report.join('\n'));
if (problems.length || failedChecks.length) process.exitCode = 2; // surface it in Actions, but data is still written
