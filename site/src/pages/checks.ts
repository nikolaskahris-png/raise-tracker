// The five check figures and the full legend of marks. They open the Methodology page: the home page starts with the companies.
import { fig } from '../fig.ts';
import { fmtInt, fmtUsd, sum } from '../money.ts';
import type { Site } from '../model.ts';


export function checksSection(site: Site): string {
  const launchAccounts = site.inputs.raises.length;
  const withTreasury = site.companies.filter((c) => c.treasury);
  const completedReal = site.real.filter((r) => r.state === 'Complete');
  const raisedReal = sum(completedReal.map((r) => r.raised ?? 0n));
  const reconciled = withTreasury.filter((c) => c.treasury?.row.reconciles).length;
  return `<section id="checks" class="wrap" style="padding-top:32px;padding-bottom:8px">
<div class="eyebrow" style="margin-bottom:12px">The checks behind the figures</div>
<div class="stats">
<div class="stat"><div class="stat-l">Raises decoded from the chain</div><div class="stat-v">${fig(fmtInt(site.decoded.length), { kind: 'sum', what: 'launch accounts decoded from the chain', rows: { raises: site.decoded } })}</div><div class="stat-n">of ${fig(fmtInt(launchAccounts), { kind: 'sum', what: 'launch accounts found onchain', rows: { raises: site.inputs.raises } })} launch accounts</div></div>
<div class="stat"><div class="stat-l">Raised in completed raises</div><div class="stat-v">${fig(fmtUsd(raisedReal), { kind: 'sum', what: 'completed raises, test launches excluded', rows: { raises: completedReal } })}</div><div class="stat-n">${fig(fmtInt(completedReal.length), { kind: 'sum', what: 'completed raises, test launches excluded', rows: { raises: completedReal } })} raises, test launches excluded</div></div>
<div class="stat"><div class="stat-l">Treasury movements, each linked</div><div class="stat-v">${fig(fmtInt(site.allFlows.length), { kind: 'sum', what: 'every treasury movement', rows: { flows: site.allFlows } })}</div><div class="stat-n">USDC in and out of ${fig(fmtInt(withTreasury.length), { kind: 'sum', what: 'treasuries read', rows: { companies: withTreasury } })} treasuries</div></div>
<div class="stat"><div class="stat-l">Treasuries read and reconciled</div><div class="stat-v">${fig(fmtInt(withTreasury.length), { kind: 'sum', what: 'treasuries read', rows: { companies: withTreasury } })} <span style="font-size:0.55em;font-weight:500">of</span> ${fig(fmtInt(site.companies.length), { kind: 'sum', what: 'completed raises with a DAO', rows: { companies: site.companies } })}</div><div class="stat-n">read; ${reconciled === withTreasury.length ? 'all' : ''} ${fig(fmtInt(reconciled), { kind: 'sum', what: 'treasuries whose history adds up to their balance at the scan', rows: { companies: withTreasury.filter((c) => c.treasury?.row.reconciles) } })} add up to the cent</div></div>
</div>
<p class="soft" style="margin-top:16px;font-size:14px;max-width:760px">Every number opens its source. A figure that opens a transaction or an account is read from that transaction or account; one that opens a list is a total of the rows in it; one that opens a formula is calculated. Its title says which. A rounded amount in a table has its exact amount in the title and on the company's page. Amounts onchain whose purpose is not identified yet are marked as such, never hidden.</p>
</section>`;
}
