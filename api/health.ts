import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    runtime: process.version,
    has_elevenlabs_key: !!process.env.ELEVENLABS_API_KEY,
    has_helius_key: !!process.env.HELIUS_API_KEY,
    has_chainabuse_key: !!process.env.CHAINABUSE_API_KEY,
    has_whoisxml_key: !!process.env.WHOISXML_API_KEY,
    network: process.env.SOLANA_NETWORK ?? 'unset',
  });
}
