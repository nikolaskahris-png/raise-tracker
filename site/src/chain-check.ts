// Re-checks the data against the chain before anything is published. Pure logic over an injected RPC, so it is tested offline.
//
// Balances. A treasury's balance keeps moving after the scan. For a sampled treasury we read its USDC account now (at slot S),
// list every successful transaction that touched it after the slot the scan read it at, and up to S, and subtract their
// changes. What is left must equal the balance the data shows, to the micro-USDC.
//
// Movements. Transactions never change, so each sampled movement must match the chain to the micro-USDC.
import type { Micro } from './money.ts';

/** How many treasuries and movements are re-read from the chain before each publication. */
export const SAMPLE_TREASURIES = 3;
export const SAMPLE_MOVEMENTS = 10;

export type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };
export type Tx = {
  transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } };
  meta: { err?: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[]; loadedAddresses?: { writable: string[]; readonly: string[] } };
};
export type SigInfo = { signature: string; slot: number; err: unknown };
export type ParsedTokenAccount = { context: { slot: number }; value: { data: { parsed: { info: { mint: string; owner: string; tokenAmount: { amount: string } } } } } | null };
export type Rpc = <T>(method: string, params: unknown[]) => Promise<T>;

/** How much a transaction changed one token account, in base units. Null when the account is not in the transaction. */
export function deltaOf(tx: Tx, account: string): Micro | null {
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey))
    .concat(tx.meta.loadedAddresses ? [...tx.meta.loadedAddresses.writable, ...tx.meta.loadedAddresses.readonly] : []);
  const idx = keys.indexOf(account);
  if (idx < 0) return null;
  const bal = (xs?: TokenBalance[]) => BigInt(xs?.find((b) => b.accountIndex === idx)?.uiTokenAmount.amount ?? '0');
  return bal(tx.meta.postTokenBalances) - bal(tx.meta.preTokenBalances);
}

/** Signatures of successful transactions on `address` with scanSlot < slot <= nowSlot, newest first, paging back as needed. */
export async function signaturesAfter(rpc: Rpc, address: string, scanSlot: number, nowSlot: number): Promise<string[]> {
  const out: string[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await rpc<SigInfo[]>('getSignaturesForAddress', [address, { limit: 1000, commitment: 'finalized', ...(before ? { before } : {}) }]);
    for (const s of page) {
      if (s.slot <= scanSlot) return out;
      if (s.slot <= nowSlot && s.err === null) out.push(s.signature);
    }
    if (page.length < 1000) return out;
    before = page.at(-1)?.signature;
  }
}

export type TreasuryToCheck = { readonly label: string; readonly usdcAccount: string; readonly daoVault: string; readonly balanceSlot: number; readonly balanceAtScan: Micro };

/** Problems found for one treasury; an empty list means its balance at the scan is confirmed by the chain. */
export async function checkTreasury(rpc: Rpc, t: TreasuryToCheck, usdcMint: string): Promise<string[]> {
  const a = await rpc<ParsedTokenAccount>('getAccountInfo', [t.usdcAccount, { encoding: 'jsonParsed', commitment: 'finalized' }]);
  const info = a.value?.data.parsed.info;
  if (!info || info.mint !== usdcMint || info.owner !== t.daoVault) return [`${t.label}: ${t.usdcAccount} is not the vault's USDC account`];
  const now = BigInt(info.tokenAmount.amount);
  let after = 0n;
  for (const sig of await signaturesAfter(rpc, t.usdcAccount, t.balanceSlot, a.context.slot)) {
    const tx = await rpc<Tx | null>('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' }]);
    if (!tx) return [`${t.label}: transaction ${sig} not found`];
    after += deltaOf(tx, t.usdcAccount) ?? 0n;
  }
  const atScan = now - after;
  return atScan === t.balanceAtScan ? [] : [`${t.label}: chain gives ${atScan} micro-USDC at slot ${t.balanceSlot} (now ${now} at slot ${a.context.slot}, minus ${after} since), data says ${t.balanceAtScan}`];
}

export type MovementToCheck = { readonly label: string; readonly signature: string; readonly account: string; readonly usdc: Micro };

export async function checkMovement(rpc: Rpc, m: MovementToCheck): Promise<string[]> {
  const tx = await rpc<Tx | null>('getTransaction', [m.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' }]);
  if (!tx) return [`${m.signature}: transaction not found`];
  const d = deltaOf(tx, m.account);
  return d === m.usdc ? [] : [`${m.label} ${m.signature}: chain says ${d ?? 'account not in the transaction'} micro-USDC, data says ${m.usdc}`];
}
