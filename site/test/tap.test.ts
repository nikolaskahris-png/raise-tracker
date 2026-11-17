// Item 9: nothing on the site depends on hovering. A formula figure opens its own formula as visible text;
// the team-budget chart lists every period's total as visible figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { build, read, visible, MINT } from './helpers.ts';

const dist = build();
const pages = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? pages(p) : n === 'index.html' ? [p] : []; });

test('no page asks the reader to hover', () => {
  for (const p of pages(dist)) assert.doesNotMatch(visible(read(p, '')), /\bhover/i, p);
});

test('every formula figure opens its formula, written out on the methodology page', () => {
  const meth = read(dist, 'methodology/index.html');
  let n = 0;
  for (const p of pages(dist)) {
    for (const m of read(p, '').matchAll(/<a\b[^>]*data-figure="formula"[^>]*href="([^"]+)"[^>]*title="Computed: ([^"]*)"/g)) {
      const href = m[1] ?? '';
      if (!href.includes('methodology/')) continue; // a gap figure opens its FinalizeProposal transaction instead
      n++;
      const id = /#(f-[a-z0-9]+)$/.exec(href)?.[1];
      assert.ok(id, `formula figure without its own anchor: ${href}`);
      const li = new RegExp(`<li id="${id}">([\\s\\S]*?)</li>`).exec(meth)?.[1] ?? '';
      assert.ok(li.includes((m[2] ?? '').replace(/&quot;/g, '"')), `methodology does not write out "${m[2]}"`);
    }
  }
  assert.ok(n > 20, `only ${n} formula figures`);
});

test('the team-budget chart lists each period total as visible figures', () => {
  const u = read(dist, `company/${MINT.UMBRA}/index.html`);
  const block = /<ul class="periods"[^>]*>([\s\S]*?)<\/ul>/.exec(u)?.[1] ?? '';
  assert.equal((block.match(/<li>/g) ?? []).length, 14);
  assert.equal((block.match(/data-figure="sum"/g) ?? []).length, 14);
});
