// In-memory behavioral baseline store. Empty on boot; entries appear only
// as /analyze calls compute baselines from real Helius parsed-tx data.
import type { BaselineSnapshot } from '../types.js';

const baselines = new Map<string, BaselineSnapshot>();

export async function getBehavioral(wallet: string): Promise<BaselineSnapshot | null> {
  return baselines.get(wallet) ?? null;
}

export async function upsertBehavioral(snap: BaselineSnapshot): Promise<void> {
  baselines.set(snap.wallet, snap);
}
