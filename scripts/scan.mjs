// Full scan of every MetaDAO launchpad raise, including failed and refunded ones.
// Needs env HELIUS_API_KEY (GitHub Actions secret). Writes data/raises.csv, data/raises.json, data/scan-report.md
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makeRpc } from './rpc.mjs';
import { b58e, b58d, PROGRAMS, DECODABLE, decodeLaunch, raisedAmount, checks, metadataAddress, decodeMetadata } from './decode.mjs';

const KEY = process.env.HELIUS_API_KEY;
if (!KEY) { console.error('HELIUS_API_KEY is not set'); process.exit(1); }
const RPC = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { rpc } = makeRpc(RPC, { minGapMs: 0 }); // retries network failures too (scripts/rpc.mjs)

// The slot the scan starts at, kept in the data so every figure can be dated onchain.
const scanSlot = await rpc('getSlot', [{ commitment: 'confirmed' }]);
const disc = createHash('sha256').update('account:Launch').digest().subarray(0, 8);
const discB58 = b58e(disc);

// Names and symbols come from each token's onchain metadata (below). MetaDAO's market API is not used: metadao.fi's terms
// forbid automated monitoring without written consent (DECISIONS.md, 16 Nov 2026).

// Launch authority used by MetaDAO's permissionless platform (Futardio, renamed Backable on 5 Oct 2026).
// Identified from the chain: 124 of 147 raises with minimum >= $10k, first seen 2026-02-17, includes the FUTARDIO token itself.
// Fixed rules of the method, shared with treasury.mjs and the site.
const C = JSON.parse(readFileSync(new URL('../constants.json', import.meta.url), 'utf8'));
const PERMISSIONLESS_AUTHORITY = C.permissionless_authority;
const MIN_REAL_RAISE_USD = C.min_real_raise_usd; // below this: test launches (many have $0.10-$20 minimums)
/** An integer amount of base units as an exact decimal string with `decimals` places. */
const units = (raw, decimals) => { const v = BigInt(raw); if (decimals === 0) return v.toString(); const s = v.toString().padStart(decimals + 1, '0'); return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`.replace(/\.?0+$/, ''); };
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
    rows.push({
      version: v, launch: a.pubkey, decoded: 'yes',
      base_mint: d.base_mint, state: d.state,
      launch_authority: d.launch_authority,
      track: Number(d.minimum_raise_amount) / 1e6 < MIN_REAL_RAISE_USD ? 'test' : (d.launch_authority === PERMISSIONLESS_AUTHORITY ? 'permissionless' : 'curated'),
      started_utc: iso(d.unix_timestamp_started), closed_utc: iso(d.unix_timestamp_closed), completed_utc: iso(d.unix_timestamp_completed),
      duration_days: d.seconds_for_launch / 86400,
      minimum_raise_usd: usd(d.minimum_raise_amount), committed_usd: usd(d.total_committed_amount), raised_usd: usd(raised),
      oversubscription: raised ? (Number(d.total_committed_amount) / Number(raised)).toFixed(2) : '',
      monthly_budget_usd: usd(d.monthly_spending_limit_amount), budget_wallets: d.monthly_spending_limit_members.length,
      budget_wallet_list: d.monthly_spending_limit_members.join(' '),
      performance_package_raw: d.performance_package_token_amount.toString(), insider_lock_months: d.months_until_insiders_can_unlock,
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

// Token decimals, read from each mint account, so token amounts are never assumed to have 6 decimals.
{
  const dec = rows.filter(r => r.decoded === 'yes');
  for (let i = 0; i < dec.length; i += 100) {
    const batch = dec.slice(i, i + 100);
    const res = await rpc('getMultipleAccounts', [batch.map(r => r.base_mint), { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    batch.forEach((r, j) => {
      const d = res.value[j]?.data?.parsed?.info?.decimals;
      if (!Number.isInteger(d)) { problems.push(`${r.launch}: mint ${r.base_mint} decimals not readable`); r.token_decimals = ''; r.performance_package_tokens = ''; return; }
      r.token_decimals = d;
      r.performance_package_tokens = units(r.performance_package_raw, d);
    });
    await sleep(150);
  }
}

rows.sort((x, y) => (x.started_utc || '').localeCompare(y.started_utc || ''));
const cols = ['version', 'launch', 'decoded', 'metadata_account', 'metadata_name', 'metadata_symbol', 'base_mint', 'state', 'launch_authority', 'track', 'started_utc', 'closed_utc', 'completed_utc', 'duration_days', 'minimum_raise_usd', 'committed_usd', 'raised_usd', 'oversubscription', 'monthly_budget_usd', 'budget_wallets', 'budget_wallet_list', 'token_decimals', 'performance_package_tokens', 'insider_lock_months', 'dao', 'dao_vault', 'team_address', 'bytes', 'checks'];
const esc = s => { s = s === undefined || s === null ? '' : String(s); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
mkdirSync('data', { recursive: true });
// Both files are written from the same rows; their sha256 go into the report so the treasury step and the site
// can prove they used exactly these files.
const raisesCsv = [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n') + '\n';
const raisesJson = JSON.stringify({ scanned_at: new Date().toISOString(), scanned_slot: scanSlot, programs: PROGRAMS, counts, rows }, null, 1);
writeFileSync('data/raises.csv', raisesCsv);
writeFileSync('data/raises.json', raisesJson);
const sha256 = s => createHash('sha256').update(s).digest('hex');

const dec = rows.filter(r => r.decoded === 'yes');
const byState = {}; for (const r of dec) byState[r.state] = (byState[r.state] || 0) + 1;
const trackStats = t => { const set = dec.filter(r => r.track === t); const c = set.filter(r => r.state === 'Complete').length, f = set.filter(r => r.state === 'Refunding').length; return `- ${t}: ${set.length} raises, ${c} complete, ${f} refunding, ${set.length - c - f} other${c + f ? `, success ${(100 * c / (c + f)).toFixed(1)}% of finished` : ''}`; };
const failedChecks = dec.filter(r => r.checks !== 'OK');
const report = [
  `# Scan report — ${new Date().toISOString()}`, '', `Slot at the start of the scan: ${scanSlot}`, '', `raises.json sha256: ${sha256(raisesJson)}`, `raises.csv sha256: ${sha256(raisesCsv)}`, '',
  '## Launch accounts per program', ...Object.entries(counts).map(([v, n]) => `- ${v} (${PROGRAMS[v]}): ${n}${DECODABLE.has(v) ? '' : ' — not decoded (older layout)'}`), '',
  '## By track', trackStats('curated'), trackStats('permissionless'), trackStats('test'), '',
  '## Decoded raises by state', ...Object.entries(byState).map(([s, n]) => `- ${s}: ${n}`), '',
  `## Rows failing a check: ${failedChecks.length}`, ...failedChecks.map(r => `- ${r.launch} ${r.metadata_symbol || r.base_mint.slice(0, 8)}: ${r.checks}`), '',
  `## Decode errors: ${problems.length}`, ...problems.map(p => `- ${p}`), '',
];
writeFileSync('data/scan-report.md', report.join('\n'));
console.log(report.join('\n'));
if (problems.length || failedChecks.length) process.exitCode = 2; // surface it in Actions, but data is still written
