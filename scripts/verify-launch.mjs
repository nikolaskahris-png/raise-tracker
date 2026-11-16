#!/usr/bin/env node
// Check a raise's figures yourself, straight from the chain.
//
//   node scripts/verify-launch.mjs <launch account address>
//
// Reads the launch account from Solana (RPC_URL if set, else the public mainnet RPC), finds its launchpad version from the
// program that owns it, decodes it with the same layout the site uses (scripts/decode.mjs), reads the token's decimals from
// its mint, and prints every figure the site shows for the raise. No dependencies; Node 18 or later.
import { pathToFileURL } from 'node:url';
import { PROGRAMS, DECODABLE, decodeLaunch, raisedAmount } from './decode.mjs';

const usd = (raw) => { const s = BigInt(raw).toString().padStart(7, '0'); return `$${Number(s.slice(0, -6)).toLocaleString('en-US')}.${s.slice(-6)}`; };
const units = (raw, decimals) => { const v = BigInt(raw); if (decimals === 0) return v.toLocaleString('en-US'); const s = v.toString().padStart(decimals + 1, '0'); const whole = BigInt(s.slice(0, -decimals)).toLocaleString('en-US'); const frac = s.slice(-decimals).replace(/0+$/, ''); return frac ? `${whole}.${frac}` : whole; };
const when = (t) => (t === null || t === undefined ? '-' : new Date(Number(t) * 1000).toISOString());

/** The figures of a decoded launch account, as text. `decimals` is the token's, read from its mint. */
export function describeLaunch(data, version, decimals) {
  const d = decodeLaunch(new Uint8Array(data), version);
  const raised = raisedAmount(d);
  return {
    version, state: d.state, token_mint: d.base_mint, launch_authority: d.launch_authority,
    started: when(d.unix_timestamp_started), closed: when(d.unix_timestamp_closed), completed: when(d.unix_timestamp_completed),
    minimum_raise: usd(d.minimum_raise_amount), committed: usd(d.total_committed_amount), raised: raised === null || raised === undefined ? '-' : usd(raised),
    monthly_team_budget: usd(d.monthly_spending_limit_amount), budget_wallets: d.monthly_spending_limit_members.join(' '),
    performance_package: decimals === null ? `${d.performance_package_token_amount} base units (decimals unknown)` : `${units(d.performance_package_token_amount, decimals)} tokens`,
    insider_lock_months: String(d.months_until_insiders_can_unlock), dao: d.dao ?? '-', dao_vault: d.dao_vault ?? '-',
  };
}

async function main() {
  const address = process.argv[2];
  if (!address) { console.error('usage: node scripts/verify-launch.mjs <launch account address>'); process.exit(2); }
  const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
  const rpc = async (method, params) => {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
    return j.result;
  };
  const acct = await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'finalized' }]);
  if (!acct.value) { console.error(`${address}: no such account`); process.exit(1); }
  const version = Object.entries(PROGRAMS).find(([, id]) => id === acct.value.owner)?.[0];
  if (!version) { console.error(`${address} is owned by ${acct.value.owner}, not a MetaDAO launchpad program`); process.exit(1); }
  console.log(`launch account  ${address}`);
  console.log(`read at slot    ${acct.context.slot}`);
  console.log(`program         ${acct.value.owner} (launchpad ${version})`);
  if (!DECODABLE.has(version)) { console.log('This version\'s account layout is not in the current MetaDAO repository, so it is not decoded.'); return; }
  const data = Buffer.from(acct.value.data[0], 'base64');
  let decimals = null;
  const first = describeLaunch(data, version, null);
  const mint = await rpc('getAccountInfo', [first.token_mint, { encoding: 'jsonParsed', commitment: 'finalized' }]);
  if (Number.isInteger(mint.value?.data?.parsed?.info?.decimals)) decimals = mint.value.data.parsed.info.decimals;
  console.log(`token decimals  ${decimals ?? 'not readable'}`);
  for (const [k, v] of Object.entries(describeLaunch(data, version, decimals))) console.log(`${k.padEnd(20)}${v}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
