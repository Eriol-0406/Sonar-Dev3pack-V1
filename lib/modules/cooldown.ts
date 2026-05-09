// In-memory cooldown session store. State is lost on restart, which means
// any active cooldown sessions become "not_found" after the server bounces
// — fine for local/single-instance dev but a real distributed deploy would
// need a shared store.
import { randomUUID } from 'node:crypto';
import type { CooldownEntry, CooldownStatus, RiskVerdict } from '../types.js';

const CONFIRM_TOKEN_TTL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const SESSION_GRACE_MS = 5 * 60 * 1000;

type Row = {
  session_id: string;
  wallet: string;
  expires_at: number;
  acknowledged_at: number | null;
  confirm_token: string | null;
  confirm_token_expires_at: number | null;
  attempts: number;
  verdict: RiskVerdict;
};

const sessions = new Map<string, Row>();

function rowToEntry(r: Row): CooldownEntry {
  return {
    sessionId: r.session_id,
    wallet: r.wallet,
    expiresAt: r.expires_at,
    acknowledgedAt: r.acknowledged_at,
    confirmToken: r.confirm_token,
    confirmTokenExpiresAt: r.confirm_token_expires_at,
    attempts: r.attempts,
    verdict: r.verdict,
  };
}

export async function startCooldown(
  verdict: RiskVerdict,
  wallet: string,
): Promise<CooldownEntry> {
  const row: Row = {
    session_id: verdict.sessionId,
    wallet,
    expires_at: Date.now() + verdict.cooldownSeconds * 1000,
    acknowledged_at: null,
    confirm_token: null,
    confirm_token_expires_at: null,
    attempts: 0,
    verdict,
  };
  sessions.set(verdict.sessionId, row);
  return rowToEntry(row);
}

export async function getSession(sessionId: string): Promise<CooldownEntry | null> {
  const row = sessions.get(sessionId);
  return row ? rowToEntry(row) : null;
}

export async function getStatus(sessionId: string): Promise<CooldownStatus | null> {
  const entry = await getSession(sessionId);
  if (!entry) return null;
  const now = Date.now();
  const remainingMs = Math.max(0, entry.expiresAt - now);
  return {
    sessionId,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    cooldownPassed: remainingMs === 0,
    acknowledged: entry.acknowledgedAt != null,
    attempts: entry.attempts,
    expired: now > entry.expiresAt + SESSION_GRACE_MS,
  };
}

export type AckResult =
  | { ok: true; confirmToken: string; expiresAt: number }
  | { ok: false; reason: 'not_found' | 'wallet_mismatch' | 'cooldown_active' | 'too_many_attempts' };

export async function acknowledgeSession(
  sessionId: string,
  wallet: string,
): Promise<AckResult> {
  const row = sessions.get(sessionId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.wallet !== wallet) {
    row.attempts += 1;
    return { ok: false, reason: 'wallet_mismatch' };
  }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (Date.now() < row.expires_at) return { ok: false, reason: 'cooldown_active' };

  const now = Date.now();
  const needsNewToken =
    !row.confirm_token || (row.confirm_token_expires_at ?? 0) < now;
  const confirmToken = needsNewToken ? randomUUID() : row.confirm_token!;
  const confirmTokenExpiresAt = needsNewToken
    ? now + CONFIRM_TOKEN_TTL_MS
    : row.confirm_token_expires_at!;
  const acknowledgedAt = row.acknowledged_at ?? now;

  row.confirm_token = confirmToken;
  row.confirm_token_expires_at = confirmTokenExpiresAt;
  row.acknowledged_at = acknowledgedAt;

  return { ok: true, confirmToken, expiresAt: confirmTokenExpiresAt };
}

export type ConsumeResult =
  | { ok: true; entry: CooldownEntry }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'wallet_mismatch'
        | 'cooldown_active'
        | 'not_acknowledged'
        | 'invalid_token'
        | 'token_expired'
        | 'too_many_attempts';
    };

export async function consumeSession(
  sessionId: string,
  wallet: string,
  confirmToken: string,
): Promise<ConsumeResult> {
  const row = sessions.get(sessionId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (row.wallet !== wallet) {
    row.attempts += 1;
    return { ok: false, reason: 'wallet_mismatch' };
  }
  if (Date.now() < row.expires_at) {
    row.attempts += 1;
    return { ok: false, reason: 'cooldown_active' };
  }
  if (!row.acknowledged_at) return { ok: false, reason: 'not_acknowledged' };
  if (!row.confirm_token || row.confirm_token !== confirmToken) {
    row.attempts += 1;
    return { ok: false, reason: 'invalid_token' };
  }
  if ((row.confirm_token_expires_at ?? 0) < Date.now()) {
    return { ok: false, reason: 'token_expired' };
  }

  const entry = rowToEntry(row);
  sessions.delete(sessionId);
  return { ok: true, entry };
}
