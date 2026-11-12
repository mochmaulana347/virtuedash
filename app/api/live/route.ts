import { NextRequest } from 'next/server';
import { getTokenPrices, getNativePrice, getPairPriceUsd } from '@/lib/prices';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const AGC = '0x63dea5acdbe1f27c968907d08610a5f0a0284ba6';
/** Pair utama AGC/WBNB PancakeSwap V2 (likuiditas terbesar) — harga diambil dari pair ini. */
const AGC_PAIR = '0xE56041CdDBB46DB01c67B7A62684F428a04Db8C6';
const USDT_BSC = '0x55d398326f99059ff775485246999027b3197955';
const WALLET = '0xC905AA0F4E53f5A7F18335e0C33977d4a6783903';
const BSC_RPCS = [
  'https://bsc.publicnode.com',
  'https://1rpc.io/bnb',
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed.bnbchain.org',
];

async function rpcOnce(url: string, body: unknown, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    if (d.error) throw new Error(d.error.message || 'RPC error');
    return d.result;
  } finally {
    clearTimeout(t);
  }
}

async function rpcBsc(method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown = null;
  for (const url of BSC_RPCS) {
    try {
      return await rpcOnce(url, { jsonrpc: '2.0', id: 1, method, params }, 12000);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Semua RPC BSC gagal');
}

/** Baca satu nilai dari RPC yang paling update (anti stale-cache provider).
 *  Majority vote gagal kalau mayoritas RPC publik lagi basi (pernah mengembalikan
 *  saldo USDT lama 34.27 padahal on-chain sudah 0): nilai basi bisa menang voting.
 *  Cara baru: (1) ambil nomor blok terbaru dari semua RPC; (2) panggil method pada
 *  blok itu (bukan 'latest') supaya cache eth_call provider yang basi tidak terpakai;
 *  (3) kalau semua gagal di blok itu, fallback ke 'latest' dengan majority vote. */
async function rpcBscFresh(method: string, params: unknown[]): Promise<any> {
  const atBlock = async (block: string): Promise<any> => {
    const p = [...params];
    p[p.length - 1] = block;
    const results = await Promise.allSettled(
      BSC_RPCS.map((url) => rpcOnce(url, { jsonrpc: '2.0', id: 1, method, params: p }, 12000))
    );
    const counts = new Map<string, { value: any; n: number }>();
    for (const r of results) {
      if (r.status !== 'fulfilled' || r.value == null) continue;
      const key = String(r.value);
      const cur = counts.get(key) ?? { value: r.value, n: 0 };
      cur.n += 1;
      counts.set(key, cur);
    }
    if (!counts.size) throw new Error('Semua RPC BSC gagal');
    let best: { value: any; n: number } | null = null;
    for (const c of counts.values()) {
      if (!best || c.n > best.n) best = c;
    }
    return best!.value;
  };
  let maxBlock = -1;
  const blocks = await Promise.all(
    BSC_RPCS.map((url) =>
      rpcOnce(url, { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }, 8000)
        .then((h: string) => {
          try {
            return Number(BigInt(h));
          } catch {
            return -1;
          }
        })
        .catch(() => -1)
    )
  );
  maxBlock = Math.max(...blocks);
  if (maxBlock > 0) {
    try {
      return await atBlock('0x' + maxBlock.toString(16));
    } catch {
      /* jatuh ke 'latest' */
    }
  }
  return atBlock('latest');
}

const BALANCE_OF = '0x70a08231' + '0'.repeat(24) + WALLET.slice(2).toLowerCase();

/**
 * GET /api/live
 * Satu panggilan ringan untuk dashboard live:
 * - harga AGC (DexScreener) + harga BNB (CoinGecko/DexScreener fallback)
 * - saldo wallet on-chain: BNB, AGC, USDT (via eth_call/eth_getBalance)
 * Tidak ada harga yang di-hardcode di sini — semua dari sumber live.
 */
export async function GET(_req: NextRequest) {
  const [agcPairPrice, agcMap, bnbPrice, balBnbHex, balAgcHex, balUsdtHex] = await Promise.all([
    getPairPriceUsd('bsc', AGC_PAIR).catch(() => null),
    getTokenPrices('bsc', [AGC]).catch(() => null),
    getNativePrice('bsc').catch(() => null),
    rpcBscFresh('eth_getBalance', [WALLET, 'latest']).catch(() => null),
    rpcBscFresh('eth_call', [{ to: AGC, data: BALANCE_OF }, 'latest']).catch(() => null),
    rpcBscFresh('eth_call', [{ to: USDT_BSC, data: BALANCE_OF }, 'latest']).catch(() => null),
  ]);

  const agcPriceUsd = agcPairPrice ?? agcMap?.get(AGC.toLowerCase())?.priceUsd ?? null;
  const toNum = (hex: string | null, decimals = 18): number | null => {
    if (!hex) return null;
    try {
      return Number(BigInt(hex)) / 10 ** decimals;
    } catch {
      return null;
    }
  };

  return Response.json(
    {
      agcPriceUsd,
      bnbPriceUsd: bnbPrice,
      balances: {
        bnb: toNum(balBnbHex),
        agc: toNum(balAgcHex),
        usdt: toNum(balUsdtHex),
      },
      fetchedAt: Date.now(),
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate' } }
  );
}
