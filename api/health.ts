import type { VercelRequest, VercelResponse } from '@vercel/node';
import { blocklistStatus, warmBlocklists } from '../lib/modules/sources/blocklists.js';
import { keyPoolStatus } from '../lib/modules/keyPool.js';
import { ofacStatus, warmOfac } from '../lib/modules/sources/ofac.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  warmBlocklists();
  warmOfac();
  return res.status(200).json({
    blocklists: blocklistStatus(),
    ofac: ofacStatus(),
    key_slots: keyPoolStatus(['CHAINABUSE', 'SCAMSNIFFER', 'CHAINALYSIS', 'WEBACY']),
    ok: true,
    runtime: process.version,
    has_elevenlabs_key: !!process.env.ELEVENLABS_API_KEY,
    elevenlabs_key_format: process.env.ELEVENLABS_API_KEY?.startsWith('sk_') ? 'sk_ (ok)' : 'not an sk_ key',
    has_helius_key: !!process.env.HELIUS_API_KEY,
    has_chainabuse_key: !!(
      process.env.CHAINABUSE_API_KEY || Object.keys(process.env).some((k) => k.startsWith('CHAINABUSE_API_KEY_'))
    ),
    network: process.env.SOLANA_NETWORK ?? 'unset',
  });
}
