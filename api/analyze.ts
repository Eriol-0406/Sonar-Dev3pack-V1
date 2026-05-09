import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { getJsonBody, methodNotAllowed } from '../lib/http.js';
import { parseInterceptorPayload } from '../lib/modules/interceptor.js';
import { gather } from '../lib/modules/simulator.js';
import { score, cooldownFor } from '../lib/modules/scorer.js';
import { startCooldown } from '../lib/modules/cooldown.js';
import { buildVoiceScript } from '../lib/modules/voice.js';
import { ensureUser } from '../lib/db/users.js';
import { logRisk } from '../lib/db/riskLogs.js';
import type { RiskVerdict } from '../lib/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  let payload;
  try {
    payload = parseInterceptorPayload(getJsonBody(req));
  } catch (err) {
    return res.status(400).json({ error: 'invalid_payload', details: String(err) });
  }

  try {
    await ensureUser(payload.wallet);

    const { sim, ctx } = await gather(payload);
    const { score: riskScore, findings } = score(sim, ctx, payload);
    const cooldownSeconds = cooldownFor(riskScore);
    const sessionId = randomUUID();
    const voiceScript = buildVoiceScript(findings, riskScore, sessionId);

    const verdict: RiskVerdict = {
      riskRequired: riskScore >= 40,
      score: riskScore,
      cooldownSeconds,
      sim,
      ctx,
      findings,
      voiceScript,
      sessionId,
    };

    await logRisk({
      wallet: payload.wallet,
      sessionId,
      riskScore,
      findings,
      scenario: payload.scenario ?? null,
      domain: ctx.domain,
      counterparty: ctx.counterparty,
    });

    if (verdict.riskRequired) await startCooldown(verdict, payload.wallet);

    return res.status(200).json(verdict);
  } catch (err) {
    console.error('[/api/analyze]', err);
    return res.status(500).json({ error: 'internal_error', message: String(err) });
  }
}
