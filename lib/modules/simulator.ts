import type { InterceptorPayload, RiskContext, SimResult } from '../types.js';
import { pickScenario } from './scenarios.js';
import { getWalletAgeDays, hasPriorInteraction } from './sources/helius.js';
import { getScamReportCount } from './sources/chainabuse.js';
import { getDomainAgeDays, extractDomain } from './sources/whois.js';
import { analyzeDomain } from './sources/domainPatterns.js';
import { getBaseline } from './baseline.js';

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

  const counterparty = payload.counterparty ?? null;
  const domain = payload.domain ? extractDomain(payload.domain) : null;

  const [walletAgeDays, prior, scamReportCount, domainAgeDays, baseline] =
    await Promise.all([
      counterparty ? getWalletAgeDays(counterparty) : Promise.resolve(null),
      counterparty
        ? hasPriorInteraction(payload.wallet, counterparty)
        : Promise.resolve(null),
      counterparty ? getScamReportCount(counterparty) : Promise.resolve(null),
      domain ? getDomainAgeDays(domain) : Promise.resolve(null),
      baselinePromise,
    ]);

  const ctx: RiskContext = {
    domain,
    counterparty,
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
