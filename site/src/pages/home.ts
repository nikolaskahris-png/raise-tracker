// The home page: one sentence of what the site holds, then the companies table (desktop) or one line per company (phone).
// Every number on it goes through fig(), with its source in the link and the exact amount in the link's title.
import { date, esc, fig, label } from '../fig.ts';
import { fmtCompact, fmtInt, fmtUsd, pctWhole, sum, type Micro } from '../money.ts';
import { page, url, type Ctx } from '../layout.ts';
import { displayName } from './company.ts';
import { type CodeInfo, type Company, type Site } from '../model.ts';
import { C, constant } from '../constants.ts';
import { ADMIN_CLASSES, isAdmin } from '../schema.ts';

const GH = 'https://github.com/';
const usd2 = (v: Micro) => fmtUsd(v, { decimals: 2 });

/** A tiny bar chart of commits per month from the month of the raise; the numbers are in the CSV the page links, not in the picture. */
function bars(months: readonly { month: string; commits: number }[]): string {
  const max = Math.max(1, ...months.map((m) => m.commits));
  const w = 5, gap = 2, h = 22;
  const width = months.length * (w + gap) - gap;
  const rects = months.map((m, i) => { const bh = m.commits === 0 ? 1 : Math.max(3, Math.round((m.commits / max) * h)); return `<rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${bh}" fill="#111"${m.commits === 0 ? ' opacity=".25"' : ''}></rect>`; }).join('');
  return `<svg class="spark" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Public commits per month, from the month of the raise to the day they were read">${rects}</svg>`;
}

/** What Public code says, worded as the mockup words it. `dim`: not an active repository. */
function codeText(c: Company): { html: string; dim: boolean } {
  const k: CodeInfo = c.code;
  switch (k.kind) {
    case 'active': {
      const n = k.daysAgo ?? 0;
      const src = { kind: 'formula', href: `${GH}${k.lastRepo ?? ''}/commits`, formula: 'days from the newest commit on the default branch to the day the commits were read' } as const;
      const when = n <= 1 ? fig(n === 0 ? 'today' : 'yesterday', src) : `${fig(fmtInt(n), src)} days ago`;
      return { html: `Active · last commit ${when}`, dim: false };
    }
    case 'quiet':
      return { html: k.lastCommit === null ? 'No public commits since the raise' : `No public commits in ${constant('public_code_quiet_days')} days`, dim: true };
    case 'private':
      return { html: `Private, as the team states · <a href="${esc(k.filing)}" rel="noopener">filing</a>`, dim: true };
    case 'open_declared':
      return { html: `Says open source; no repo found · <a href="${esc(k.filing)}" rel="noopener">filing</a>`, dim: true };
    case 'none':
      return { html: 'No public repo found', dim: true };
    case 'unchecked':
      return { html: 'Not checked yet', dim: true };
  }
}

const codeBars = (c: Company): string => ((c.code.kind === 'active' || c.code.kind === 'quiet') && c.code.months.length > 0 ? bars(c.code.months) : '');

export type Tag = { readonly kind: 'admin' | 'removed' | 'changed' | 'launch' | 'unclassified'; readonly html: string };

/** The On record lines that hold for this company: facts only, in a fixed order. If nothing holds, none. */
export function tagsOf(ctx: Ctx, c: Company): Tag[] {
  const t = c.treasury;
  if (!t) return [];
  const page = (anchor: string) => url(ctx, `company/${c.raise.mint}/#${anchor}`);
  const out: Tag[] = [];
  const admin = t.flows.filter((f) => isAdmin(f.cls));
  if (admin.length > 0) {
    const total = sum(ADMIN_CLASSES.map((k) => t.byClass[k]));
    out.push({ kind: 'admin', html: `<a href="${page('decisions')}">Admin-key transfer${admin.length > 1 ? 's' : ''}</a> ${fig(fmtCompact(total), { kind: 'sum', what: `${c.displayName}: movements approved with MetaDAO's admin key`, rows: { flows: admin } }, { exact: usd2(total) })}` });
  }
  const changes = t.row.limitChanges;
  if (changes.some((x) => x.action === 'removed')) out.push({ kind: 'removed', html: `<a href="${page('limit-changes')}">Spending limit removed</a>` });
  else if (changes.length > 0 || t.row.limitChanged === 'yes') out.push({ kind: 'changed', html: `<a href="${page('limit-changes')}">Spending limit changed</a>` });
  const unidentified = sum(t.row.launchRecipients.filter((x) => x.owner !== c.raise.dao).map((x) => x.amount));
  if (unidentified > 0n) out.push({ kind: 'launch', html: `${fig(fmtCompact(unidentified), { kind: 'tx', signature: t.row.launchSignature }, { exact: usd2(unidentified) })} <a href="${page('launch')}">at launch</a> to unidentified accounts` });
  if (t.byClass.other_out > 0n) {
    out.push({ kind: 'unclassified', html: `<a href="${page('decisions')}">Unclassified movement</a> ${fig(fmtCompact(t.byClass.other_out), { kind: 'sum', what: `${c.displayName}: movements not classified yet`, rows: { flows: t.flows.filter((f) => f.cls === 'other_out') } }, { exact: usd2(t.byClass.other_out) })}` });
  }
  return out;
}

/**
 * How long the balance lasts at the monthly limit, in words: "treasury empty", "no limit", "under 1 month", "≈ N months",
 * "over 5 years" (more than the cap in constants.json). The phrase with a number in it is the figure: its formula is on the Methodology page.
 */
export function runway(ctx: Ctx, t: NonNullable<Company['treasury']>): string {
  const removed = t.row.limitChanges.some((x) => x.action === 'removed');
  const now = t.row.spendingLimitNow;
  if (t.net <= 0n) return 'treasury empty';
  if (removed || now === null || now <= 0n) return 'no limit';
  const months = t.net / now; // whole months, rounded down
  const text = months < 1n ? 'under 1 month' : months > BigInt(C.runway_cap_months) ? 'over 5 years' : `≈ ${months} month${months === 1n ? '' : 's'}`;
  return fig(text, { kind: 'formula', href: url(ctx, 'methodology/#budget'), formula: 'treasury balance / monthly team limit, rounded down' });
}

function leftCell(ctx: Ctx, c: Company): { top: string; sub: string; bar: string; sort: string } {
  const r = c.raise, t = c.treasury;
  if (!t) return { top: '<span class="muted">not read</span>', sub: '', bar: '', sort: '-1' };
  const top = fig(fmtCompact(t.net), { kind: 'account', address: t.row.usdcAccount }, { exact: usd2(t.net) });
  const more = r.raised !== null && t.net > r.raised;
  const sub = r.raised === null || r.raised <= 0n ? '' : more ? 'more than raised' : fig(pctWhole(t.net, r.raised), { kind: 'formula', href: url(ctx, 'methodology/#categories'), formula: 'treasury balance / amount raised' });
  const width = r.raised === null || r.raised <= 0n ? 0 : more ? 100 : Number((t.net * 100n) / r.raised);
  return { top, sub, bar: `<div class="lbar"><i style="width:${width}%"></i></div>`, sort: t.net.toString() };
}

function limitCell(ctx: Ctx, t: NonNullable<Company['treasury']>): { html: string; sort: string } {
  const removed = t.row.limitChanges.some((x) => x.action === 'removed');
  const now = t.row.spendingLimitNow;
  const main = !removed && now !== null && t.row.spendingLimitAccount
    ? `${fig(fmtCompact(now), { kind: 'account', address: t.row.spendingLimitAccount }, { exact: usd2(now) })}<span class="muted"> / month</span>` : '—';
  return { html: `<div>${main}</div><div class="sub">${runway(ctx, t)}</div>`, sort: !removed && now !== null ? now.toString() : '-1' };
}

const trackOf = (c: Company): string => (c.raise.track === 'permissionless' ? 'permissionless' : 'curated');

function nameBits(c: Company): { tag: string; sub: string; when: string } {
  const r = c.raise;
  const tag = c.name.kind === 'none' ? ' <span class="badge">Name pending</span>' : c.name.press ? ' <span class="badge">Project name quoted</span>' : '';
  const sub = c.name.kind === 'onchain' ? c.name.symbol : `${r.mint.slice(0, 8)}…`;
  const w = r.completed ?? r.closed ?? r.started;
  return { tag, sub, when: w ? date(w, 'month') : '' };
}

function companyRow(ctx: Ctx, c: Company): string {
  const r = c.raise, t = c.treasury;
  const href = url(ctx, `company/${r.mint}/`);
  const { tag, sub, when } = nameBits(c);
  const left = leftCell(ctx, c);
  const lim = t ? limitCell(ctx, t) : { html: '<div>—</div>', sort: '-1' };
  const code = codeText(c);
  const tags = tagsOf(ctx, c);
  const codeSort = c.code.kind === 'active' || c.code.kind === 'quiet' ? String(c.code.lastCommit?.getTime() ?? 0) : '-1';
  const raised = r.raised === null ? '—' : fig(fmtCompact(r.raised), { kind: 'account', address: r.launch }, { exact: usd2(r.raised) });
  return `<tr data-track="${trackOf(c)}" data-search="${esc(`${c.displayName} ${sub}`.toLowerCase())}">
<td class="co" data-v="${esc(c.displayName.toLowerCase())}"><a href="${href}" class="coname">${displayName(c)}</a>${tag}<div class="sub"><span class="mono">${label(sub, `Ticker or token mint ${r.mint}`)}</span>${when ? ` · raised ${when}` : ''}</div></td>
<td class="r num" data-v="${(r.raised ?? 0n).toString()}"><div class="v">${raised}</div></td>
<td class="num" data-v="${left.sort}"><div>${left.top} <span class="muted" style="font-size:12px">${left.sub}</span></div>${left.bar}</td>
<td class="num" data-v="${lim.sort}">${lim.html}</td>
<td data-v="${codeSort}"><div class="code-v${code.dim ? ' dim' : ''}">${code.html}</div>${codeBars(c)}</td>
<td class="rec">${tags.map((x) => `<div>${x.html}</div>`).join('')}</td>
</tr>`;
}

const sortBtn = (text: string, num: boolean) => `<th scope="col" class="${num ? 'r ' : ''}sortable" aria-sort="none"><button type="button" class="sortbtn">${text}</button></th>`;

function table(ctx: Ctx, cs: readonly Company[]): string {
  return `<div class="tblbox cotbl-d"><table class="tbl cotbl" id="cotbl"><thead><tr>${sortBtn('Company', false)}${sortBtn('Raised', true)}${sortBtn('Left in treasury', false)}${sortBtn('Team can spend', false)}${sortBtn('Public code', false)}<th scope="col">On record</th></tr></thead><tbody>${cs.map((c) => companyRow(ctx, c)).join('')}</tbody></table></div>`;
}

/** The phone's version: one line per company, opening below on tap with <details>, no JavaScript. */
function list(ctx: Ctx, cs: readonly Company[]): string {
  return `<div class="colist" id="colist">${cs.map((c) => {
    const r = c.raise, t = c.treasury;
    const { tag, sub, when } = nameBits(c);
    const left = leftCell(ctx, c);
    const code = codeText(c);
    const tags = tagsOf(ctx, c);
    const raised = r.raised === null ? '—' : fig(fmtCompact(r.raised), { kind: 'account', address: r.launch }, { exact: usd2(r.raised) });
    const lim = t ? limitCell(ctx, t).html : '<div>—</div>';
    return `<details data-track="${trackOf(c)}" data-search="${esc(`${c.displayName} ${sub}`.toLowerCase())}">
<summary><div class="l"><div class="nm">${displayName(c)}${tag}</div><div class="st">${code.html.replace(/ · <a [^>]*>filing<\/a>/, '')}</div></div><div class="rt"><div class="a">${raised}</div><div class="b">${left.top} left</div></div></summary>
<div class="more">${left.bar}
<dl><div><dt>Raised</dt><dd>${raised}<div class="sub"><span class="mono">${label(sub, `Ticker or token mint ${r.mint}`)}</span>${when ? ` · raised ${when}` : ''}</div></dd></div><div><dt>Left in treasury</dt><dd>${left.top} <span class="muted">${left.sub}</span></dd></div>
<div><dt>Team can spend</dt><dd>${lim}</dd></div><div><dt>Public code</dt><dd>${code.html}${codeBars(c)}</dd></div></dl>
${tags.length ? `<div class="recs"><div class="eyebrow" style="margin-bottom:4px">On record</div>${tags.map((x) => `<div>${x.html}</div>`).join('')}</div>` : ''}
<a class="open" href="${url(ctx, `company/${r.mint}/`)}">Open ${label(c.displayName, 'Company name')}’s page →</a></div>
</details>`;
  }).join('')}</div>`;
}

/** Search and column sorting. Without JavaScript the table is still there, sorted by Raised; the search box stays hidden. */
const TABLE_JS = `<script>(function(){var tb=document.getElementById('cotbl');if(!tb)return;var body=tb.tBodies[0];var q=document.getElementById('q');var s=document.getElementById('qbox');
function sortBy(i,dir,num){var rows=[].slice.call(body.rows);rows.sort(function(a,b){var x=a.cells[i].getAttribute('data-v'),y=b.cells[i].getAttribute('data-v');var c=num?(Number(x)-Number(y)):x.localeCompare(y);return dir*(c||a.cells[0].getAttribute('data-v').localeCompare(b.cells[0].getAttribute('data-v')));});rows.forEach(function(r){body.appendChild(r);});}
[].forEach.call(tb.querySelectorAll('.sortbtn'),function(b,i){b.addEventListener('click',function(){var th=b.parentNode;var d=th.getAttribute('aria-sort')==='descending'?1:-1;if(th.getAttribute('aria-sort')==='none'&&i===0)d=1;[].forEach.call(tb.querySelectorAll('th'),function(h){h.setAttribute('aria-sort','none');});th.setAttribute('aria-sort',d===1?'ascending':'descending');sortBy(i,d,i>0&&i<5);});});
if(q){s.hidden=false;q.hidden=false;q.addEventListener('input',function(){var v=q.value.trim().toLowerCase();[].forEach.call(document.querySelectorAll('[data-search]'),function(r){r.classList.toggle('nomatch',v!==''&&r.getAttribute('data-search').indexOf(v)<0);});});}
})();</script>`;

export function homePage(ctx: Ctx, site: Site): string {
  const meth = (a: string) => url(ctx, `methodology/#${a}`);
  const cs = site.companies;
  const read = cs.filter((c) => c.treasury);
  const notRead = cs.filter((c) => !c.treasury);
  const raised = sum(cs.map((c) => c.raise.raised ?? 0n));
  const left = sum(read.map((c) => c.treasury?.net ?? 0n));
  const count = fig(fmtInt(cs.length), { kind: 'sum', what: 'completed raises with a DAO', rows: { companies: cs } });
  const totalRaised = fig(fmtCompact(raised), { kind: 'sum', what: 'completed raises with a DAO', rows: { raises: cs.map((c) => c.raise) } }, { exact: usd2(raised) });
  const totalLeft = fig(fmtCompact(left), { kind: 'sum', what: 'treasuries read', rows: { companies: read } }, { exact: usd2(left) });
  const readFig = fig(fmtInt(read.length), { kind: 'sum', what: 'treasuries read', rows: { companies: read } });
  const where = notRead.length === 0 ? 'their treasuries' : `the ${readFig} treasuries we could read`;
  const unread = notRead.length === 0 ? '' : ` ${fig(fmtInt(notRead.length), { kind: 'sum', what: 'treasuries not read', rows: { companies: notRead } })} could not be read in the latest scan.`;
  const filters = `<div class="filters"><div class="tabbar" role="group" aria-label="Launch authority"><label for="t-all">All ${count}</label><label for="t-perm">Permissionless</label><label for="t-not">Not permissionless</label></div>
<label class="srch" id="qbox" hidden>Find <input id="q" type="search" placeholder="Name or ticker" autocomplete="off" hidden></label></div>`;
  const body = `
<section class="wrap"><div class="hero">
<h1>What teams raised on MetaDAO, what they have left, and what their public code shows</h1>
<p>${count} raises through MetaDAO's launchpad. Together they raised ${totalRaised}; ${totalLeft} is still in ${where}.${unread}</p>
</div></section>
<section id="companies" class="wrap tabs" style="padding-bottom:8px">
<input type="radio" name="trk" id="t-all" checked><input type="radio" name="trk" id="t-perm"><input type="radio" name="trk" id="t-not">
<div class="tabhead">${filters}</div>
<h2 class="sr">Companies</h2>
<div class="panels">${table(ctx, cs)}${list(ctx, cs)}</div>
<div class="notes2">
<p><b>Public code.</b> “No public repo found” does not mean no work: some teams keep their code private. Bars show public commits per month since the raise. <a href="${meth('public-code')}">How it is counted →</a></p>
<p><b>Not in this table:</b> MetaDAO, Omnipair, Sanctum and Flash.Trade. They have a MetaDAO DAO but no launchpad raise we can read. <a href="${meth('not-in-table')}">How we check →</a></p>
</div>
${TABLE_JS}
</section>`;
  return page(ctx, { title: 'raise-tracker: what teams raised on MetaDAO, and where every treasury dollar went', description: 'What teams raised on MetaDAO, what they have left in their treasuries and what their public code shows. Every figure links to its source.', active: 'companies', body });
}
