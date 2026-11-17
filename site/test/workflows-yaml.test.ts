// A workflow file that is not valid YAML is not run at all: GitHub lists it by its path and starts nothing, not even the schedule.
// (17 Nov 2026: collect.yml had `- name: Shipped work as numbers: releases ...`, a plain scalar with ": " in it.)
// The other tests read these files with regexes and cannot see that. This one checks the one thing that went wrong, on every
// workflow file, without a YAML library: no plain (unquoted) value may contain ": ", and no indentation may use a tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.ts';

const DIR = join(ROOT, '.github', 'workflows');
const BLOCK = /(?:^|:|-)\s*[|>][+-]?\d?\s*(?:#.*)?$/; // "run: |", "- >-": what follows, indented deeper, is text, not YAML

/** Problems that make a workflow file invalid YAML. Empty when none was found. */
export function yamlProblems(text: string): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  let blockIndent = -1; // indent of the line that opened a block scalar, while inside one
  lines.forEach((raw, i) => {
    const at = `line ${i + 1}`;
    const indent = /^[ \t]*/.exec(raw)?.[0] ?? '';
    if (blockIndent >= 0) {
      if (raw.trim() === '' || indent.length > blockIndent) return; // inside the block scalar
      blockIndent = -1;
    }
    if (raw.trim() === '' || raw.trim().startsWith('#')) return;
    if (indent.includes('\t')) out.push(`${at}: a tab in the indentation`);
    if (BLOCK.test(raw.replace(/\s+$/, ''))) blockIndent = indent.length;
    const m = /^(\s*(?:-\s+)*)([A-Za-z0-9_.\-"']+):(?:\s+(.*))?$/.exec(raw);
    const value = (m?.[3] ?? '').trim();
    if (!m || value === '') return;
    if (/^["'|>\[{&*!%@`]/.test(value)) {
      const q = value[0];
      if ((q === '"' || q === "'") && !new RegExp(`^${q}(?:[^${q}\\\\]|\\\\.${q === "'" ? "|''" : ''})*${q}\\s*(?:#.*)?$`).test(value)) out.push(`${at}: a quoted value that does not end where it should: ${value.slice(0, 60)}`);
      return;
    }
    const plain = value.replace(/\s+#.*$/, '');
    if (plain.includes(': ') || plain.endsWith(':')) out.push(`${at}: the plain value "${plain.slice(0, 70)}" has ": " in it; put it in quotes`);
  });
  return out;
}

test('every file in .github/workflows is YAML GitHub can read: no unquoted value with ": ", no tab indentation', () => {
  const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length >= 3, `only ${files.length} workflow files`);
  for (const f of files) assert.deepEqual(yamlProblems(readFileSync(join(DIR, f), 'utf8')), [], f);
});

test('every step name that is not in quotes has no ": " in it', () => {
  for (const f of readdirSync(DIR).filter((x) => /\.ya?ml$/.test(x))) {
    for (const [i, line] of readFileSync(join(DIR, f), 'utf8').split(/\r?\n/).entries()) {
      const m = /^\s*(?:-\s+)?name:\s+(.*)$/.exec(line);
      const v = (m?.[1] ?? '').trim();
      if (m && !/^["']/.test(v)) assert.ok(!v.replace(/\s+#.*$/, '').includes(': '), `${f} line ${i + 1}: name "${v}" has ": " and no quotes`);
    }
  }
});

test('the check sees the line that broke collect.yml, and passes it once it is quoted', () => {
  const broke = '    steps:\n      - name: Shipped work as numbers: releases and contributors (the file is replaced only if every repository was read)\n        run: python collector/shipped.py\n';
  const fixed = broke.replace('name: Shipped work as numbers: releases and contributors (the file is replaced only if every repository was read)', 'name: "Shipped work as numbers: releases and contributors (the file is replaced only if every repository was read)"');
  assert.match(yamlProblems(broke).join('\n'), /line 2: the plain value "Shipped work as numbers: releases/);
  assert.deepEqual(yamlProblems(fixed), []);
});

test('the check leaves valid YAML alone: quoted values, expressions, block scalars with colons, URLs, comments, flow lists', () => {
  const ok = [
    'name: daily-snapshot',
    'on:',
    '  schedule:',
    '    - cron: "17 3 * * *"   # 03:17 UTC every day',
    "    - cron: '41 17 * * *'   # 17:41 UTC, backup",
    '  push:',
    '    branches: [main]',
    '    paths: [\'site/**\', ".github/workflows/site.yml"]',
    'jobs:',
    '  build:',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          ref: ${{ github.ref_name }}',
    '      - name: "Re-read: a sample from the chain"',
    "      - name: 'Tests: frozen data'",
    '        if: github.event_name == \'push\'',
    '        run: |',
    '          echo "result: done"',
    '          git config user.name "snapshot-bot"',
    '          echo "a: b"',
    '      - name: Commit snapshot (even if some steps failed, so failures are on record)',
    '        env:',
    '          URL: https://github.com/x/y',
    '        run: >-',
    '          python a.py',
    '          --note: x',
    '',
  ].join('\n');
  assert.deepEqual(yamlProblems(ok), []);
});

test('the check refuses other plain values with ": ", a tab, and a quote that is never closed', () => {
  assert.match(yamlProblems('env:\n  NOTE: see this: that\n').join('\n'), /line 2/);
  assert.match(yamlProblems('jobs:\n\tbuild: x\n').join('\n'), /tab/);
  assert.match(yamlProblems('steps:\n  - name: "not closed\n').join('\n'), /does not end where it should/);
  assert.match(yamlProblems('    steps:\n      - name: Tests: a\n').join('\n'), /line 2/);
});
