import { chip, date, duration, fig, label, esc, txUrl } from '../fig.ts';
import { fmtInt, fmtUsd, pct, sum, type Micro } from '../money.ts';
import { page, url, type Ctx } from '../layout.ts';
import { displayName } from './company.ts';
import { MIN_REAL_RAISE, type CodeInfo, type Company, type Site } from '../model.ts';
import { byAuthority, startedSentence, trackHeadline, trackOutcomes, TRACK_NAME, TRACK_SHORT } from '../tracks.ts';
import { pct1 } from '../stats.ts';
import type { ListRows } from '../lists.ts';

const CLASS_WORDS: Partial<Record<string, string>> = { team_budget: 'team budget draws', market_approved: 'movements approved by market vote' };
import { constant } from '../constants.ts';
import { PROGRAMS, programChip } from './methodology.ts';
import { CLOCK } from './checks.ts';
import { ADMIN_CLASSES, isAdmin, type FlowClass } from '../schema.ts';

const COLORS = { team: '#2A44E8', market: '#0F1A4A', admin: '#F08C2B', left: '#C9D1F5', other: '#8A8F9C' } as const;
const CHECK = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"></path></svg>';

export type Totals = {
  readonly totalIn: Micro; readonly team: Micro; readonly market: Micro; readonly admin: Micro; readonly liquidation: Micro; readonly otherOut: Micro; readonly left: Micro; readonly inflowOther: Micro;
};

export function totals(site: Site): Totals {
  const ts = site.companies.flatMap((c) => (c.treasury ? [c.treasury] : []));
  const s = (k: keyof (typeof ts)[number]['byClass']) => sum(ts.map((t) => t.byClass[k]));
  return {
    totalIn: sum(ts.map((t) => t.totalIn)), team: s('team_budget'), market: s('market_approved'), admin: sum(ADMIN_CLASSES.map((k) => s(k))), liquidation: s('liquidation'), otherOut: s('other_out'),
    left: sum(ts.map((t) => t.net)), inflowOther: s('inflow_other'),
  };
}

const share = (part: Micro, whole: Micro): string => (whole === 0n ? '0%' : pct(part, whole));

function bar(parts: { v: Micro; color: string }[], whole: Micro, cls = 'bar'): string {
  if (whole === 0n) return `<div class="${cls}"></div>`;
  return `<div class="${cls}">${parts.filter((p) => p.v > 0n).map((p) => `<div style="width:${share(p.v, whole)};background:${p.color}"></div>`).join('')}</div>`;
}


const GH = 'https://github.com/';

/** A tiny bar chart of commits per month from the month of the raise; the numbers are in the CSV the page links, not in the picture. */
function spark(months: readonly { month: string; commits: number }[]): string {
  const max = Math.max(1, ...months.map((m) => m.commits));
  const w = 5, gap = 2, h = 20;
  const width = months.length * (w + gap) - gap;
  const bars = months.map((m, i) => { const bh = m.commits === 0 ? 1 : Math.max(2, Math.round((m.commits / max) * h)); return `<rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${bh}" rx="1" fill="${m.commits === 0 ? '#C9CDD6' : '#2A44E8'}"></rect>`; }).join('');
  return `<svg class="spark" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Public commits per month, from the month of the raise to the day they were read">${bars}</svg>`;
}

/** The four values of Public code (plus "not checked yet" for a company nobody has looked up), worded as the plan says. */
function codeCell(c: Company): string {
  const k: CodeInfo = c.code;
  switch (k.kind) {
    case 'active': {
      const n = k.daysAgo ?? 0;
      const src = { kind: 'formula', href: `${GH}${k.lastRepo ?? ''}/commits`, formula: 'days from the newest commit on the default branch to the day the commits were read' } as const;
      return `<div class="code-v"><b>Active</b> · last commit ${fig(fmtInt(n), src)} day${n === 1 ? '' : 's'} ago</div>${spark(k.months)}`;
    }
    case 'quiet':
      return `<div class="code-v"><b>No public commits in ${constant('public_code_quiet_days')} days</b></div>`;
    case 'private':
      return `<div class="code-v"><b>Private, as the team states</b> <a href="${esc(k.filing)}" rel="noopener">filing</a></div>`;
    case 'open_declared':
      return `<div class="code-v"><b>Team states open source; no repository found</b> <a href="${esc(k.filing)}" rel="noopener">filing</a></div>`;
    case 'none':
      return `<div class="code-v"><b>No public repository found</b></div>`;
    case 'unchecked':
      return `<div class="code-v muted">Not checked yet</div>`;
  }
}

type Tag = { readonly kind: 'admin' | 'removed' | 'changed' | 'launch' | 'unclassified'; readonly html: string };

/** The On record tags that hold for this company: facts only, in a fixed order. If nothing holds, no tags. */
export function tagsOf(ctx: Ctx, c: Company): Tag[] {
  const t = c.treasury;
  if (!t) return [];
  const page = (anchor: string) => url(ctx, `company/${c.raise.mint}/#${anchor}`);
  const out: Tag[] = [];
  const admin = t.flows.filter((f) => isAdmin(f.cls));
  if (admin.length > 0) {
    const rows = { flows: admin };
    const what = `${c.displayName}: movements approved with MetaDAO's admin key`;
    out.push({ kind: 'admin', html: `<a href="${page('decisions')}">Admin-key transfer</a>: ${fig(fmtUsd(sum(ADMIN_CLASSES.map((k) => t.byClass[k]))), { kind: 'sum', what, rows })} (${fig(fmtInt(admin.length), { kind: 'sum', what, rows })})` });
  }
  const changes = t.row.limitChanges;
  if (changes.some((x) => x.action === 'removed')) out.push({ kind: 'removed', html: `<a href="${page('limit-changes')}">Spending limit removed</a>` });
  else if (changes.length > 0 || t.row.limitChanged === 'yes') out.push({ kind: 'changed', html: `<a href="${page('limit-changes')}">Spending limit changed</a>` });
  const unidentified = sum(t.row.launchRecipients.filter((x) => x.owner !== c.raise.dao).map((x) => x.amount));
  if (unidentified > 0n) out.push({ kind: 'launch', html: `<a href="${page('launch')}">At launch</a>, ${fig(fmtUsd(unidentified), { kind: 'tx', signature: t.row.launchSignature })} went to accounts not identified` });
  if (t.byClass.other_out > 0n) {
    const rows = { flows: t.flows.filter((f) => f.cls === 'other_out') };
    out.push({ kind: 'unclassified', html: `<a href="${page('decisions')}">Unclassified movement</a>: ${fig(fmtUsd(t.byClass.other_out), { kind: 'sum', what: `${c.displayName}: movements not classified yet`, rows })}` });
  }
  return out;
}

/** The limit column: the limit now (or "No limit (removed)"), and how long the balance lasts at it, or why that is not said. */
function limitCell(ctx: Ctx, t: NonNullable<Company['treasury']>): { html: string; sort: string } {
  const removed = t.row.limitChanges.some((x) => x.action === 'removed');
  const now = t.row.spendingLimitNow;
  let top: string, sort = '-1';
  if (removed) top = '<b>No limit (removed)</b>';
  else if (now !== null && t.row.spendingLimitAccount) { top = fig(fmtUsd(now), { kind: 'account', address: t.row.spendingLimitAccount }); sort = now.toString(); }
  else top = '<span class="muted">Limit not read</span>';
  let second = '';
  if (t.net <= 0n) second = 'Treasury empty';
  else if (!removed && now !== null && now > 0n) second = `≈ ${fig(fmtInt(t.net / now), { kind: 'formula', href: url(ctx, 'methodology/#budget'), formula: 'treasury balance / monthly team limit, rounded down' })} months at this limit`;
  return { html: `<div class="v">${top}</div>${second ? `<div class="sub">${second}</div>` : ''}`, sort };
}

function companyRow(ctx: Ctx, c: Company): string {
  const r = c.raise;
  const href = url(ctx, `company/${r.mint}/`);
  const nameTag = c.name.kind === 'none' ? ' <span class="badge b-p" style="height:20px;font-size:11px">Name pending</span>' : c.name.press ? ' <span class="badge b-d" style="height:20px;font-size:11px"><span class="mk mk-d" aria-hidden="true"></span>Project name quoted</span>' : '';
  const sub = c.name.kind === 'onchain' ? c.name.symbol : `${r.mint.slice(0, 8)}…`;
  const when = r.completed ?? r.closed ?? r.started;
  const raised = r.raised === null ? '—' : fig(fmtUsd(r.raised), { kind: 'account', address: r.launch });
  const t = c.treasury;
  const tags = tagsOf(ctx, c);
  const lim = t ? limitCell(ctx, t) : null;
  const left = t
    ? `<div class="v">${fig(fmtUsd(t.net, { decimals: 2 }), { kind: 'account', address: t.row.usdcAccount })}</div>${r.raised !== null && r.raised > 0n ? `<div class="sub">${fig(pct(t.net, r.raised), { kind: 'formula', href: url(ctx, 'methodology/#categories'), formula: 'treasury balance / amount raised' })} of the raise</div>` : ''}`
    : '<div class="v muted">Not read</div>';
  const codeSort = c.code.kind === 'active' || c.code.kind === 'quiet' ? String(c.code.lastCommit?.getTime() ?? 0) : '-1';
  return `<tr data-track="${r.track}" data-search="${esc(`${c.displayName} ${sub}`.toLowerCase())}">
<td class="co" data-v="${esc(c.displayName.toLowerCase())}"><a href="${href}" class="coname"><span class="n">${displayName(c)}${nameTag}</span></a><div class="mono muted" style="font-size:12px">${label(sub, `Ticker or token mint ${r.mint}`)}${when ? ` · ${date(when, 'month')}` : ''}</div><div class="trk">${r.track === 'permissionless' ? TRACK_SHORT.permissionless : TRACK_SHORT.curated}</div></td>
<td class="r m1" data-v="${(r.raised ?? 0n).toString()}"><span class="ml">Raised</span><div class="v">${raised}</div></td>
<td class="r m2" data-v="${t ? t.net.toString() : '-1'}"><span class="ml">Left in treasury</span>${left}</td>
<td class="r m3" data-v="${lim?.sort ?? '-1'}"><span class="ml">Team limit / month</span>${lim ? lim.html : '<div class="v muted">—</div>'}</td>
<td class="code" data-v="${codeSort}"><span class="ml">Public code</span>${codeCell(c)}</td>
<td class="rec"><span class="ml">On record</span>${tags.map((x) => `<span class="tag tag-${x.kind}">${x.html}</span>`).join('')}</td>
</tr>`;
}

const sortBtn = (k: string, text: string, num: boolean) => `<th scope="col" class="${num ? 'r ' : ''}sortable" aria-sort="none"><button type="button" class="sortbtn" data-k="${k}">${text}</button></th>`;

function table(ctx: Ctx, cs: readonly Company[]): string {
  return `<div class="card tblbox cobox"><table class="tbl cotbl" id="cotbl"><thead><tr>${sortBtn('co', 'Company', false)}${sortBtn('m1', 'Raised', true)}${sortBtn('m2', 'Left in treasury', true)}${sortBtn('m3', 'Team limit / month', true)}${sortBtn('code', 'Public code', false)}<th scope="col">On record</th></tr></thead><tbody>${cs.map((c) => companyRow(ctx, c)).join('')}</tbody></table></div>`;
}

/** Search and column sorting. Without JavaScript the table is still there, sorted by Raised; the search box stays hidden. */
const TABLE_JS = `<script>(function(){var tb=document.getElementById('cotbl');if(!tb)return;var body=tb.tBodies[0];var q=document.getElementById('q');
function sortBy(i,dir,num){var rows=[].slice.call(body.rows);rows.sort(function(a,b){var x=a.cells[i].getAttribute('data-v'),y=b.cells[i].getAttribute('data-v');var c=num?(Number(x)-Number(y)):x.localeCompare(y);return dir*(c||a.cells[0].getAttribute('data-v').localeCompare(b.cells[0].getAttribute('data-v')));});rows.forEach(function(r){body.appendChild(r);});}
[].forEach.call(tb.querySelectorAll('.sortbtn'),function(b,i){b.addEventListener('click',function(){var th=b.parentNode;var d=th.getAttribute('aria-sort')==='descending'?1:-1;if(th.getAttribute('aria-sort')==='none'&&i===0)d=1;[].forEach.call(tb.querySelectorAll('th'),function(h){h.setAttribute('aria-sort','none');});th.setAttribute('aria-sort',d===1?'ascending':'descending');sortBy(i,d,i>0&&i<5);});});
if(q){q.hidden=false;q.addEventListener('input',function(){var s=q.value.trim().toLowerCase();[].forEach.call(body.rows,function(r){r.classList.toggle('nomatch',s!==''&&r.getAttribute('data-search').indexOf(s)<0);});});}
})();</script>`;

function squares(n: number, color: string, outline = false): string {
  return Array.from({ length: n }, () => `<div class="sq" style="${outline ? 'border:1.5px solid #4A5068' : `background:${color}`}"></div>`).join('');
}

export function homePage(ctx: Ctx, site: Site): string {
  const csv = (f: string) => url(ctx, `data/${f}`);
  const meth = (a: string) => url(ctx, `methodology/#${a}`);
  const T = totals(site);
  const other = trackOutcomes(site, 'curated');
  const perm = trackOutcomes(site, 'permissionless');
  const authorities = byAuthority(site);
  const CONF = constant('confidence');
  const ciFig = (x: number, dark = true) => fig(pct1(x), { kind: 'formula', href: meth('tracks'), formula: 'Wilson score interval at the confidence level shown' }, { dark });
  const tests = site.decoded.filter((r) => r.minimum < MIN_REAL_RAISE).length;
  const withTreasury = site.companies.filter((c) => c.treasury);
  const notRead = site.companies.filter((c) => !c.treasury);

  // The title is written from the data: a direction only when the 95% intervals do not overlap, never a multiple.
  const headline = trackHeadline(other, perm);

  // Admin-key movements: only what the order of the transactions shows, written from the data.
  const adminFlows = site.allFlows.filter((f) => isAdmin(f.cls));
  const by = (c: FlowClass) => adminFlows.filter((f) => f.cls === c);
  const afterVote = by('admin_after_vote');
  const notAfter = adminFlows.length - afterVote.length;
  const nAdmin = fig(fmtInt(adminFlows.length), { kind: 'sum', what: 'movements approved with MetaDAO\'s admin key', rows: { flows: adminFlows } });
  const nAfter = fig(fmtInt(afterVote.length), { kind: 'sum', what: 'admin-key movements that came after a proposal on the same DAO had passed', rows: { flows: afterVote } });
  const gaps = afterVote.flatMap((f) => (f.prior?.finalizedAt && f.prior.finalizeSignature ? [{ ms: f.time.getTime() - f.prior.finalizedAt.getTime(), sig: f.prior.finalizeSignature }] : [])).sort((x, y) => x.ms - y.ms);
  const gapFig = (g: { ms: number; sig: string } | undefined) => (g ? fig(duration(g.ms), { kind: 'formula', href: txUrl(g.sig), formula: 'days from the proposal\x27s FinalizeProposal transaction (opens it) to the movement' }) : '');
  const others = ([['admin_vote_passed_after', 'came before the proposal passed'], ['admin_vote_no_finalize', 'follow a proposal whose passing time we did not find'], ['admin_no_vote_found', 'had no passed proposal on the DAO in the window'], ['admin_against_market', 'went against their own proposal']] as const)
    .filter(([c]) => by(c).length > 0)
    .map(([c, words]) => `${fig(fmtInt(by(c).length), { kind: 'sum', what: `admin-key movements that ${words}`, rows: { flows: by(c) } })} ${words}`);
  const adminTitle = adminFlows.length === 0 ? '' : notAfter === 0
    ? `Every admin-key movement came after a proposal on the same DAO had passed.`
    : `Not every admin-key movement came after a vote.`;
  const adminNote = adminFlows.length === 0 ? '' : `<div class="note ${notAfter === 0 ? 'note-v' : 'note-p'}" style="flex:1 1 360px"><span class="mk ${notAfter === 0 ? 'mk-v' : 'mk-p'}" style="width:22px;height:22px;background:#fff;margin-top:1px" aria-hidden="true">${notAfter === 0 ? CHECK : CLOCK}</span><div><b>${adminTitle}</b> Of ${nAdmin} movements approved with MetaDAO's admin key, ${nAfter} came after a proposal on the same DAO had passed${gaps.length ? `, between ${gapFig(gaps[0])} and ${gapFig(gaps.at(-1))} after the proposal's FinalizeProposal transaction` : ''}${others.length ? `; ${others.join('; ')}` : ''}. This is timing only: the chain does not tell us whether a proposal covers a payment. Each movement links its proposal.</div></div>`;
  const pending = T.inflowOther > 0n || T.otherOut > 0n
    ? `<div class="note note-p" style="flex:1 1 360px"><span class="mk mk-p" style="width:22px;height:22px;background:#fff;margin-top:1px" aria-hidden="true">${CLOCK}</span><div><b>Pending verification:</b> ${fig(fmtUsd(T.inflowOther, { decimals: 2 }), { kind: 'sum', what: 'inflows after the raise, all treasuries', rows: { flows: site.allFlows.filter((f) => f.cls === 'inflow_other') } })} came into treasuries after their raise, in ${fig(fmtInt(site.allFlows.filter((f) => f.cls === 'inflow_other').length), { kind: 'sum', what: 'inflows after the raise, all treasuries', rows: { flows: site.allFlows.filter((f) => f.cls === 'inflow_other') } })} transactions. The amounts and senders are onchain; what each payment was for is not identified yet.${T.otherOut > 0n ? ` Also ${fig(fmtUsd(T.otherOut, { decimals: 2 }), { kind: 'sum', what: 'outflows not classified yet, all treasuries', rows: { flows: site.allFlows.filter((f) => f.cls === 'other_out') } })} of outflows we have not classified.` : ''}</div></div>`
    : '';

  const cat = (color: string, name: string, v: Micro, note: string, rows: ListRows, what: string) =>
    `<div><div style="display:flex;align-items:center;gap:8px;font-size:13px" class="soft"><span class="sw" style="background:${color}"></span>${name}</div>${fig(fmtUsd(v, { decimals: 2 }), { kind: 'sum', what, rows }, { style: "font-size:24px;font-weight:600;margin-top:8px;font-family:'Inter Tight',sans-serif" })}<div class="muted" style="font-size:13px;margin-top:6px">${note}</div></div>`;
  const n = (cls: string) => fig(fmtInt(site.allFlows.filter((f) => f.cls === cls).length), { kind: 'sum', what: `${CLASS_WORDS[cls] ?? cls}, all treasuries`, rows: { flows: site.allFlows.filter((f) => f.cls === cls) } });

  const quoted = site.companies.filter((c) => c.name.kind === 'onchain' && c.name.press);
  const unnamed = site.companies.filter((c) => c.name.kind === 'none');
  const byVersion = (v: string) => site.undecoded.filter((u) => u.version === v).length;

  const body = `
<section class="wrap" style="padding-top:56px;padding-bottom:24px">
<h1 style="font-size:clamp(28px,4.2vw,46px);line-height:1.1;font-weight:600;max-width:900px">Every team that raised on MetaDAO: what they raised, what is left, and what their public code shows.</h1>
<p style="font-size:17px;line-height:1.55;max-width:700px;margin-top:16px" class="soft">Every number links to the chain.</p>
<label class="srch" id="qbox"><span class="sr">Search a company by name or ticker</span><input id="q" type="search" placeholder="Search by name or ticker" autocomplete="off" hidden></label>
</section>

<section id="companies" class="wrap tabs" style="padding-top:8px;padding-bottom:24px">
<input type="radio" name="trk" id="t-all" checked><input type="radio" name="trk" id="t-cur"><input type="radio" name="trk" id="t-perm">
<div class="tabhead" style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px">
<h2 style="font-size:clamp(22px,2.6vw,30px);font-weight:600">Companies</h2>
<div class="tabbar" role="group" aria-label="Launch authority"><label for="t-all">All</label><label for="t-cur">Other authorities</label><label for="t-perm">Permissionless</label></div>
</div>
<div class="panels">${table(ctx, site.companies)}</div>
<div class="legend1">Every number opens its source. On company pages: <span class="mk mk-s" aria-hidden="true">Σ</span> = a total (click for the list) · <span class="mk mk-v" aria-hidden="true">${CHECK}</span> = read from one transaction or account · <span class="mk mk-f" aria-hidden="true">=</span> = calculated (click for the formula) · <span class="mk mk-p" aria-hidden="true">${CLOCK}</span> = amount is onchain, purpose not identified yet.</div>
<div class="muted" style="font-size:13px;margin-top:10px;line-height:1.55">No public commits does not mean no work: some teams keep their code private. Public code counts commits on each repository's default branch, read from GitHub. <a href="${meth('public-code')}">How it is counted</a> · <a href="${csv('commits-monthly.csv')}">Download commits-monthly.csv</a> · <a href="${csv('treasury.csv')}">Download treasury.csv</a></div>
${TABLE_JS}
</section>

<section id="raises" class="wrap" style="padding-top:24px;padding-bottom:24px">
<div style="background:#0A0B0F;color:#FFFFFF;border-radius:20px;padding:clamp(24px,4vw,48px)">
<div class="eyebrow" style="color:#8E95A8;margin-bottom:14px">How the raises went · by launch authority</div>
<h2 style="font-size:clamp(28px,3.6vw,42px);line-height:1.1;font-weight:600;max-width:760px">${headline}</h2>
<p style="color:#A9AFBF;font-size:16px;line-height:1.55;max-width:640px;margin-top:14px">Each square is one finished raise. Filled means it completed and the treasury was funded. Outlined means it missed its minimum and investors were refunded. The range under each rate is its ${CONF} confidence interval: with few raises, the true rate could be anywhere in it.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:40px;margin-top:40px">
${([
    { s: other, t: 'curated' as const, sub: 'Every launch authority except the permissionless one. Who controls them, and how their raises were chosen, is not onchain.', color: '#8EA0FF', big: '#FFFFFF' },
    { s: perm, t: 'permissionless' as const, sub: 'Our identification from the chain: the authority of MetaDAO\'s permissionless platform (Futardio, now Backable). It is not declared onchain.', color: '#F5A55A', big: '#F5A55A' },
  ]).map(({ s, t, sub, color, big }) => `<div>
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid #23283A;padding-bottom:14px">
<div><div style="font-size:15px;font-weight:600">${TRACK_NAME[t]}</div><div style="font-size:13px;color:#A9AFBF;margin-top:4px;max-width:280px">${sub}</div></div>
${s.finished ? fig(pct(BigInt(s.complete.length), BigInt(s.finished)), { kind: 'formula', href: meth('tracks'), formula: 'completed / (completed + refunded)' }, { dark: true, style: `font-family:'Inter Tight',sans-serif;font-size:56px;font-weight:600;letter-spacing:-0.03em;color:${big}` }) : ''}
</div>
${s.ci ? `<div style="font-size:13px;color:#C9CEDA;margin-top:10px">${CONF} interval ${ciFig(s.ci.low)} to ${ciFig(s.ci.high)} · n = ${fig(fmtInt(s.finished), { kind: 'sum', what: `finished raises, ${TRACK_NAME[t].toLowerCase()}`, rows: { raises: [...s.complete, ...s.refunded] } }, { dark: true })} finished raises</div>` : ''}
<div style="font-size:13px;color:#A9AFBF;margin-top:6px;line-height:1.55">${t === 'permissionless' ? 'This authority' : 'These authorities'} started ${startedSentence(site, t)}</div>
<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:20px;max-width:340px" role="img" aria-label="${s.complete.length} completed, ${s.refunded.length} refunded">${squares(s.complete.length, color)}${squares(s.refunded.length, color, true)}</div>
<div style="font-size:14px;color:#C9CEDA;margin-top:18px;line-height:1.7">${fig(fmtInt(s.complete.length), { kind: 'sum', what: `completed raises, ${TRACK_NAME[t].toLowerCase()}`, rows: { raises: s.complete } }, { dark: true })} completed · ${fig(fmtInt(s.refunded.length), { kind: 'sum', what: `refunded raises, ${TRACK_NAME[t].toLowerCase()}`, rows: { raises: s.refunded } }, { dark: true })} refunded · ${fig(fmtInt(s.open), { kind: 'sum', what: `raises not finished, ${TRACK_NAME[t].toLowerCase()}`, rows: { raises: s.raises.filter((r) => r.state !== 'Complete' && r.state !== 'Refunding') } }, { dark: true })} not finished<br>Raised in completed raises: ${fig(fmtUsd(s.raised, { decimals: 'auto' }), { kind: 'sum', what: `completed raises, ${TRACK_NAME[t].toLowerCase()}`, rows: { raises: s.complete } }, { dark: true })}</div>
</div>`).join('')}
</div>
<div style="font-size:12px;color:#8E95A8;margin-top:32px;line-height:1.6;border-top:1px solid #23283A;padding-top:16px">Finished means Complete or Refunding. ${fig(fmtInt(tests), { kind: 'sum', what: 'test launches', rows: { raises: site.decoded.filter((r) => r.minimum < MIN_REAL_RAISE) } }, { dark: true })} test launches with a minimum under ${constant('min_real_raise_usd')} are left out. The split comes from the launch authority recorded onchain. The names Futardio and Backable are labels, not onchain: see the <a href="${meth('tracks')}" style="color:#AEBBFF">methodology</a>.</div>
</div>
<div class="card tblbox" style="margin-top:16px"><table class="tbl" style="min-width:720px"><caption style="text-align:left;padding:16px 20px 4px;font-weight:600">Every launch authority, with its raises</caption><thead><tr><th scope="col">Launch authority</th><th scope="col">Group</th><th scope="col" class="r">Raises counted</th><th scope="col" class="r">Test launches</th><th scope="col" class="r">Completed</th><th scope="col" class="r">Refunded</th><th scope="col" class="r">Not finished</th><th scope="col">Completion rate, ${CONF} interval</th></tr></thead><tbody>
${authorities.map((a) => `<tr><td>${chip(a.authority, 'address')}</td><td>${TRACK_SHORT[a.track]}</td><td class="r">${fig(fmtInt(a.o.raises.length), { kind: 'sum', what: `raises started by ${a.authority}`, rows: { raises: a.o.raises } })}</td><td class="r">${fig(fmtInt(a.tests.length), { kind: 'sum', what: `test launches started by ${a.authority}`, rows: { raises: a.tests } })}</td><td class="r">${fig(fmtInt(a.o.complete.length), { kind: 'sum', what: `completed raises started by ${a.authority}`, rows: { raises: a.o.complete } })}</td><td class="r">${fig(fmtInt(a.o.refunded.length), { kind: 'sum', what: `refunded raises started by ${a.authority}`, rows: { raises: a.o.refunded } })}</td><td class="r">${fig(fmtInt(a.o.open), { kind: 'sum', what: `unfinished raises started by ${a.authority}`, rows: { raises: a.o.raises.filter((r) => r.state !== 'Complete' && r.state !== 'Refunding') } })}</td><td>${a.o.ci ? `${fig(pct(BigInt(a.o.complete.length), BigInt(a.o.finished)), { kind: 'formula', href: meth('tracks'), formula: 'completed / (completed + refunded)' })} <span class="muted">(${ciFig(a.o.ci.low, false)} to ${ciFig(a.o.ci.high, false)}, n = ${fig(fmtInt(a.o.finished), { kind: 'sum', what: `finished raises started by ${a.authority}`, rows: { raises: [...a.o.complete, ...a.o.refunded] } })})</span>` : '<span class="muted">none finished</span>'}</td></tr>`).join('')}
</tbody></table></div>
</section>
<section class="wrap" style="padding-top:48px;padding-bottom:24px">
<div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px">
<div><div class="eyebrow" style="margin-bottom:12px">All ${fig(fmtInt(withTreasury.length), { kind: 'sum', what: 'treasuries read', rows: { companies: withTreasury } })} treasuries</div><h2 style="font-size:clamp(26px,3vw,36px);font-weight:600">Where every treasury dollar went</h2></div>
<div class="soft" style="font-size:14px">Total that came in: ${fig(fmtUsd(T.totalIn, { decimals: 2 }), { kind: 'sum', what: 'every movement into the treasuries', rows: { flows: site.allFlows.filter((f) => f.usdc > 0n) } }, { style: 'font-weight:600;color:#0A0B0F' })}</div>
</div>
<div class="card" style="padding:clamp(20px,3vw,32px)">
${bar([{ v: T.team, color: COLORS.team }, { v: T.market, color: COLORS.market }, { v: T.admin, color: COLORS.admin }, { v: T.liquidation + T.otherOut, color: COLORS.other }, { v: T.left, color: COLORS.left }], T.totalIn, 'bar').replace('class="bar"', `class="bar" style="width:100%;height:44px;border-radius:10px;gap:2px" role="img" aria-label="Team budget ${share(T.team, T.totalIn)}, approved by market vote ${share(T.market, T.totalIn)}, approved with the admin key ${share(T.admin, T.totalIn)}, still in the treasuries ${share(T.left, T.totalIn)}"`)}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:24px;margin-top:28px">
${cat(COLORS.team, 'Team budget', T.team, `${fig(share(T.team, T.totalIn), { kind: 'formula', href: meth('categories'), formula: 'team budget / total in' })} · ${n('team_budget')} draws through the monthly spending limit`, { flows: site.allFlows.filter((f) => f.cls === 'team_budget') }, 'team budget draws, all treasuries')}
${cat(COLORS.market, 'Approved by market vote', T.market, `${fig(share(T.market, T.totalIn), { kind: 'formula', href: meth('categories'), formula: 'market-approved / total in' })} · ${n('market_approved')} transactions, each the subject of a passed proposal`, { flows: site.allFlows.filter((f) => f.cls === 'market_approved') }, 'movements approved by market vote, all treasuries')}
${cat(COLORS.admin, 'Approved with MetaDAO\'s admin key', T.admin, `${fig(share(T.admin, T.totalIn), { kind: 'formula', href: meth('admin-key'), formula: 'admin-key movements / total in' })} · ${fig(fmtInt(adminFlows.length), { kind: 'sum', what: 'movements approved with MetaDAO\'s admin key', rows: { flows: adminFlows } })} transactions, see below`, { flows: adminFlows }, 'movements approved with MetaDAO\'s admin key')}
${cat(COLORS.left, 'Still in the treasuries', T.left, `${fig(share(T.left, T.totalIn), { kind: 'formula', href: meth('categories'), formula: 'balances / total in' })} · USDC balance of the treasuries at the scan, reconciled`, { companies: withTreasury }, 'treasuries read')}
</div>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:28px">${adminNote}${pending}</div>
</div>
</section>



<section class="wrap" style="padding-top:48px;padding-bottom:24px">
<div class="eyebrow" style="margin-bottom:12px">Not hidden</div>
<h2 style="font-size:clamp(26px,3vw,36px);font-weight:600;margin-bottom:8px">Still being verified</h2>
<p class="soft" style="font-size:16px;margin:0 0 24px;max-width:640px;line-height:1.55">What we could not confirm yet is listed here with the reason. It is never left out, and it is never shown as zero.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
${notRead.length ? `<div class="card" style="padding:20px"><span class="badge b-p">Pending verification</span><div style="font-weight:600;margin-top:14px">${fig(fmtInt(notRead.length), { kind: 'sum', what: 'treasuries not read', rows: { companies: notRead } })} treasuries not read</div><div class="soft" style="font-size:14px;line-height:1.55;margin-top:6px">The USDC account at the expected address does not belong to the DAO vault, so the treasury is not shown rather than shown as zero.</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">${notRead.map((c) => `<a class="chip" data-label href="${url(ctx, `company/${c.raise.mint}/`)}">${esc(c.raise.mint.slice(0, 8))}…</a>`).join('')}</div></div>` : ''}
${quoted.length ? `<div class="card" style="padding:20px"><span class="badge b-d"><span class="mk mk-d" aria-hidden="true"></span>Declared offchain</span><div style="font-weight:600;margin-top:14px">${fig(fmtInt(quoted.length), { kind: 'sum', what: 'project names quoted from articles', rows: { companies: quoted } })} project names quoted from articles</div><div class="soft" style="font-size:14px;line-height:1.55;margin-top:6px">Every name on this site comes from the token's own onchain metadata. For these tokens an article also names the project; each page quotes it word for word, with its dates. No figure is taken from an article.</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">${quoted.map((c) => `<a class="chip" data-label href="${url(ctx, `company/${c.raise.mint}/`)}">${esc(c.displayName)}</a>`).join('')}</div></div>` : ''}
${unnamed.length ? `<div class="card" style="padding:20px"><span class="badge b-p">Pending verification</span><div style="font-weight:600;margin-top:14px">${fig(fmtInt(unnamed.length), { kind: 'sum', what: 'companies without onchain metadata', rows: { companies: unnamed } })} companies without a name</div><div class="soft" style="font-size:14px;line-height:1.55;margin-top:6px">Their tokens have no onchain metadata, so they are shown by mint address.</div></div>` : ''}
${site.undecoded.length ? `<div class="card" style="padding:20px"><span class="badge b-p">Pending verification</span><div style="font-weight:600;margin-top:14px">${fig(fmtInt(site.undecoded.length), { kind: 'sum', what: 'launch accounts of older versions', rows: { raises: site.undecoded } })} older launch accounts</div><div class="soft" style="font-size:14px;line-height:1.55;margin-top:6px">Launchpad ${programChip('v05')} (${fig(fmtInt(byVersion('v05')), { kind: 'sum', what: `launch accounts of the launchpad program ${PROGRAMS.find((p) => p.code === 'v05')?.id ?? ''}`, rows: { raises: site.undecoded.filter((u) => u.version === 'v05') } })}) and ${programChip('v041')} (${fig(fmtInt(byVersion('v041')), { kind: 'sum', what: `launch accounts of the launchpad program ${PROGRAMS.find((p) => p.code === 'v041')?.id ?? ''}`, rows: { raises: site.undecoded.filter((u) => u.version === 'v041') } })}) use an account layout whose code is not in the current version of MetaDAO's repository. They are counted, not decoded.</div></div>` : ''}
<div class="card" style="padding:20px"><span class="badge b-d"><span class="mk mk-d" aria-hidden="true"></span>Declared offchain · coming soon</span><div style="font-weight:600;margin-top:14px">Founder and GitHub history</div><div class="soft" style="font-size:14px;line-height:1.55;margin-top:6px">Only a founder can add it, by claiming their company page. Each link is verified before it is shown.</div></div>
</div>
</section>

<section class="wrap" style="padding-top:48px">
<div class="card" style="padding:clamp(24px,4vw,40px);display:flex;flex-wrap:wrap;gap:32px;align-items:center;justify-content:space-between">
<div style="max-width:620px"><h2 style="font-size:26px;font-weight:600">Check any number yourself</h2><p class="soft" style="font-size:15px;line-height:1.6;margin-top:10px">Click a figure and it opens the transaction or account on the Solana Explorer. A total opens the list it adds up. The code, the raw data and every daily snapshot are public on GitHub.</p></div>
<div style="display:flex;flex-wrap:wrap;gap:12px"><a href="${url(ctx, 'methodology/')}" class="btn btn-dark">Read the methodology</a><a href="https://github.com/${ctx.repo}" class="btn btn-light" rel="noopener">View source</a></div>
</div>
</section>`;
  return page(ctx, { title: 'raise-tracker: onchain raises on MetaDAO, and where every treasury dollar went', description: 'What teams raised onchain on MetaDAO, and where every dollar of their treasuries went. Every figure links to its Solana transaction.', active: 'companies', body });
}

export const _test = { totals };
