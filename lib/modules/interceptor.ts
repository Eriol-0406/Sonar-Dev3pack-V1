import { z } from 'zod';
import type { InterceptorPayload } from '../types.js';

const payloadSchema = z.object({
  wallet: z.string().min(32).max(44),
  transaction: z.string().min(1),
  type: z.enum(['signTransaction', 'signMessage']),
  domain: z.string().min(1).max(253).optional(),
  // Any chain: BTC legacy is 26+, bech32m / Cardano can exceed 60.
  counterparty: z.string().trim().min(20).max(120).optional(),
  messageText: z.string().max(4000).optional(),
  scenario: z.enum(['drainer', 'unlimited_approval', 'fake_token', 'phishing_message', 'safe']).optional(),
  character: z.string().optional(),
});

export function parseInterceptorPayload(input: unknown): InterceptorPayload {
  return payloadSchema.parse(input);
}
