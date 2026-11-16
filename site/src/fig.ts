// Provenance. A number may appear on a page only through fig(), which forces it to carry a source and a link.
// The post-build check (check-html.ts) fails the build if any digit in <main> is outside a figure,
// a <time>, an address chip or a labelled constant.

export type Source =
  | { readonly kind: 'tx'; readonly signature: string }
  | { readonly kind: 'account'; readonly address: string }
  | { readonly kind: 'sum'; readonly href: string; readonly what: string }
  | { readonly kind: 'formula'; readonly href: string; readonly formula: string }
  | { readonly kind: 'declared'; readonly href: string; readonly by: string };

export const EXPLORER = 'https://explorer.solana.com';
export const txUrl = (sig: string): string => `${EXPLORER}/tx/${sig}`;
export const addrUrl = (a: string): string => `${EXPLORER}/address/${a}`;

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CHECK = '<svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"></path></svg>';

function mark(src: Source, dark: boolean): string {
  const dk = dark ? ' mk-dk' : '';
  switch (src.kind) {
    case 'tx':
    case 'account':
      return `<span class="mk mk-v${dk}" aria-hidden="true">${CHECK}</span>`;
    case 'sum':
      return `<span class="mk mk-s${dk}" aria-hidden="true">Σ</span>`;
    case 'formula':
      return `<span class="mk mk-f${dk}" aria-hidden="true">=</span>`;
    case 'declared':
      return `<span class="mk mk-d" aria-hidden="true"></span>`;
  }
}

function hrefOf(src: Source): string {
  switch (src.kind) {
    case 'tx': return txUrl(src.signature);
    case 'account': return addrUrl(src.address);
    case 'sum':
    case 'formula':
    case 'declared': return src.href;
  }
}

function titleOf(src: Source): string {
  switch (src.kind) {
    case 'tx': return 'Verified onchain: opens the transaction';
    case 'account': return 'Verified onchain: opens the account it is read from';
    case 'sum': return `Sum of ${src.what}`;
    case 'formula': return `Computed: ${src.formula}`;
    case 'declared': return `Declared by ${src.by}, not onchain`;
  }
}

export type FigOpts = { readonly cls?: string; readonly style?: string; readonly dark?: boolean; readonly bare?: boolean };

/** A number with its source. `text` is the already formatted figure. */
export function fig(text: string, src: Source, o: FigOpts = {}): string {
  const external = /^https?:/.test(hrefOf(src));
  return `<a class="fig${o.dark ? ' fig-dk' : ''}${o.cls ? ' ' + o.cls : ''}" data-figure="${src.kind}" href="${esc(hrefOf(src))}" title="${esc(titleOf(src))}"${external ? ' rel="noopener"' : ''}${o.style ? ` style="${o.style}"` : ''}>${esc(text)}${o.bare ? '' : mark(src, o.dark ?? false)}</a>`;
}

/** A shortened address or signature, linking to the explorer. Digits inside chips are identifiers, not figures. */
export function chip(full: string, kind: 'address' | 'tx', label?: string): string {
  const short = label ?? `${full.slice(0, 6)}…${full.slice(-4)}`;
  return `<a class="chip" href="${kind === 'tx' ? txUrl(full) : addrUrl(full)}" title="${esc(full)}" rel="noopener">${esc(short)}${kind === 'tx' ? ' ↗' : ''}</a>`;
}

/** A fixed rule of the method (for example the $10,000 threshold), not a measured figure. */
export const label = (text: string, title: string): string => `<span data-label title="${esc(title)}">${esc(text)}</span>`;

/** A time span in the largest unit that keeps it readable: minutes under 90 minutes, hours under 48 hours, else days. */
export function duration(ms: number): string {
  if (!(ms >= 0)) throw new Error(`duration: ${ms}`);
  const min = ms / 60_000;
  if (min < 90) return `${Math.round(min)} minute${Math.round(min) === 1 ? '' : 's'}`;
  const h = ms / 3_600_000;
  if (h < 48) return `${h.toFixed(1)} hours`;
  return `${(ms / 86_400_000).toFixed(1)} days`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function date(d: Date, style: 'day' | 'month' | 'minute' = 'day'): string {
  const day = d.getUTCDate(), mon = MONTHS[d.getUTCMonth()] ?? '', y = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  const text = style === 'month' ? `${mon} ${y}` : style === 'minute' ? `${day} ${mon} ${y}, ${hh}:${mm} UTC` : `${day} ${mon} ${y}`;
  return `<time datetime="${d.toISOString()}">${text}</time>`;
}
