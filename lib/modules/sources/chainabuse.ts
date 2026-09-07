import { getKeyPool, KeyExhaustedError } from '../keyPool.js';

// Chainabuse free tier: 10 requests / key / month. Keys live in
// CHAINABUSE_API_KEY and CHAINABUSE_API_KEY_1..32 and are round-robined.

const cache = new Map<string, { count: number | null; at: number }>();
const TTL_MS = 60 * 60 * 1000;
const pool = () => getKeyPool('CHAINABUSE');

/**
 * Number of Chainabuse reports naming `address`.
 * `chain` is a Chainabuse chain id (SOL, ETH, BTC, TRON, ...). Pass null to
 * search every chain — needed for EVM addresses, which are shared across
 * ETH/BSC/Polygon/Arbitrum/etc.
 */
export async function getScamReportCount(
  address: string,
  chain: string | null = null,
): Promise<number | null> {
  const cacheKey = `${chain ?? '*'}:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.count;

  const url =
    `https://api.chainabuse.com/v0/reports` +
    `?address=${encodeURIComponent(address)}` +
    (chain ? `&chain=${encodeURIComponent(chain)}` : '') +
    `&perPage=1`;

  const count = await pool().withKey(async (key) => {
    const authHeader = 'Basic ' + Buffer.from(`${key}:`, 'utf8').toString('base64');
    const res = await fetch(url, {
      headers: { authorization: authHeader, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 429) throw new KeyExhaustedError();
    if (!res.ok) throw new Error(`Chainabuse → ${res.status}`);

    const json = (await res.json()) as { count?: number; total?: number; reports?: unknown[] };
    const n =
      typeof json.count === 'number'
        ? json.count
        : typeof json.total === 'number'
          ? json.total
          : Array.isArray(json.reports)
            ? json.reports.length
            : 0;
    return Number.isFinite(n) ? n : 0;
  });

  if (count != null) cache.set(cacheKey, { count, at: Date.now() });
  return count;
}
