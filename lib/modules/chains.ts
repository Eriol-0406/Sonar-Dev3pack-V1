// Detects which chain a raw wallet address belongs to from its format alone.
// Chain ids match Chainabuse's `chain` enum so they can be passed straight
// through. EVM addresses are ambiguous across ETH/BSC/Polygon/etc, so they are
// reported as 'ETH' with `evm: true`, and lookups should omit the chain
// filter where a provider allows it.

export type ChainId =
  | 'SOL'
  | 'ETH'
  | 'BTC'
  | 'TRON'
  | 'LITECOIN'
  | 'DOGECOIN'
  | 'BCH'
  | 'XRP'
  | 'TON'
  | 'APTOS'
  | 'SUI'
  | 'POLKADOT'
  | 'COSMOS'
  | 'NEAR'
  | 'XLM'
  | 'ALGORAND'
  | 'CARDANO';

export type ChainInfo = {
  chain: ChainId;
  evm: boolean;
  /** Canonical form used for lookups (EVM lowercased, others untouched). */
  normalized: string;
};

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function base58DecodeLength(s: string): number | null {
  if (!B58_RE.test(s)) return null;
  // Big-int decode; strings are short so this is cheap.
  let n = 0n;
  for (const ch of s) n = n * 58n + BigInt(B58_ALPHABET.indexOf(ch));
  let bytes = 0;
  while (n > 0n) {
    n >>= 8n;
    bytes++;
  }
  // Leading '1's encode leading zero bytes.
  let leading = 0;
  for (const ch of s) {
    if (ch !== '1') break;
    leading++;
  }
  return bytes + leading;
}

export function detectChain(raw: string): ChainInfo | null {
  const addr = raw.trim();
  if (!addr) return null;

  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    return { chain: 'ETH', evm: true, normalized: addr.toLowerCase() };
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(addr)) {
    // Aptos and Sui both use 32-byte hex; Aptos is the more common wallet form.
    return { chain: 'APTOS', evm: false, normalized: addr.toLowerCase() };
  }
  if (/^(bc1)[02-9ac-hj-np-z]{11,71}$/i.test(addr)) return { chain: 'BTC', evm: false, normalized: addr };
  if (/^(ltc1)[02-9ac-hj-np-z]{11,71}$/i.test(addr)) return { chain: 'LITECOIN', evm: false, normalized: addr };
  if (/^(bitcoincash:)?[qp][02-9ac-hj-np-z]{41}$/i.test(addr)) return { chain: 'BCH', evm: false, normalized: addr };
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return { chain: 'TRON', evm: false, normalized: addr };
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr)) return { chain: 'XRP', evm: false, normalized: addr };
  if (/^(EQ|UQ|Ef|Uf)[A-Za-z0-9_-]{46}$/.test(addr)) return { chain: 'TON', evm: false, normalized: addr };
  if (/^addr1[02-9ac-hj-np-z]{50,110}$/i.test(addr)) return { chain: 'CARDANO', evm: false, normalized: addr };
  if (/^cosmos1[02-9ac-hj-np-z]{38}$/i.test(addr)) return { chain: 'COSMOS', evm: false, normalized: addr };
  if (/^G[A-Z2-7]{55}$/.test(addr)) return { chain: 'XLM', evm: false, normalized: addr };
  if (/^[A-Z2-7]{58}$/.test(addr)) return { chain: 'ALGORAND', evm: false, normalized: addr };
  if (/^[a-z0-9_-]{2,64}\.near$/.test(addr)) return { chain: 'NEAR', evm: false, normalized: addr };

  // Base58check families: BTC legacy (1.../3...), LTC (L/M), DOGE (D), and
  // Polkadot/Solana raw 32-byte keys.
  const len = base58DecodeLength(addr);
  if (len == null) return null;
  if (len === 25) {
    if (/^[13]/.test(addr)) return { chain: 'BTC', evm: false, normalized: addr };
    if (/^[LM]/.test(addr)) return { chain: 'LITECOIN', evm: false, normalized: addr };
    if (/^D/.test(addr)) return { chain: 'DOGECOIN', evm: false, normalized: addr };
  }
  if (len === 32 && addr.length >= 32 && addr.length <= 44) {
    return { chain: 'SOL', evm: false, normalized: addr };
  }
  if (len === 35 && /^[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(addr)) {
    return { chain: 'POLKADOT', evm: false, normalized: addr };
  }
  return null;
}

export const CHAIN_LABELS: Record<ChainId, string> = {
  SOL: 'Solana',
  ETH: 'Ethereum / EVM',
  BTC: 'Bitcoin',
  TRON: 'Tron',
  LITECOIN: 'Litecoin',
  DOGECOIN: 'Dogecoin',
  BCH: 'Bitcoin Cash',
  XRP: 'XRP Ledger',
  TON: 'TON',
  APTOS: 'Aptos / Sui',
  SUI: 'Sui',
  POLKADOT: 'Polkadot',
  COSMOS: 'Cosmos',
  NEAR: 'NEAR',
  XLM: 'Stellar',
  ALGORAND: 'Algorand',
  CARDANO: 'Cardano',
};
