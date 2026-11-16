// Page shell and stylesheet, ported from the design canvas (raise-tracker design, 16 Nov 2026).
import { chip, date, esc, fig } from './fig.ts';
import { fmtInt } from './money.ts';

export type Ctx = {
  readonly base: string; // URL prefix, e.g. "/raise-tracker/"
  readonly scanAt: Date;
  readonly scanSlot: number; // slot the scan started at
  readonly commit: string | null; // data commit the site was built from
  readonly repo: string;
};

export const url = (ctx: Ctx, path: string): string => `${ctx.base}${path.replace(/^\//, '')}`;

const ICON = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="1" y="1" width="20" height="20" rx="6" stroke="currentColor" stroke-width="1.6"></rect><path d="M6 14.5h3.2M6 11h6.5M6 7.5h10" stroke="#2A44E8" stroke-width="1.6" stroke-linecap="round"></path></svg>';
const CODE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5.5 4L1.5 8l4 4M10.5 4l4 4-4 4"></path></svg>';

export function page(ctx: Ctx, o: { title: string; description: string; active?: 'companies' | 'methodology'; banner?: string; body: string }): string {
  const nav = (href: string, text: string, on: boolean) => `<a href="${href}" class="hide-sm nav${on ? ' on' : ''}"${on ? ' aria-current="page"' : ''}>${text}</a>`;
  const commit = ctx.commit ? `<a class="mono" href="https://github.com/${ctx.repo}/tree/${ctx.commit}/data" style="color:#AEBBFF">data ${esc(ctx.commit.slice(0, 7))}</a>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Inter+Tight:wght@500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="${url(ctx, 'site.css')}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Crect x='1' y='1' width='20' height='20' rx='6' fill='white' stroke='%230A0B0F' stroke-width='1.6'/%3E%3Cpath d='M6 14.5h3.2M6 11h6.5M6 7.5h10' stroke='%232A44E8' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<div class="wrap top-in">
<a href="${url(ctx, '')}" class="brand">${ICON}<span>raise-tracker</span></a>
<nav aria-label="Main" class="topnav">
${nav(url(ctx, '#companies'), 'Companies', o.active === 'companies')}
${nav(url(ctx, '#raises'), 'Raises', false)}
${nav(url(ctx, 'methodology/'), 'Methodology', o.active === 'methodology')}
<a href="https://github.com/${ctx.repo}" class="srcbtn" rel="noopener">${CODE}Source</a>
</nav>
</div>
</header>
<div class="banner"><div class="wrap banner-in">
<span class="banner-lead"><span class="dot" aria-hidden="true"></span>Data from the scan of ${date(ctx.scanAt, 'minute')}, slot ${fig(fmtInt(ctx.scanSlot), { kind: 'block', slot: ctx.scanSlot }, { dark: true, style: 'color:#FFFFFF' })}</span>
<span>${o.banner ?? 'Rebuilt automatically after every scan. If a check fails, the previous version stays up.'}</span>
${commit}
</div></div>
<main id="main">
${o.body}
</main>
<footer class="foot"><div class="wrap foot-in">
<span>raise-tracker · open source · data read from Solana mainnet</span>
<span class="foot-links"><a href="${url(ctx, 'data/raises.csv')}">raises.csv</a><a href="${url(ctx, 'data/treasury.csv')}">treasury.csv</a><a href="${url(ctx, 'data/treasury-flows.csv')}">treasury-flows.csv</a><a href="${url(ctx, 'methodology/')}">Methodology</a></span>
</div></footer>
</body>
</html>
`;
}

export const addr = (a: string, label?: string): string => chip(a, 'address', label);

export const CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#F6F7F9;color:#0A0B0F;font-family:Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.4}
a{color:#2A44E8;text-decoration:none}a:hover{color:#1B2FB8}
a:focus-visible,button:focus-visible,label:focus-visible{outline:2px solid #2A44E8;outline-offset:2px;border-radius:4px}
h1,h2,h3{font-family:'Inter Tight',Inter,sans-serif;margin:0;letter-spacing:-0.025em}
p{margin:0}
.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:12px;top:12px;background:#fff;padding:8px 12px;border-radius:8px;z-index:10}
.wrap{max-width:1200px;margin:0 auto;padding:0 32px}
.mono{font-family:'JetBrains Mono',monospace}
.card{background:#FFFFFF;border:1px solid #E6E8EC;border-radius:14px}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5B6170}
.muted{color:#5B6170}.soft{color:#3D4250}
.top{background:#FFFFFF;border-bottom:1px solid #E6E8EC}
.top-in{display:flex;align-items:center;justify-content:space-between;gap:16px;height:64px}
.brand{display:flex;align-items:center;gap:10px;color:#0A0B0F;font-family:'Inter Tight',sans-serif;font-weight:600;font-size:17px;letter-spacing:-0.02em}
.brand:hover{color:#0A0B0F}
.topnav{display:flex;align-items:center;gap:28px;font-size:14px}
.nav{color:#3D4250}.nav.on{color:#0A0B0F;font-weight:500}
.srcbtn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border:1px solid #E6E8EC;border-radius:8px;color:#0A0B0F}
.banner{background:#0A0B0F;color:#C9CEDA;font-size:13px}
.banner-in{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding-top:10px;padding-bottom:10px}
.banner-lead{display:inline-flex;align-items:center;gap:8px;color:#FFFFFF;font-weight:500}
.dot{width:7px;height:7px;border-radius:999px;background:#7C8CFF}
.foot{border-top:1px solid #E6E8EC;background:#FFFFFF;margin-top:72px}
.foot-in{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;padding-top:28px;padding-bottom:28px;font-size:13px;color:#5B6170}
.foot-links{display:flex;flex-wrap:wrap;gap:20px}
.fig{color:inherit;font-variant-numeric:tabular-nums;text-decoration:none;border-bottom:1px dotted #B8BFD0;display:inline-flex;align-items:center;gap:5px}
.fig:hover{color:#2A44E8;border-bottom-color:#2A44E8}
.fig-dk{border-bottom-color:#4A5068}.fig-dk:hover{color:#AEBBFF;border-bottom-color:#AEBBFF}
.mk{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:999px;flex:none;font-size:10px;font-weight:600;font-family:Inter,sans-serif;line-height:1}
.mk-v,.mk-s,.mk-f{background:#E8ECFF;color:#2A44E8}
.mk-d{border:1px dashed #7A8090;color:#4A5060;width:13px;height:13px}
.mk-p{background:#FFEBCC;color:#8A4200}
.mk-dk{background:#1E2440;color:#AEBBFF}
.badge{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap}
.b-v{background:#EEF1FF;color:#2236C7}.b-d{background:#FFFFFF;color:#3D4250;border:1px dashed #9AA0AE}
.b-p{background:#FFF3E0;color:#8A4200}.b-n{background:#F1F2F5;color:#3D4250}
.b-o{background:#FFF0E0;color:#8A4200}.b-k{background:#E7E9F4;color:#0F1A4A}
.chip{font-family:'JetBrains Mono',monospace;font-size:12px;color:#3D4250;background:#F1F2F5;border-radius:6px;padding:3px 7px;display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
.chip:hover{background:#E8ECFF;color:#2236C7}
.tblbox{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:14px;min-width:820px}
.tbl th{font-size:12px;font-weight:500;color:#5B6170;text-align:left;padding:12px 20px;border-bottom:1px solid #E6E8EC;white-space:nowrap;background:#FBFBFC}
.tbl td{padding:14px 20px;border-bottom:1px solid #EEF0F3;white-space:nowrap;vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}
.tbl tbody tr:hover{background:#FAFBFF}
.r{text-align:right}
.bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:#EEF0F3;width:168px}
.sq{width:12px;height:12px;border-radius:3px}
.btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:10px;font-weight:500;font-size:15px}
.btn-dark{background:#0A0B0F;color:#FFFFFF}.btn-dark:hover{color:#FFFFFF;background:#22252E}
.btn-light{background:#FFFFFF;color:#0A0B0F;border:1px solid #D9DCE3}.btn-light:hover{color:#0A0B0F;border-color:#0A0B0F}
.kv{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #EEF0F3;font-size:14px}
.kv:last-child{border-bottom:0}
.dl>div:last-child{border-bottom:0!important}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1px;background:#E6E8EC;border:1px solid #E6E8EC;border-radius:14px;overflow:hidden}
.stat{background:#FFFFFF;padding:24px}
.stat-l{font-size:13px;color:#5B6170;margin-bottom:10px}
.stat-v{font-family:'Inter Tight',sans-serif;font-size:34px;font-weight:600;letter-spacing:-0.02em}
.stat-n{font-size:13px;color:#5B6170;margin-top:8px}
.legend{display:flex;flex-wrap:wrap;gap:10px 24px;margin-top:20px;font-size:13px;color:#3D4250}
.legend span{display:inline-flex;align-items:center;gap:7px}
.sw{width:10px;height:10px;border-radius:3px;flex:none}
.note{display:flex;gap:14px;align-items:flex-start;border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.55}
.note-v{background:#EEF1FF;color:#1A2154}.note-p{background:#FFF3E0;color:#5A2C00}
.tabs input{position:absolute;opacity:0;pointer-events:none}
.tabbar{display:flex;gap:8px;flex-wrap:wrap}
.tabbar label{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:8px;border:1px solid #D9DCE3;background:#FFFFFF;color:#0A0B0F;font:500 13px Inter,sans-serif;cursor:pointer}
.tab-panel{display:none}
#t-cur:checked~.tabhead label[for=t-cur],#t-perm:checked~.tabhead label[for=t-perm],#t-all:checked~.tabhead label[for=t-all]{background:#0A0B0F;color:#FFFFFF;border-color:#0A0B0F}
#t-cur:focus-visible~.tabhead label[for=t-cur],#t-perm:focus-visible~.tabhead label[for=t-perm],#t-all:focus-visible~.tabhead label[for=t-all]{outline:2px solid #2A44E8;outline-offset:2px}
#t-cur:checked~.panels .p-cur,#t-perm:checked~.panels .p-perm,#t-all:checked~.panels .p-all{display:block}
.chart{position:relative;height:180px;min-width:520px;display:flex;align-items:flex-end;gap:8px;border-bottom:1px solid #D9DCE3}
.chart .b{flex:1;background:#2A44E8;border-radius:4px 4px 0 0;min-height:2px}
.chart .zero{background:#E6E8EC}
.chart .line{position:absolute;left:0;right:0}
.chart-x{display:flex;gap:8px;min-width:520px;margin-top:8px;font-size:11px;color:#5B6170;text-align:center}
.chart-x span{flex:1}
.ph{border:1px dashed #C9CDD6;border-radius:10px;padding:14px;font-size:13px;color:#5B6170}
.prose{max-width:760px}
.prose h2{font-size:26px;font-weight:600;margin:48px 0 12px}
.prose h3{font-size:18px;font-weight:600;margin:28px 0 8px}
.prose p,.prose li{font-size:16px;line-height:1.65;color:#2A2E38}
.prose p{margin:0 0 14px}
.prose ul{padding-left:20px;margin:0 0 14px}
.prose code{font-family:'JetBrains Mono',monospace;font-size:13px;background:#F1F2F5;padding:1px 5px;border-radius:4px}
@media (max-width:720px){
.wrap{padding:0 16px}.hide-sm{display:none}
.stat{padding:18px}.stat-v{font-size:28px}
.topnav{gap:12px}
}
@media (prefers-reduced-motion:no-preference){a,.chip,.fig{transition:color .12s,background-color .12s,border-color .12s}}
`;
