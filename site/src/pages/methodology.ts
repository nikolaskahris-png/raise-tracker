import { addrUrl, chip, fig, label } from '../fig.ts';
import { fmtInt } from '../money.ts';
import { page, url, type Ctx } from '../layout.ts';
import type { Site } from '../model.ts';
import { ADMIN_KEYS } from './company.ts';

export const PERMISSIONLESS_AUTHORITY = 'LRrTQLqFzAPxjschuAKQAqH1XHBuBgHqwhybENStARt';
export const PROGRAMS: readonly { v: string; id: string; decoded: boolean }[] = [
  { v: 'v0.8', id: 'moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n', decoded: true },
  { v: 'v0.7', id: 'moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM', decoded: true },
  { v: 'v0.6', id: 'MooNyh4CBUYEKyXVnjGYQ8mEiJDpGvJMdvrZx1iGeHV', decoded: true },
  { v: 'v0.5', id: 'mooNhciQJi1LqHDmse2JPic2NqG2PXCanbE3ZYzP3qA', decoded: false },
  { v: 'v0.4.1', id: 'AfJJJ5UqxhBKoE3grkKAZZsoXDE9kncbMKvqSHGsCNrE', decoded: false },
];
const SRC = 'https://github.com/metaDAOproject/programs/blob/main/programs';

export function methodologyPage(ctx: Ctx, site: Site): string {
  const csv = (f: string) => url(ctx, `data/${f}`);
  const permCount = site.decoded.filter((r) => r.launchAuthority === PERMISSIONLESS_AUTHORITY).length;
  const permFirst = site.decoded.filter((r) => r.launchAuthority === PERMISSIONLESS_AUTHORITY && r.started).map((r) => r.started as Date).sort((a, b) => a.getTime() - b.getTime())[0];
  const curatedAuthorities = new Set(site.real.filter((r) => r.track === 'curated').map((r) => r.launchAuthority)).size;
  const n = (v: number, what: string, file = 'raises.csv') => fig(fmtInt(v), { kind: 'sum', href: csv(file), what });
  const L = (t: string) => label(t, 'Fixed rule of the method');
  const day = (d: Date | undefined) => (d ? `<time datetime="${d.toISOString()}">${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}</time>` : '');

  const body = `
<section class="wrap" style="padding-top:64px">
<div class="eyebrow" style="margin-bottom:16px">Methodology</div>
<h1 style="font-size:clamp(34px,5vw,56px);line-height:1.05;font-weight:600;max-width:880px">How every number is read, checked and published.</h1>
<p class="soft" style="font-size:18px;line-height:1.6;max-width:720px;margin-top:20px">Every figure on this site comes from the Solana blockchain, from a list of records that are each on the blockchain, or from a formula over those. Nothing is typed in by hand. This page says exactly where each kind of number comes from, what we do not know yet, and how to check any number yourself.</p>
</section>

<section class="wrap prose" style="padding-top:8px">

<h2 id="sources">Sources</h2>
<ul>
<li><b>Solana mainnet</b>, read through a standard RPC provider. Every raise, balance and movement comes from here.</li>
<li><b>MetaDAO's open-source programs</b> (<a href="https://github.com/metaDAOproject/programs" rel="noopener">github.com/metaDAOproject/programs</a>). We decode accounts with the field layouts in that code, one layout per program version.</li>
<li><b>MetaDAO's public market API</b>, only for a token's name and ticker. Names are marked as declared, because they are not onchain.</li>
<li><b>Press reports</b>, only for the names of tokens that are not in that API. Each such page links its source and says how it was matched to the chain.</li>
</ul>
<p>We do not collect from websites whose terms forbid automated collection, and we never compile information about a person. Founder information appears only when founders add it themselves.</p>

<h2 id="raise">How a raise is read</h2>
<p>Every raise on the MetaDAO launchpad has a <b>launch account</b>, an address derived from the token's mint. It records the raise's terms and state: the minimum, how much investors committed, how much was raised, when it opened and closed, the team's monthly budget and who can spend it, the insider lock and the performance package. Each figure in a raise card links to that account.</p>
<p>The launchpad program has been upgraded several times and each version stores the account differently. Decoding every version with one layout gives wrong numbers, so each version is decoded with its own layout from the published code:</p>
<div class="card tblbox" style="margin:8px 0 18px"><table class="tbl" style="min-width:560px"><thead><tr><th scope="col">Version</th><th scope="col">Program</th><th scope="col">Decoded</th></tr></thead><tbody>
${PROGRAMS.map((p) => `<tr><td>${label(p.v, 'Launchpad version')}</td><td>${chip(p.id, 'address')}</td><td>${p.decoded ? '<span class="badge b-v">Yes</span>' : '<span class="badge b-p">Counted only: source not published</span>'}</td></tr>`).join('')}
</tbody></table></div>
<p><b>Raised.</b> Version ${L('v0.6')} stores the final amount directly. Versions ${L('v0.7')} and later store the approved amount, which is the amount raised once the raise is complete. <b>Oversubscription</b> is committed divided by raised.</p>

<h2 id="tracks">Curated and permissionless raises</h2>
<p>Each launch account records the <b>launch authority</b>, the key that started the raise. One authority, ${chip(PERMISSIONLESS_AUTHORITY, 'address')}, started ${n(permCount, 'raises started by the permissionless authority')} raises from ${day(permFirst)} onward, including the platform's own FUTARDIO token. We identify it as MetaDAO's permissionless platform, launched as Futardio and renamed Backable. That identification is ours, from the chain; it is not declared onchain. Every other authority (${n(curatedAuthorities, 'distinct launch authorities of curated raises')} of them among real raises) counts as <b>curated</b>.</p>
<p>A raise with a minimum under ${L('$10,000')} is treated as a <b>test launch</b> and left out of every rate and total. The <b>completion rate</b> is completed raises divided by finished raises, where finished means Complete or Refunding.</p>

<h2 id="categories">What a treasury is, and how each movement is classified</h2>
<p>When a raise completes, the launchpad sends most of the USDC to the DAO's treasury: a Squads multisig vault controlled by the DAO's futarchy program. We read the vault's USDC account and every transaction that ever changed its balance. Each movement goes into exactly one category:</p>
<ul>
<li><b>Launch deposit</b>: the launchpad's deposit when the raise completed.</li>
<li><b>Other inflow</b>: any later payment into the treasury. The amount and sender are onchain; what it was for is not identified yet, so these are marked pending.</li>
<li><b>Team budget</b>: a draw through the monthly spending limit set at launch (a Squads <code>SpendingLimitUse</code>).</li>
<li><b>Market vote</b>: a vault transaction that was itself the subject of a futarchy proposal that passed.</li>
<li><b>Admin key</b>: a vault transaction approved through MetaDAO's admin path, described below.</li>
<li><b>Unclassified</b>: anything else. Shown, with its instructions, until it can be classified.</li>
</ul>

<h2 id="admin-key">The admin key</h2>
<p>MetaDAO's futarchy program has an admin path. A MetaDAO-controlled key can approve a vault transaction of any DAO without a market vote, and the vault applies no time lock. The keys are written in the program's code:</p>
<ul>
${Object.entries(ADMIN_KEYS).map(([k, v]) => `<li>${chip(k, 'address')} ${v}</li>`).join('')}
</ul>
<p>For every movement approved this way we show the most recent proposal that passed on the same DAO in the ${L('60')} days before it, and how many days earlier it was enqueued. <b>This is context, not proof.</b> It tells you which decision to read; it does not prove that the proposal approved that exact amount. Two cases are confirmed by press: Ranger Finance's liquidation in <time datetime="2026-03">March 2026</time> and ZKFG's proposal ${label('008', 'Proposal name used in the press')}. A movement with no passed proposal in that window, or whose own proposal did not pass, is labelled as such and listed first.</p>

<h2 id="budget">Team budget</h2>
<p>The team's monthly allowance is a Squads spending limit with a ${L('30-day')} period. <b>Allowed at the launch limit</b> is the number of periods started since the raise times the monthly limit set at launch. A DAO can change its limit by proposal, so we also read the current limit. When it differs from the launch limit, the page says so and marks the change as pending until the transaction that changed it is linked. Draws above the launch limit are not judged while that is pending.</p>

<h2 id="reconcile">Reconciliation</h2>
<p>For each treasury we add up every movement, positive in and negative out, and compare the total with the balance read in the same scan. A treasury is shown only if they agree. Amounts are added as whole numbers of micro-USDC (USDC has six decimals), never as floating-point numbers, so no amount is lost to rounding.</p>

<h2 id="names">Names</h2>
<p>A token's name comes from MetaDAO's market API when it is listed there. Tokens that no longer trade are not listed; for those, a name is taken from a press report only when the chain matches the report (for example the exact amount and date of a payout), and the page shows the source and the match. Otherwise the company is shown by its mint address with the name pending.</p>

<h2 id="gate">The publication gate</h2>
<p>The data is rescanned every day. The site is rebuilt only from data that passes every check below. If any check fails, nothing is published and the previous version stays online:</p>
<ul>
<li>every row of every file matches its schema (addresses, signatures, dates, amounts);</li>
<li>the scan reports no failed check and no decode error;</li>
<li>counts per track recomputed from the raises file equal the scan report;</li>
<li>every treasury reconciles, and every total and balance equals the exact sum of its movements, to the cent;</li>
<li>the treasury scan ran after the raise scan, on the same data;</li>
<li>any problem the scan reports is a known kind, shown on the site as "not read" and never as zero;</li>
<li>after the build, every number on every page is a linked figure, and a sample of balances and transactions is re-read from the chain and compared.</li>
</ul>

<h2 id="limits">What we do not know yet</h2>
<ul>
<li>What each <b>other inflow</b> was for.</li>
<li>The transaction that changed a DAO's <b>spending limit</b>, where it changed.</li>
<li>Whether each <b>admin-key movement</b> matches the proposal shown before it.</li>
<li>Raises on launchpad ${L('v0.5')} and ${L('v0.4.1')}, which are counted but not decoded.</li>
<li>Treasuries whose USDC account is not owned by the DAO vault, shown as not read.</li>
<li>Founder history and GitHub activity, until founders claim their pages.</li>
</ul>

<h2 id="verify">Check a number yourself</h2>
<p>Every figure is a link. A figure with ${'<span class="mk mk-v" aria-hidden="true"><svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M3 8.5l3.2 3L13 4.5"></path></svg></span>'} opens the transaction or account on the <a href="${addrUrl(PERMISSIONLESS_AUTHORITY).replace(/\/address\/.*$/, '')}" rel="noopener">Solana Explorer</a>. A figure with Σ opens the list it adds up. A figure with = shows its formula when you hover it. The data files are published with the site (<a href="${csv('raises.csv')}">raises.csv</a>, <a href="${csv('treasury.csv')}">treasury.csv</a>, <a href="${csv('treasury-flows.csv')}">treasury-flows.csv</a>), each company page has its own CSV of movements, and the code and every daily snapshot are on <a href="https://github.com/${ctx.repo}" rel="noopener">GitHub</a>. The decoders follow <a href="${SRC}" rel="noopener">MetaDAO's program source</a>.</p>
</section>`;
  return page(ctx, { title: 'Methodology · raise-tracker', description: 'Where every number on raise-tracker comes from, how it is checked before it is published, and what is not known yet.', active: 'methodology', body });
}

export function notFoundPage(ctx: Ctx): string {
  return page(ctx, {
    title: 'Not found · raise-tracker',
    description: 'Page not found.',
    body: `<section class="wrap" style="padding:120px 32px 80px"><div class="eyebrow">Not found</div><h1 style="font-size:44px;font-weight:600;margin-top:12px">This page does not exist.</h1><p class="soft" style="font-size:17px;margin-top:14px">A company page is addressed by its token mint. <a href="${url(ctx, '#companies')}">See all companies</a>.</p></section>`,
  });
}
