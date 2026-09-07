import { getKeyPool, KeyExhaustedError } from '../keyPool.js';

// ScamSniffer lookup API — live version of the GitHub blocklist, updated
// continuously rather than on the repo's cadence. Keys: SCAMSNIFFER_API_KEY[_n].
// https://docs.scamsniffer.io/reference/getaddresscheck

const cache = new Map<string, { blocked: boolean; at: number }>();
const TTL_MS = 60 * 60 * 1000;
const pool = () => getKeyPool('SCAMSNIFFER');

/** true = BLOCKED, false = PASSED, null = unavailable (no key / error). */
export async function isScamSnifferBlocked(address: string): Promise<boolean | null> {
  const cached = cache.get(address);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.blocked;

  const url = `https://lookup-api.scamsniffer.io/address/check?address=${encodeURIComponent(address)}`;
  const blocked = await pool().withKey(async (key) => {
    const res = await fetch(url, {
      headers: { 'x-api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 429) throw new KeyExhaustedError();
    if (!res.ok) throw new Error(`ScamSniffer → ${res.status}`);
    const json = (await res.json()) as { status?: string; error?: string };
    if (json.error) {
      // "api_key missing" / invalid key — treat as exhausted so we rotate.
      if (/api_key|unauthori|quota|limit/i.test(json.error)) throw new KeyExhaustedError(json.error);
      throw new Error(`ScamSniffer: ${json.error}`);
    }
    return json.status === 'BLOCKED';
  });

  if (blocked != null) cache.set(address, { blocked, at: Date.now() });
  return blocked;
}
