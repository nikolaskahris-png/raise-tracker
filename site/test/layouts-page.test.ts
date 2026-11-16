// Item 10: claims about the launch account layouts link lines at a fixed commit, like the admin-key claims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, read, ROOT } from './helpers.ts';

const dist = build();
const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts', 'layouts', 'launch.json'), 'utf8')) as { commit: string; versions: Record<string, { path: string; struct_line: number; fields: { name: string; line: number }[] }> };

test('the methodology links each Launch struct and each "raised" field at the pinned commit', () => {
  const m = read(dist, 'methodology/index.html');
  const url = (v: string, line: number) => `https://github.com/metaDAOproject/programs/blob/${manifest.commit}/${manifest.versions[v]?.path}#L${line}`;
  for (const v of ['v06', 'v07', 'v08']) assert.ok(m.includes(url(v, manifest.versions[v]?.struct_line ?? -1)), `${v} struct`);
  const line = (v: string, f: string) => manifest.versions[v]?.fields.find((x) => x.name === f)?.line ?? -1;
  assert.ok(m.includes(url('v06', line('v06', 'final_raise_amount'))));
  assert.ok(m.includes(url('v07', line('v07', 'total_approved_amount'))));
  assert.doesNotMatch(m, /metaDAOproject\/programs\/(blob|tree)\/main/);
});
