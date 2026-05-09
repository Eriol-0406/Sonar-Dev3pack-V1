import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getJsonBody, methodNotAllowed } from '../lib/http.js';
import { consumeSession } from '../lib/modules/cooldown.js';
import { setOutcome } from '../lib/db/riskLogs.js';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  wallet: z.string().min(32).max(44),
  confirmToken: z.string().uuid(),
});

const reasonStatus: Record<string, number> = {
  not_found: 404,
  wallet_mismatch: 403,
  cooldown_active: 409,
  not_acknowledged: 412,
  invalid_token: 401,
  token_expired: 410,
  too_many_attempts: 429,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const parsed = bodySchema.safeParse(getJsonBody(req));
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
  }

  try {
    const result = await consumeSession(parsed.data.sessionId, parsed.data.wallet, parsed.data.confirmToken);
    if (!result.ok) {
      return res.status(reasonStatus[result.reason] ?? 400).json({ error: result.reason });
    }
    await setOutcome(parsed.data.sessionId, 'confirmed');
    return res.status(200).json({
      ok: true,
      message: 'Confirmation accepted. The dApp may now sign the transaction.',
      sessionId: parsed.data.sessionId,
    });
  } catch (err) {
    console.error('[/api/confirm]', err);
    return res.status(500).json({ error: 'internal_error', message: String(err) });
  }
}
