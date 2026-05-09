import type {
  InterceptorPayload,
  RiskContext,
  RiskFinding,
  SimResult,
} from '../types.js';

type RuleInput = {
  sim: SimResult;
  ctx: RiskContext;
  payload: InterceptorPayload;
};

type Rule = {
  id: string;
  evaluate(input: RuleInput): RiskFinding | null;
};

const PHISHING_PHRASES = [
  /reveal\s+(?:your\s+)?(?:seed|recovery)\s*phrase/i,
  /enter\s+your\s+(?:private\s+key|seed\s+phrase)/i,
  /grant\s+full\s+access/i,
  /sign\s+to\s+claim\s+airdrop/i,
  /verify\s+wallet\s+ownership.*urgent/i,
];

const RULES: Rule[] = [
  {
    id: 'large_transfer',
    evaluate: ({ sim }) => {
      const m = sim.simulatedTransfer?.match(/^(\d+(?:\.\d+)?) SOL$/);
      if (!m || parseFloat(m[1]) <= 10) return null;
      return {
        rule: 'large_transfer',
        level: 'warning',
        points: 15,
        message: `Large transfer detected: ${sim.simulatedTransfer}`,
        evidence: { sol: parseFloat(m[1]) },
      };
    },
  },
  {
    id: 'unlimited_approval',
    evaluate: ({ sim }) => {
      if (sim.approval !== 'unlimited') return null;
      return {
        rule: 'unlimited_approval',
        level: 'critical',
        points: 30,
        message:
          'Unlimited token approval — this program could drain your tokens at any time in the future',
        evidence: { approval: 'unlimited' },
      };
    },
  },
  {
    id: 'unverified_program',
    evaluate: ({ sim }) => {
      if (sim.programVerified) return null;
      return {
        rule: 'unverified_program',
        level: 'critical',
        points: 25,
        message: 'This transaction interacts with an unverified program',
        evidence: { programIds: sim.programIds },
      };
    },
  },
  {
    id: 'complex_transaction',
    evaluate: ({ sim }) => {
      if (sim.programIds.length <= 3) return null;
      return {
        rule: 'complex_transaction',
        level: 'info',
        points: 10,
        message: `Complex transaction touching ${sim.programIds.length} programs`,
        evidence: { count: sim.programIds.length },
      };
    },
  },
  {
    id: 'fake_token_name',
    evaluate: ({ sim }) => {
      if (!sim.simulatedTransfer || !/\*$/.test(sim.simulatedTransfer)) return null;
      return {
        rule: 'fake_token_name',
        level: 'warning',
        points: 20,
        message: 'Token name appears to impersonate a known project',
        evidence: { transfer: sim.simulatedTransfer },
      };
    },
  },
  {
    id: 'wallet_age',
    evaluate: ({ ctx }) => {
      if (ctx.walletAgeDays == null || ctx.walletAgeDays >= 7) return null;
      return {
        rule: 'wallet_age',
        level: 'warning',
        points: 20,
        message: `Counterparty wallet is only ${ctx.walletAgeDays} day(s) old — fresh wallets are common in scams`,
        evidence: { walletAgeDays: ctx.walletAgeDays, counterparty: ctx.counterparty },
      };
    },
  },
  {
    id: 'no_prior_interaction',
    evaluate: ({ ctx }) => {
      if (ctx.hasPriorInteraction !== false) return null;
      return {
        rule: 'no_prior_interaction',
        level: 'info',
        points: 5,
        message: "You've never interacted with this address before",
        evidence: { counterparty: ctx.counterparty },
      };
    },
  },
  {
    id: 'scam_reports',
    evaluate: ({ ctx }) => {
      if (!ctx.scamReportCount || ctx.scamReportCount <= 0) return null;
      return {
        rule: 'scam_reports',
        level: 'critical',
        points: 40,
        message: `${ctx.scamReportCount} scam report(s) filed against this address on Chainabuse`,
        evidence: { count: ctx.scamReportCount, counterparty: ctx.counterparty },
      };
    },
  },
  {
    id: 'domain_age',
    evaluate: ({ ctx }) => {
      if (ctx.domainAgeDays == null || ctx.domainAgeDays >= 30) return null;
      return {
        rule: 'domain_age',
        level: 'warning',
        points: 25,
        message: `Domain "${ctx.domain}" was registered only ${ctx.domainAgeDays} day(s) ago`,
        evidence: { domain: ctx.domain, domainAgeDays: ctx.domainAgeDays },
      };
    },
  },
  {
    id: 'fake_domain_pattern',
    evaluate: ({ ctx }) => {
      if (ctx.domainSuspicionReasons.length === 0) return null;
      return {
        rule: 'fake_domain_pattern',
        level: 'critical',
        points: 30,
        message: `Domain "${ctx.domain}" looks like a phishing site: ${ctx.domainSuspicionReasons[0]}`,
        evidence: { domain: ctx.domain, reasons: ctx.domainSuspicionReasons },
      };
    },
  },
  {
    id: 'phishing_message',
    evaluate: ({ payload }) => {
      if (payload.type !== 'signMessage' || !payload.messageText) return null;
      const text = payload.messageText;
      const matched = PHISHING_PHRASES.find((re) => re.test(text));
      if (!matched) return null;
      return {
        rule: 'phishing_message',
        level: 'critical',
        points: 45,
        message: 'Message you are being asked to sign contains a known phishing phrase',
        evidence: { matched: matched.source, snippet: text.slice(0, 200) },
      };
    },
  },
  {
    id: 'transfer_above_baseline',
    evaluate: ({ sim, ctx }) => {
      const m = sim.simulatedTransfer?.match(/^(\d+(?:\.\d+)?) SOL$/);
      if (!m || !ctx.baseline || ctx.baseline.avgTransferSol <= 0) return null;
      const amount = parseFloat(m[1]);
      const avg = ctx.baseline.avgTransferSol;
      if (amount < avg * 5) return null;
      const multiple = Math.round(amount / avg);
      return {
        rule: 'transfer_above_baseline',
        level: 'warning',
        points: 20,
        message: `Transfer is ~${multiple}× larger than your average of ${avg} SOL`,
        evidence: { amount, avgTransferSol: avg, multiple },
      };
    },
  },
  {
    id: 'unfamiliar_counterparty',
    evaluate: ({ ctx }) => {
      if (!ctx.baseline || !ctx.counterparty) return null;
      if (ctx.baseline.sampleSize < 5) return null;
      if (ctx.baseline.topCounterparties.includes(ctx.counterparty)) return null;
      if (ctx.baseline.topPrograms.includes(ctx.counterparty)) return null;
      return {
        rule: 'unfamiliar_counterparty',
        level: 'info',
        points: 10,
        message: 'Counterparty is not among addresses you commonly interact with',
        evidence: {
          counterparty: ctx.counterparty,
          knownCounterparties: ctx.baseline.topCounterparties.length,
        },
      };
    },
  },
  {
    id: 'unfamiliar_protocol',
    evaluate: ({ sim, ctx }) => {
      if (!ctx.baseline || sim.programIds.length === 0) return null;
      if (ctx.baseline.sampleSize < 5) return null;
      const known = new Set(ctx.baseline.topPrograms);
      const unfamiliar = sim.programIds.filter((p) => !known.has(p));
      if (unfamiliar.length === 0) return null;
      return {
        rule: 'unfamiliar_protocol',
        level: 'info',
        points: 10,
        message: `Touches ${unfamiliar.length} program(s) you've never used before`,
        evidence: { unfamiliarProgramIds: unfamiliar },
      };
    },
  },
  {
    id: 'off_hours_signing',
    evaluate: ({ ctx }) => {
      if (!ctx.baseline || ctx.baseline.activeHoursUtc.length === 0) return null;
      if (ctx.baseline.sampleSize < 10) return null;
      const hour = new Date().getUTCHours();
      if (ctx.baseline.activeHoursUtc.includes(hour)) return null;
      return {
        rule: 'off_hours_signing',
        level: 'info',
        points: 5,
        message: `Signing at ${hour}:00 UTC — outside your normal active hours`,
        evidence: { hourUtc: hour, activeHoursUtc: ctx.baseline.activeHoursUtc },
      };
    },
  },
];

export function score(
  sim: SimResult,
  ctx: RiskContext,
  payload: InterceptorPayload,
): { score: number; findings: RiskFinding[] } {
  const findings: RiskFinding[] = [];
  for (const rule of RULES) {
    const f = rule.evaluate({ sim, ctx, payload });
    if (f) findings.push(f);
  }
  findings.sort((a, b) => b.points - a.points);
  const total = findings.reduce((sum, f) => sum + f.points, 0);
  return { score: Math.min(total, 100), findings };
}

export function cooldownFor(score: number): number {
  if (score >= 80) return 60;
  if (score >= 60) return 45;
  if (score >= 40) return 30;
  return 0;
}

export const __rules = RULES;
