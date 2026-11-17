// Public code: what a team's public GitHub repositories show, in the table (one line) and on the company page (with the numbers).
// Everything here is neutral: counts and dates, no word that grades a team, and 0 is a measured count, never a verdict.
import { date, esc, fig } from '../fig.ts';
import { fmtInt } from '../money.ts';
import { constant } from '../constants.ts';
import { url, type Ctx } from '../layout.ts';
import type { CodeInfo, Company } from '../model.ts';

const GH = 'https://github.com/';

/** A tiny bar chart of commits per month from the month of the raise; the numbers are in the CSV the page links, not in the picture. */
export function bars(months: readonly { month: string; commits: number }[]): string {
  const max = Math.max(1, ...months.map((m) => m.commits));
  const w = 5, gap = 2, h = 22;
  const width = months.length * (w + gap) - gap;
  const rects = months.map((m, i) => { const bh = m.commits === 0 ? 1 : Math.max(3, Math.round((m.commits / max) * h)); return `<rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${bh}" fill="#111"${m.commits === 0 ? ' opacity=".25"' : ''}></rect>`; }).join('');
  return `<svg class="spark" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Public commits per month, from the month of the raise to the day they were read">${rects}</svg>`;
}

/** What Public code says, worded as the mockup words it. `dim`: not an active repository. */
export function codeText(c: Company): { html: string; dim: boolean } {
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

export const codeBars = (c: Company): string => ((c.code.kind === 'active' || c.code.kind === 'quiet') && c.code.months.length > 0 ? bars(c.code.months) : '');

const chipLink = (href: string, text: string): string => `<a class="chip" href="${esc(href)}" rel="noopener">${esc(text)}</a>`;

/**
 * The Public code section of a company's page. A team without a repository gets the same words the table shows, and no number.
 * With repositories: releases since the raise (the latest with its tag, date and link), pre-releases apart, and how many people committed.
 * Each number links to the GitHub page it was counted from; a total over several repositories links to the organisation and is
 * the sum of the per-repository counts in the table below it (the number of people is not a sum: one person in two repositories is one).
 */
export function publicCodeSection(ctx: Ctx, c: Company): string {
  const code = codeText(c);
  const s = c.shipped;
  const meth = url(ctx, 'methodology/#shipped');
  const head = `<section id="public-code" class="wrap" style="padding-top:56px">
<div class="eyebrow" style="margin-bottom:12px">Public code</div>
<h2 style="font-size:clamp(26px,3vw,34px);font-weight:600;margin-bottom:12px">What the public repositories show</h2>
<p class="soft" style="font-size:16px;margin:0 0 6px">${code.html}</p>${codeBars(c)}`;
  if (!s) return `${head}\n</section>`;
  const single = s.repos.length === 1;
  const only = s.repos[0];
  const relHref = single && only ? `${GH}${only.repo}/releases` : `${GH}${s.owner}`;
  const comHref = single && only ? `${GH}${only.repo}/commits` : `${GH}${s.owner}`;
  const how = single ? '' : '; the total of the per-repository counts in the table below';
  const releases = fig(fmtInt(s.releases), { kind: 'formula', href: relHref, formula: `published releases since the raise, pre-releases and drafts not counted${how}` });
  const pre = fig(fmtInt(s.prereleases), { kind: 'formula', href: relHref, formula: `published pre-releases since the raise${how}` });
  const people = fig(fmtInt(s.people), { kind: 'formula', href: comHref, formula: `different people who committed to the default branch since the raise, bots left out${single ? '' : '; one person in several repositories counts once'}` });
  const latest = s.latest && s.latest.latestTag && s.latest.latestDate && s.latest.latestUrl
    ? `latest: ${chipLink(s.latest.latestUrl, s.latest.latestTag)} · ${date(s.latest.latestDate)}${single ? '' : ` · ${chipLink(`${GH}${s.latest.repo}`, s.latest.repo.split('/')[1] ?? '')}`}`
    : 'no release published since the raise';
  const row = (l: string, v: string, n = '') => `<div class="kv" style="align-items:flex-start"><span class="soft">${l}</span><span style="text-align:right">${v}${n ? `<br><span class="muted" style="font-size:13px">${n}</span>` : ''}</span></div>`;
  const table = single ? '' : `<div class="tblbox" style="margin-top:20px"><table class="tbl" style="min-width:620px"><caption style="text-align:left;padding:0 0 8px">By repository</caption><thead><tr><th scope="col">Repository</th><th scope="col" class="r">Releases</th><th scope="col" class="r">Pre-releases</th><th scope="col" class="r">People who committed</th><th scope="col">Latest release</th></tr></thead><tbody>${s.repos.map((r) => `<tr><td>${chipLink(`${GH}${r.repo}`, r.repo.split('/')[1] ?? '')}</td><td class="r">${fig(fmtInt(r.releases), { kind: 'formula', href: `${GH}${r.repo}/releases`, formula: 'published releases since the raise, pre-releases and drafts not counted' })}</td><td class="r">${fig(fmtInt(r.prereleases), { kind: 'formula', href: `${GH}${r.repo}/releases`, formula: 'published pre-releases since the raise' })}</td><td class="r">${fig(fmtInt(r.contributors), { kind: 'formula', href: `${GH}${r.repo}/commits`, formula: 'different people who committed to the default branch since the raise, bots left out' })}</td><td>${r.latestTag && r.latestDate && r.latestUrl ? `${chipLink(r.latestUrl, r.latestTag)} · ${date(r.latestDate)}` : '<span class="muted">none since the raise</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  return `${head}
<div class="card" style="padding:8px 24px;max-width:760px;margin-top:16px">
${row('Releases since the raise', releases, latest)}
${row('Pre-releases since the raise', pre)}
${row('People who committed since the raise', people, 'different people on the default branch, bots left out; no names are kept')}
</div>
${table}
<p class="muted" style="font-size:13px;margin-top:14px;max-width:760px;line-height:1.55">Counted from the public GitHub pages linked on each number, read on ${date(s.readAt)}. Publishing releases is optional, and not every team uses them: a count of zero says only that none was published here. <a href="${meth}">What is counted</a></p>
</section>`;
}
