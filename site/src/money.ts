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
