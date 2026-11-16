// Rates over counts, with their uncertainty. Counts are exact integers; only the interval uses floating point.

/** 95% two-sided normal quantile. */
export const Z95 = 1.959963984540054;

export type Interval = { readonly low: number; readonly high: number };

/**
 * Wilson score interval for k successes out of n (Wilson 1927). Better than the normal approximation for small n
 * and for rates near 0 or 1. Returns proportions in [0, 1].
 */
export function wilson(k: number, n: number, z: number = Z95): Interval {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n <= 0 || k > n) throw new Error(`wilson: bad counts ${k}/${n}`);
  const p = k / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** A proportion as a percentage with one decimal. */
export const pct1 = (x: number): string => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;

/** True when the two intervals do not overlap: the data then supports saying which rate is higher. */
export const separated = (a: Interval, b: Interval): boolean => a.low > b.high || b.low > a.high;

/** The confidence level used for every interval on the site. */
export const CONFIDENCE = 0.95;
