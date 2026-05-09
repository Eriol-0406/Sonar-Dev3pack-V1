import { z } from 'zod';

// Vercel injects env vars at runtime. `vercel dev` loads .env for us; in CI
// (e.g. typecheck) the values may be unset — so we validate lazily on first
// access, not at module load.

const schema = z.object({
  ELEVENLABS_API_KEY: z.string().min(1, 'ELEVENLABS_API_KEY is required'),
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  SOLANA_NETWORK: z.enum(['devnet', 'mainnet-beta', 'testnet']).default('devnet'),
  HELIUS_API_KEY: z.string().min(1, 'HELIUS_API_KEY is required'),
  WHOISXML_API_KEY: z.string().min(1, 'WHOISXML_API_KEY is required'),
  CHAINABUSE_API_KEY: z.string().min(1, 'CHAINABUSE_API_KEY is required'),
});

type Config = z.infer<typeof schema>;

let _data: Config | undefined;

function load(): Config {
  if (_data) return _data;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[config] invalid environment — ${issues}`);
  }
  _data = parsed.data;
  return _data;
}

// Preserves existing `config.X` access pattern so callers don't need rewriting.
export const config: Config = new Proxy({} as Config, {
  get: (_, key: string) => load()[key as keyof Config],
});
