// Shared round-robin API key pool with per-key cooldown.
//
// Reads `<PREFIX>_API_KEY` plus `<PREFIX>_API_KEY_1` .. `<PREFIX>_API_KEY_32`
// from the environment. Any key that returns 429 (or that a caller marks
// exhausted) is skipped for `cooldownMs`, so a set of free-tier accounts can
// be pooled to survive a monthly quota.
//
//   const pool = getKeyPool('CHAINABUSE');
//   const result = await pool.withKey(async (key) => { ... });
//
// The callback should throw `new KeyExhaustedError()` on a quota response so
// the pool moves to the next key; any other error also advances to the next
// key but is logged. Returns `null` when no key succeeds or none are set.

export class KeyExhaustedError extends Error {
  constructor(msg = 'key exhausted') {
    super(msg);
    this.name = 'KeyExhaustedError';
  }
}

export type KeyPool = {
  readonly name: string;
  size(): number;
  withKey<T>(fn: (key: string) => Promise<T>): Promise<T | null>;
};

const MAX_SLOTS = 32;
const pools = new Map<string, KeyPool>();

function readKeys(prefix: string): string[] {
  const keys: string[] = [];
  const base = process.env[`${prefix}_API_KEY`]?.trim();
  if (base) keys.push(base);
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const k = process.env[`${prefix}_API_KEY_${i}`]?.trim();
    if (k) keys.push(k);
  }
  return [...new Set(keys)];
}

export function getKeyPool(prefix: string, opts: { cooldownMs?: number } = {}): KeyPool {
  const existing = pools.get(prefix);
  if (existing) return existing;

  const cooldownMs = opts.cooldownMs ?? 24 * 60 * 60 * 1000;
  const cooldowns = new Map<string, number>();
  let cursor = 0;

  const pool: KeyPool = {
    name: prefix,
    size: () => readKeys(prefix).length,
    async withKey<T>(fn: (key: string) => Promise<T>): Promise<T | null> {
      // Re-read each call: env can be injected lazily in serverless runtimes.
      const keys = readKeys(prefix);
      if (keys.length === 0) return null;

      for (let attempt = 0; attempt < keys.length; attempt++) {
        const idx = (cursor + attempt) % keys.length;
        const key = keys[idx];
        if ((cooldowns.get(key) ?? 0) > Date.now()) continue;

        try {
          const out = await fn(key);
          cursor = (idx + 1) % keys.length;
          return out;
        } catch (err) {
          if (err instanceof KeyExhaustedError) {
            cooldowns.set(key, Date.now() + cooldownMs);
            console.warn(`[keypool:${prefix}] slot ${idx} exhausted, cooling down`);
          } else {
            console.error(`[keypool:${prefix}] slot ${idx} failed:`, String(err));
          }
        }
      }
      return null;
    },
  };
  pools.set(prefix, pool);
  return pool;
}

/** For /health: which pools have keys configured. */
export function keyPoolStatus(prefixes: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of prefixes) out[p.toLowerCase()] = readKeys(p).length;
  return out;
}
