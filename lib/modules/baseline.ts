import type { BaselineSnapshot } from '../types.js';
import { getRecentParsedTransactions, type ParsedTx } from './sources/helius.js';
import { getBehavioral, upsertBehavioral } from '../db/behavioral.js';

const cache = new Map<string, { snap: BaselineSnapshot | null; at: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOP_K = 10;

export async function getBaseline(wallet: string): Promise<BaselineSnapshot | null> {
  const cached = cache.get(wallet);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.snap;

  // Try persistent store first; fresh enough rows skip the Helius round-trip.
  const persisted = await getBehavioral(wallet);
  if (persisted && Date.now() - persisted.computedAt < TTL_MS) {
    cache.set(wallet, { snap: persisted, at: Date.now() });
    return persisted;
  }

  const txs = await getRecentParsedTransactions(wallet, 100);
  if (txs == null || txs.length === 0) {
    cache.set(wallet, { snap: null, at: Date.now() });
    return null;
  }

  const snap = computeBaseline(wallet, txs);
  cache.set(wallet, { snap, at: Date.now() });
  await upsertBehavioral(snap);
  return snap;
}

export function computeBaseline(wallet: string, txs: ParsedTx[]): BaselineSnapshot {
  const outgoingSolAmounts: number[] = [];
  const counterpartyCounts = new Map<string, number>();
  const programCounts = new Map<string, number>();
  const hourCounts = new Array<number>(24).fill(0);

  let oldestTs = Infinity;
  let newestTs = -Infinity;

  for (const tx of txs) {
    if (typeof tx.timestamp === 'number') {
      oldestTs = Math.min(oldestTs, tx.timestamp);
      newestTs = Math.max(newestTs, tx.timestamp);
      const hour = new Date(tx.timestamp * 1000).getUTCHours();
      hourCounts[hour]++;
    }

    for (const t of tx.nativeTransfers ?? []) {
      if (t.fromUserAccount === wallet && typeof t.amount === 'number') {
        outgoingSolAmounts.push(t.amount / LAMPORTS_PER_SOL);
      }
      if (t.toUserAccount && t.toUserAccount !== wallet) {
        counterpartyCounts.set(
          t.toUserAccount,
          (counterpartyCounts.get(t.toUserAccount) ?? 0) + 1,
        );
      }
    }

    for (const t of tx.tokenTransfers ?? []) {
      if (t.toUserAccount && t.toUserAccount !== wallet) {
        counterpartyCounts.set(
          t.toUserAccount,
          (counterpartyCounts.get(t.toUserAccount) ?? 0) + 1,
        );
      }
    }

    for (const ix of tx.instructions ?? []) {
      if (ix.programId) {
        programCounts.set(ix.programId, (programCounts.get(ix.programId) ?? 0) + 1);
      }
    }
  }

  const windowDays =
    isFinite(oldestTs) && isFinite(newestTs)
      ? Math.max(1, Math.ceil((newestTs - oldestTs) / 86400))
      : 1;

  const avgTransferSol =
    outgoingSolAmounts.length === 0
      ? 0
      : outgoingSolAmounts.reduce((a, b) => a + b, 0) / outgoingSolAmounts.length;

  const maxTransferSol =
    outgoingSolAmounts.length === 0 ? 0 : Math.max(...outgoingSolAmounts);

  const txPerDay = txs.length / windowDays;

  const topCounterparties = [...counterpartyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([addr]) => addr);

  const topPrograms = [...programCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([id]) => id);

  const totalHourCounts = hourCounts.reduce((a, b) => a + b, 0);
  const hourThreshold = totalHourCounts === 0 ? 0 : totalHourCounts / 24;
  const activeHoursUtc = hourCounts
    .map((count, hour) => ({ count, hour }))
    .filter(({ count }) => count >= hourThreshold)
    .map(({ hour }) => hour);

  return {
    wallet,
    sampleSize: txs.length,
    windowDays,
    avgTransferSol: round(avgTransferSol, 4),
    maxTransferSol: round(maxTransferSol, 4),
    txPerDay: round(txPerDay, 2),
    topCounterparties,
    topPrograms,
    activeHoursUtc,
    chains: { SOL: txs.length },
    computedAt: Date.now(),
  };
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
