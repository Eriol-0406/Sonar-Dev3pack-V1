import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { getJsonBody, methodNotAllowed } from '../lib/http.js';
import { parseInterceptorPayload } from '../lib/modules/interceptor.js';
import { gather } from '../lib/modules/simulator.js';
import { score, cooldownFor } from '../lib/modules/scorer.js';
import { startCooldown } from '../lib/modules/cooldown.js';
import { buildVoiceScript, voiceProvider } from '../lib/modules/voice.js';
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
    const riskRequired = riskScore >= 40;

    // Generate audio inline so the frontend doesn't have to fetch
    // /voice/:sessionId — that follow-up request can't see the cooldown row
    // when Vercel routes it to a different function instance.
    let voiceAudioDataUrl: string | null = null;
    if (riskRequired) {
      try {
        const buf = await voiceProvider.generate(voiceScript, sessionId);
        voiceAudioDataUrl = `data:audio/mpeg;base64,${buf.toString('base64')}`;
      } catch (err) {
        console.error('[/api/analyze] voice generation failed (continuing):', err);
      }
    }

    const verdict: RiskVerdict = {
      riskRequired,
      score: riskScore,
      cooldownSeconds,
      sim,
      ctx,
      findings,
      voiceScript,
      voiceAudioDataUrl,
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

    if (riskRequired) await startCooldown(verdict, payload.wallet);

    return res.status(200).json(verdict);
  } catch (err) {
    console.error('[/api/analyze]', err);
    return res.status(500).json({ error: 'internal_error', message: String(err) });
  }
}
