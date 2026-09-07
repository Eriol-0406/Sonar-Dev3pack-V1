import { getKeyPool, KeyExhaustedError } from '../keyPool.js';

// Chainalysis free Sanctions Screening API. Covers OFAC and other sanctions
// designations across all major chains. Keys: CHAINALYSIS_API_KEY[_n].
// Register at https://go.chainalysis.com/chainalysis-oracle-docs.html
//   GET https://public.chainalysis.com/api/v1/address/{address}
//   header X-API-Key
//   → { identifications: [{ category, name, description, url }] }

export type SanctionHit = { category: string; name: string; description?: string; url?: string };

const cache = new Map<string, { hits: SanctionHit[]; at: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;
const pool = () => getKeyPool('CHAINALYSIS');

/** Sanctions identifications for the address, or null if unavailable. */
export async function getSanctions(address: string): Promise<SanctionHit[] | null> {
  const cached = cache.get(address);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.hits;

  const url = `https://public.chainalysis.com/api/v1/address/${encodeURIComponent(address)}`;
  const hits = await pool().withKey(async (key) => {
    const res = await fetch(url, {
      headers: { 'X-API-Key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 429) throw new KeyExhaustedError();
    if (!res.ok) throw new Error(`Chainalysis → ${res.status}`);
    const json = (await res.json()) as { identifications?: unknown };
    if (!Array.isArray(json.identifications)) return [] as SanctionHit[];
    return json.identifications
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
      .map((i) => ({
        category: String(i.category ?? 'sanctions'),
        name: String(i.name ?? 'Unknown designation'),
        description: typeof i.description === 'string' ? i.description : undefined,
        url: typeof i.url === 'string' ? i.url : undefined,
      }));
  });

  if (hits != null) cache.set(address, { hits, at: Date.now() });
  return hits;
}
