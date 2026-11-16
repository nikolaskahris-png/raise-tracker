// Raise outcomes by launch authority. The only split the chain gives us is who started a raise (its launch authority).
// One authority is MetaDAO's permissionless platform; every other authority is grouped as "other launch authorities".
// We do not know how those raises were chosen, so nothing here says or implies that MetaDAO selected them.
import { sum, type Micro } from './money.ts';
import { separated, wilson, type Interval } from './stats.ts';
import type { Site } from './model.ts';
import type { Raise } from './schema.ts';

export type RealTrack = 'curated' | 'permissionless';
/** Display names. The data keeps the scripts' word "curated"; the site never shows it. */
export const TRACK_NAME: Readonly<Record<RealTrack, string>> = { curated: 'Other launch authorities', permissionless: 'Permissionless authority' };
export const TRACK_SHORT: Readonly<Record<RealTrack, string>> = { curated: 'Other authority', permissionless: 'Permissionless' };

export type Outcomes = {
  readonly raises: readonly Raise[];
  readonly complete: readonly Raise[];
  readonly refunded: readonly Raise[];
  readonly open: number;
  readonly finished: number;
  readonly raised: Micro;
  /** 95% Wilson interval of the completion rate; null when nothing has finished. */
  readonly ci: Interval | null;
};

export function outcomes(raises: readonly Raise[]): Outcomes {
  const complete = raises.filter((r) => r.state === 'Complete');
  const refunded = raises.filter((r) => r.state === 'Refunding');
  const finished = complete.length + refunded.length;
  return {
    raises, complete, refunded, finished,
    open: raises.length - finished,
    raised: sum(complete.map((r) => r.raised ?? 0n)),
    ci: finished > 0 ? wilson(complete.length, finished) : null,
  };
}

export const trackOutcomes = (site: Site, t: RealTrack): Outcomes => outcomes(site.real.filter((r) => r.track === t));

export type AuthorityRow = { readonly authority: string; readonly track: RealTrack; readonly o: Outcomes };

/** One row per launch authority of a real raise (minimum at or above the test threshold), most raises first. */
export function byAuthority(site: Site): AuthorityRow[] {
  const groups = new Map<string, Raise[]>();
  for (const r of site.real) {
    if (r.track === 'test') continue;
    const g = groups.get(r.launchAuthority) ?? [];
    g.push(r);
    groups.set(r.launchAuthority, g);
  }
  return [...groups.entries()]
    .map(([authority, rs]) => ({ authority, track: (rs[0]?.track ?? 'curated') as RealTrack, o: outcomes(rs) }))
    .sort((a, b) => b.o.raises.length - a.o.raises.length || a.authority.localeCompare(b.authority));
}

/**
 * The section title, written from the data. It names a direction only when the two 95% intervals do not overlap,
 * and never a multiple: with these sample sizes a ratio of rates is far too uncertain to state.
 */
export function trackHeadline(other: Outcomes, perm: Outcomes): string {
  if (other.ci && perm.ci && separated(other.ci, perm.ci)) {
    return other.ci.low > perm.ci.high
      ? 'Raises from other launch authorities completed more often than permissionless ones.'
      : 'Permissionless raises completed more often than raises from other launch authorities.';
  }
  return 'How often raises completed, by launch authority.';
}
