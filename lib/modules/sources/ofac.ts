// Keyless sanctions screening from the US Treasury OFAC SDN list.
//
// OFAC publishes every digital-currency address attached to a sanctions
// designation. The 0xB10C mirror extracts them per asset into plain text
// files on GitHub, refreshed automatically from the official XML:
//   https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
// This replaces the Chainalysis REST API (whose free-tier form is no longer
// reachable) for the OFAC portion of sanctions data. No key, no quota.

import type { SanctionHitRef } from '../../types.js';

const BASE =
  'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_';

// OFAC asset codes → human label. XBT is Bitcoin. USDT/USDC lists contain
// the underlying chain addresses (EVM / Tron) and are merged with the rest.
const ASSETS: Record<string, string> = {
  XBT: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  TRX: 'Tron',
  LTC: 'Litecoin',
  BCH: 'Bitcoin Cash',
  XRP: 'XRP',
  ARB: 'Arbitrum',
  BSC: 'BNB Chain',
  ETC: 'Ethereum Classic',
  USDT: 'Tether',
  USDC: 'USD Coin',
  DASH: 'Dash',
  ZEC: 'Zcash',
  XMR: 'Monero',
  BTG: 'Bitcoin Gold',
  BSV: 'Bitcoin SV',
  XVG: 'Verge',
};

type ListData = { addresses: Map<string, string[]>; fetchedAt: number };

const TTL_MS = 24 * 60 * 60 * 1000;
let cache: ListData | null = null;
let inflight: Promise<ListData | null> | null = null;

function normalize(a: string): string {
  const t = a.trim();
  return t.startsWith('0x') ? t.toLowerCase() : t;
}

async function load(): Promise<ListData | null> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const addresses = new Map<string, string[]>();
    let ok = 0;
    await Promise.all(
      Object.entries(ASSETS).map(async ([code, label]) => {
        try {
          const res = await fetch(`${BASE}${code}.txt`, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`${res.status}`);
          for (const line of (await res.text()).split('\n')) {
            const a = normalize(line);
            if (!a) continue;
            const labels = addresses.get(a) ?? [];
            if (!labels.includes(label)) labels.push(label);
            addresses.set(a, labels);
          }
          ok++;
        } catch (err) {
          console.warn(`[ofac] ${code} list failed:`, String(err));
        }
      }),
    );
    inflight = null;
    if (ok === 0) return cache; // serve stale on total failure
    cache = { addresses, fetchedAt: Date.now() };
    return cache;
  })();
  return inflight;
}

/** OFAC SDN hit for the address, or [] if clean, or null if the list is unavailable. */
export async function getOfacSanctions(address: string): Promise<SanctionHitRef[] | null> {
  const data = await load();
  if (!data) return null;
  const labels = data.addresses.get(normalize(address));
  if (!labels) return [];
  return [
    {
      category: 'sanctions',
      name: 'OFAC SDN list',
      description: `Address appears on the US Treasury OFAC Specially Designated Nationals list (${labels.join(', ')})`,
      url: 'https://sanctionssearch.ofac.treas.gov/',
    },
  ];
}

export function ofacStatus(): { addresses: number; ageSeconds: number } | null {
  return cache
    ? { addresses: cache.addresses.size, ageSeconds: Math.floor((Date.now() - cache.fetchedAt) / 1000) }
    : null;
}

export function warmOfac(): void {
  void load();
}
