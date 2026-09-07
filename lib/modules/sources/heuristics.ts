// On-chain behavioural heuristics for a Solana counterparty, built from the
// Helius parsed-transaction feed we already fetch. These catch drainer and
// address-poisoning wallets that no report database knows about yet.

import { getRecentParsedTransactions, getSolBalance, type ParsedTx } from './helius.js';

export type HeuristicId = 'sweep_pattern' | 'dust_sprayer' | 'burst_activity' | 'instant_drain';

export type HeuristicFlag = {
  id: HeuristicId;
  message: string;
  evidence: Record<string, unknown>;
};

const LAMPORTS = 1_000_000_000;
const DUST_LAMPORTS = 0.001 * LAMPORTS;

export async function analyzeCounterparty(
  address: string,
  walletAgeDays: number | null,
): Promise<HeuristicFlag[]> {
  const txs = await getRecentParsedTransactions(address, 100);
  if (!txs || txs.length === 0) return [];

  const flags: HeuristicFlag[] = [];

  let inboundLamports = 0;
  let outboundLamports = 0;
  const inboundSenders = new Set<string>();
  const outboundByDest = new Map<string, number>();
  let dustOutCount = 0;
  const dustRecipients = new Set<string>();

  for (const tx of txs) {
    for (const t of tx.nativeTransfers ?? []) {
      const amt = t.amount ?? 0;
      if (t.toUserAccount === address && t.fromUserAccount && t.fromUserAccount !== address) {
        inboundLamports += amt;
        inboundSenders.add(t.fromUserAccount);
      } else if (t.fromUserAccount === address && t.toUserAccount && t.toUserAccount !== address) {
        outboundLamports += amt;
        outboundByDest.set(t.toUserAccount, (outboundByDest.get(t.toUserAccount) ?? 0) + amt);
        if (amt > 0 && amt < DUST_LAMPORTS) {
          dustOutCount++;
          dustRecipients.add(t.toUserAccount);
        }
      }
    }
    // Token dust (address poisoning often uses fake USDC/USDT with tiny amounts).
    for (const t of tx.tokenTransfers ?? []) {
      if (t.fromUserAccount === address && t.toUserAccount && t.toUserAccount !== address) {
        const amt = t.tokenAmount ?? 0;
        if (amt > 0 && amt < 0.01) {
          dustOutCount++;
          dustRecipients.add(t.toUserAccount);
        }
      }
    }
  }

  // 1. Sweep / consolidation: many victims pay in, funds leave to 1-2 wallets.
  if (inboundSenders.size >= 10 && inboundLamports > 0) {
    const sortedDest = [...outboundByDest.entries()].sort((a, b) => b[1] - a[1]);
    const topTwoOut = sortedDest.slice(0, 2).reduce((s, [, v]) => s + v, 0);
    const sweepRatio = topTwoOut / inboundLamports;
    if (sweepRatio >= 0.7) {
      flags.push({
        id: 'sweep_pattern',
        message: `Receives from ${inboundSenders.size} different wallets and forwards ${Math.round(sweepRatio * 100)}% of it to ${Math.min(2, sortedDest.length)} destination(s) — classic drainer collection wallet`,
        evidence: {
          inboundSenders: inboundSenders.size,
          inboundSol: +(inboundLamports / LAMPORTS).toFixed(3),
          sweptSol: +(topTwoOut / LAMPORTS).toFixed(3),
          destinations: sortedDest.slice(0, 2).map(([d]) => d),
        },
      });
    }
  }

  // 2. Dust sprayer / address poisoning.
  if (dustOutCount >= 20 && dustRecipients.size >= 15) {
    flags.push({
      id: 'dust_sprayer',
      message: `Sent ${dustOutCount} dust-sized transfers to ${dustRecipients.size} wallets — address-poisoning behaviour`,
      evidence: { dustTransfers: dustOutCount, recipients: dustRecipients.size },
    });
  }

  // 3. Burst: brand-new wallet with heavy activity.
  if (walletAgeDays != null && walletAgeDays <= 3 && txs.length >= 50) {
    flags.push({
      id: 'burst_activity',
      message: `Wallet is ${walletAgeDays} day(s) old but already has ${txs.length}+ transactions`,
      evidence: { walletAgeDays, recentTxCount: txs.length },
    });
  }

  // 4. Instant drain: meaningful inflow but the wallet keeps nothing.
  if (inboundLamports >= 1 * LAMPORTS) {
    const balance = await getSolBalance(address);
    if (balance != null && balance < 0.01 * LAMPORTS && outboundLamports >= inboundLamports * 0.9) {
      flags.push({
        id: 'instant_drain',
        message: `Received ${(inboundLamports / LAMPORTS).toFixed(2)} SOL recently but holds almost nothing — funds are moved out immediately`,
        evidence: {
          inboundSol: +(inboundLamports / LAMPORTS).toFixed(3),
          outboundSol: +(outboundLamports / LAMPORTS).toFixed(3),
          balanceSol: +(balance / LAMPORTS).toFixed(4),
        },
      });
    }
  }

  return flags;
}

export const __internals = { DUST_LAMPORTS };
export type { ParsedTx };
