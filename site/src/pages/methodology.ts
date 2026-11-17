import { addrUrl, chip, esc, fig } from '../fig.ts';
import { fmtInt } from '../money.ts';
import { startedSentence } from '../tracks.ts';
import { allFormulas } from '../lists.ts';
import type { ListRows } from '../lists.ts';
import { page, url, type Ctx } from '../layout.ts';
import type { Site } from '../model.ts';

export { PERMISSIONLESS_AUTHORITY } from '../constants.ts';
import { PERMISSIONLESS_AUTHORITY, constant } from '../constants.ts';

/** A launchpad version, shown as a chip that opens its program account. `code` is the data's form (v06, v041). */
export function programChip(code: string): string {
  const p = PROGRAMS.find((x) => x.code === code);
  return p ? chip(p.id, 'address', p.v) : esc(code);
}
export const PROGRAMS: readonly { code: string; v: string; id: string; decoded: boolean }[] = [
  { code: 'v08', v: 'v0.8', id: 'moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n', decoded: true },
  { code: 'v07', v: 'v0.7', id: 'moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM', decoded: true },
  { code: 'v06', v: 'v0.6', id: 'MooNyh4CBUYEKyXVnjGYQ8mEiJDpGvJMdvrZx1iGeHV', decoded: true },
  { code: 'v05', v: 'v0.5', id: 'mooNhciQJi1LqHDmse2JPic2NqG2PXCanbE3ZYzP3qA', decoded: false },
  { code: 'v041', v: 'v0.4.1', id: 'AfJJJ5UqxhBKoE3grkKAZZsoXDE9kncbMKvqSHGsCNrE', decoded: false },
];
const SRC = 'https://github.com/metaDAOproject/programs/blob/main/programs';
// Every claim about MetaDAO's or Squads' code links the exact line at a fixed commit.
export const MD_COMMIT = '74aec758b5c8b5363b94ecce0a45bcd426c9746e';
export const SQUADS_COMMIT = '3a39735d0c56249bf2ce4b16b3229d7be87ad55f';
const ADMIN_ENQUEUE = '6awyHMshBGVjJ3ozdSJdyyDE1CTAXUwrpNMaRGMsb4sf';
const ADMIN_EXECUTE = 'CWGawadYU8CzRVBecnJymNw97H7E3ndDinV5sMzesgY2';
export const codeUrl = (file: string, line: number): string => `https://github.com/metaDAOproject/programs/blob/${MD_COMMIT}/programs/futarchy/src/instructions/${file}#L${line}`;
const code = (file: string, line: number): string => `<a class="chip" href="${codeUrl(file, line)}" rel="noopener">${file}#L${line}</a>`;
const squadsCode = (line: number): string => `<a class="chip" href="https://github.com/Squads-Protocol/v4/blob/${SQUADS_COMMIT}/programs/squads_multisig_program/src/state/spending_limit.rs#L${line}" rel="noopener">squads spending_limit.rs#L${line}</a>`;

export function methodologyPage(ctx: Ctx, site: Site): string {
  const csv = (f: string) => url(ctx, `data/${f}`);
  const permFirst = site.decoded.filter((r) => r.launchAuthority === PERMISSIONLESS_AUTHORITY && r.started).map((r) => r.started as Date).sort((a, b) => a.getTime() - b.getTime())[0];
  const example = site.companies.find((c) => c.treasury) ?? null;
  const otherAuthorities = new Set(site.real.filter((r) => r.track === 'curated').map((r) => r.launchAuthority)).size;
  const n = (v: number, what: string, rows: ListRows) => fig(fmtInt(v), { kind: 'sum', what, rows });
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
<li><b>Each token's onchain metadata</b> (its Metaplex metadata account), for the company's name and symbol. It is onchain and anyone can read it, but whoever controls the token's metadata chose it, so names are marked as declared.</li>
<li><b>Published articles</b>, only to add a project name that the onchain metadata does not give. We quote the sentence word for word, with the article's date and the day we read it, and take nothing else from it.</li>
</ul>
<p>We do not collect from websites whose terms forbid automated collection, and we never compile information about a person. Founder information appears only when founders add it themselves.</p>

<h2 id="raise">How a raise is read</h2>
<p>Every raise on the MetaDAO launchpad has a <b>launch account</b>, an address derived from the token's mint. It records the raise's terms and state: the minimum, how much investors committed, how much was raised, when it opened and closed, the team's monthly budget and who can spend it, the insider lock and the performance package. Each figure in a raise card links to that account.</p>
<p>The launchpad program has been upgraded several times and each version stores the account differently. Decoding every version with one layout gives wrong numbers, so each version is decoded with its own layout from the published code:</p>
<div class="card tblbox" style="margin:8px 0 18px"><table class="tbl" style="min-width:560px"><thead><tr><th scope="col">Version</th><th scope="col">Program</th><th scope="col">Decoded</th></tr></thead><tbody>
${PROGRAMS.map((p) => `<tr><td>${chip(p.id, 'address', p.v)}</td><td>${chip(p.id, 'address')}</td><td>${p.decoded ? '<span class="badge b-v">Yes</span>' : '<span class="badge b-p">Counted only: its code is not in the current version of the repository</span>'}</td></tr>`).join('')}
</tbody></table></div>
<p><b>Raised.</b> Version ${programChip('v06')} stores the final amount directly. Versions ${programChip('v07')} and later store the approved amount, which is the amount raised once the raise is complete. <b>Oversubscription</b> is committed divided by raised.</p>

<h2 id="tracks">Raises by launch authority</h2>
<p>Each launch account records the <b>launch authority</b>, the key that started the raise. It is the only split of raises the chain gives us. One authority, ${chip(PERMISSIONLESS_AUTHORITY, 'address')}, started its first raise on ${day(permFirst)}, the platform's own FUTARDIO token among them. It started ${startedSentence(site, 'permissionless')} We identify it as MetaDAO's permissionless platform, launched as Futardio and renamed Backable. That identification is ours, from the chain; it is not declared onchain.</p>
<p>Every other authority (${n(otherAuthorities, 'launch authorities other than the permissionless one, among real raises', { authorities: [...new Set(site.real.filter((r) => r.track === 'curated').map((r) => r.launchAuthority))] })} of them among real raises) is grouped as <b>other launch authorities</b>. We do not know who controls those keys or how their raises were chosen, so the site does not call them curated or selected. The home page lists every authority with its own counts.</p>
<p>A raise with a minimum under ${constant('min_real_raise_usd')} is treated as a <b>test launch</b> and left out of every rate and total. The <b>completion rate</b> is completed raises divided by finished raises, where finished means Complete or Refunding.</p>
<p><b>Uncertainty.</b> Each rate is shown with its ${constant('confidence')} <b>Wilson score interval</b> and the number of finished raises it rests on (n). With few raises the interval is wide. The home page's title names a direction only when the two groups' intervals do not overlap, and it never states a ratio between the rates: with these sample sizes a ratio is far too uncertain.</p>
<h2 id="categories">What a treasury is, and how each movement is classified</h2>
<p>When a raise completes, the launchpad sends most of the USDC to the DAO's treasury: a Squads multisig vault controlled by the DAO's futarchy program. We read the vault's USDC account and every transaction that ever changed its balance. Each movement goes into exactly one category:</p>
<ul>
<li><b>Launch deposit</b>: the launchpad's deposit when the raise completed. The same transaction also sends part of the raise elsewhere; each company page shows how much went where (see below).</li>
<li><b>Other inflow</b>: any later payment into the treasury. The amount and sender are onchain; what it was for is not identified yet, so these are marked pending.</li>
<li><b>Team budget</b>: a draw through the monthly spending limit set at launch (a Squads <code>SpendingLimitUse</code>).</li>
<li><b>Market vote</b>: a vault transaction that was itself the subject of a futarchy proposal that passed.</li>
<li><b>Admin key</b>: a vault transaction approved through MetaDAO's admin path, not by a vote on that transaction. Described below, with the code it rests on.</li>
<li><b>Unclassified</b>: anything else. Shown, with its instructions, until it can be classified.</li>
</ul>

<h2 id="admin-key">The admin key</h2>
<p>MetaDAO's futarchy program has an admin path next to the market vote. What follows is what the published source says at commit ${chip(MD_COMMIT, 'address', MD_COMMIT.slice(0, 7))} of <a href="https://github.com/metaDAOproject/programs" rel="noopener">metaDAOproject/programs</a>. DAOs created by earlier versions of the program may differ, and we have not checked each version.</p>
<ul>
<li>A key fixed in the code, ${chip(ADMIN_ENQUEUE, 'address')}, can queue the approval of a pending vault transaction of a DAO (${code('admin_enqueue_multisig_proposal_approval.rs', 6)}, checked at ${code('admin_enqueue_multisig_proposal_approval.rs', 82)}). On a DAO that has been liquidated, the liquidator's key takes its place (${code('admin_enqueue_multisig_proposal_approval.rs', 73)}). Nothing in this path checks a market vote.</li>
<li>Anyone can then carry out the queued approval, which approves the vault transaction as the DAO (${code('execute_multisig_proposal_approval.rs', 85)}).</li>
<li>A second fixed key, ${chip(ADMIN_EXECUTE, 'address')}, can execute an approved vault transaction (${code('admin_execute_multisig_proposal.rs', 7)}, checked at ${code('admin_execute_multisig_proposal.rs', 64)}, executed at ${code('admin_execute_multisig_proposal.rs', 89)}).</li>
<li>The DAO's multisig is created with no time lock (${code('initialize_dao.rs', 143)}), so an approved transaction can execute at once.</li>
</ul>
<p>For each movement approved this way we take the proposals on the same DAO that are marked Passed and find when each one passed: the block time of its <b>FinalizeProposal</b> transaction. We never use the time a proposal was opened. Each movement then falls into exactly one case, and its page links the proposal and its FinalizeProposal transaction:</p>
<ul>
<li><b>After a vote passed</b>: a proposal on the DAO passed before the movement, at most ${constant('admin_vote_window_days')} days earlier. The nearest one is shown.</li>
<li><b>Before the vote passed</b>: no proposal had passed yet; one that was already open passed after the movement.</li>
<li><b>Vote time not found</b>: a proposal is marked Passed, but we did not find its FinalizeProposal transaction.</li>
<li><b>No recent vote</b>: no proposal on the DAO passed in that window. <b>Against a vote</b>: the movement's own proposal did not pass.</li>
</ul>
<p><b>This is timing, not proof.</b> The chain shows which proposal passed and when. It does not tell us whether that proposal covers the exact payment; for that, read the proposal.</p>
<h2 id="budget">Team budget</h2>
<p>The team's monthly allowance is a Squads spending limit that the DAO creates at launch with the period <code>Month</code> (${code('initialize_dao.rs', 169)}), which Squads defines as ${constant('spending_limit_period_days')} days (${squadsCode(104)}). <b>Allowed at the launch limit</b> is the number of periods started since the raise times the monthly limit set at launch. A DAO can change its limit by proposal, so we also read the current limit. When it differs from the launch limit, the page says so and marks the change as pending until the transaction that changed it is linked. Draws above the launch limit are not judged while that is pending.</p>

<h2 id="reconcile">Reconciliation</h2>
<p>For each treasury we add up every movement, positive in and negative out, and compare the total with the balance read in the same scan. A treasury is shown only if they agree. Amounts are added as whole numbers of micro-USDC (USDC has six decimals), never as floating-point numbers, so no amount is lost to rounding.</p>
<p>The data keeps the slot the scan started at (shown at the top of every page, linked to its block) and, for each treasury, the slot at which its balance was read (<code>balance_slot</code> in treasury.csv). A balance on this site is the balance at that slot; the explorer shows today's.</p>

<h2 id="names">Names</h2>
<p>Two marks keep declarations apart from facts. <span class="mk mk-o" aria-hidden="true"></span> <b>Declared onchain</b>: written onchain, so anyone can read it, but chosen by whoever controls it, like a token's name in its metadata. <span class="mk mk-d" aria-hidden="true"></span> <b>Declared offchain</b>: stated outside the chain, like a sentence quoted from an article.</p>
<p>A company's name and symbol are read from its token's <b>onchain metadata</b>, the Metaplex metadata account derived from the token's mint. Each company page links that account. The metadata is set by whoever controls it, usually the team or the launchpad, so a name is a declaration, not a verified fact.</p>
<p>When an article names the project behind a token more fully than the metadata does, the page shows the article's sentence <b>word for word</b>, the publisher, the date it was published and the day we read it. The build refuses a quote unless it names the token's onchain symbol, so a quote cannot be attached to the wrong token. We do not take amounts, dates or any other fact from articles: every figure comes from the chain.</p>
<p>A token without onchain metadata is shown by its mint address, with the name marked as pending.</p>

<h2 id="gate">The publication gate</h2>
<p>A scan is scheduled twice a day, at ${constant('scan_times_utc.0')} and ${constant('scan_times_utc.1')} UTC. GitHub starts scheduled runs late on this repository, by about eight hours so far, so the two times keep at least one scan within the day. The site is rebuilt after every scan, and once a day on its own. The bar at the top of every page says when the data was scanned, says that the site rebuilt itself only when a scheduled scan started that build, and warns when the data is more than ${constant('stale_hours')} hours old; your browser checks the age again when you open the page.</p>
<p>The site is built only from data that passes every check below. If any check fails, nothing is published and the previous version stays online:</p>
<ul>
<li>every row of every file matches its schema (addresses, signatures, dates, amounts);</li>
<li>the scan reports no failed check and no decode error;</li>
<li>counts per track recomputed from the raises file equal the scan report;</li>
<li>every treasury reconciles, and every total and balance equals the exact sum of its movements, to the cent;</li>
<li>the treasury scan ran after the raise scan, on the same data;</li>
<li>any problem the scan reports is a known kind, shown on the site as "not read" and never as zero;</li>
<li>after the build, every digit on every page is a linked figure, a date, an address, a labelled rule of the method or a verbatim quote;</li>
<li>the chain is read again before publishing. For ${constant('sample_treasuries')} treasuries picked at random, the USDC account is read now; every successful transaction on it after the slot at which the scan read it is subtracted; the result must equal the balance shown, to the micro-USDC. ${constant('sample_movements')} movements picked at random are read again and must match to the micro-USDC. If the chain cannot be reached, nothing is published.</li>
</ul>

<h3 id="follow">What we follow, and what we do not</h3>
<p>We follow <b>only the USDC in the DAO's treasury vault</b> (its USDC account). The launch transaction moves the whole amount raised: part goes to the treasury, and the rest to other accounts. Each company page lists those amounts and the accounts that received them, read from the transaction's balance changes. An amount sent to an account owned by the DAO itself is called liquidity only when that same transaction runs futarchy <code>ProvideLiquidity</code>; any other recipient is shown as not identified. We do not follow those amounts afterwards, and we do not follow tokens other than USDC.</p>

<h2 id="limits">What we do not know yet</h2>
<ul>
<li>Where the USDC that left in the launch transaction to accounts other than the treasury went afterwards, and every token other than USDC.</li>
<li>What each <b>other inflow</b> was for.</li>
<li>The transaction that changed a DAO's <b>spending limit</b>, where it changed.</li>
<li>Whether each <b>admin-key movement</b> matches the proposal shown before it.</li>
<li>Raises on launchpad ${programChip('v05')} and ${programChip('v041')}, which are counted but not decoded: their code is not in the current version of MetaDAO's repository.</li>
<li>Treasuries whose USDC account is not owned by the DAO vault, shown as not read.</li>
<li>Founder history and GitHub activity, until founders claim their pages.</li>
</ul>

<h2 id="verify">Check a number yourself</h2>
<p>Every figure is a link. A figure with ${'<span class="mk mk-v" aria-hidden="true"><svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M3 8.5l3.2 3L13 4.5"></path></svg></span>'} opens the transaction or account on the <a href="${addrUrl(PERMISSIONLESS_AUTHORITY).replace(/\/address\/.*$/, '')}" rel="noopener">Solana Explorer</a>. A figure with Σ opens the list it adds up. A figure with = opens its formula in the list below. The data files are published with the site (<a href="${csv('raises.csv')}">raises.csv</a>, <a href="${csv('treasury.csv')}">treasury.csv</a>, <a href="${csv('treasury-flows.csv')}">treasury-flows.csv</a>), each company page has its own CSV of movements, and the code and every daily snapshot are on <a href="https://github.com/${ctx.repo}" rel="noopener">GitHub</a>. The decoders follow <a href="${SRC}" rel="noopener">MetaDAO's program source</a>.</p>
<h3 id="formulas">Every formula on this site</h3>
<p>A figure marked = is computed from figures that are each linked. Tapping it opens its formula here.</p>
<ul>${allFormulas().map((f) => `<li id="${f.id}">${esc(f.formula)}</li>`).join('')}</ul>

<h3 id="verify-launch">Decode a launch account yourself</h3>
<p>A figure read from a launch account opens that account in the Solana Explorer, which shows its raw bytes. To turn them into the figures shown here, run the decoder from this site's repository; it needs only Node and no keys:</p>
<p><code>node scripts/verify-launch.mjs &lt;launch account&gt;</code></p>
<p>It reads the account from Solana (a public RPC, or the one in <code>RPC_URL</code>), finds the launchpad version from the program that owns the account, decodes it with the same layout this site uses, reads the token's decimals from its mint, and prints the minimum, the amount committed and raised, the team budget and its wallets, the insider lock and the performance package. ${example ? `For example, ${esc(example.displayName)}'s launch account is ${chip(example.raise.launch, 'address')}.` : ''}</p>
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
