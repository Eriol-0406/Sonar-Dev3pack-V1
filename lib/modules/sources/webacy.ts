import { getKeyPool, KeyExhaustedError } from '../keyPool.js';
import type { ChainId } from '../chains.js';

// Webacy address risk. Keys: WEBACY_API_KEY[_n].
//   GET https://api.webacy.com/addresses/{address}?chain={chain}
//   header x-api-key
//   → { count, medium, high, overallRisk, issues: [{ score, tags: [{ name, key, severity }] }] }

export type WebacyRisk = {
  overallRisk: number | null;
  high: number;
  medium: number;
  tags: string[];
};

const CHAIN_MAP: Partial<Record<ChainId, string>> = {
  SOL: 'sol',
  ETH: 'eth',
  BTC: 'btc',
  TON: 'ton',
  SUI: 'sui',
  XLM: 'stellar',
};

const cache = new Map<string, { risk: WebacyRisk | null; at: number }>();
const TTL_MS = 60 * 60 * 1000;
const pool = () => getKeyPool('WEBACY');

export function webacySupports(chain: ChainId | null): boolean {
  return !!chain && !!CHAIN_MAP[chain];
}

export async function getWebacyRisk(address: string, chain: ChainId | null): Promise<WebacyRisk | null> {
  const wchain = chain ? CHAIN_MAP[chain] : undefined;
  if (!wchain) return null;

  const cacheKey = `${wchain}:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.risk;

  const url = `https://api.webacy.com/addresses/${encodeURIComponent(address)}?chain=${wchain}`;
  const risk = await pool().withKey(async (key) => {
    const res = await fetch(url, {
      headers: { 'x-api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429 || res.status === 402) throw new KeyExhaustedError(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`Webacy → ${res.status}`);
    const json = (await res.json()) as {
      overallRisk?: number;
      high?: number;
      medium?: number;
      issues?: Array<{ tags?: Array<{ name?: string; key?: string }> }>;
    };
    const tags = new Set<string>();
    for (const issue of json.issues ?? [])
      for (const t of issue.tags ?? []) if (t.name || t.key) tags.add(String(t.name ?? t.key));
    return {
      overallRisk: typeof json.overallRisk === 'number' ? json.overallRisk : null,
      high: json.high ?? 0,
      medium: json.medium ?? 0,
      tags: [...tags],
    } satisfies WebacyRisk;
  });

  if (risk != null) cache.set(cacheKey, { risk, at: Date.now() });
  return risk;
}
