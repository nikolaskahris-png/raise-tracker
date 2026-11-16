// Every host the code, the workflows or the registry contacts is listed in DECISIONS.md with what allows it,
// and the sources DECISIONS.md rules out are not used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const decisions = readFileSync(join(ROOT, 'DECISIONS.md'), 'utf8');

function files(dir: string, exts: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === 'dist' || n === 'fixtures' || n === 'test' || n === '__pycache__') return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, exts) : exts.test(n) ? [p] : [];
  });
}
const code = [
  ...files(join(ROOT, 'scripts'), /\.(mjs|js)$/), ...files(join(ROOT, 'collector'), /\.py$/), ...files(join(ROOT, 'site', 'src'), /\.ts$/),
  ...files(join(ROOT, '.github', 'workflows'), /\.yml$/), join(ROOT, 'registry', 'names.json'), join(ROOT, 'registry', 'projects.json'),
];
const NOT_A_SOURCE = new Set(['www.w3.org']); // SVG namespace

test('every host the code contacts is listed in DECISIONS.md', () => {
  const hosts = new Set<string>();
  for (const f of code) for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-z]{2,})/g)) if (m[1] && !NOT_A_SOURCE.has(m[1])) hosts.add(m[1]);
  assert.ok(hosts.size > 5);
  for (const h of hosts) assert.ok(decisions.includes(h), `${h} is used but not listed in DECISIONS.md`);
});

test('MetaDAO\'s market API and the removed name source are no longer used', () => {
  for (const f of code) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t.replace(/^\s*\/\/.*$/gm, ''), /market-api\.metadao\.fi|metadao\.fi\/api/, f);
    assert.doesNotMatch(t, /defi-kai/, f);
  }
  assert.match(decisions, /market-api\.metadao\.fi[^\n]*❌ \*\*removed 16 Nov 2026\*\*/);
});

test('every article in names.json, quoted or only linked, is in DECISIONS.md with its date', () => {
  type Entry = { source?: string; published?: string; reading?: { source: string; published: string } };
  const names = JSON.parse(readFileSync(join(ROOT, 'registry', 'names.json'), 'utf8')) as Record<string, Entry>;
  for (const [k, e] of Object.entries(names)) {
    const v = e.reading ?? e;
    if (k.startsWith('_') || !v.source) continue;
    const host = new URL(v.source).host;
    const row = decisions.split('\n').find((l) => l.includes(host));
    assert.ok(row, `${host} not in DECISIONS.md`);
    const [y, mo, d] = (v.published ?? '').split('-').map(Number);
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(mo ?? 1) - 1];
    assert.ok(row.includes(`${d} ${month} ${y}`), `${host}: publication date not in DECISIONS.md`);
  }
});

test('an article whose terms do not allow quoting is only linked (Solana Compass: no terms page)', () => {
  const names = JSON.parse(readFileSync(join(ROOT, 'registry', 'names.json'), 'utf8')) as Record<string, Record<string, unknown>>;
  for (const [k, v] of Object.entries(names)) {
    if (k.startsWith('_')) continue;
    const src = String((v['reading'] as { source?: string } | undefined)?.source ?? v['source'] ?? '');
    if (src.includes('solanacompass.com')) { assert.ok('reading' in v && !('quote' in v), 'Solana Compass must be a reading, not a quote'); }
  }
  assert.match(decisions, /solanacompass\.com[^\n]*\*\*Link only\*\*/);
});
