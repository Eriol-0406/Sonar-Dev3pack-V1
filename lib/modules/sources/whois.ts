import { config } from '../../config.js';

const cache = new Map<string, { ageDays: number | null; at: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

export function extractDomain(input: string): string | null {
  try {
    const u = new URL(input.startsWith('http') ? input : `https://${input}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function getDomainAgeDays(domainInput: string): Promise<number | null> {
  const domain = extractDomain(domainInput);
  if (!domain) return null;

  const cached = cache.get(domain);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ageDays;

  try {
    const url =
      `https://www.whoisxmlapi.com/whoisserver/WhoisService` +
      `?apiKey=${config.WHOISXML_API_KEY}` +
      `&domainName=${encodeURIComponent(domain)}` +
      `&outputFormat=JSON`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`WhoisXML → ${res.status}`);
    const json = (await res.json()) as {
      WhoisRecord?: { createdDate?: string; registryData?: { createdDate?: string } };
    };
    const created =
      json.WhoisRecord?.createdDate ?? json.WhoisRecord?.registryData?.createdDate;
    if (!created) {
      console.warn('[whois] no createdDate for', domain, '— response keys:', Object.keys(json));
      console.warn('[whois] WhoisRecord keys:', json.WhoisRecord ? Object.keys(json.WhoisRecord) : 'missing');
    }
    const ageDays = created
      ? Math.floor((Date.now() - new Date(created).getTime()) / 86400000)
      : null;
    cache.set(domain, { ageDays, at: Date.now() });
    return ageDays;
  } catch (err) {
    console.warn('[whois] error for', domain, ':', String(err));
    return null;
  }
}
