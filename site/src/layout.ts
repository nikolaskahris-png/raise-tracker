// Page shell and stylesheet. The look is a newspaper's data table (FT, ProPublica): white page, black text, one blue for links,
// rules instead of boxes, Newsreader for headlines, IBM Plex Sans for text and IBM Plex Mono for tickers and addresses.
import { chip, date, esc } from './fig.ts';
import { C, constant } from './constants.ts';

export type Ctx = {
  readonly base: string; // URL prefix, e.g. "/raise-tracker/"
  readonly scanAt: Date;
  readonly scanSlot: number; // slot the scan started at (shown on the Methodology page)
  readonly builtAt: Date; // when this build ran (SITE_NOW overrides it in tests)
  /** What started this build: GitHub's event_name for the site workflow, and for a workflow_run, the scan's own event. */
  readonly siteTrigger: string | null;
  readonly scanTrigger: string | null;
  readonly commit: string | null; // data commit the site was built from (shown on the Methodology page)
  readonly repo: string;
};

export const url = (ctx: Ctx, path: string): string => `${ctx.base}${path.replace(/^\//, '')}`;

/** Data older than this counts as stale and the banner says so (at build time, and again in the browser). */
export const STALE_HOURS = C.stale_hours;
export const isStale = (ctx: Ctx): boolean => ctx.builtAt.getTime() - ctx.scanAt.getTime() > STALE_HOURS * 3_600_000;

/** Says the site rebuilt itself only when this very build was started by a scheduled scan; otherwise it claims nothing. */
export function buildNote(ctx: Ctx): string {
  if (ctx.siteTrigger === 'workflow_run' && ctx.scanTrigger === 'schedule') return 'Rebuilt automatically after the scheduled scan. ';
  if (ctx.siteTrigger === 'workflow_run') return 'Rebuilt after a scan started by hand. ';
  return '';
}

export type Active = 'companies' | 'raises' | 'methodology';

/**
 * Inline styles written before the redesign may still carry rounded corners, shadows or the old typeface; the one place that
 * strips them is here, so no page can bring a pill or a shadow back.
 */
export function flatten(html: string): string {
  return html
    .replace(/\s*border-radius:[^;"]*;?/g, '')
    .replace(/\s*box-shadow:[^;"]*;?/g, '')
    .replace(/\s*background:#(?:FFFAF3|FFF3E0|FFEBCC|FFF0E0|FBFBFC|F6F7F9|EEF1FF|F4F6FF|E8ECFF|FFFFFF|fff)(?=[;"'])/gi, '')
    .replace(/;;+/g, ';')
    .replace(/'Inter Tight',sans-serif/g, "'IBM Plex Sans',sans-serif")
    .replace(/style="\s*"/g, '');
}

export function page(ctx: Ctx, o: { title: string; description: string; active?: Active; banner?: string; body: string }): string {
  const nav = (href: string, text: string, on: boolean, external = false) => `<a href="${href}" class="nav${on ? ' on' : ''}"${on ? ' aria-current="page"' : ''}${external ? ' rel="noopener"' : ''}>${text}</a>`;
  return flatten(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="stylesheet" href="${url(ctx, 'site.css')}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Crect x='1' y='1' width='20' height='20' fill='white' stroke='%23111' stroke-width='1.6'/%3E%3Cpath d='M6 14.5h3.2M6 11h6.5M6 7.5h10' stroke='%23111' stroke-width='1.6'/%3E%3C/svg%3E">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<div class="wrap top-in">
<a href="${url(ctx, '')}" class="brand">raise-tracker</a>
<nav aria-label="Main" class="topnav">
${nav(url(ctx, ''), 'Companies', o.active === 'companies')}
${nav(url(ctx, 'raises/'), 'All raises', o.active === 'raises')}
${nav(url(ctx, 'methodology/'), 'How we check', o.active === 'methodology')}
${nav(`https://github.com/${ctx.repo}`, 'Data &amp; code', false, true)}
</nav>
</div>
</header>
<div class="banner"><div class="wrap banner-in">
<span>Updated ${date(ctx.scanAt, 'minute')} · read directly from Solana · every figure links to its source</span>
<span>${o.banner ? `${o.banner} ` : ''}${buildNote(ctx)}</span>
<span class="stale" data-scan="${ctx.scanAt.toISOString()}" data-hours="${STALE_HOURS}"${isStale(ctx) ? '' : ' hidden'}>This data is more than ${constant('stale_hours')} hours old. The latest scan may have failed or not run yet.</span>
<script>(function(){var s=document.querySelector('.stale');if(!s)return;var h=(Date.now()-Date.parse(s.getAttribute('data-scan')))/36e5;if(h>Number(s.getAttribute('data-hours')))s.hidden=false;})();</script>
</div></div>
<main id="main">
${o.body}
</main>
<footer class="foot"><div class="wrap foot-in">
<span>raise-tracker · open source · data read from Solana mainnet</span>
<span class="foot-links"><a href="${url(ctx, 'data/raises.csv')}">raises.csv</a><a href="${url(ctx, 'data/treasury.csv')}">treasury.csv</a><a href="${url(ctx, 'data/treasury-flows.csv')}">treasury-flows.csv</a><a href="${url(ctx, 'data/commits-monthly.csv')}">commits-monthly.csv</a><a href="${url(ctx, 'methodology/')}">How we check</a><a href="https://github.com/${ctx.repo}" rel="noopener">Source</a></span>
</div></footer>
</body>
</html>
`);
}

export const addr = (a: string, label?: string): string => chip(a, 'address', label);

export const CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:#111;font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:#1d4ed8;text-decoration:none}a:hover{color:#1e3a8a;text-decoration:underline}
a:focus-visible,button:focus-visible,label:focus-visible,summary:focus-visible,input:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}
h1,h2,h3{font-family:Newsreader,Georgia,serif;font-weight:500;margin:0;letter-spacing:-0.01em;line-height:1.12}
p{margin:0}
.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:12px;top:12px;background:#fff;padding:8px 12px;border:1px solid #111;z-index:10}
.wrap{max-width:1180px;margin:0 auto;padding:0 32px}
.mono{font-family:'IBM Plex Mono',monospace}
.num{font-variant-numeric:tabular-nums}
.card{background:transparent;border:0;border-top:1px solid #d6d2c9;border-radius:0}
.eyebrow{font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#55524c}
.muted{color:#55524c}.soft{color:#33312c}
.top{border-bottom:2px solid #111}
.top-in{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding-top:22px;padding-bottom:14px}
.brand{font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:500;letter-spacing:.02em;color:#111}.brand:hover{color:#111;text-decoration:none}
.topnav{display:flex;flex-wrap:wrap;gap:0 28px;font-size:14px}
.nav{color:#55524c}.nav.on{color:#111;font-weight:600}
.banner{font-size:13px;color:#55524c;border-bottom:1px solid #e7e4dd}
.banner-in{display:flex;flex-wrap:wrap;align-items:center;gap:4px 20px;padding-top:10px;padding-bottom:10px}
.stale{flex-basis:100%;color:#111;font-weight:600;border-left:3px solid #111;padding-left:10px}
.stale[hidden]{display:none}
.foot{border-top:1px solid #e7e4dd;margin-top:72px}
.foot-in{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;padding-top:28px;padding-bottom:28px;font-size:13px;color:#55524c}
.foot-links{display:flex;flex-wrap:wrap;gap:8px 20px}
.fig{color:inherit;font-variant-numeric:tabular-nums;text-decoration:none;border-bottom:1px dotted #b8b3a8}
.fig:hover{color:#1d4ed8;border-bottom-color:#1d4ed8;text-decoration:none}
.mk{display:none}
.badge{display:inline;font-size:12px;color:#55524c;font-weight:500;white-space:normal}
.chip{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#1d4ed8;white-space:nowrap}
.chip:hover{text-decoration:underline}
.tblbox{overflow-x:auto;border-top:1px solid #111}
.tbl{width:100%;border-collapse:collapse;font-size:14px;min-width:820px}
.tbl caption{font-family:Newsreader,Georgia,serif;font-size:18px;font-weight:500}
.tbl th{font-size:12px;font-weight:500;color:#55524c;text-align:left;text-transform:uppercase;letter-spacing:.06em;padding:12px 12px 10px;border-bottom:1px solid #d6d2c9;white-space:nowrap}
.tbl td{padding:12px;border-bottom:1px solid #ece9e2;white-space:nowrap;vertical-align:middle}
.tbl th:first-child,.tbl td:first-child{padding-left:0}.tbl th:last-child,.tbl td:last-child{padding-right:0}
.tbl tbody tr:hover td{background:#faf9f6}
.r{text-align:right}
.bar{display:flex;height:4px;overflow:hidden;background:#ece9e2;width:168px}
.sq{width:12px;height:12px}
.btn{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid #111;border-radius:2px;font-weight:500;font-size:14px;color:#111;background:#fff}
.btn:hover{text-decoration:none;background:#faf9f6;color:#111}.btn-dark{background:#111;color:#fff}.btn-dark:hover{background:#33312c;color:#fff}
.btn-light{background:#fff}
.kv{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #ece9e2;font-size:14px}
.kv:last-child{border-bottom:0}
.dl>div:last-child{border-bottom:0!important}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 28px;border-top:1px solid #111}
.stat{padding:16px 0;border-bottom:1px solid #ece9e2}
.stat-l{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#55524c;margin-bottom:6px}
.stat-v{font-family:'IBM Plex Sans',sans-serif;font-size:28px;font-weight:500;letter-spacing:-0.01em;font-variant-numeric:tabular-nums}
.stat-n{font-size:13px;color:#55524c;margin-top:6px}
.legend{display:block;margin-top:18px;font-size:13px;color:#33312c}
.legend span{display:block;margin:2px 0}
.sw{display:inline-block;width:10px;height:10px;margin-right:6px}
.note{display:block;border-left:3px solid #111;padding:2px 0 2px 14px;font-size:14px;line-height:1.55}
.note-v,.note-p{background:transparent;color:#111}
.tabs>input[type=radio]{position:absolute;opacity:0;pointer-events:none}
.tabbar{display:flex;gap:6px;flex-wrap:wrap}
.tabbar label{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid #d6d2c9;border-radius:2px;background:#fff;color:#111;font:14px 'IBM Plex Sans',sans-serif;cursor:pointer}
#t-all:checked~.tabhead label[for=t-all],#t-perm:checked~.tabhead label[for=t-perm],#t-not:checked~.tabhead label[for=t-not]{background:#111;color:#fff;border-color:#111}
#t-all:focus-visible~.tabhead label[for=t-all],#t-perm:focus-visible~.tabhead label[for=t-perm],#t-not:focus-visible~.tabhead label[for=t-not]{outline:2px solid #1d4ed8;outline-offset:2px}
#t-perm:checked~.panels [data-track=curated],#t-not:checked~.panels [data-track=permissionless]{display:none}
.tabbar label .fig{color:inherit;border-bottom-color:currentColor;margin-left:.4em}
.chart{position:relative;height:180px;min-width:520px;display:flex;align-items:flex-end;gap:8px;border-bottom:1px solid #111}
.chart .b{flex:1;background:#111;min-height:2px}
.chart .zero{background:#ece9e2}
.chart .line{position:absolute;left:0;right:0}
.periods{list-style:none;margin:12px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 16px;font-size:13px}.periods li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #ece9e2;padding:4px 0}
.chart-x{display:flex;gap:8px;min-width:520px;margin-top:8px;font-size:11px;color:#55524c;text-align:center}
.chart-x span{flex:1}
.ph{border:1px dashed #b8b3a8;padding:14px;font-size:13px;color:#55524c}
.prose{max-width:760px}
.prose h2{font-size:28px;margin:48px 0 12px;border-top:1px solid #111;padding-top:14px}
.prose h3{font-size:20px;margin:28px 0 8px}
.prose p,.prose li{font-size:16px;line-height:1.65;color:#222}
.prose p{margin:0 0 14px}
.prose ul{padding-left:20px;margin:0 0 14px}
.prose code{font-family:'IBM Plex Mono',monospace;font-size:13px}
/* the companies table */
.filters{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 0 14px}
.srch{display:flex;align-items:center;gap:8px;font-size:14px;color:#55524c}
.srch input{font:inherit;width:220px;height:44px;padding:0 10px;border:1px solid #d6d2c9;border-radius:2px;color:#111;background:#fff}.srch[hidden],.srch input[hidden]{display:none}
.cotbl{min-width:980px}
.cotbl td{white-space:normal;vertical-align:top;padding:14px 12px}
.cotbl .co{min-width:190px}.cotbl .coname{color:#111;font-weight:600;font-size:15px}
.cotbl .sub{font-size:12px;color:#55524c;margin-top:3px}
.cotbl .v{font-weight:500}
.cotbl .code-v{font-size:14px}.cotbl .code-v.dim{color:#55524c}
.cotbl .rec{font-size:13px;line-height:1.5}.cotbl .rec div{margin-bottom:2px}
.lbar{height:4px;background:#ece9e2;margin-top:7px;min-width:96px}.lbar i{display:block;height:4px;background:#111}
.spark{display:block;margin-top:6px}
.sortbtn{all:unset;cursor:pointer;font:inherit;text-transform:inherit;letter-spacing:inherit;color:inherit;display:inline-flex;align-items:center;gap:4px;min-height:24px}.sortbtn:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}
th[aria-sort=ascending] .sortbtn::after{content:"↑"}th[aria-sort=descending] .sortbtn::after{content:"↓"}
.nomatch{display:none!important}
.notes2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;font-size:13px;line-height:1.55;color:#55524c;padding:20px 0 0}
.notes2 b{color:#111}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.colist{display:none}
.hero{padding:44px 0 20px;max-width:820px}
.hero h1{font-size:46px;line-height:1.08;margin:0 0 16px}
.hero p{font-size:18px;line-height:1.5;color:#33312c}
.sect{padding-top:48px}
.sect h2{font-size:30px;margin:0 0 10px}
@media (max-width:720px){
.wrap{padding:0 18px}
.top-in{flex-direction:column;align-items:flex-start;gap:4px}
.topnav{gap:0 18px}.topnav a{display:inline-flex;align-items:center;min-height:44px}
.hero{padding:22px 0 12px}.hero h1{font-size:30px}.hero p{font-size:15px}
.notes2{grid-template-columns:1fr;gap:12px}
.cotbl-d{display:none}
.colist{display:block;border-top:1px solid #111}
.colist details{border-bottom:1px solid #ece9e2}
.colist summary{list-style:none;display:flex;justify-content:space-between;align-items:baseline;gap:12px;min-height:44px;padding:12px 0;cursor:pointer}
.colist summary::-webkit-details-marker{display:none}
.colist summary .l{min-width:0}.colist summary .nm{font-weight:600;font-size:15px}.colist summary .st{font-size:12px;color:#55524c;margin-top:2px}
.colist summary .rt{text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.colist summary .rt .a{font-weight:500}.colist summary .rt .b{font-size:13px;color:#55524c}
.colist details[open]{background:#faf9f6;margin:0 -18px;padding:0 18px}
.colist .more{padding:0 0 12px}
.colist dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;margin:6px 0 0;font-size:13px}
.colist dt{color:#55524c;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.colist dd{margin:2px 0 0}
.colist .recs{margin-top:12px;font-size:13px;line-height:1.5}
.colist .open{display:inline-flex;align-items:center;gap:.3em;min-height:44px;font-weight:500;font-size:14px}
.tblbox{overflow-x:auto}
.filters{padding-top:6px}.srch{width:100%}.srch input{width:100%}
.tabbar label{min-height:44px}
.stat-v{font-size:24px}
.prose h2{font-size:24px}
}
@media (prefers-reduced-motion:no-preference){a,.chip,.fig{transition:color .12s,border-color .12s}}
`;
