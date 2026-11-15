// Decoders for MetaDAO launchpad `Launch` accounts.
// Layouts copied field-by-field from github.com/MetaDAOProject/programs:
//   programs/v06_launchpad/src/state/launch.rs, v07_..., v08_...
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58e(b) { let n = 0n; for (const x of b) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const x of b) { if (x === 0) s = '1' + s; else break; } return s; }
export function b58d(s) { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const c of s) { if (c === '1') out.unshift(0); else break; } return Uint8Array.from(out); }

export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const PROGRAMS = {
  v08: 'moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n',
  v07: 'moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM',
  v06: 'MooNyh4CBUYEKyXVnjGYQ8mEiJDpGvJMdvrZx1iGeHV',
  // Older versions: source not in the repo at HEAD, so they are counted but not decoded.
  v05: 'mooNhciQJi1LqHDmse2JPic2NqG2PXCanbE3ZYzP3qA',
  v041: 'AfJJJ5UqxhBKoE3grkKAZZsoXDE9kncbMKvqSHGsCNrE',
};
export const DECODABLE = new Set(['v06', 'v07', 'v08']);
const STATES = ['Initialized', 'Live', 'Closed', 'Complete', 'Refunding'];

export function decodeLaunch(data, v) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength); let o = 8;
  const u8 = () => data[o++];
  const u32 = () => { const x = dv.getUint32(o, true); o += 4; return x; };
  const u64 = () => { const x = dv.getBigUint64(o, true); o += 8; return x; };
  const i64 = () => { const x = dv.getBigInt64(o, true); o += 8; return x; };
  const pk = () => { const x = b58e(data.slice(o, o + 32)); o += 32; return x; };
  const opt = f => { const t = u8(); if (t > 1) throw new Error('bad Option tag at ' + (o - 1)); return t ? f() : null; };
  const bool = () => { const t = u8(); if (t > 1) throw new Error('bad bool at ' + (o - 1)); return !!t; };
  const d = { version: v };
  d.pda_bump = u8();
  d.minimum_raise_amount = u64();
  d.monthly_spending_limit_amount = u64();
  const n = u32(); if (n > 10) throw new Error('members > 10');
  d.monthly_spending_limit_members = []; for (let i = 0; i < n; i++) d.monthly_spending_limit_members.push(pk());
  d.launch_authority = pk(); d.launch_signer = pk(); d.launch_signer_pda_bump = u8();
  d.launch_quote_vault = pk(); d.launch_base_vault = pk(); d.base_mint = pk(); d.quote_mint = pk();
  d.unix_timestamp_started = opt(i64); d.unix_timestamp_closed = opt(i64);
  d.total_committed_amount = u64();
  if (v === 'v06') d.final_raise_amount = opt(u64);
  const st = u8(); if (st > 4) throw new Error('bad state ' + st); d.state = STATES[st];
  d.seq_num = u64(); d.seconds_for_launch = u32();
  d.dao = opt(pk); d.dao_vault = opt(pk);
  d.performance_package_grantee = pk(); d.performance_package_token_amount = u64();
  d.months_until_insiders_can_unlock = u8(); d.team_address = pk();
  if (v !== 'v06') {
    d.total_approved_amount = u64(); d.additional_tokens_amount = u64();
    d.additional_tokens_recipient = opt(pk); d.additional_tokens_claimed = bool();
    d.unix_timestamp_completed = opt(i64);
    if (v === 'v07') d.is_performance_package_initialized = bool(); else d.is_finalized = bool();
    d.accumulator_activation_delay_seconds = u32(); d.has_bid_wall = bool();
    if (v === 'v08') d.mint_governor = pk();
  }
  d._bytes_used = o; d._bytes_total = data.length; d._trailing_nonzero = data.slice(o).some(x => x !== 0);
  return d;
}

// Amount actually raised. v0.6 stores it; v0.7+ stores approved amount, valid once Complete.
export function raisedAmount(d) {
  if (d.version === 'v06') return d.final_raise_amount;
  return d.state === 'Complete' ? d.total_approved_amount : null;
}

export function checks(d, discOk) {
  const c = [];
  if (!discOk) c.push('discriminator');
  if (d.quote_mint !== USDC) c.push('quote_not_usdc');
  if (d._trailing_nonzero) c.push('trailing_bytes');
  if (d.minimum_raise_amount > 0n && d.monthly_spending_limit_amount * 6n > d.minimum_raise_amount) c.push('budget_over_1_6');
  return c;
}
