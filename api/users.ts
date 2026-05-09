import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getJsonBody, methodNotAllowed } from '../lib/http.js';
import { getUser, setRiskPreferences } from '../lib/db/users.js';
import { getRecentRiskLogs } from '../lib/db/riskLogs.js';
import { getBehavioral } from '../lib/db/behavioral.js';

const walletSchema = z.string().min(32).max(44);
const limitSchema = z.coerce.number().int().min(1).max(500).default(50);
const actionSchema = z.enum(['profile', 'preferences', 'risk-logs', 'baseline']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const wallet = walletSchema.safeParse(req.query.wallet);
  if (!wallet.success) return res.status(400).json({ error: 'invalid_wallet' });

  const action = actionSchema.safeParse(req.query.action ?? 'profile');
  if (!action.success) return res.status(400).json({ error: 'invalid_action' });

  try {
    switch (action.data) {
      case 'profile': {
        if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
        const user = await getUser(wallet.data);
        if (!user) return res.status(404).json({ error: 'user_not_found' });
        return res.status(200).json(user);
      }
      case 'preferences': {
        if (req.method !== 'PUT') return methodNotAllowed(res, ['PUT']);
        const prefs = z.record(z.unknown()).safeParse(getJsonBody(req));
        if (!prefs.success) return res.status(400).json({ error: 'invalid_preferences' });
        const updated = await setRiskPreferences(wallet.data, prefs.data);
        if (!updated) return res.status(404).json({ error: 'user_not_found' });
        return res.status(200).json(updated);
      }
      case 'risk-logs': {
        if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
        const limit = limitSchema.safeParse(req.query.limit);
        if (!limit.success) return res.status(400).json({ error: 'invalid_query' });
        const logs = await getRecentRiskLogs(wallet.data, limit.data);
        return res.status(200).json({ logs });
      }
      case 'baseline': {
        if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
        const baseline = await getBehavioral(wallet.data);
        if (!baseline) return res.status(404).json({ error: 'baseline_not_found' });
        return res.status(200).json(baseline);
      }
    }
  } catch (err) {
    console.error('[/api/users]', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
