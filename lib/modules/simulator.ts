import type { InterceptorPayload, RiskContext, SimResult } from '../types.js';
import { pickScenario } from './scenarios.js';
import { getWalletAgeDays, hasPriorInteraction } from './sources/helius.js';
import { getScamReportCount } from './sources/chainabuse.js';
import { getDomainAgeDays, extractDomain } from './sources/whois.js';
import { analyzeDomain } from './sources/domainPatterns.js';
import { getBaseline } from './baseline.js';
import { detectChain } from './chains.js';
import { checkBlocklists } from './sources/blocklists.js';
import { analyzeCounterparty } from './sources/heuristics.js';
import { isScamSnifferBlocked } from './sources/scamsniffer.js';
import { getSanctions } from './sources/chainalysis.js';
import { getOfacSanctions } from './sources/ofac.js';
import { getWebacyRisk } from './sources/webacy.js';

const emptySim: SimResult = {
  simulatedTransfer: null,
  approval: 'none',
  programVerified: true,
  programIds: [],
  rawNote: 'No transaction details decoded.',
};

export async function gather(
  payload: InterceptorPayload,
): Promise<{ sim: SimResult; ctx: RiskContext }> {
  const baselinePromise = getBaseline(payload.wallet);

  if (payload.scenario) {
    const baseline = await baselinePromise;
    const { sim, ctx } = pickScenario(payload.scenario);
    return { sim, ctx: { ...ctx, baseline } };
  }

  const rawCounterparty = payload.counterparty ?? null;
  const chainInfo = rawCounterparty ? detectChain(rawCounterparty) : null;
  // EVM addresses are case-insensitive; normalise so caches and lists match.
  const counterparty = chainInfo?.normalized ?? rawCounterparty;
  const isSolana = chainInfo?.chain === 'SOL';
  // Chainabuse's EVM reports are filed under whichever chain the scam ran on,
  // so search all chains for EVM addresses and only filter for the rest.
  const chainabuseChain = chainInfo && !chainInfo.evm ? chainInfo.chain : null;
  const domain = payload.domain ? extractDomain(payload.domain) : null;

  const quiet = <T>(label: string, p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err) => {
      console.warn(`[simulator] ${label} failed:`, String(err));
      return fallback;
    });

  const [
    walletAgeDays,
    prior,
    scamReportCount,
    domainAgeDays,
    baseline,
    blocklistHits,
    scamSnifferBlocked,
    chainalysisSanctions,
    ofacSanctions,
    webacy,
  ] = await Promise.all([
      counterparty && isSolana ? getWalletAgeDays(counterparty) : Promise.resolve(null),
      counterparty && isSolana
        ? hasPriorInteraction(payload.wallet, counterparty)
        : Promise.resolve(null),
      counterparty ? getScamReportCount(counterparty, chainabuseChain) : Promise.resolve(null),
      domain ? getDomainAgeDays(domain) : Promise.resolve(null),
      baselinePromise,
      quiet('blocklists', checkBlocklists({ address: counterparty, domain }), []),
      counterparty ? quiet('scamsniffer', isScamSnifferBlocked(counterparty), null) : Promise.resolve(null),
      counterparty ? quiet('chainalysis', getSanctions(counterparty), null) : Promise.resolve(null),
      counterparty ? quiet('ofac', getOfacSanctions(counterparty), null) : Promise.resolve(null),
      counterparty
        ? quiet('webacy', getWebacyRisk(counterparty, chainInfo?.chain ?? null), null)
        : Promise.resolve(null),
    ]);

  // Merge sanctions sources: OFAC list is keyless and always on; Chainalysis
  // adds EU/UN designations when a key is configured.
  const sanctions =
    chainalysisSanctions == null && ofacSanctions == null
      ? null
      : [...(ofacSanctions ?? []), ...(chainalysisSanctions ?? [])];

  // The live ScamSniffer API supersedes the static list; fold it into the
  // same hit list so it scores through the existing blocklist rule.
  if (scamSnifferBlocked && !blocklistHits.some((h) => h.source === 'scamsniffer' && h.kind === 'address')) {
    blocklistHits.push({ source: 'scamsniffer', kind: 'address', matched: counterparty! });
  }

  const heuristics =
    counterparty && isSolana
      ? await analyzeCounterparty(counterparty, walletAgeDays).catch((err) => {
          console.warn('[simulator] heuristics failed:', String(err));
          return [];
        })
      : [];

  const ctx: RiskContext = {
    domain,
    counterparty,
    counterpartyChain: chainInfo?.chain ?? null,
    sanctions,
    webacy,
    blocklistHits,
    heuristics,
    walletAgeDays,
    hasPriorInteraction: prior,
    scamReportCount,
    domainAgeDays,
    domainSuspicionReasons: domain ? analyzeDomain(domain) : [],
    baseline,
  };

  return { sim: emptySim, ctx };
}

export const simulate = gather;
