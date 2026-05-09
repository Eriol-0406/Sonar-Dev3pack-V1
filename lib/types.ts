export type InterceptorPayload = {
  wallet: string;
  transaction: string;
  type: 'signTransaction' | 'signMessage';
  domain?: string;
  counterparty?: string;
  messageText?: string;
  scenario?: ScenarioKey;
};

export type ScenarioKey =
  | 'drainer'
  | 'unlimited_approval'
  | 'fake_token'
  | 'phishing_message'
  | 'safe';

export type SimResult = {
  simulatedTransfer: string | null;
  approval: 'unlimited' | 'scoped' | 'none';
  programVerified: boolean;
  programIds: string[];
  rawNote: string;
};

export type RiskContext = {
  domain: string | null;
  counterparty: string | null;
  walletAgeDays: number | null;
  hasPriorInteraction: boolean | null;
  scamReportCount: number | null;
  domainAgeDays: number | null;
  domainSuspicionReasons: string[];
  baseline: BaselineSnapshot | null;
};

export type BaselineSnapshot = {
  wallet: string;
  sampleSize: number;
  windowDays: number;
  avgTransferSol: number;
  maxTransferSol: number;
  txPerDay: number;
  topCounterparties: string[];
  topPrograms: string[];
  activeHoursUtc: number[];
  chains: Record<string, number>;
  computedAt: number;
};

export type RiskLevel = 'critical' | 'warning' | 'info';

export type RiskFinding = {
  rule: string;
  level: RiskLevel;
  points: number;
  message: string;
  evidence?: Record<string, unknown>;
};

export type RiskVerdict = {
  riskRequired: boolean;
  score: number;
  cooldownSeconds: number;
  sim: SimResult;
  ctx: RiskContext;
  findings: RiskFinding[];
  voiceScript: string;
  sessionId: string;
};

export interface VoiceProvider {
  readonly name: 'tts' | 'conversational';
  generate(script: string, sessionId: string): Promise<Buffer>;
}

export type CooldownEntry = {
  wallet: string;
  sessionId: string;
  expiresAt: number;
  acknowledgedAt: number | null;
  confirmToken: string | null;
  confirmTokenExpiresAt: number | null;
  attempts: number;
  verdict: RiskVerdict;
};

export type CooldownStatus = {
  sessionId: string;
  remainingSeconds: number;
  cooldownPassed: boolean;
  acknowledged: boolean;
  attempts: number;
  expired: boolean;
};
