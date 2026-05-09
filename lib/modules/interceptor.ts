import { z } from 'zod';
import type { InterceptorPayload } from '../types.js';

const payloadSchema = z.object({
  wallet: z.string().min(32).max(44),
  transaction: z.string().min(1),
  type: z.enum(['signTransaction', 'signMessage']),
  domain: z.string().min(1).max(253).optional(),
  counterparty: z.string().min(32).max(44).optional(),
  messageText: z.string().max(4000).optional(),
  scenario: z.enum(['drainer', 'unlimited_approval', 'fake_token', 'phishing_message', 'safe']).optional(),
});

export function parseInterceptorPayload(input: unknown): InterceptorPayload {
  return payloadSchema.parse(input);
}
