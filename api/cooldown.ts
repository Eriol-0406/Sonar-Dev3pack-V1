import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getJsonBody, methodNotAllowed } from '../lib/http.js';
import { acknowledgeSession, getSession, getStatus } from '../lib/modules/cooldown.js';

const sessionSchema = z.string().uuid();
const walletSchema = z.string().min(32).max(44);
const actionSchema = z.enum(['status', 'start', 'acknowledge']);

const reasonStatus: Record<string, number> = {
  not_found: 404,
  wallet_mismatch: 403,
  cooldown_active: 409,
  too_many_attempts: 429,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = actionSchema.safeParse(req.query.action ?? 'status');
  if (!action.success) return res.status(400).json({ error: 'invalid_action' });

  try {
    switch (action.data) {
      case 'status': {
        if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
        const sessionId = sessionSchema.safeParse(req.query.sessionId);
        if (!sessionId.success) return res.status(400).json({ error: 'invalid_session_id' });
        const status = await getStatus(sessionId.data);
        if (!status) return res.status(404).json({ error: 'session_not_found' });
        return res.status(200).json(status);
      }
      case 'start': {
        if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
        const body = z
          .object({ sessionId: sessionSchema, wallet: walletSchema })
          .safeParse(getJsonBody(req));
        if (!body.success) return res.status(400).json({ error: 'invalid_payload' });
        const entry = await getSession(body.data.sessionId);
        if (!entry) return res.status(404).json({ error: 'session_not_found' });
        if (entry.wallet !== body.data.wallet) return res.status(403).json({ error: 'wallet_mismatch' });
        const status = await getStatus(body.data.sessionId);
        return res.status(200).json(status);
      }
      case 'acknowledge': {
        if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
        const sessionId = sessionSchema.safeParse(req.query.sessionId);
        if (!sessionId.success) return res.status(400).json({ error: 'invalid_session_id' });
        const body = z.object({ wallet: walletSchema }).safeParse(getJsonBody(req));
        if (!body.success) return res.status(400).json({ error: 'invalid_payload' });
        const result = await acknowledgeSession(sessionId.data, body.data.wallet);
        if (!result.ok) {
          return res.status(reasonStatus[result.reason] ?? 400).json({ error: result.reason });
        }
        return res.status(200).json({
          ok: true,
          confirmToken: result.confirmToken,
          confirmTokenExpiresAt: result.expiresAt,
        });
      }
    }
  } catch (err) {
    console.error('[/api/cooldown]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
