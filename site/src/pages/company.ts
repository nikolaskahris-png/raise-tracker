import { addrUrl, chip, date, esc, fig, label, txUrl } from '../fig.ts';
import { fmtInt, fmtUsd, microToDecimal, pct, ratio, sum, type Micro } from '../money.ts';
import { addr, page, url, type Ctx } from '../layout.ts';
import type { Company, Site, Treasury } from '../model.ts';
import type { Flow, FlowClass } from '../schema.ts';

export const PERIOD_MS = 30 * 86_400_000; // Squads monthly spending limit period
export const ADMIN_KEYS: Readonly<Record<string, string>> = {
  CWGawadYU8CzRVBecnJymNw97H7E3ndDinV5sMzesgY2: 'futarchy admin (execute)',
  '6awyHMshBGVjJ3ozdSJdyyDE1CTAXUwrpNMaRGMsb4sf': 'futarchy admin (enqueue approval)',
};

const CHECK = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"></path></svg>';
const CLOCK = '<svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 5v3.2l2 1.3"></path></svg>';
const COLORS = { launch: '#3D4250', team: '#2A44E8', market: '#0F1A4A', admin: '#F08C2B', left: '#C9D1F5', other: '#8A8F9C' } as const;

const CLASS_BADGE: Record<FlowClass, string> = {
  launch_funding: '<span class="badge b-n">Launch deposit</span>',
  inflow_other: '<span class="badge b-p">Other inflow</span>',
  team_budget: '<span class="badge b-v">Team budget</span>',
  market_approved: '<span class="badge b-k">Market vote</span>',
  admin_after_vote: '<span class="badge b-o">Admin key after a vote</span>',
  admin_no_vote_found: '<span class="badge b-p">Admin key, no recent vote</span>',
  admin_against_market: '<span class="badge b-p">Admin key, against a vote</span>',
  liquidation: '<span class="badge b-n">Liquidation</span>',
  other_out: '<span class="badge b-p">Unclassified</span>',
};

const proposalLink = (n: number, address: string) => `<a data-label href="${addrUrl(address)}" rel="noopener" title="Futarchy proposal account">#${n}</a>`;

function tokens(x: Micro): string {
  const whole = x / 1_000_000n, frac = x % 1_000_000n;
  return frac === 0n ? fmtInt(whole) : `${fmtInt(whole)}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

function shortDate(d: Date): string {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] ?? '';
  return `<time datetime="${d.toISOString()}">${d.getUTCDate()} ${m}</time>`;
}

export type Period = { readonly start: Date; readonly drawn: Micro; readonly flows: readonly Flow[] };

/** Team draws grouped in 30-day periods counted from the end of the raise (the limit's own period length). */
export function budgetPeriods(t: Treasury, start: Date): Period[] {
  const out: Period[] = [];
  for (let k = 0; k < t.row.periodsStarted; k++) {
    const s = start.getTime() + k * PERIOD_MS, e = s + PERIOD_MS;
    const fl = t.flows.filter((f) => f.cls === 'team_budget' && f.time.getTime() >= s && f.time.getTime() < e);
    out.push({ start: new Date(s), drawn: sum(fl.map((f) => -f.usdc)), flows: fl });
  }
  return out;
}

/** The company's name, or its mint prefix (an identifier, labelled as such) when it has none. */
export function displayName(c: Company): string {
  const title = c.name.kind === 'none' ? `Token mint ${c.raise.mint}` : c.name.press ? `Project name quoted from ${c.name.press.publisher}; symbol from the token's onchain metadata` : "Name from the token's onchain metadata";
  return label(c.displayName, title);
}

function nameBadge(c: Company): string {
  if (c.name.kind === 'none') return '<span class="badge b-p">Name pending</span>';
  return `<a class="badge b-d" href="${addrUrl(c.name.account)}" rel="noopener" title="The name and symbol this token declares in its Metaplex metadata account"><span class="mk mk-d" aria-hidden="true"></span>Name from the token's onchain metadata ↗</a>`;
}

/** Where the name comes from: the onchain metadata, and, when present, the verbatim press quote that adds the project name. */
function nameSource(c: Company): string {
  if (c.name.kind !== 'onchain') return '';
  const onchain = `The token's onchain metadata (${chip(c.name.account, 'address', 'metadata account')}) declares the name ${label(c.name.name, 'Name in the onchain metadata')} and the symbol ${label(c.name.symbol, 'Symbol in the onchain metadata')}. Whoever controls the metadata sets it.`;
  const p = c.name.press;
  if (!p) return `<p class="soft" style="font-size:14px;line-height:1.55;margin-top:14px;max-width:760px">${onchain}</p>`;
  const day = (s: string) => date(new Date(`${s}T00:00:00Z`));
  return `<div class="soft" style="font-size:14px;line-height:1.55;margin-top:14px;max-width:760px"><p>${onchain}</p>
<p style="margin-top:8px"><b>Project name.</b> ${esc(p.publisher)} (published ${day(p.published)}, read by us ${day(p.read)}) names the project: <q data-quote cite="${esc(p.source)}">${esc(p.quote)}</q> <a href="${esc(p.source)}" rel="noopener">Source ↗</a></p>
<p style="margin-top:8px">We use the article only for the name ${label(p.project, 'Project name from the article')}, matched to this token because the quote names its onchain symbol. Every figure on this page comes from the chain.</p></div>`;
}

function header(ctx: Ctx, c: Company, movementsCount: number | null): string {
  const r = c.raise;
  return `<section class="wrap" style="padding-top:40px">
<nav aria-label="Breadcrumb" class="muted" style="font-size:13px;display:flex;gap:8px"><a href="${url(ctx, '#companies')}" class="muted">Companies</a><span aria-hidden="true">/</span><span style="color:#0A0B0F">${displayName(c)}</span></nav>
<div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:20px">
<div>
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px">
<div aria-hidden="true" style="width:56px;height:56px;border-radius:14px;background:#0A0B0F;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-family:'Inter Tight',sans-serif;font-weight:600;font-size:24px">${esc((c.displayName.match(/[A-Za-z]/)?.[0] ?? '·').toUpperCase())}</div>
<h1 style="font-size:clamp(36px,5vw,52px);font-weight:600;line-height:1">${displayName(c)}</h1>
${nameBadge(c)}
</div>
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px">
<span class="badge b-n">${r.track === 'curated' ? 'Curated' : 'Permissionless'}</span>
<span class="badge b-v">Raise complete</span>
<span class="badge b-n">Launchpad ${label(r.version.replace(/^v0?(\d)(\d)?(\d)?$/, (_m, a: string, b?: string, d?: string) => `v0.${a}${b ? `.${b}` : ''}${d ? `.${d}` : ''}`), 'Launchpad program version')}</span>
${chip(r.mint, 'address', `${c.name.kind === 'onchain' ? c.name.symbol + ' · ' : ''}${r.mint.slice(0, 6)}…`)}
${r.dao ? chip(r.dao, 'address', `DAO ${r.dao.slice(0, 6)}…`) : ''}
</div>
${nameSource(c)}
</div>
${movementsCount !== null ? `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><span class="soft" style="font-size:14px">${fig(fmtInt(movementsCount), { kind: 'sum', href: 'movements.csv', what: 'movements of this treasury' })} movements</span><a href="movements.csv" class="btn btn-light">Download CSV</a></div>` : ''}
</div>`;
}

function stats(ctx: Ctx, c: Company): string {
  const r = c.raise;
  const t = c.treasury;
  const meth = (a: string) => url(ctx, `methodology/#${a}`);
  const raisedAt = r.completed ?? r.closed;
  const months = t && raisedAt ? ((ctx.scanAt.getTime() - raisedAt.getTime()) / (30.4375 * 86_400_000)).toFixed(1) : null;
  const cell = (l: string, v: string, n: string) => `<div class="stat"><div class="stat-l">${l}</div><div class="stat-v" style="font-size:30px">${v}</div><div class="stat-n">${n}</div></div>`;
  const big = (text: string, src: Parameters<typeof fig>[1]) => fig(text, src);
  return `<div class="stats" style="margin-top:36px">
${cell('Raised', r.raised === null ? '—' : big(fmtUsd(r.raised), { kind: 'account', address: r.launch }), r.closed ? `closed ${date(r.closed)} after ${fig(String(r.durationDays % 1 === 0 ? r.durationDays : r.durationDays.toFixed(2)), { kind: 'account', address: r.launch })} days` : '')}
${cell('Committed by investors', big(fmtUsd(r.committed), { kind: 'account', address: r.launch }), r.raised ? `${fig(`${ratio(r.committed, r.raised, 2)}×`, { kind: 'formula', href: meth('raise'), formula: 'committed / raised' })} oversubscribed · minimum ${fig(fmtUsd(r.minimum), { kind: 'account', address: r.launch })}` : '')}
${t ? cell('In the treasury now', big(fmtUsd(t.net, { decimals: 2 }), { kind: 'account', address: t.row.usdcAccount }), `USDC in the DAO vault${months ? ` · ${fig(months, { kind: 'formula', href: meth('budget'), formula: 'days since the raise completed / 30.4375' })} months after the raise` : ''}`) : cell('In the treasury now', '<span class="muted">not read</span>', '<span class="badge b-p">Pending verification</span>')}
${t && t.row.spendingLimitNow !== null && t.row.spendingLimitAccount ? cell('Team budget limit now', big(fmtUsd(t.row.spendingLimitNow), { kind: 'account', address: t.row.spendingLimitAccount }), `per month · was ${fig(fmtUsd(r.monthlyBudget), { kind: 'account', address: r.launch })} at launch`) : cell('Team budget at launch', big(fmtUsd(r.monthlyBudget), { kind: 'account', address: r.launch }), 'per month, set in the launch account')}
</div>
</section>`;
}

function whereItWent(ctx: Ctx, t: Treasury): string {
  const meth = (a: string) => url(ctx, `methodology/#${a}`);
  const b = t.byClass;
  const admin = b.admin_after_vote + b.admin_no_vote_found + b.admin_against_market;
  const other = b.liquidation + b.other_out;
  const share = (v: Micro) => (t.totalIn === 0n ? '0%' : pct(v, t.totalIn));
  const seg = (v: Micro, color: string, text = '', pattern = false) => v > 0n ? `<div style="width:${share(v)};background:${pattern ? 'repeating-linear-gradient(135deg,#F7C58A 0 6px,#FBE0BF 6px 12px)' : color};display:flex;align-items:center;padding-left:${text ? 12 : 0}px;color:${pattern ? '#5A2C00' : '#FFFFFF'};font-size:12px;font-weight:500;overflow:hidden;white-space:nowrap">${text}</div>` : '';
  const count = (cls: FlowClass) => t.flows.filter((f) => f.cls === cls).length;
  const item = (color: string, name: string, v: Micro, src: Parameters<typeof fig>[1], note: string, pending = false) =>
    `<div><div style="display:flex;align-items:center;gap:8px;font-size:13px" class="soft"><span class="sw" style="background:${color}"></span>${name}${v > 0n && name !== 'Launch deposit' && name !== 'Other inflows' ? ` · ${fig(share(v), { kind: 'formula', href: meth('categories'), formula: `${name.toLowerCase()} / total in` })}` : ''}</div>${fig(fmtUsd(v, { decimals: 2 }), src, { style: "font-family:'Inter Tight',sans-serif;font-size:22px;font-weight:600;margin-top:6px" })}<div style="font-size:13px;margin-top:4px;${pending ? 'color:#8A4200;display:flex;align-items:center;gap:6px' : 'color:#5B6170'}">${pending ? `<span class="mk mk-p" aria-hidden="true">${CLOCK}</span>` : ''}${note}</div></div>`;
  const launchFlow = t.flows.find((f) => f.cls === 'launch_funding');
  const decisionsNote = (() => {
    const props = [...new Set(t.flows.filter((f) => f.cls === 'market_approved').map((f) => f.decisionNumber))].filter((x): x is number => x !== null).sort((a, z) => a - z);
    return props.length ? `proposals ${props.map((p) => label(`#${p}`, 'Futarchy proposal number on this DAO')).join(', ')} passed` : 'none';
  })();
  return `<section class="wrap" style="padding-top:56px">
<div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px">
<div><div class="eyebrow" style="margin-bottom:12px">Treasury</div><h2 style="font-size:clamp(26px,3vw,34px);font-weight:600">Where every dollar went</h2></div>
${t.row.reconciles ? `<a class="badge b-v" href="${meth('reconcile')}">${CHECK}History reconciles to the cent</a>` : ''}
</div>
<div class="card" style="padding:clamp(20px,3vw,32px)">
<div style="display:grid;grid-template-columns:72px minmax(0,1fr);gap:14px 16px;align-items:center">
<div class="soft" style="font-size:13px;font-weight:500">Came in</div>
<div style="display:flex;height:40px;border-radius:10px;overflow:hidden;gap:2px" role="img" aria-label="Launch deposit ${share(b.launch_funding)}, other inflows ${share(b.inflow_other)}">${seg(b.launch_funding, COLORS.launch, 'Launch deposit')}${seg(b.inflow_other, '', 'Other inflows', true)}</div>
<div class="soft" style="font-size:13px;font-weight:500">Went to</div>
<div style="display:flex;height:40px;border-radius:10px;overflow:hidden;gap:2px" role="img" aria-label="Team budget ${share(b.team_budget)}, market vote ${share(b.market_approved)}, admin key ${share(admin)}, still in treasury ${share(t.net)}">${seg(b.team_budget, COLORS.team)}${seg(b.market_approved, COLORS.market)}${seg(admin, COLORS.admin)}${seg(other, COLORS.other)}${seg(t.net, COLORS.left)}</div>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:28px;margin-top:32px;padding-top:28px;border-top:1px solid #EEF0F3">
<div><div class="eyebrow" style="margin-bottom:14px">In · ${fig(fmtUsd(t.totalIn, { decimals: 2 }), { kind: 'sum', href: 'movements.csv', what: 'inflows' }, { bare: true, style: 'border:0' })}</div><div style="display:flex;flex-direction:column;gap:16px">
${item(COLORS.launch, 'Launch deposit', b.launch_funding, launchFlow ? { kind: 'tx', signature: launchFlow.signature } : { kind: 'sum', href: 'movements.csv', what: 'launch deposits' }, launchFlow ? `the launchpad's deposit, ${date(launchFlow.time)}` : '')}
${b.inflow_other > 0n ? item('#F7C58A', 'Other inflows', b.inflow_other, { kind: 'sum', href: '#inflows', what: 'inflows after the raise' }, `${fig(fmtInt(count('inflow_other')), { kind: 'sum', href: '#inflows', what: 'inflow transactions' })} transactions · purpose pending verification`, true) : ''}
</div></div>
<div><div class="eyebrow" style="margin-bottom:14px">Out · ${fig(fmtUsd(t.totalOut, { decimals: 2 }), { kind: 'sum', href: 'movements.csv', what: 'outflows' }, { bare: true, style: 'border:0' })}</div><div style="display:flex;flex-direction:column;gap:16px">
${item(COLORS.team, 'Team budget', b.team_budget, { kind: 'sum', href: '#budget', what: 'team budget draws' }, `${fig(fmtInt(count('team_budget')), { kind: 'sum', href: '#budget', what: 'team budget draws' })} draws through the monthly spending limit`)}
${b.market_approved > 0n ? item(COLORS.market, 'Approved by market vote', b.market_approved, { kind: 'sum', href: '#decisions', what: 'market-approved movements' }, `${fig(fmtInt(count('market_approved')), { kind: 'sum', href: '#decisions', what: 'market-approved movements' })} transactions · ${decisionsNote}`) : ''}
</div></div>
<div><div class="eyebrow" style="margin-bottom:14px" aria-hidden="true">&#160;</div><div style="display:flex;flex-direction:column;gap:16px">
${admin > 0n ? item(COLORS.admin, 'Approved with the admin key', admin, { kind: 'sum', href: '#decisions', what: 'admin-key movements' }, `${fig(fmtInt(count('admin_after_vote') + count('admin_no_vote_found') + count('admin_against_market')), { kind: 'sum', href: '#decisions', what: 'admin-key movements' })} transactions · each listed below with the vote before it`) : ''}
${other > 0n ? item(COLORS.other, 'Other outflows', other, { kind: 'sum', href: '#decisions', what: 'other outflows' }, 'not classified yet', true) : ''}
${item(COLORS.left, 'Still in the treasury', t.net, { kind: 'account', address: t.row.usdcAccount }, "balance of the vault's USDC account")}
</div></div>
</div>
</div>
</section>`;
}

function decisions(ctx: Ctx, t: Treasury): string {
  const rows = t.flows.filter((f) => f.cls !== 'team_budget' && f.cls !== 'launch_funding' && f.cls !== 'inflow_other');
  if (!rows.length) return '';
  const line = (f: Flow) => {
    let text: string;
    if (f.cls === 'market_approved' && f.decisionNumber !== null && f.decisionAddress) {
      text = `Proposal ${proposalLink(f.decisionNumber, f.decisionAddress)} passed; this transaction is the one it approved`;
    } else if (f.cls === 'admin_after_vote' && f.priorVoteNumber !== null && f.priorVoteAddress) {
      const keys = f.adminKeys.length ? ` · signed by ${f.adminKeys.map((k) => chip(k, 'address', ADMIN_KEYS[k] ? `${k.slice(0, 6)}… (MetaDAO admin)` : undefined)).join(' ')}` : '';
      text = `Approved with MetaDAO's admin key, ${fig(f.priorVoteDays ?? '', { kind: 'formula', href: url(ctx, 'methodology/#admin-key'), formula: 'days from the proposal being enqueued to this movement' })} days after proposal ${proposalLink(f.priorVoteNumber, f.priorVoteAddress)} passed on this DAO. Check on the proposal that it covers this payment${keys}`;
    } else if (f.cls === 'admin_no_vote_found') {
      text = 'Approved with an admin key, with no passed proposal on this DAO in the 60 days before';
    } else if (f.cls === 'admin_against_market') {
      text = 'Approved with an admin key although its own proposal did not pass';
    } else {
      text = 'Not classified yet';
    }
    const to = f.counterparty.length ? ` · to ${f.counterparty.map((a) => chip(a, 'address')).join(' ')}` : '';
    return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:18px 24px;border-bottom:1px solid #EEF0F3${f.cls !== 'market_approved' ? ';background:#FFFAF3' : ''}">
<div class="muted" style="width:96px;font-size:13px">${date(f.time)}</div>
${fig(fmtUsd(f.usdc, { decimals: 2 }), { kind: 'tx', signature: f.signature }, { style: 'min-width:150px;font-weight:600;font-size:16px' })}
${CLASS_BADGE[f.cls]}
<span class="soft" style="flex:1 1 260px;font-size:14px;line-height:1.5">${text}${to}</span>
${chip(f.signature, 'tx')}
</div>`;
  };
  return `<section id="decisions" class="wrap" style="padding-top:56px">
<div class="eyebrow" style="margin-bottom:12px">Governance</div>
<h2 style="font-size:clamp(26px,3vw,34px);font-weight:600;margin-bottom:8px">Every spend outside the team budget</h2>
<p class="soft" style="font-size:15px;margin:0 0 20px;max-width:720px;line-height:1.55">"Market vote" means a futarchy proposal for this exact transaction passed. "Admin key after a vote" means MetaDAO's admin key approved the transaction itself; we show the most recent proposal that passed on this DAO before it, so you can check that it covers the payment. <a href="${url(ctx, 'methodology/#admin-key')}">How this is decided</a></p>
<div class="card dl" style="overflow:hidden">${rows.map(line).join('')}</div>
</section>`;
}

function budget(ctx: Ctx, c: Company, t: Treasury): string {
  const r = c.raise;
  const start = r.completed ?? r.closed;
  if (!start) return '';
  const periods = budgetPeriods(t, start);
  const limitNow = t.row.spendingLimitNow;
  const launchLimit = r.monthlyBudget;
  const maxDraw = periods.reduce((m, p) => (p.drawn > m ? p.drawn : m), 0n);
  const top = [maxDraw, launchLimit, limitNow ?? 0n].reduce((m, v) => (v > m ? v : m), 1n);
  const h = (v: Micro) => Number((v * 160n) / top);
  const drawn = t.byClass.team_budget;
  const allowed = launchLimit * BigInt(t.row.periodsStarted);
  const meth = (a: string) => url(ctx, `methodology/#${a}`);
  const bars = periods.map((p) => `<div class="b${p.drawn === 0n ? ' zero' : ''}" style="height:${Math.max(2, h(p.drawn))}px" title="${esc(`${fmtUsd(p.drawn, { decimals: 2 })} in ${p.flows.length} draws`)}"></div>`).join('');
  const changed = limitNow !== null && limitNow !== launchLimit;
  return `<section id="budget" class="wrap" style="padding-top:56px">
<div class="eyebrow" style="margin-bottom:12px">Team budget</div>
<h2 style="font-size:clamp(26px,3vw,34px);font-weight:600;margin-bottom:20px">What the team drew in each ${label('30-day', 'Length of the spending limit period')} period</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px">
<div class="card" style="flex:999 1 560px;min-width:0;padding:24px">
<div style="display:flex;flex-wrap:wrap;gap:8px 20px;font-size:12px;margin-bottom:18px" class="soft">
<span style="display:inline-flex;align-items:center;gap:6px"><span class="sw" style="background:#2A44E8"></span>Drawn in the period</span>
${changed && limitNow !== null ? `<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:16px;border-top:2px dashed #0A0B0F"></span>Limit now ${fig(fmtUsd(limitNow), { kind: 'account', address: t.row.spendingLimitAccount ?? t.row.multisig })}</span>` : ''}
<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:16px;border-top:2px dashed #F08C2B"></span>Limit at launch ${fig(fmtUsd(launchLimit), { kind: 'account', address: r.launch })}</span>
</div>
<div style="overflow-x:auto"><div class="chart" role="img" aria-label="Team draws per 30-day period">
${changed && limitNow !== null ? `<div class="line" style="bottom:${h(limitNow)}px;border-top:2px dashed #0A0B0F;opacity:.55"></div>` : ''}
<div class="line" style="bottom:${h(launchLimit)}px;border-top:2px dashed #F08C2B"></div>
${bars}
</div>
<div class="chart-x">${periods.map((p) => `<span>${shortDate(p.start)}</span>`).join('')}</div></div>
<div class="muted" style="font-size:12px;margin-top:10px;line-height:1.5">Each bar is a ${label('30-day', 'Length of the spending limit period')} period counted from the end of the raise, the same length as the limit's period. The program resets the limit on its own clock, so one period's bar can include a draw from the next period's allowance. Hover a bar for its total.</div>
</div>
<div class="card" style="flex:1 1 300px;padding:8px 24px">
<div class="kv"><span class="soft">Drawn so far</span>${fig(fmtUsd(drawn, { decimals: 2 }), { kind: 'sum', href: 'movements.csv', what: 'team budget draws' }, { style: 'font-weight:600' })}</div>
<div class="kv"><span class="soft">Allowed at the launch limit</span>${fig(fmtUsd(allowed, { decimals: 2 }), { kind: 'formula', href: meth('budget'), formula: 'periods started × monthly limit at launch' }, { style: 'font-weight:600' })}</div>
<div class="muted" style="font-size:12px;margin:-4px 0 8px">= ${fig(fmtInt(t.row.periodsStarted), { kind: 'formula', href: meth('budget'), formula: '30-day periods started since the raise' })} periods × ${fig(fmtUsd(launchLimit), { kind: 'account', address: r.launch })}</div>
<div class="kv"><span class="soft">Largest ${label('30-day', 'Length of the spending limit period')} period</span>${fig(fmtUsd(maxDraw, { decimals: 2 }), { kind: 'sum', href: 'movements.csv', what: 'team draws in the largest period' }, { style: 'font-weight:600' })}</div>
<div class="kv"><span class="soft">Wallets that can draw</span>${fig(fmtInt(r.budgetWallets.length), { kind: 'account', address: r.launch }, { style: 'font-weight:600' })}</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 12px">${r.budgetWallets.map((w) => addr(w)).join('')}</div>
${changed && limitNow !== null ? `<div class="note note-p" style="margin:8px 0 14px;padding:12px 14px;font-size:13px;line-height:1.5"><span class="mk mk-p" style="margin-top:2px;background:#fff" aria-hidden="true">${CLOCK}</span><span><b>Pending verification.</b> The limit went from ${fig(fmtUsd(launchLimit), { kind: 'account', address: r.launch })} to ${fig(fmtUsd(limitNow), { kind: 'account', address: t.row.spendingLimitAccount ?? t.row.multisig })} a month. Both amounts are onchain. The transaction that changed it is not linked yet, so draws above the launch limit are not judged here.</span></div>` : ''}
</div>
</div>
</section>`;
}

function inflows(t: Treasury): string {
  const all = t.flows.filter((f) => f.cls === 'inflow_other');
  if (!all.length) return '';
  const big = all.filter((f) => f.usdc >= 1_000_000_000n).slice(0, 12);
  const rest = all.filter((f) => !big.includes(f));
  const restSum = sum(rest.map((f) => f.usdc));
  const row = (f: Flow) => `<tr><td>${date(f.time)}</td><td class="r">${fig(fmtUsd(f.usdc, { decimals: 2, sign: 'always' }), { kind: 'tx', signature: f.signature }, { style: 'font-weight:600' })}</td><td>${f.counterparty.map((a) => chip(a, 'address')).join(' ') || '<span class="muted">—</span>'}</td><td><span class="badge b-p">Pending verification</span></td><td>${chip(f.signature, 'tx')}</td></tr>`;
  return `<section id="inflows" class="wrap" style="padding-top:56px">
<div class="eyebrow" style="margin-bottom:12px">Other inflows</div>
<h2 style="font-size:clamp(26px,3vw,34px);font-weight:600;margin-bottom:8px">Money that came in after the raise</h2>
<p class="soft" style="font-size:15px;margin:0 0 20px;max-width:680px;line-height:1.55">The amounts and senders are onchain. What each payment was for is not identified yet, so these are marked as pending, not hidden.</p>
<div class="card tblbox"><table class="tbl"><thead><tr><th scope="col">Date</th><th scope="col" class="r">Amount</th><th scope="col">From</th><th scope="col">Purpose</th><th scope="col">Transaction</th></tr></thead><tbody>
${big.map(row).join('')}
${rest.length ? `<tr><td class="muted">Earlier and smaller</td><td class="r">${fig(fmtUsd(restSum, { decimals: 2, sign: 'always' }), { kind: 'sum', href: 'movements.csv', what: 'the remaining inflows' }, { style: 'font-weight:600' })}</td><td class="muted">${fig(fmtInt(rest.length), { kind: 'sum', href: 'movements.csv', what: 'the remaining inflows' })} transfers</td><td><span class="badge b-p">Pending verification</span></td><td class="muted"><a href="movements.csv">see the full list</a></td></tr>` : ''}
</tbody></table></div>
</section>`;
}

function terms(ctx: Ctx, c: Company): string {
  const r = c.raise;
  const issue = `https://github.com/${ctx.repo}/issues/new?title=${encodeURIComponent(`Claim: ${c.displayName} (${r.mint})`)}&body=${encodeURIComponent('Founder links to verify (GitHub, X, past projects):\n\n- \n\nPlease also sign a message with one of the team wallets listed on the page, or post the claim from the project\'s official X account.')}`;
  return `<section class="wrap" style="padding-top:56px">
<div style="display:flex;flex-wrap:wrap;gap:16px">
<div class="card" style="flex:1 1 420px;padding:8px 24px">
<div style="font-family:'Inter Tight',sans-serif;font-weight:600;font-size:18px;padding:16px 0 6px">Raise terms</div>
<div class="muted" style="font-size:13px;padding-bottom:6px">Read from the launch account ${chip(r.launch, 'address')}</div>
<div class="kv"><span class="soft">Minimum raise</span>${fig(fmtUsd(r.minimum), { kind: 'account', address: r.launch })}</div>
<div class="kv"><span class="soft">Open</span><span>${r.started ? date(r.started) : '—'} to ${r.closed ? date(r.closed) : '—'}</span></div>
<div class="kv"><span class="soft">Monthly team budget at launch</span>${fig(fmtUsd(r.monthlyBudget), { kind: 'account', address: r.launch })}</div>
<div class="kv"><span class="soft">Insider tokens locked for</span>${fig(`${r.insiderLockMonths} months`, { kind: 'account', address: r.launch })}</div>
<div class="kv"><span class="soft">Performance package</span>${fig(`${tokens(r.performanceTokens)} ${c.name.kind === 'onchain' ? c.name.symbol : 'tokens'}`, { kind: 'account', address: r.launch })}</div>
</div>
<div class="card" style="flex:1 1 420px;padding:24px;display:flex;flex-direction:column;gap:14px">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div style="font-family:'Inter Tight',sans-serif;font-weight:600;font-size:18px">Founders and GitHub</div><span class="badge b-d"><span class="mk mk-d" aria-hidden="true"></span>Not claimed yet</span></div>
<p class="soft" style="font-size:14px;line-height:1.6">This section is filled in only by the founders themselves. They claim this page and add their GitHub, past projects and who is on the team. Each link is verified before it is shown, and anything not yet verified carries the pending mark.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
<div class="ph">Team members<br><span style="color:#0A0B0F;font-weight:500">Not claimed</span></div>
<div class="ph">GitHub activity<br><span style="color:#0A0B0F;font-weight:500">Not claimed</span></div>
<div class="ph">Past projects<br><span style="color:#0A0B0F;font-weight:500">Not claimed</span></div>
</div>
<a href="${esc(issue)}" class="btn btn-dark" style="align-self:flex-start" rel="noopener">I'm a founder: claim this page</a>
</div>
</div>
</section>`;
}

function ledger(t: Treasury): string {
  const rows = t.flows.filter((f) => (f.usdc < 0n ? -f.usdc : f.usdc) >= 1_000_000_000n).slice(0, 20);
  const badge = (f: Flow) => (f.cls === 'market_approved' && f.decisionNumber !== null ? `<span class="badge b-k">Market vote ${label(`#${f.decisionNumber}`, 'Proposal number')}</span>` : CLASS_BADGE[f.cls]);
  return `<section class="wrap" style="padding-top:56px">
<div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px">
<div><div class="eyebrow" style="margin-bottom:12px">Ledger</div><h2 style="font-size:clamp(26px,3vw,34px);font-weight:600">Recent movements of ${label('$1,000', 'Display threshold')} or more</h2></div>
<span style="font-size:14px" class="soft">${fig(fmtInt(t.flows.length), { kind: 'sum', href: 'movements.csv', what: 'movements' })} movements in all · <a href="movements.csv" style="font-weight:500">Download CSV →</a></span>
</div>
<div class="card tblbox"><table class="tbl"><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col" class="r">USDC</th><th scope="col">Counterparty</th><th scope="col">Transaction</th></tr></thead><tbody>
${rows.map((f) => `<tr><td>${date(f.time)}</td><td>${badge(f)}</td><td class="r">${fig(fmtUsd(f.usdc, { decimals: 2, sign: 'always' }).replace('$', ''), { kind: 'tx', signature: f.signature })}</td><td>${f.counterparty.slice(0, 2).map((a) => chip(a, 'address')).join(' ') || '<span class="muted">—</span>'}</td><td>${chip(f.signature, 'tx')}</td></tr>`).join('')}
</tbody></table></div>
</section>`;
}

function notRead(): string {
  return `<section class="wrap" style="padding-top:56px"><div class="note note-p"><span class="mk mk-p" style="width:22px;height:22px;background:#fff" aria-hidden="true">${CLOCK}</span><div><b>Treasury not read.</b> The scan reported a USDC account mismatch. The USDC account at the expected address does not belong to this DAO's vault, so no balance or movement is shown rather than showing zero. The raise figures above are read directly from the launch account.</div></div></section>`;
}

export function companyPage(ctx: Ctx, _site: Site, c: Company): string {
  const t = c.treasury;
  const body = [
    header(ctx, c, t ? t.flows.length : null),
    stats(ctx, c),
    t ? whereItWent(ctx, t) : notRead(),
    t ? decisions(ctx, t) : '',
    t ? budget(ctx, c, t) : '',
    t ? inflows(t) : '',
    terms(ctx, c),
    t ? ledger(t) : '',
  ].join('\n');
  return page(ctx, {
    title: `${c.displayName}: raise and treasury · raise-tracker`,
    description: `${c.displayName} raised onchain on MetaDAO. Every movement of its treasury, linked to Solana transactions.`,
    active: 'companies',
    banner: t ? 'History of this treasury adds up exactly to today\'s balance.' : 'Raise figures are read from the launch account.',
    body,
  });
}

export function movementsCsv(t: Treasury): string {
  const rows = [['time_utc', 'class', 'usdc', 'proposal', 'prior_passed_vote', 'counterparty', 'signature', 'explorer']];
  for (const f of t.flows) {
    rows.push([f.time.toISOString(), f.cls, microToDecimal(f.usdc), f.decisionNumber !== null ? `#${f.decisionNumber} ${f.decisionAddress ?? ''}` : '', f.priorVoteNumber !== null ? `#${f.priorVoteNumber} ${f.priorVoteAddress ?? ''}` : '', f.counterparty.join(' '), f.signature, txUrl(f.signature)]);
  }
  return rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
}
