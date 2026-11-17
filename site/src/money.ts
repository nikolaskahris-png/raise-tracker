// Exact money. USDC has 6 decimals, so every amount is held as an integer number of micro-USDC (bigint).
// No floating point ever touches an amount.

export type Micro = bigint;

const DECIMAL = /^(-)?(\d+)(?:\.(\d{1,6}))?$/;

export function parseMicro(s: string): Micro {
  const m = DECIMAL.exec(s);
  if (!m) throw new Error(`not a decimal amount with at most 6 decimals: "${s}"`);
  const whole = BigInt(m[2] ?? '0');
  const frac = BigInt((m[3] ?? '').padEnd(6, '0'));
  const v = whole * 1_000_000n + frac;
  return m[1] ? -v : v;
}

export const ZERO: Micro = 0n;
export const sum = (xs: Iterable<Micro>): Micro => { let t = 0n; for (const x of xs) t += x; return t; };
export const abs = (x: Micro): Micro => (x < 0n ? -x : x);

/** Round half away from zero to whole cents. */
export function toCents(x: Micro): bigint {
  const a = abs(x);
  const c = (a + 5_000n) / 10_000n;
  return x < 0n ? -c : c;
}

/**
 * True when an exact amount agrees with a figure the scripts wrote rounded to cents.
 * The scripts round with floating point, so at an exact half cent they can land on either side:
 * the exact value must lie within half a cent of the written one.
 */
export const matchesCents = (exact: Micro, written: Micro): boolean => abs(exact - written) <= 5_000n;

function group(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format as US dollars. decimals 'auto': no decimals when the amount is a whole dollar, else cents.
 * sign 'always' prefixes + for positive amounts (ledger style).
 */
export function fmtUsd(x: Micro, opts: { decimals?: 0 | 2 | 'auto'; sign?: 'always' | 'negative' } = {}): string {
  const decimals = opts.decimals ?? 'auto';
  const neg = x < 0n;
  const a = abs(x);
  let body: string;
  const showCents = decimals === 2 || (decimals === 'auto' && a % 1_000_000n !== 0n);
  if (showCents) {
    const cents = toCents(a);
    body = `${group(cents / 100n)}.${(cents % 100n).toString().padStart(2, '0')}`;
  } else {
    body = group((a + 500_000n) / 1_000_000n);
  }
  const sign = neg ? '−' : opts.sign === 'always' && a > 0n ? '+' : '';
  return `${sign}$${body}`;
}

/** Exact decimal string with 6 places, for CSV output. */
export function microToDecimal(x: Micro): string {
  const a = abs(x);
  return `${x < 0n ? '-' : ''}${a / 1_000_000n}.${(a % 1_000_000n).toString().padStart(6, '0')}`;
}

/** Plain integer with thousands separators. */
export const fmtInt = (n: number | bigint): string => group(BigInt(n));

/** part / whole as a percentage with one decimal, computed exactly. */
export function pct(part: Micro, whole: Micro): string {
  if (whole === 0n) throw new Error('percentage of zero');
  const tenths = (part * 1000n * 2n + whole) / (whole * 2n); // round half up for non-negative inputs
  return `${tenths / 10n}.${tenths % 10n}%`;
}

/** part / whole as a ratio with the given decimals, computed exactly. */
export function ratio(part: Micro, whole: Micro, decimals: number): string {
  if (whole === 0n) throw new Error('ratio over zero');
  const scale = 10n ** BigInt(decimals);
  const v = (part * scale * 2n + whole) / (whole * 2n);
  const s = (v / scale).toString();
  return decimals === 0 ? s : `${s}.${(v % scale).toString().padStart(decimals, '0')}`;
}

/**
 * A rounded amount for tables: $3.0M, $989K, $9.6K, $50. Exact integer arithmetic on micro-USDC, never floating point.
 * From $1,000,000 one decimal of millions; from $10,000 whole thousands; from $1,000 one decimal of thousands; below, whole dollars.
 * The exact amount belongs in the figure's title and on the company's page.
 */
export function fmtCompact(x: Micro): string {
  const a = abs(x);
  const sign = x < 0n ? '\u2212' : '';
  const M = 1_000_000_000_000n; // one million dollars, in micro-USDC
  const K = 1_000_000_000n; // one thousand dollars
  const tenthsOf = (unit: bigint) => (a * 10n * 2n + unit) / (unit * 2n); // round half up
  const asM = () => { const t = tenthsOf(M); return `${sign}$${t / 10n}.${t % 10n}M`; };
  if (a >= M) return asM();
  if (a >= 10n * K) {
    const k = (a * 2n + K) / (K * 2n);
    return k >= 1000n ? asM() : `${sign}$${k}K`;
  }
  if (a >= K) {
    const t = tenthsOf(K);
    return t >= 100n ? `${sign}$${t / 10n}K` : `${sign}$${t / 10n}.${t % 10n}K`;
  }
  const d = (a * 2n + 1_000_000n) / 2_000_000n;
  return d >= 1000n ? `${sign}$1.0K` : `${sign}$${d}`;
}

/** part / whole as a whole percentage; "<1%" when the part is not zero but rounds to zero. */
export function pctWhole(part: Micro, whole: Micro): string {
  if (whole <= 0n) throw new Error('percentage of zero');
  if (part === 0n) return '0%';
  const p = (part * 100n * 2n + whole) / (whole * 2n);
  return p === 0n ? '<1%' : `${p}%`;
}
