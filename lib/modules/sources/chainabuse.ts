import { config } from '../../config.js';

const cache = new Map<string, { count: number | null; at: number }>();
const TTL_MS = 60 * 60 * 1000;

export async function getScamReportCount(
  address: string,
  chain: 'SOL' = 'SOL',
): Promise<number | null> {
  const cached = cache.get(address);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.count;

  const key = config.CHAINABUSE_API_KEY.trim();
  const url =
    `https://api.chainabuse.com/v0/reports` +
    `?address=${encodeURIComponent(address)}` +
    `&chain=${chain}` +
    `&perPage=1`;

  const fetchWith = async (password: string) => {
    const authHeader =
      'Basic ' + Buffer.from(`${key}:${password}`, 'utf8').toString('base64');
    return fetch(url, {
      headers: { authorization: authHeader, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
  };

  try {
    let res = await fetchWith(key);
    if (res.status === 401 || res.status === 403) {
      res = await fetchWith('');
    }
    if (!res.ok) throw new Error(`Chainabuse → ${res.status}`);
    const json = (await res.json()) as {
      count?: number;
      total?: number;
      reports?: unknown[];
    };
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
  } catch {
    return null;
  }
}
