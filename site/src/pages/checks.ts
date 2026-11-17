// The five check figures and the full legend of marks. They open the Methodology page: the home page starts with the companies.
import { fig } from '../fig.ts';
import { fmtInt, fmtUsd, sum } from '../money.ts';
import type { Site } from '../model.ts';

const CHECK = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"></path></svg>';
export const CLOCK = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 5v3.2l2 1.3"></path></svg>';

export function checksSection(site: Site): string {
  const launchAccounts = site.inputs.raises.length;
  const withTreasury = site.companies.filter((c) => c.treasury);
  const completedReal = site.real.filter((r) => r.state === 'Complete');
  const raisedReal = sum(completedReal.map((r) => r.raised ?? 0n));
  const reconciled = withTreasury.filter((c) => c.treasury?.row.reconciles).length;
  return `<section id="checks" class="wrap" style="padding-top:40px;padding-bottom:8px">
<div class="eyebrow" style="margin-bottom:12px">The checks behind the figures</div>
<div class="stats">
<div class="stat"><div class="stat-l">Raises decoded from the chain</div><div class="stat-v">${fig(fmtInt(site.decoded.length), { kind: 'sum', what: 'launch accounts decoded from the chain', rows: { raises: site.decoded } })}</div><div class="stat-n">of ${fig(fmtInt(launchAccounts), { kind: 'sum', what: 'launch accounts found onchain', rows: { raises: site.inputs.raises } })} launch accounts</div></div>
<div class="stat"><div class="stat-l">Raised in completed raises</div><div class="stat-v">${fig(fmtUsd(raisedReal), { kind: 'sum', what: 'completed raises, test launches excluded', rows: { raises: completedReal } })}</div><div class="stat-n">${fig(fmtInt(completedReal.length), { kind: 'sum', what: 'completed raises, test launches excluded', rows: { raises: completedReal } })} raises, test launches excluded</div></div>
<div class="stat"><div class="stat-l">Treasury movements, each linked</div><div class="stat-v">${fig(fmtInt(site.allFlows.length), { kind: 'sum', what: 'every treasury movement', rows: { flows: site.allFlows } })}</div><div class="stat-n">USDC in and out of ${fig(fmtInt(withTreasury.length), { kind: 'sum', what: 'treasuries read', rows: { companies: withTreasury } })} treasuries</div></div>
<div class="stat"><div class="stat-l">Treasuries read and reconciled</div><div class="stat-v">${fig(fmtInt(withTreasury.length), { kind: 'sum', what: 'treasuries read', rows: { companies: withTreasury } })} <span style="font-size:0.55em;font-weight:500">of</span> ${fig(fmtInt(site.companies.length), { kind: 'sum', what: 'completed raises with a DAO', rows: { companies: site.companies } })}</div><div class="stat-n">read; ${reconciled === withTreasury.length ? 'all' : ''} ${fig(fmtInt(reconciled), { kind: 'sum', what: 'treasuries whose history adds up to their balance at the scan', rows: { companies: withTreasury.filter((c) => c.treasury?.row.reconciles) } })} add up to the cent</div></div>
</div>
<div class="legend">
<span><span class="mk mk-v" aria-hidden="true">${CHECK}</span>Verified onchain: opens the transaction or account</span>
<span><span class="mk mk-s" aria-hidden="true">Σ</span>Sum of verified records: opens the list</span>
<span><span class="mk mk-f" aria-hidden="true">=</span>Computed from verified figures: opens the formula</span>
<span><span class="mk mk-o" aria-hidden="true"></span>Declared onchain: written onchain by whoever controls it, like a token's name</span>
<span><span class="mk mk-d" aria-hidden="true"></span>Declared offchain: stated outside the chain, like a quoted article</span>
<span><span class="mk mk-p" aria-hidden="true">${CLOCK}</span>Pending verification: shown, never hidden</span>
</div>
</section>`;
}
