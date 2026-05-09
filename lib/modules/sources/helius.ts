import { config } from '../../config.js';

// Lazy URL builders — accessing config.X at module top-level would crash the
// whole serverless function with FUNCTION_INVOCATION_FAILED if any env var
// were missing or invalid, hiding the actual zod error.
const rpcUrl = () => `https://mainnet.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`;
const parsedTxUrl = (addr: string, limit: number) =>
  `https://api.helius.xyz/v0/addresses/${addr}/transactions?api-key=${config.HELIUS_API_KEY}&limit=${limit}`;

const ageCache = new Map<string, { ageDays: number | null; at: number }>();
const txCache = new Map<string, { txs: ParsedTx[]; at: number }>();
const TTL_MS = 60 * 60 * 1000;

export type ParsedTx = {
  signature?: string;
  timestamp?: number;
  type?: string;
  source?: string;
  feePayer?: string;
  nativeTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    mint?: string;
    tokenAmount?: number;
  }>;
  accountData?: Array<{ account: string; nativeBalanceChange?: number }>;
  instructions?: Array<{ programId?: string }>;
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Helius RPC ${method} → ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`Helius RPC ${method}: ${json.error.message}`);
  return json.result as T;
}

export async function getRecentParsedTransactions(
  wallet: string,
  limit = 100,
): Promise<ParsedTx[] | null> {
  const cached = txCache.get(wallet);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.txs;

  try {
    const res = await fetch(parsedTxUrl(wallet, limit), {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Helius parsed-tx → ${res.status}`);
    const txs = (await res.json()) as ParsedTx[];
    txCache.set(wallet, { txs, at: Date.now() });
    return txs;
  } catch {
    return null;
  }
}

export async function getWalletAgeDays(address: string): Promise<number | null> {
  const cached = ageCache.get(address);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ageDays;

  try {
    let oldestBlockTime: number | null = null;
    let before: string | undefined;
    let reachedBottom = false;

    const PAGE = 200;
    const MAX_PAGES = 4;

    for (let i = 0; i < MAX_PAGES; i++) {
      const sigs = await rpc<Array<{ signature: string; blockTime: number | null }>>(
        'getSignaturesForAddress',
        [address, { limit: PAGE, before }],
      );
      if (sigs.length === 0) {
        reachedBottom = true;
        break;
      }
      const last = sigs[sigs.length - 1];
      if (last.blockTime != null) oldestBlockTime = last.blockTime;
      if (sigs.length < PAGE) {
        reachedBottom = true;
        break;
      }
      before = last.signature;
    }

    const ageDays =
      reachedBottom && oldestBlockTime != null
        ? Math.floor((Date.now() / 1000 - oldestBlockTime) / 86400)
        : null;
    ageCache.set(address, { ageDays, at: Date.now() });
    return ageDays;
  } catch {
    ageCache.set(address, { ageDays: null, at: Date.now() });
    return null;
  }
}

export async function hasPriorInteraction(
  userWallet: string,
  counterparty: string,
): Promise<boolean | null> {
  const txs = await getRecentParsedTransactions(userWallet);
  if (txs == null) return null;
  return txs.some((tx) =>
    (tx.accountData ?? []).some((a) => a.account === counterparty),
  );
}
