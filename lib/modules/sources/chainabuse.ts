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

const domainCache = new Map<string, { count: number | null; at: number }>();

function hostOf(entry: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(entry) ? entry : `https://${entry}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Number of Chainabuse reports naming `domain` (hostname, no scheme).
 * Chainabuse's domain filter is a substring search, so "jup.ag" also returns
 * reports about "jup.ag-swap.online". Only reports whose hostname is exactly
 * `domain` are counted, capped at one page of 50. Victims also often list
 * the genuine site next to the phishing one, so a single untrusted report is
 * ignored: the count is returned only if at least one exact report is marked
 * trusted by Chainabuse, or three or more exact reports exist.
 */
export async function getDomainReportCount(domain: string): Promise<number | null> {
  const key = domain.toLowerCase().replace(/^www\./, '');
  const cached = domainCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.count;

  const url = `https://api.chainabuse.com/v0/reports?domain=${encodeURIComponent(key)}&perPage=50`;
  const count = await pool().withKey(async (k) => {
    const authHeader = 'Basic ' + Buffer.from(`${k}:`, 'utf8').toString('base64');
    const res = await fetch(url, {
      headers: { authorization: authHeader, accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 429) throw new KeyExhaustedError();
    if (!res.ok) throw new Error(`Chainabuse → ${res.status}`);
    const json = (await res.json()) as {
      reports?: Array<{ trusted?: boolean; addresses?: Array<{ domain?: string | null }> }>;
    };
    let exact = 0;
    let trusted = 0;
    for (const r of json.reports ?? []) {
      if ((r.addresses ?? []).some((a) => a.domain && hostOf(a.domain) === key)) {
        exact++;
        if (r.trusted) trusted++;
      }
    }
    return trusted > 0 || exact >= 3 ? exact : 0;
  });

  if (count != null) domainCache.set(key, { count, at: Date.now() });
  return count;
}
