// Every Σ figure opens exactly the rows it adds up. A sum figure carries its rows instead of a link; this registry gives each
// distinct (what, rows) pair a stable page under lists/, which build.ts writes and check-html.ts verifies.
import { createHash } from 'node:crypto';
import type { Flow, Raise, UndecodedLaunch } from './schema.ts';
import type { Company } from './model.ts';

export type ListRows =
  | { readonly flows: readonly Flow[] }
  | { readonly raises: readonly (Raise | UndecodedLaunch)[] }
  | { readonly companies: readonly Company[] }
  | { readonly authorities: readonly string[] };

export type ListEntry = { readonly id: string; readonly what: string; readonly rows: ListRows };

const registry = new Map<string, ListEntry>();
let base = '/';

/** Start a build: forget every list and set the URL prefix. */
export function resetLists(urlBase: string): void { registry.clear(); base = urlBase; }
export const allLists = (): ListEntry[] => [...registry.values()];

function keys(rows: ListRows): string[] {
  if ('flows' in rows) return rows.flows.map((f) => `${f.mint}:${f.signature}`);
  if ('raises' in rows) return rows.raises.map((r) => r.launch);
  if ('companies' in rows) return rows.companies.map((c) => c.raise.mint);
  return [...rows.authorities];
}

export function listId(what: string, rows: ListRows): string {
  const slug = what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'list';
  const h = createHash('sha256').update(`${what}\n${keys(rows).join('\n')}`).digest('hex').slice(0, 10);
  return `${slug}-${h}`;
}

/** Registers the list (once) and returns its URL. */
export function listHref(what: string, rows: ListRows): string {
  const id = listId(what, rows);
  if (!registry.has(id)) registry.set(id, { id, what, rows });
  return `${base}lists/${id}/`;
}

export const rowCount = (rows: ListRows): number => keys(rows).length;
