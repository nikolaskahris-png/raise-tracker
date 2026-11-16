// Post-build checks on the generated HTML.
// Rule: inside <main>, every run of digits must sit inside a linked figure (a[data-figure][href]),
// a <time>, an address chip (a.chip), a labelled constant ([data-label]) or a verbatim quote (q[data-quote]) whose text is
// exactly a quote from registry/names.json. Anything else is a number typed in by hand.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['script', 'style', 'svg']);

const unescape = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export function unsourcedDigits(html: string, quotes: ReadonlySet<string> = new Set()): string[] {
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html)?.[1];
  if (main === undefined) return ['no <main> element'];
  const found: string[] = [];
  // A quote may hold digits only if it is, character for character, a quote from names.json.
  for (const q of main.matchAll(/<q\b[^>]*\bdata-quote\b[^>]*>([\s\S]*?)<\/q>/g)) {
    const text = unescape(q[1] ?? '');
    if (/\d/.test(text) && !quotes.has(text)) found.push(`quote not in names.json: ${text.slice(0, 80)}`);
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
    const allowed = isFigure || isChip || isQuote || tag === 'time' || /\bdata-label\b/.test(attrs);
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

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? htmlFiles(p) : n.endsWith('.html') ? [p] : [];
  });
}

export function checkHtmlDir(dir: string, mints: readonly string[], quotes: ReadonlySet<string> = new Set()): string[] {
  const problems: string[] = [];
  for (const mint of mints) if (!existsSync(join(dir, 'company', mint, 'index.html'))) problems.push(`missing page for ${mint}`);
  for (const f of htmlFiles(dir)) {
    const html = readFileSync(f, 'utf8');
    const rel = relative(dir, f);
    for (const d of unsourcedDigits(html, quotes)) problems.push(`${rel}: number without a source: "${d}"`);
    for (const b of badTokens(html)) problems.push(`${rel}: ${b}`);
  }
  return problems;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const dir = process.argv[2] ?? 'dist';
  const problems = checkHtmlDir(dir, []);
  for (const p of problems) console.error(p);
  console.log(problems.length ? `${problems.length} problem(s)` : 'HTML checks passed');
  process.exit(problems.length ? 1 : 0);
}
