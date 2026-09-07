// Free, keyless community blocklists. All three are static files on GitHub,
// so they are fetched once per function instance and held in memory for an
// hour. No rate limits apply beyond GitHub's raw-content fair use.
//
//   Phantom     — Solana phishing domains (yaml)
//   ScamSniffer — phishing domains + drainer addresses (mostly EVM)
//   MetaMask    — eth-phishing-detect domain blacklist
//
// Each list is fetched independently so one outage never blanks the others.

export type BlocklistSource = 'phantom' | 'scamsniffer' | 'metamask';

export type BlocklistHit = {
  source: BlocklistSource;
  kind: 'address' | 'domain';
  /** The list entry that matched (for domains this may be a parent domain). */
  matched: string;
};

type ListData = { domains: Set<string>; addresses: Set<string>; fetchedAt: number };

const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

const FEEDS: Record<BlocklistSource, { url: string; parse: (text: string) => Omit<ListData, 'fetchedAt'> }> = {
  phantom: {
    url: 'https://raw.githubusercontent.com/phantom/blocklist/master/blocklist.yaml',
    parse: (text) => {
      const domains = new Set<string>();
      for (const m of text.matchAll(/^\s*-\s*url:\s*["']?([^"'\s#]+)/gm)) {
        domains.add(normalizeDomain(m[1]));
      }
      return { domains, addresses: new Set() };
    },
  },
  scamsniffer: {
    // Two files; handled specially in load() below.
    url: 'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json',
    parse: (text) => {
      const arr = JSON.parse(text) as unknown;
      const domains = new Set<string>();
      if (Array.isArray(arr)) for (const d of arr) if (typeof d === 'string') domains.add(normalizeDomain(d));
      return { domains, addresses: new Set() };
    },
  },
  metamask: {
    url: 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json',
    parse: (text) => {
      const json = JSON.parse(text) as { blacklist?: unknown };
      const domains = new Set<string>();
      if (Array.isArray(json.blacklist))
        for (const d of json.blacklist) if (typeof d === 'string') domains.add(normalizeDomain(d));
      return { domains, addresses: new Set() };
    },
  },
};

const SCAMSNIFFER_ADDRESSES_URL =
  'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json';

const cache = new Map<BlocklistSource, ListData>();
const inflight = new Map<BlocklistSource, Promise<ListData | null>>();

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

function normalizeAddress(a: string): string {
  return a.trim().startsWith('0x') ? a.trim().toLowerCase() : a.trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function load(source: BlocklistSource): Promise<ListData | null> {
  const cached = cache.get(source);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const existing = inflight.get(source);
  if (existing) return existing;

  const p = (async () => {
    try {
      const feed = FEEDS[source];
      const parsed = feed.parse(await fetchText(feed.url));
      if (source === 'scamsniffer') {
        try {
          const arr = JSON.parse(await fetchText(SCAMSNIFFER_ADDRESSES_URL)) as unknown;
          if (Array.isArray(arr))
            for (const a of arr) if (typeof a === 'string') parsed.addresses.add(normalizeAddress(a));
        } catch (err) {
          console.warn('[blocklists] scamsniffer address list failed:', String(err));
        }
      }
      const data: ListData = { ...parsed, fetchedAt: Date.now() };
      cache.set(source, data);
      return data;
    } catch (err) {
      console.warn(`[blocklists] ${source} failed:`, String(err));
      // Serve stale data if we have it rather than nothing.
      return cache.get(source) ?? null;
    } finally {
      inflight.delete(source);
    }
  })();
  inflight.set(source, p);
  return p;
}

/** Match a hostname against a set, including any parent domain. */
function domainMatch(host: string, set: Set<string>): string | null {
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.');
    if (set.has(candidate)) return candidate;
  }
  return null;
}

export async function checkBlocklists(input: {
  address?: string | null;
  domain?: string | null;
}): Promise<BlocklistHit[]> {
  const address = input.address ? normalizeAddress(input.address) : null;
  const domain = input.domain ? normalizeDomain(input.domain) : null;
  if (!address && !domain) return [];

  const sources = Object.keys(FEEDS) as BlocklistSource[];
  const lists = await Promise.all(sources.map((s) => load(s)));

  const hits: BlocklistHit[] = [];
  sources.forEach((source, i) => {
    const list = lists[i];
    if (!list) return;
    if (address && list.addresses.has(address)) {
      hits.push({ source, kind: 'address', matched: address });
    }
    if (domain) {
      const m = domainMatch(domain, list.domains);
      if (m) hits.push({ source, kind: 'domain', matched: m });
    }
  });
  return hits;
}

/** For /health: which lists are loaded and how big they are. */
export function blocklistStatus(): Record<string, { domains: number; addresses: number; ageSeconds: number } | null> {
  const out: Record<string, { domains: number; addresses: number; ageSeconds: number } | null> = {};
  for (const s of Object.keys(FEEDS) as BlocklistSource[]) {
    const d = cache.get(s);
    out[s] = d
      ? { domains: d.domains.size, addresses: d.addresses.size, ageSeconds: Math.floor((Date.now() - d.fetchedAt) / 1000) }
      : null;
  }
  return out;
}

/** Warm every list in the background (safe to call without awaiting). */
export function warmBlocklists(): void {
  for (const s of Object.keys(FEEDS) as BlocklistSource[]) void load(s);
}
