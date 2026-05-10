import { config } from '../../config.js';

const cache = new Map<string, { count: number | null; at: number }>();
const TTL_MS = 60 * 60 * 1000;

const KEY_COOLDOWNS = new Map<string, number>();
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
let lastKeyIndex = 0;

function getAvailableKeys(): string[] {
  const keys: string[] = [];
  if (config.CHAINABUSE_API_KEY) keys.push(config.CHAINABUSE_API_KEY);
  for (let i = 1; i <= 32; i++) {
    const k = process.env[`CHAINABUSE_API_KEY_${i}`];
    if (k) keys.push(k.trim());
  }
  return keys;
}

export async function getScamReportCount(
  address: string,
  chain: 'SOL' = 'SOL',
): Promise<number | null> {
  const cached = cache.get(address);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.count;

  const allKeys = getAvailableKeys();
  if (allKeys.length === 0) return null;

  const url =
    `https://api.chainabuse.com/v0/reports` +
    `?address=${encodeURIComponent(address)}` +
    `&chain=${chain}` +
    `&perPage=1`;

  // Try each key once in a round-robin fashion, skipping those on cooldown.
  for (let attempt = 0; attempt < allKeys.length; attempt++) {
    const idx = (lastKeyIndex + attempt) % allKeys.length;
    const key = allKeys[idx];

    if ((KEY_COOLDOWNS.get(key) ?? 0) > Date.now()) continue;

    try {
      const authHeader = 'Basic ' + Buffer.from(`${key}:`, 'utf8').toString('base64');
      const res = await fetch(url, {
        headers: { authorization: authHeader, accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 429) {
        KEY_COOLDOWNS.set(key, Date.now() + COOLDOWN_MS);
        continue;
      }

      if (!res.ok) throw new Error(`Chainabuse → ${res.status}`);

      const json = (await res.json()) as {
        count?: number;
        total?: number;
        reports?: unknown[];
      };

      lastKeyIndex = (idx + 1) % allKeys.length;

      let count =
        typeof json.count === 'number'
          ? json.count
          : typeof json.total === 'number'
            ? json.total
            : Array.isArray(json.reports)
              ? json.reports.length
              : NaN;

      if (!Number.isFinite(count)) count = 0;
      cache.set(address, { count, at: Date.now() });
      return count;
    } catch (err) {
      console.error(`[chainabuse] key ${idx} failed:`, err);
      // Try next key
    }
  }

  return null;
}
