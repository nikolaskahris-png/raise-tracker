// One page per Σ figure: exactly the rows that figure adds up, each linked to the chain, with the totals it can be checked against.
import { chip, date, esc, fig } from '../fig.ts';
import { fmtInt, fmtUsd, microToDecimal, sum } from '../money.ts';
import { page, url, type Ctx } from '../layout.ts';
import type { ListEntry, ListRows } from '../lists.ts';
import type { Site } from '../model.ts';
import type { Raise, UndecodedLaunch } from '../schema.ts';
import { programChip } from './methodology.ts';
import { CONSTANT_TEXT, constant } from '../constants.ts';

const abs = (x: bigint) => (x < 0n ? -x : x);
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Every text a figure linking to these rows may show: their count, and for money rows each way of adding them. */
export function totalsOf(rows: ListRows, site: Site): string[] {
  const out = new Set<string>();
  const add = (n: number | bigint) => out.add(fmtInt(n));
  const money = (v: bigint, signs = false) => {
    for (const d of ['auto', 2, 0] as const) {
      out.add(fmtUsd(v, { decimals: d }));
      if (signs) out.add(fmtUsd(v, { decimals: d, sign: 'always' }));
    }
  };
  if ('flows' in rows) {
    add(rows.flows.length);
    money(sum(rows.flows.map((f) => abs(f.usdc))), true);
    money(sum(rows.flows.map((f) => f.usdc)), true);
  } else if ('raises' in rows) {
    add(rows.raises.length);
    money(sum(rows.raises.map((r) => (r.decoded ? r.raised ?? 0n : 0n))));
  } else if ('companies' in rows) {
    add(rows.companies.length);
    money(sum(rows.companies.map((c) => c.treasury?.net ?? 0n)));
  } else add(rows.authorities.length);
  void site;
  return [...out];
}

/**
 * The list's title. Its words come from the code; any address in it becomes a chip, any rule of the method its constant,
 * and a company name before the colon a label, so the title holds no digit the checks cannot trace.
 */
function titleHtml(what: string, site: Site): string {
  const t = what.charAt(0).toUpperCase() + what.slice(1);
  const colon = t.indexOf(': ');
  const company = colon > 0 && site.companies.some((c) => c.displayName === t.slice(0, colon)) ? t.slice(0, colon) : null;
  const rest = company ? t.slice(colon + 2) : t;
  const consts = Object.entries(CONSTANT_TEXT).filter(([, v]) => /\d/.test(v)).sort((a, b) => b[1].length - a[1].length);
  let html = '';
  for (const part of rest.split(/([1-9A-HJ-NP-Za-km-z]{32,44})/)) {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(part)) { html += chip(part, 'address'); continue; }
    let s = esc(part);
    for (const [k, v] of consts) s = s.split(esc(v)).join(constant(k));
    html += s;
  }
  return company ? `<span data-label>${esc(company)}</span>: ${html}` : html;
}

export function listPage(ctx: Ctx, site: Site, e: ListEntry): { html: string; csv: string } {
  const nameOf = new Map(site.companies.map((c) => [c.raise.mint, c]));
  const self = { kind: 'sum' as const, what: e.what, rows: e.rows };
  let head = '', body = '', total = '', csv: string[][] = [];
  const r = e.rows;
  if ('flows' in r) {
    head = '<th scope="col">Date</th><th scope="col">Company</th><th scope="col">Type</th><th scope="col" class="r">USDC</th><th scope="col">Transaction</th>';
    body = r.flows.map((f) => {
      const c = nameOf.get(f.mint);
      return `<tr><td>${date(f.time)}</td><td>${c ? `<a href="${url(ctx, `company/${f.mint}/`)}" data-label>${esc(c.displayName)}</a>` : chip(f.mint, 'address')}</td><td>${esc(f.cls.replace(/_/g, ' '))}</td><td class="r">${fig(fmtUsd(f.usdc, { decimals: 2, sign: 'always' }), { kind: 'tx', signature: f.signature })}</td><td>${chip(f.signature, 'tx')}</td></tr>`;
    }).join('');
    const net = sum(r.flows.map((f) => f.usdc)), gross = sum(r.flows.map((f) => abs(f.usdc)));
    total = `${fig(fmtInt(r.flows.length), self)} movements · total ${fig(fmtUsd(gross, { decimals: 2 }), self)}${net !== gross && net !== -gross ? ` · net ${fig(fmtUsd(net, { decimals: 2, sign: 'always' }), self)}` : ''}`;
    csv = [['time_utc', 'company', 'class', 'usdc', 'signature'], ...r.flows.map((f) => [f.time.toISOString(), nameOf.get(f.mint)?.displayName ?? f.mint, f.cls, microToDecimal(f.usdc), f.signature])];
  } else if ('raises' in r) {
    head = '<th scope="col">Launch account</th><th scope="col">Token</th><th scope="col">Version</th><th scope="col">State</th><th scope="col">Launch authority</th><th scope="col" class="r">Minimum</th><th scope="col" class="r">Raised</th>';
    const row = (x: Raise | UndecodedLaunch) => {
      if (!x.decoded) return `<tr><td>${chip(x.launch, 'address')}</td><td class="muted">not decoded</td><td>${programChip(x.version)}</td><td></td><td></td><td></td><td></td></tr>`;
      const c = nameOf.get(x.mint);
      const token = c ? `<a href="${url(ctx, `company/${x.mint}/`)}" data-label>${esc(c.displayName)}</a>` : x.metadataSymbol ? `<span data-label>${esc(x.metadataSymbol)}</span>` : chip(x.mint, 'address');
      return `<tr><td>${chip(x.launch, 'address')}</td><td>${token}</td><td>${programChip(x.version)}</td><td>${esc(x.state)}</td><td>${chip(x.launchAuthority, 'address')}</td><td class="r">${fig(fmtUsd(x.minimum), { kind: 'account', address: x.launch })}</td><td class="r">${x.raised === null ? '<span class="muted">—</span>' : fig(fmtUsd(x.raised), { kind: 'account', address: x.launch })}</td></tr>`;
    };
    body = r.raises.map(row).join('');
    const raised = sum(r.raises.map((x) => (x.decoded ? x.raised ?? 0n : 0n)));
    total = `${fig(fmtInt(r.raises.length), self)} launch accounts${raised > 0n ? ` · raised in total ${fig(fmtUsd(raised), self)}` : ''}`;
    csv = [['launch', 'version', 'decoded', 'mint', 'state', 'launch_authority', 'minimum_usd', 'raised_usd'], ...r.raises.map((x) => x.decoded ? [x.launch, x.version, 'yes', x.mint, x.state, x.launchAuthority, microToDecimal(x.minimum), x.raised === null ? '' : microToDecimal(x.raised)] : [x.launch, x.version, 'no', '', '', '', '', ''])];
  } else if ('companies' in r) {
    head = '<th scope="col">Company</th><th scope="col" class="r">Raised</th><th scope="col" class="r">In the treasury at the scan</th>';
    body = r.companies.map((c) => `<tr><td><a href="${url(ctx, `company/${c.raise.mint}/`)}" data-label>${esc(c.displayName)}</a></td><td class="r">${c.raise.raised === null ? '—' : fig(fmtUsd(c.raise.raised), { kind: 'account', address: c.raise.launch })}</td><td class="r">${c.treasury ? fig(fmtUsd(c.treasury.net, { decimals: 2 }), { kind: 'account', address: c.treasury.row.usdcAccount }) : '<span class="muted">not read</span>'}</td></tr>`).join('');
    const bal = sum(r.companies.map((c) => c.treasury?.net ?? 0n));
    total = `${fig(fmtInt(r.companies.length), self)} companies${r.companies.some((c) => c.treasury) ? ` · in their treasuries at the scan ${fig(fmtUsd(bal, { decimals: 2 }), self)}` : ''}`;
    csv = [['company', 'mint', 'raised_usd', 'treasury_at_scan_usd'], ...r.companies.map((c) => [c.displayName, c.raise.mint, c.raise.raised === null ? '' : microToDecimal(c.raise.raised), c.treasury ? microToDecimal(c.treasury.net) : ''])];
  } else {
    head = '<th scope="col">Launch authority</th>';
    body = r.authorities.map((a) => `<tr><td>${chip(a, 'address')}</td></tr>`).join('');
    total = `${fig(fmtInt(r.authorities.length), self)} launch authorities`;
    csv = [['launch_authority'], ...r.authorities.map((a) => [a])];
  }
  const html = `<section class="wrap" style="padding-top:40px;padding-bottom:64px">
<nav aria-label="Breadcrumb" class="muted" style="font-size:13px"><a href="${url(ctx, '')}" class="muted">Home</a> / List</nav>
<h1 style="font-size:clamp(26px,3.4vw,36px);font-weight:600;margin-top:16px;max-width:900px">${titleHtml(e.what, site)}</h1>
<p class="soft" style="font-size:15px;margin-top:10px">Exactly the rows behind the figure you clicked. ${total}. <a href="list.csv">Download as CSV</a></p>
<div class="list-totals" hidden data-totals="${esc(JSON.stringify(totalsOf(r, site)))}"></div>
<div class="card tblbox" style="margin-top:20px"><table class="tbl" style="min-width:640px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
</section>`;
  return { html: page(ctx, { title: `${e.what} · raise-tracker`, description: `The rows behind a figure on raise-tracker: ${e.what}.`, body: html }), csv: csv.map((row) => row.map(csvCell).join(',')).join('\n') + '\n' };
}
