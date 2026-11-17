// Fixed addresses and the rules of the method. The rules live in /constants.json, read by the scripts and by the site.
// A rule shown on a page goes through constant(), and the post-build check accepts its digits only when the text is exactly
// the formatted value of that key.
import { readFileSync } from 'node:fs';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type Constants = {
  readonly min_real_raise_usd: number;
  readonly permissionless_authority: string;
  readonly admin_vote_window_days: number;
  readonly spending_limit_period_days: number;
  readonly average_month_days: number;
  readonly stale_hours: number;
  readonly public_code_quiet_days: number;
  readonly confidence: number;
  readonly sample_treasuries: number;
  readonly sample_movements: number;
  readonly ledger_min_usd: number;
  readonly scan_times_utc: readonly string[];
  readonly max_report_gap_hours: number;
};

export const C: Constants = JSON.parse(readFileSync(new URL('../../constants.json', import.meta.url), 'utf8')) as Constants;

const DAY_MS = 86_400_000;
export const MIN_REAL_RAISE = BigInt(C.min_real_raise_usd) * 1_000_000n; // micro-USDC
export const LEDGER_MIN = BigInt(C.ledger_min_usd) * 1_000_000n; // micro-USDC
export const ADMIN_VOTE_WINDOW_MS = C.admin_vote_window_days * DAY_MS;
export const PERIOD_MS = C.spending_limit_period_days * DAY_MS;
export const AVERAGE_MONTH_MS = C.average_month_days * DAY_MS;
export const PERMISSIONLESS_AUTHORITY = C.permissionless_authority;

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
/** The exact text each displayable rule is shown as. */
export const CONSTANT_TEXT: Readonly<Record<string, string>> = {
  min_real_raise_usd: usd(C.min_real_raise_usd),
  admin_vote_window_days: String(C.admin_vote_window_days),
  spending_limit_period_days: String(C.spending_limit_period_days),
  stale_hours: String(C.stale_hours),
  public_code_quiet_days: String(C.public_code_quiet_days),
  confidence: `${Math.round(C.confidence * 100)}%`,
  sample_treasuries: String(C.sample_treasuries),
  sample_movements: String(C.sample_movements),
  ledger_min_usd: usd(C.ledger_min_usd),
  max_report_gap_hours: String(C.max_report_gap_hours),
  ...Object.fromEntries(C.scan_times_utc.map((t, i) => [`scan_times_utc.${i}`, t])),
};

/** A rule of the method on a page. Its text comes from constants.json, never from the page's code. */
export function constant(key: keyof typeof CONSTANT_TEXT & string): string {
  const text = CONSTANT_TEXT[key];
  if (text === undefined) throw new Error(`no constant ${key}`);
  return `<span data-constant="${key}" title="Rule of the method, from constants.json">${text}</span>`;
}
