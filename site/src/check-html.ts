// Post-build checks on the generated HTML.
// Rule: inside <main>, every run of digits must sit inside one of:
//   a linked figure (a[data-figure][href]); a <time>; an address or code chip (a.chip[href]);
//   a rule of the method (span[data-constant]) whose text is exactly that key's value in constants.json;
//   a label (a data-label element) whose text, if it holds digits, is an identifier taken from the data (a name, symbol or mint prefix);
//   a verbatim quote (q[data-quote]) whose text is exactly a quote from registry/names.json.
// Anything else is a number typed in by hand. Every Σ figure must open a list page whose totals include the figure's text.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['script', 'style', 'svg']);

const unescape = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const textOf = (html: string): string => unescape(html.replace(/<[^>]+>/g, '')).trim();

export type Allowed = {
  readonly quotes?: ReadonlySet<string>; // verbatim quotes from names.json
  readonly identifiers?: ReadonlySet<string>; // names, symbols and mint prefixes from the data
  readonly constants?: Readonly<Record<string, string>>; // constant key -> its exact text
};

export function unsourcedDigits(html: string, allowed: Allowed | ReadonlySet<string> = {}): string[] {
  const a: Allowed = allowed instanceof Set ? { quotes: allowed } : (allowed as Allowed);
  const quotes = a.quotes ?? new Set<string>(), ids = a.identifiers ?? new Set<string>(), consts = a.constants ?? {};
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1];
  if (main === undefined) return ['no <main> element'];
  const found: string[] = [];
  for (const q of main.matchAll(/<q\b[^>]*\bdata-quote\b[^>]*>([\s\S]*?)<\/q>/g)) {
    const text = unescape(q[1] ?? '');
    if (/\d/.test(text) && !quotes.has(text)) found.push(`quote not in names.json: ${text.slice(0, 80)}`);
  }
  for (const c of main.matchAll(/<span\b[^>]*\bdata-constant="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g)) {
    const want = consts[c[1] ?? ''];
    if (want === undefined || textOf(c[2] ?? '') !== want) found.push(`constant ${c[1]} shows "${textOf(c[2] ?? '')}", constants.json gives "${want ?? 'nothing'}"`);
  }
  for (const l of main.matchAll(/<(span|a|div)\b[^>]*\bdata-label\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = textOf(l[2] ?? '');
    if (/\d/.test(text) && !ids.has(text)) found.push(`label with digits that is not an identifier from the data: ${text.slice(0, 80)}`);
  }
  const stack: { tag: string; allowed: boolean; skip: boolean }[] = [];
  const allowedNow = () => stack.some((s) => s.allowed);
  const skipNow = () => stack.some((s) => s.skip);
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(main))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[3] !== undefined) {
      const text = m[3].replace(/&#?\w+;/g, ' ');
      if (/\d/.test(text) && !allowedNow() && !skipNow()) found.push(text.trim().slice(0, 80));
      continue;
    }
    const tag = (m[1] ?? '').toLowerCase();
    const attrs = m[2] ?? '';
    if (m[0].startsWith('</')) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      continue;
    }
    if (VOID.has(tag) || attrs.trim().endsWith('/')) continue;
    if (tag === 'a' && stack.some((x) => x.tag === 'a')) found.push('a link nested inside a link');
    const isFigure = tag === 'a' && /\bdata-figure="/.test(attrs) && /\bhref="[^"]+"/.test(attrs);
    const isChip = tag === 'a' && /\bclass="chip"/.test(attrs) && /\bhref="[^"]+"/.test(attrs);
    const isQuote = tag === 'q' && /\bdata-quote\b/.test(attrs);
    const isConstant = tag === 'span' && /\bdata-constant="/.test(attrs);
    const allowed = isFigure || isChip || isQuote || isConstant || tag === 'time' || /\bdata-label\b/.test(attrs);
    stack.push({ tag, allowed, skip: SKIP.has(tag) });
  }
  return found;
}

export function badTokens(html: string): string[] {
  const out: string[] = [];
  for (const bad of ['NaN', 'undefined', 'Infinity', '[object Object]', 'null%']) if (html.includes(bad)) out.push(`contains "${bad}"`);
  if (/data-figure="[^"]*"[^>]*href=""/.test(html)) out.push('a figure with an empty link');
  return out;
}

/** Every Σ figure opens a page under lists/ whose totals include the figure's text. */
export function sumLinks(html: string, dir: string): string[] {
  const out: string[] = [];
  for (const f of html.matchAll(/<a\b[^>]*\bdata-figure="sum"[^>]*>([\s\S]*?)<\/a>/g)) {
    const tag = /^<a\b[^>]*>/.exec(f[0])?.[0] ?? '';
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1] ?? '';
    const id = /\blists\/([a-z0-9-]+)\/$/.exec(href)?.[1];
    const shown = textOf((f[1] ?? '').replace(/<span class="mk[^"]*"[^>]*>[\s\S]*?<\/span>/g, ''));
    if (!id) { out.push(`Σ figure "${shown}" does not open a list page: ${href}`); continue; }
    const page = join(dir, 'lists', id, 'index.html');
    if (!existsSync(page)) { out.push(`Σ figure "${shown}" opens a missing list ${id}`); continue; }
    const totals = JSON.parse(unescape(/data-totals="([^"]*)"/.exec(readFileSync(page, 'utf8'))?.[1] ?? '[]')) as string[];
    if (!totals.includes(shown)) out.push(`Σ figure "${shown}" does not equal its list ${id} (${totals.join(' | ')})`);
  }
  return out;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? htmlFiles(p) : n.endsWith('.html') ? [p] : [];
  });
}

export function checkHtmlDir(dir: string, mints: readonly string[], allowed: Allowed = {}): string[] {
  const problems: string[] = [];
  for (const mint of mints) if (!existsSync(join(dir, 'company', mint, 'index.html'))) problems.push(`missing page for ${mint}`);
  for (const f of htmlFiles(dir)) {
    const html = readFileSync(f, 'utf8');
    const rel = relative(dir, f);
    for (const d of unsourcedDigits(html, allowed)) problems.push(`${rel}: number without a source: "${d}"`);
    for (const b of badTokens(html)) problems.push(`${rel}: ${b}`);
    for (const s of sumLinks(html, dir)) problems.push(`${rel}: ${s}`);
  }
  return problems;
}
