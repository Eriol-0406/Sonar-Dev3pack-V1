// In-memory risk log store. Empty on boot; entries appear only as
// /analyze calls run.
import type { RiskFinding } from '../types.js';

export type RiskOutcome = 'pending' | 'confirmed' | 'cancelled';

export type RiskLogRow = {
  id: number;
  wallet: string;
  session_id: string;
  risk_score: number;
  reasons: RiskFinding[];
  scenario: string | null;
  domain: string | null;
  counterparty: string | null;
  timestamp: number;
  outcome: RiskOutcome;
};

export type LogRiskInput = {
  wallet: string;
  sessionId: string;
  riskScore: number;
  findings: RiskFinding[];
  scenario?: string | null;
  domain?: string | null;
  counterparty?: string | null;
};

const rows: RiskLogRow[] = [];
let nextId = 1;

export async function logRisk(input: LogRiskInput): Promise<void> {
  rows.push({
    id: nextId++,
    wallet: input.wallet,
    session_id: input.sessionId,
    risk_score: input.riskScore,
    reasons: input.findings,
    scenario: input.scenario ?? null,
    domain: input.domain ?? null,
    counterparty: input.counterparty ?? null,
    timestamp: Date.now(),
    outcome: 'pending',
  });
}

export async function setOutcome(sessionId: string, outcome: RiskOutcome): Promise<boolean> {
  const row = rows.find((r) => r.session_id === sessionId);
  if (!row) return false;
  row.outcome = outcome;
  return true;
}

export async function getRecentRiskLogs(wallet: string, limit = 50): Promise<RiskLogRow[]> {
  return rows
    .filter((r) => r.wallet === wallet)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
