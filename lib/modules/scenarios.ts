import type { RiskContext, ScenarioKey, SimResult } from '../types.js';

export type ScenarioBundle = { sim: SimResult; ctx: RiskContext };

const empty: RiskContext = {
  domain: null,
  counterparty: null,
  walletAgeDays: null,
  hasPriorInteraction: null,
  scamReportCount: null,
  domainAgeDays: null,
  domainSuspicionReasons: [],
  baseline: null,
};

export const SCENARIOS: Record<ScenarioKey, ScenarioBundle> = {
  drainer: {
    sim: {
      simulatedTransfer: '50 SOL',
      approval: 'none',
      programVerified: false,
      programIds: ['DrAiNxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxX'],
      rawNote: 'Transfers 50 SOL to an unverified program flagged for drain patterns.',
    },
    ctx: {
      ...empty,
      domain: 'phantom-airdrop.xyz',
      counterparty: 'DrAiNxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxX',
      walletAgeDays: 2,
      hasPriorInteraction: false,
      scamReportCount: 14,
      domainAgeDays: 4,
      domainSuspicionReasons: [
        'Domain mimics known brand "phantom" (e.g. "phantom-airdrop")',
        'Suspicious top-level domain ".xyz" — common in phishing campaigns',
      ],
    },
  },
  unlimited_approval: {
    sim: {
      simulatedTransfer: '0 SOL',
      approval: 'unlimited',
      programVerified: true,
      programIds: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'],
      rawNote: 'Grants unlimited SPL token approval — the contract can drain tokens at any future time.',
    },
    ctx: {
      ...empty,
      domain: 'jup-claim.support',
      counterparty: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      walletAgeDays: 5,
      hasPriorInteraction: false,
      scamReportCount: 3,
      domainAgeDays: 11,
      domainSuspicionReasons: [
        'Domain mimics known brand "jup" (e.g. "jup-claim")',
        'Suspicious top-level domain ".support" — common in phishing campaigns',
      ],
    },
  },
  fake_token: {
    sim: {
      simulatedTransfer: '1000 USDC*',
      approval: 'scoped',
      programVerified: false,
      programIds: ['FaKeT0kEnXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxX'],
      rawNote: 'Receives a token whose name impersonates a major project. Likely a phishing airdrop.',
    },
    ctx: {
      ...empty,
      domain: 'usdc-bonus.click',
      counterparty: 'FaKeT0kEnXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxX',
      walletAgeDays: 1,
      hasPriorInteraction: false,
      scamReportCount: 0,
      domainAgeDays: 6,
      domainSuspicionReasons: ['Suspicious top-level domain ".click" — common in phishing campaigns'],
    },
  },
  phishing_message: {
    sim: {
      simulatedTransfer: null,
      approval: 'none',
      programVerified: true,
      programIds: [],
      rawNote: 'signMessage request — no on-chain effect, but the text grants account control.',
    },
    ctx: {
      ...empty,
      domain: 'magicedeen.xyz',
      counterparty: null,
      walletAgeDays: null,
      hasPriorInteraction: null,
      scamReportCount: null,
      domainAgeDays: 9,
      domainSuspicionReasons: [
        'Domain mimics known brand "magiceden" (e.g. "magicedeen")',
        'Suspicious top-level domain ".xyz" — common in phishing campaigns',
      ],
    },
  },
  safe: {
    sim: {
      simulatedTransfer: '0.001 SOL',
      approval: 'none',
      programVerified: true,
      programIds: ['11111111111111111111111111111111'],
      rawNote: 'Standard SOL transfer to the System Program.',
    },
    ctx: {
      ...empty,
      domain: 'phantom.app',
      counterparty: '11111111111111111111111111111111',
      walletAgeDays: 1500,
      hasPriorInteraction: true,
      scamReportCount: 0,
      domainAgeDays: 1700,
      domainSuspicionReasons: [],
    },
  },
};

export function pickScenario(key?: ScenarioKey): ScenarioBundle {
  return SCENARIOS[key ?? 'safe'];
}
