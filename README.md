# SONAR — behavioral security for Solana

SONAR interrupts impulsive transaction signing with a forced cooldown and
an AI voice agent that walks the user through the specific risks.

> Existing crypto security tools fail because users ignore warnings.
> SONAR focuses on psychology instead of only detection.

## Stack

- **Frontend**: vanilla HTML/CSS/JS in `public/`, served as static.
- **Backend**: Vercel serverless functions in `api/` (Node/TS).
- **Database**: Supabase Postgres.
- **Voice**: ElevenLabs TTS.
- **Risk signals**: Helius (wallet age, history), Chainabuse (scam reports),
  WhoisXML (domain age).

## Pipeline

```
Frontend (public/)
  ↓ POST /api/analyze { wallet, transaction, type, counterparty?, scenario? }
Interceptor      → validate payload (zod)
Simulator        → canned scenarios OR real Helius/Chainabuse/WHOIS lookups
Scorer           → 0..100 + findings (rule-based)
Cooldown         → Supabase row, gates /api/confirm
ElevenLabs TTS   → narrates the risk during cooldown
Intervention UI  → overlay with audio + countdown
```

## Local development

```sh
# 1. Install
npm install

# 2. Run the schema in Supabase
#    Open supabase/schema.sql, paste into your Supabase project's
#    SQL Editor, and run once.

# 3. Configure env
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API)
# and the API keys for ElevenLabs, Helius, Chainabuse, WhoisXML.

# 4. Run via Vercel CLI
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

1. **Supabase**: run `supabase/schema.sql` in your project's SQL editor.
2. **Vercel**: connect this repo (`Settings → Git`), or run `npx vercel` once
   from the project root to link.
3. **Env vars**: in Vercel dashboard → Settings → Environment Variables, add
   every key from `.env.example`. Use the `service_role` key, not the anon
   key — backend handlers need to bypass RLS.
4. **Deploy**: push to `main` (or whatever branch is connected). Vercel
   builds the static `public/` and serverless `api/` automatically. No build
   step — TypeScript is compiled by Vercel.

## Threat intelligence sources

Counterparty addresses are checked on every chain the format can be
recognised for (`lib/modules/chains.ts`): Solana, EVM (ETH/BSC/Polygon/
Arbitrum/Base/...), Bitcoin, Litecoin, Dogecoin, Bitcoin Cash, Tron, XRP,
TON, Aptos, Cardano, Cosmos, Stellar, Algorand, NEAR, Polkadot.

| Source | What it covers | Key needed | Limits | Notes |
|---|---|---|---|---|
| Chainabuse `/v0/reports` | Community scam reports, 47 chains | Yes (`CHAINABUSE_API_KEY_n`) | **10 requests / key / month** on the free tier, 429 after that | Round-robin across slots; a slot that returns 429 is skipped for 24h. EVM addresses are searched across all chains. |
| Phantom blocklist | Solana phishing domains (~2.3k) | No | None (static GitHub file, re-fetched hourly) | |
| ScamSniffer scam-database | Phishing domains (~350k) + drainer addresses (~2.5k, EVM) | No | None (static GitHub files, re-fetched hourly) | |
| MetaMask eth-phishing-detect | Phishing domains (~98k) | No | None (static GitHub file, re-fetched hourly) | |
| Helius | Wallet age, prior interaction, behavioural heuristics (Solana only) | Yes (`HELIUS_API_KEY`) | Free tier: 1M credits / month, 10 RPS | Heuristics: `sweep_pattern`, `instant_drain`, `dust_sprayer`, `burst_activity` in `lib/modules/sources/heuristics.ts`. |
| ScamSniffer lookup API | Live drainer address check (mostly EVM) | Optional (`SCAMSNIFFER_API_KEY[_n]`) | Paid only: Standard plan from $999/month, keys via b2b@scamsniffer.io | Folds into the `blocklisted_address` rule. The free GitHub list above covers the same data with a daily delay. |
| OFAC SDN list (0xB10C mirror) | US Treasury sanctioned addresses: BTC, ETH, SOL, TRX, LTC, BCH, XRP, ARB, BSC, USDT/USDC and more | No | None (static GitHub files, re-fetched daily) | `sanctioned_address` rule, 50 points. |
| Chainalysis sanctions screening | Adds EU/UN designations on top of OFAC | Optional (`CHAINALYSIS_API_KEY[_n]`) | Free-tier request form is no longer reachable; sales contact only | Same rule; merged with OFAC hits. |
| Webacy | Address risk score + tags (SOL, ETH, BTC, TON, SUI, XLM) | Optional (`WEBACY_API_KEY[_n]`) | Free demo tier, but signup requires a non-personal (organisation domain) email; 402/429 rotate | `webacy_risk` rule, 35 or 15 points. |
| WhoisXML | Domain registration age | Yes (`WHOISXML_API_KEY`) | Free tier: 500 lookups / month total | Cached 24h per domain. |

All results are cached in function memory (1h for lists and lookups, 24h for
WHOIS), so repeated checks of the same address within a warm instance cost
nothing.

Every keyed provider reads its keys through `lib/modules/keyPool.ts`:
`<PREFIX>_API_KEY` plus `<PREFIX>_API_KEY_1..32`, round-robined, with a 24h
cooldown on any slot that returns 429. Providers with no key set are skipped
silently.

### Not wired

| Source | Why |
|---|---|
| GoPlus address security | Solana endpoint returned errors when tested |
| Blockaid / Blowfish | Enterprise contract only |

## File map

```
api/
├── analyze.ts                  POST — risk pipeline orchestrator
├── confirm.ts                  POST — consumes cooldown after acknowledge
├── cancel.ts                   POST — marks session cancelled
├── health.ts                   GET  — readiness probe
├── cooldown/
│   ├── [sessionId].ts          GET  — public status
│   ├── start.ts                POST — wallet-authed status
│   └── acknowledge.ts          POST — issue confirmToken once expired
├── voice/
│   ├── [sessionId].ts          GET  — audio/mpeg stream
│   └── generate.ts             POST — same audio, programmatic
└── users/
    ├── [wallet].ts             GET  — user profile
    ├── preferences.ts          PUT  — update risk preferences
    ├── risk-logs.ts            GET  — recent risk logs
    └── baseline.ts             GET  — behavioral baseline

lib/
├── config.ts                   zod-validated env (lazy)
├── http.ts                     small Vercel-handler helpers
├── types.ts                    shared types
├── db/
│   ├── client.ts               Supabase service-role client
│   ├── users.ts                users table
│   ├── riskLogs.ts             risk_logs table
│   └── behavioral.ts           behavioral_data table
└── modules/
    ├── interceptor.ts          payload schema
    ├── simulator.ts            scenarios OR live signals
    ├── scenarios.ts            canned demo scenarios
    ├── scorer.ts               rule-based scoring
    ├── cooldown.ts             cooldown_sessions table
    ├── voice.ts                ElevenLabs TTS provider
    ├── baseline.ts             baseline computation
    ├── chains.ts               address-format chain detection (multi-chain)
    ├── keyPool.ts              round-robin API key slots with cooldown
    └── sources/                helius, chainabuse, whois, domainPatterns, blocklists,
                                heuristics, scamsniffer, chainalysis, ofac, webacy

public/
├── index.html                  static page
├── style.css                   dark theme + intervention overlay
├── app.js                      fetches /risk, runs cooldown, plays audio
├── three-bg.js                 3D globe background
└── geojson/                    country borders for the globe

supabase/
└── schema.sql                  one-time setup — run in Supabase SQL Editor
```

## What's mocked vs real

- **Real**: full pipeline, scoring, cooldown, ElevenLabs TTS, Supabase
  persistence, Helius/Chainabuse/WhoisXML lookups.
- **Mocked**: transaction simulation (canned scenarios), final signing.
