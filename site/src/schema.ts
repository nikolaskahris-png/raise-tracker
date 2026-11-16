// One validator per data file. Every field is checked; anything unexpected stops the build.
import { parseCsv, type CsvRow } from './csv.ts';
import { parseMicro, type Micro } from './money.ts';

export class SchemaError extends Error {}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function at(file: string, row: CsvRow, col: string, msg: string): SchemaError {
  return new SchemaError(`${file} line ${row.line}, column ${col}: ${msg}`);
}
function req(file: string, row: CsvRow, col: string): string {
  const v = row.get(col);
  if (v === '') throw at(file, row, col, 'is empty');
  return v;
}
function addr(file: string, row: CsvRow, col: string): string {
  const v = req(file, row, col);
  if (!BASE58.test(v)) throw at(file, row, col, `not a base58 address: "${v}"`);
  return v;
}
function optAddr(file: string, row: CsvRow, col: string): string | null {
  return row.get(col) === '' ? null : addr(file, row, col);
}
function money(file: string, row: CsvRow, col: string): Micro {
  try { return parseMicro(req(file, row, col)); } catch (e) { throw at(file, row, col, (e as Error).message); }
}
function optMoney(file: string, row: CsvRow, col: string): Micro | null {
  return row.get(col) === '' ? null : money(file, row, col);
}
function time(file: string, row: CsvRow, col: string): Date {
  const v = req(file, row, col);
  if (!ISO.test(v) || Number.isNaN(Date.parse(v))) throw at(file, row, col, `not an ISO UTC time: "${v}"`);
  return new Date(v);
}
function optTime(file: string, row: CsvRow, col: string): Date | null {
  return row.get(col) === '' ? null : time(file, row, col);
}
function int(file: string, row: CsvRow, col: string): number {
  const v = req(file, row, col);
  if (!/^\d+$/.test(v)) throw at(file, row, col, `not a whole number: "${v}"`);
  return Number(v);
}
function num(file: string, row: CsvRow, col: string): number {
  const v = req(file, row, col);
  if (!/^\d+(\.\d+)?$/.test(v)) throw at(file, row, col, `not a number: "${v}"`);
  return Number(v);
}
function oneOf<T extends string>(file: string, row: CsvRow, col: string, allowed: readonly T[]): T {
  const v = req(file, row, col);
  if (!(allowed as readonly string[]).includes(v)) throw at(file, row, col, `"${v}" is not one of ${allowed.join(', ')}`);
  return v as T;
}
function requireColumns(file: string, header: readonly string[], cols: readonly string[]): void {
  const missing = cols.filter((c) => !header.includes(c));
  if (missing.length) throw new SchemaError(`${file}: missing columns ${missing.join(', ')}`);
}

// ---- raises.csv ---------------------------------------------------------------------------------

export const VERSIONS = ['v041', 'v05', 'v06', 'v07', 'v08'] as const;
export const STATES = ['Initialized', 'Live', 'Closed', 'Complete', 'Refunding'] as const;
export const TRACKS = ['curated', 'permissionless', 'test'] as const;
export type Version = (typeof VERSIONS)[number];
export type LaunchState = (typeof STATES)[number];
export type Track = (typeof TRACKS)[number];

export type UndecodedLaunch = { readonly decoded: false; readonly version: Version; readonly launch: string };
export type Raise = {
  readonly decoded: true;
  readonly version: Version;
  readonly launch: string;
  readonly ticker: string | null;
  readonly apiName: string | null;
  readonly stillTrading: boolean;
  readonly mint: string;
  readonly state: LaunchState;
  readonly launchAuthority: string;
  readonly track: Track;
  readonly started: Date | null;
  readonly closed: Date | null;
  readonly completed: Date | null;
  readonly durationDays: number;
  readonly minimum: Micro;
  readonly committed: Micro;
  readonly raised: Micro | null;
  readonly oversubscription: string;
  readonly monthlyBudget: Micro;
  readonly budgetWallets: readonly string[];
  readonly performanceTokens: Micro; // token amount with 6 decimals, not dollars
  readonly insiderLockMonths: number;
  readonly dao: string | null;
  readonly daoVault: string | null;
  readonly checks: string;
};

const RAISE_COLS = ['version', 'launch', 'decoded', 'ticker', 'name', 'still_trading', 'base_mint', 'state', 'launch_authority', 'track', 'started_utc', 'closed_utc', 'completed_utc', 'duration_days', 'minimum_raise_usd', 'committed_usd', 'raised_usd', 'oversubscription', 'monthly_budget_usd', 'budget_wallets', 'budget_wallet_list', 'performance_package_tokens', 'insider_lock_months', 'dao', 'dao_vault', 'team_address', 'bytes', 'checks'] as const;

export function parseRaises(text: string): (Raise | UndecodedLaunch)[] {
  const F = 'raises.csv';
  const { header, rows } = parseCsv(text, F);
  requireColumns(F, header, RAISE_COLS);
  return rows.map((r) => {
    const version = oneOf(F, r, 'version', VERSIONS);
    const launch = addr(F, r, 'launch');
    const decoded = oneOf(F, r, 'decoded', ['yes', 'no', 'error'] as const);
    if (decoded === 'error') throw at(F, r, 'decoded', 'a launch account failed to decode');
    if (decoded === 'no') return { decoded: false, version, launch };
    const wallets = r.get('budget_wallet_list') === '' ? [] : r.get('budget_wallet_list').split(' ');
    wallets.forEach((w) => { if (!BASE58.test(w)) throw at(F, r, 'budget_wallet_list', `bad address ${w}`); });
    if (wallets.length !== int(F, r, 'budget_wallets')) throw at(F, r, 'budget_wallets', 'count does not match the list');
    return {
      decoded: true,
      version,
      launch,
      ticker: r.get('ticker') || null,
      apiName: r.get('name') || null,
      stillTrading: oneOf(F, r, 'still_trading', ['yes', 'no'] as const) === 'yes',
      mint: addr(F, r, 'base_mint'),
      state: oneOf(F, r, 'state', STATES),
      launchAuthority: addr(F, r, 'launch_authority'),
      track: oneOf(F, r, 'track', TRACKS),
      started: optTime(F, r, 'started_utc'),
      closed: optTime(F, r, 'closed_utc'),
      completed: optTime(F, r, 'completed_utc'),
      durationDays: num(F, r, 'duration_days'),
      minimum: money(F, r, 'minimum_raise_usd'),
      committed: money(F, r, 'committed_usd'),
      raised: optMoney(F, r, 'raised_usd'),
      oversubscription: r.get('oversubscription'),
      monthlyBudget: money(F, r, 'monthly_budget_usd'),
      budgetWallets: wallets,
      performanceTokens: money(F, r, 'performance_package_tokens'),
      insiderLockMonths: int(F, r, 'insider_lock_months'),
      dao: optAddr(F, r, 'dao'),
      daoVault: optAddr(F, r, 'dao_vault'),
      checks: req(F, r, 'checks'),
    };
  });
}

// ---- treasury.csv -------------------------------------------------------------------------------

export type TreasuryRow = {
  readonly label: string;
  readonly mint: string;
  readonly launch: string;
  readonly dao: string;
  readonly daoVault: string;
  readonly track: Track;
  readonly raised: Micro;
  readonly balanceNow: Micro;
  readonly cols: Readonly<Record<FlowClass, Micro>>;
  readonly periodsStarted: number;
  readonly monthlyBudget: Micro;
  readonly spendingLimitNow: Micro | null;
  readonly limitChanged: 'yes' | 'no' | 'unknown';
  readonly reconciles: boolean;
  readonly usdcAccount: string;
  readonly multisig: string;
  readonly spendingLimitAccount: string | null;
};

export const FLOW_CLASSES = ['launch_funding', 'inflow_other', 'team_budget', 'market_approved', 'admin_after_vote', 'admin_no_vote_found', 'admin_against_market', 'liquidation', 'other_out'] as const;
export type FlowClass = (typeof FLOW_CLASSES)[number];
const CLASS_COLUMN: Record<FlowClass, string> = {
  launch_funding: 'launch_funding_usd', inflow_other: 'inflow_other_usd', team_budget: 'team_budget_usd',
  market_approved: 'market_approved_usd', admin_after_vote: 'admin_after_vote_usd', admin_no_vote_found: 'admin_no_vote_found_usd',
  admin_against_market: 'admin_against_market_usd', liquidation: 'liquidation_usd', other_out: 'other_out_usd',
};

export function parseTreasury(text: string): TreasuryRow[] {
  const F = 'treasury.csv';
  const { header, rows } = parseCsv(text, F);
  requireColumns(F, header, ['ticker', 'base_mint', 'launch', 'dao', 'dao_vault', 'track', 'raised_usd', 'balance_now_usd', ...Object.values(CLASS_COLUMN), 'periods_started', 'monthly_budget_usd', 'spending_limit_now_usd', 'limit_changed', 'reconciles', 'treasury_usdc_account', 'squads_multisig', 'spending_limit_account']);
  return rows.map((r) => {
    const cols = {} as Record<FlowClass, Micro>;
    for (const c of FLOW_CLASSES) cols[c] = money(F, r, CLASS_COLUMN[c]);
    return {
      label: req(F, r, 'ticker'),
      mint: addr(F, r, 'base_mint'),
      launch: addr(F, r, 'launch'),
      dao: addr(F, r, 'dao'),
      daoVault: addr(F, r, 'dao_vault'),
      track: oneOf(F, r, 'track', TRACKS),
      raised: money(F, r, 'raised_usd'),
      balanceNow: money(F, r, 'balance_now_usd'),
      cols,
      periodsStarted: int(F, r, 'periods_started'),
      monthlyBudget: money(F, r, 'monthly_budget_usd'),
      spendingLimitNow: optMoney(F, r, 'spending_limit_now_usd'),
      limitChanged: oneOf(F, r, 'limit_changed', ['yes', 'no', 'unknown'] as const),
      reconciles: oneOf(F, r, 'reconciles', ['yes', 'NO'] as const) === 'yes',
      usdcAccount: addr(F, r, 'treasury_usdc_account'),
      multisig: addr(F, r, 'squads_multisig'),
      spendingLimitAccount: optAddr(F, r, 'spending_limit_account'),
    };
  });
}

// ---- treasury-flows.csv -------------------------------------------------------------------------

export type Flow = {
  readonly mint: string;
  readonly label: string;
  readonly time: Date;
  readonly usdc: Micro;
  readonly cls: FlowClass;
  readonly decisionNumber: number | null; // linked proposal (market_approved)
  readonly decisionAddress: string | null;
  readonly priorVoteNumber: number | null; // most recent passed proposal before an admin-key movement
  readonly priorVoteAddress: string | null;
  readonly priorVoteDays: string | null;
  readonly adminKeys: readonly string[];
  readonly counterparty: readonly string[];
  readonly signature: string;
};

const REF = /^#(\d+) ([1-9A-HJ-NP-Za-km-z]{32,44})$/;
const PRIOR = /^#(\d+) ([1-9A-HJ-NP-Za-km-z]{32,44}), enqueued (\d+\.\d) days earlier$/;

export function parseFlows(text: string): Flow[] {
  const F = 'treasury-flows.csv';
  const { header, rows } = parseCsv(text, F);
  requireColumns(F, header, ['ticker', 'base_mint', 'time_utc', 'usdc', 'class', 'approval', 'decision_ref', 'prior_passed_vote', 'counterparty', 'signature']);
  return rows.map((r) => {
    const cls = oneOf(F, r, 'class', FLOW_CLASSES);
    const usdc = money(F, r, 'usdc');
    const incoming = cls === 'launch_funding' || cls === 'inflow_other';
    if (usdc === 0n || (incoming ? usdc < 0n : usdc > 0n)) throw at(F, r, 'usdc', `sign does not match class ${cls}`);
    const sig = req(F, r, 'signature');
    if (!SIGNATURE.test(sig)) throw at(F, r, 'signature', 'not a base58 signature');
    let decisionNumber: number | null = null, decisionAddress: string | null = null;
    if (r.get('decision_ref') !== '') {
      const m = REF.exec(r.get('decision_ref'));
      if (!m) throw at(F, r, 'decision_ref', 'unexpected format');
      decisionNumber = Number(m[1]); decisionAddress = m[2] ?? null;
    }
    let priorVoteNumber: number | null = null, priorVoteAddress: string | null = null, priorVoteDays: string | null = null;
    if (r.get('prior_passed_vote') !== '') {
      const m = PRIOR.exec(r.get('prior_passed_vote'));
      if (!m) throw at(F, r, 'prior_passed_vote', 'unexpected format');
      priorVoteNumber = Number(m[1]); priorVoteAddress = m[2] ?? null; priorVoteDays = m[3] ?? null;
    }
    if (cls === 'market_approved' && decisionAddress === null) throw at(F, r, 'decision_ref', 'a market-approved movement needs its proposal');
    if (cls === 'admin_after_vote' && priorVoteAddress === null) throw at(F, r, 'prior_passed_vote', 'an admin-after-vote movement needs the vote');
    const approval = r.get('approval');
    const by = /admin_approved by ([1-9A-HJ-NP-Za-km-z ]+?)(?: \(| proposal=)/.exec(approval);
    const adminKeys = by?.[1] ? by[1].split(' ').filter((k) => BASE58.test(k)) : [];
    const counterparty = r.get('counterparty') === '' ? [] : r.get('counterparty').split(' ');
    counterparty.forEach((c) => { if (!BASE58.test(c)) throw at(F, r, 'counterparty', `bad address ${c}`); });
    return {
      mint: addr(F, r, 'base_mint'), label: req(F, r, 'ticker'), time: time(F, r, 'time_utc'), usdc, cls,
      decisionNumber, decisionAddress, priorVoteNumber, priorVoteAddress, priorVoteDays, adminKeys, counterparty, signature: sig,
    };
  });
}

// ---- reports (markdown written by the scripts) ---------------------------------------------------

export type ScanReport = {
  readonly at: Date;
  readonly failingChecks: number;
  readonly decodeErrors: number;
  readonly tracks: Readonly<Record<Track, { raises: number; complete: number; refunding: number; other: number }>>;
};

export function parseScanReport(md: string): ScanReport {
  const at = /^# Scan report — (\S+)$/m.exec(md)?.[1];
  const failing = /^## Rows failing a check: (\d+)$/m.exec(md)?.[1];
  const errors = /^## Decode errors: (\d+)$/m.exec(md)?.[1];
  if (!at || failing === undefined || errors === undefined) throw new SchemaError('scan-report.md: unexpected format');
  const tracks = {} as Record<Track, { raises: number; complete: number; refunding: number; other: number }>;
  for (const t of TRACKS) {
    const m = new RegExp(`^- ${t}: (\\d+) raises, (\\d+) complete, (\\d+) refunding, (\\d+) other`, 'm').exec(md);
    if (!m) throw new SchemaError(`scan-report.md: no line for track ${t}`);
    tracks[t] = { raises: Number(m[1]), complete: Number(m[2]), refunding: Number(m[3]), other: Number(m[4]) };
  }
  return { at: new Date(at), failingChecks: Number(failing), decodeErrors: Number(errors), tracks };
}

export type TreasuryReport = { readonly at: Date; readonly problems: readonly string[] };

export function parseTreasuryReport(md: string): TreasuryReport {
  const at = /^# Treasury report — (\S+)$/m.exec(md)?.[1];
  const lines = md.split('\n');
  const head = lines.findIndex((l) => /^## Problems: \d+$/.test(l));
  if (!at || head < 0) throw new SchemaError('treasury-report.md: unexpected format');
  const count = Number(/\d+/.exec(lines[head] ?? '')?.[0]);
  const problems: string[] = [];
  for (const l of lines.slice(head + 1)) {
    if (!l.startsWith('- ')) break;
    problems.push(l.slice(2));
  }
  if (problems.length !== count) throw new SchemaError('treasury-report.md: problem count does not match the list');
  return { at: new Date(at), problems };
}

// ---- registry/names.json ------------------------------------------------------------------------

export type DeclaredName = { readonly name: string; readonly source: string; readonly basis: string };

export function parseNames(json: string): ReadonlyMap<string, DeclaredName> {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const out = new Map<string, DeclaredName>();
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    if (!BASE58.test(k)) throw new SchemaError(`names.json: key ${k} is not a mint`);
    const o = v as Record<string, unknown>;
    if (typeof o['name'] !== 'string' || typeof o['basis'] !== 'string' || typeof o['source'] !== 'string' || !/^https:\/\//.test(o['source'])) {
      throw new SchemaError(`names.json: ${k} needs name, https source and basis`);
    }
    out.set(k, { name: o['name'], source: o['source'], basis: o['basis'] });
  }
  return out;
}
