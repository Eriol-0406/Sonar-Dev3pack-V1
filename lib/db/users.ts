// In-memory replacement for the previous Supabase-backed user store.
// Lives for the lifetime of the process; restarts wipe it. Same exports
// as before so callers (api/analyze, api/users) don't change.

export type UserRow = {
  wallet_address: string;
  created_at: number;
  updated_at: number;
  risk_preferences: Record<string, unknown>;
};

const users = new Map<string, UserRow>();

export async function ensureUser(wallet: string): Promise<UserRow> {
  const now = Date.now();
  const existing = users.get(wallet);
  if (existing) {
    existing.updated_at = now;
    return existing;
  }
  const row: UserRow = {
    wallet_address: wallet,
    created_at: now,
    updated_at: now,
    risk_preferences: {},
  };
  users.set(wallet, row);
  return row;
}

export async function getUser(wallet: string): Promise<UserRow | null> {
  return users.get(wallet) ?? null;
}

export async function setRiskPreferences(
  wallet: string,
  prefs: Record<string, unknown>,
): Promise<UserRow | null> {
  const row = users.get(wallet);
  if (!row) return null;
  row.risk_preferences = prefs;
  row.updated_at = Date.now();
  return row;
}
