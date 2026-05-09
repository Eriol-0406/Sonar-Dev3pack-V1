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
    └── sources/                helius, chainabuse, whois, domainPatterns

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
