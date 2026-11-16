// Loads every input file and joins them into the shape the pages render.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sum, type Micro } from './money.ts';
import {
  FLOW_CLASSES, parseFlows, parseNames, parseRaises, parseScanReport, parseTreasury, parseTreasuryReport,
  type PressName, type Flow, type FlowClass, type Raise, type ScanReport, type TreasuryReport, type TreasuryRow, type UndecodedLaunch,
} from './schema.ts';

export { MIN_REAL_RAISE } from './constants.ts';
import { MIN_REAL_RAISE } from './constants.ts';

export type Inputs = {
  readonly raises: readonly (Raise | UndecodedLaunch)[];
  readonly treasury: readonly TreasuryRow[];
  readonly flows: readonly Flow[];
  readonly scanReport: ScanReport;
  readonly treasuryReport: TreasuryReport;
  readonly names: ReadonlyMap<string, PressName>;
};

export function readInputs(dataDir: string, registryDir: string): Inputs {
  const f = (name: string) => readFileSync(join(dataDir, name), 'utf8');
  return {
    raises: parseRaises(f('raises.csv')),
    treasury: parseTreasury(f('treasury.csv')),
    flows: parseFlows(f('treasury-flows.csv')),
    scanReport: parseScanReport(f('scan-report.md')),
    treasuryReport: parseTreasuryReport(f('treasury-report.md')),
    names: parseNames(readFileSync(join(registryDir, 'names.json'), 'utf8')),
  };
}

/**
 * A company name. "onchain": the name and symbol the token declares in its Metaplex metadata account
 * (verifiable onchain, but set by whoever controls the metadata). "press" adds a project name quoted verbatim from an article.
 */
export type Name =
  | { readonly kind: 'onchain'; readonly name: string; readonly symbol: string; readonly account: string; readonly press: PressName | null }
  | { readonly kind: 'none' };

export type Treasury = {
  readonly row: TreasuryRow;
  readonly flows: readonly Flow[]; // newest first
  readonly byClass: Readonly<Record<FlowClass, Micro>>; // absolute amounts, summed exactly from flows
  readonly totalIn: Micro;
  readonly totalOut: Micro;
  readonly net: Micro;
};

export type Company = {
  readonly raise: Raise;
  readonly name: Name;
  readonly displayName: string;
  readonly treasury: Treasury | null; // null: the treasury could not be read (see problems)
  readonly problem: string | null;
};

export type Site = {
  readonly inputs: Inputs;
  readonly decoded: readonly Raise[];
  readonly undecoded: readonly UndecodedLaunch[];
  readonly real: readonly Raise[]; // minimum >= $10,000
  readonly companies: readonly Company[]; // completed real raises with a DAO
  readonly allFlows: readonly Flow[];
};

export function nameOf(r: Raise, names: ReadonlyMap<string, PressName>): Name {
  if (r.metadataAccount && r.metadataName && r.metadataSymbol) {
    return { kind: 'onchain', name: r.metadataName, symbol: r.metadataSymbol, account: r.metadataAccount, press: names.get(r.mint) ?? null };
  }
  return { kind: 'none' };
}

/** Every name, symbol and mint prefix the data gives: the only texts a label may show with digits in them. */
export function identifiersOf(site: Site): Set<string> {
  const out = new Set<string>();
  for (const r of site.decoded) {
    for (const s of [r.metadataName, r.metadataSymbol]) if (s) out.add(s);
    out.add(`${r.mint.slice(0, 8)}…`);
  }
  for (const c of site.companies) {
    out.add(c.displayName);
    if (c.name.kind === 'onchain' && c.name.press) out.add(c.name.press.project);
  }
  return out;
}

/** "Project (SYMBOL)" when a press name adds the project, else the onchain name, else the mint prefix. */
export function displayNameOf(r: Raise, name: Name): string {
  if (name.kind === 'onchain') return name.press ? `${name.press.project} (${name.symbol})` : name.name;
  return `${r.mint.slice(0, 8)}…`;
}

export function buildSite(inputs: Inputs): Site {
  const decoded = inputs.raises.filter((r): r is Raise => r.decoded);
  const undecoded = inputs.raises.filter((r): r is UndecodedLaunch => !r.decoded);
  const real = decoded.filter((r) => r.minimum >= MIN_REAL_RAISE);
  const treasuryByMint = new Map(inputs.treasury.map((t) => [t.mint, t]));
  const flowsByMint = new Map<string, Flow[]>();
  for (const f of inputs.flows) {
    const list = flowsByMint.get(f.mint) ?? [];
    list.push(f);
    flowsByMint.set(f.mint, list);
  }
  const problemFor = (label: string) => inputs.treasuryReport.problems.find((p) => p.startsWith(`${label}:`)) ?? null;

  const companies: Company[] = real
    .filter((r) => r.state === 'Complete' && r.dao !== null)
    .map((r) => {
      const name = nameOf(r, inputs.names);
      const displayName = displayNameOf(r, name);
      const row = treasuryByMint.get(r.mint);
      let treasury: Treasury | null = null;
      if (row) {
        const flows = [...(flowsByMint.get(r.mint) ?? [])].sort((a, b) => b.time.getTime() - a.time.getTime());
        const byClass = {} as Record<FlowClass, Micro>;
        for (const c of FLOW_CLASSES) byClass[c] = sum(flows.filter((f) => f.cls === c).map((f) => (f.usdc < 0n ? -f.usdc : f.usdc)));
        const totalIn = sum(flows.filter((f) => f.usdc > 0n).map((f) => f.usdc));
        const totalOut = -sum(flows.filter((f) => f.usdc < 0n).map((f) => f.usdc));
        treasury = { row, flows, byClass, totalIn, totalOut, net: totalIn - totalOut };
      }
      return { raise: r, name, displayName, treasury, problem: row ? null : problemFor(r.metadataSymbol ?? r.mint.slice(0, 8)) ?? problemFor(r.mint.slice(0, 8)) };
    })
    .sort((a, b) => Number((b.raise.raised ?? 0n) - (a.raise.raised ?? 0n)) || a.raise.mint.localeCompare(b.raise.mint));

  return { inputs, decoded, undecoded, real, companies, allFlows: inputs.flows };
}
