import { extractDomain } from './whois.js';

const KNOWN_BRANDS = [
  'phantom', 'solflare', 'magiceden', 'tensor', 'jup', 'jupiter',
  'raydium', 'orca', 'marinade', 'drift', 'kamino', 'mango', 'metaplex',
];

const SUSPICIOUS_TLDS = ['xyz', 'top', 'click', 'rest', 'fit', 'lol', 'support', 'claim'];

const HOMOGLYPH_RE = /[а-яА-Я]|[аорес]|0(?=[a-z])|(?<=[a-z])1(?=[a-z])/;

export function analyzeDomain(input: string): string[] {
  const reasons: string[] = [];
  const domain = extractDomain(input);
  if (!domain) return reasons;

  const labels = domain.split('.');
  const sld = labels.length >= 2 ? labels[labels.length - 2] : domain;
  const tld = labels[labels.length - 1];

  if (HOMOGLYPH_RE.test(domain)) {
    reasons.push(`Domain contains homoglyph or digit-substituted characters`);
  }

  if (SUSPICIOUS_TLDS.includes(tld)) {
    reasons.push(`Suspicious top-level domain ".${tld}" — common in phishing campaigns`);
  }

  for (const brand of KNOWN_BRANDS) {
    if (sld === brand) continue;
    if (sld.includes(brand) && sld !== brand) {
      reasons.push(`Domain mimics known brand "${brand}" (e.g. "${sld}")`);
      break;
    }
    if (labels.slice(0, -2).some((sub) => sub === brand)) {
      reasons.push(`Brand "${brand}" appears as subdomain of "${sld}.${tld}" — likely impersonation`);
      break;
    }
  }

  if (sld.includes('-') && sld.split('-').length > 2) {
    reasons.push(`Domain has unusually many hyphens — common in phishing kits`);
  }

  return reasons;
}
