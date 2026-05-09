import type { VercelRequest, VercelResponse } from '@vercel/node';

export function methodNotAllowed(res: VercelResponse, allowed: string[]): void {
  res.setHeader('allow', allowed.join(', '));
  res.status(405).json({ error: 'method_not_allowed', allowed });
}

// Vercel parses JSON bodies into req.body when content-type is JSON, but
// returns it as a string when content-type is missing. Normalize.
export function getJsonBody(req: VercelRequest): unknown {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}
