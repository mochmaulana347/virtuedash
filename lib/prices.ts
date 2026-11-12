import type { Chain, EvmChainId } from './types';
import { EVM_CONFIG } from './chains';

export interface PriceInfo {
  priceUsd: number | null;
  symbol?: string;
  name?: string;
}

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const cache = new Map<string, { at: number; data: Map<string, PriceInfo> }>();
const TTL = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const norm = (chain: Chain, a: string) => (chain === 'solana' ? a : a.toLowerCase());

/** Slug chainId DexScreener untuk tiap chain. */
function dexChainId(chain: Chain): string {
  if (chain === 'solana') return 'solana';
  return (EVM_CONFIG[chain as EvmChainId]?.dexChainId || chain) as string;
}

/** Harga token via DexScreener (gratis, tanpa API key). Filter per chainId. */
export async function getTokenPrices(
  chain: Chain,
  addresses: string[]
): Promise<Map<string, PriceInfo>> {
  const uniq = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  const out = new Map<string, PriceInfo>();
  if (!uniq.length) return out;

  const dexId = dexChainId(chain);
  const key = `${dexId}:${uniq.map((a) => norm(chain, a)).sort().join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  for (const chunk of chunks(uniq, 30)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`,
        { signal: ctrl.signal, headers: { Accept: 'application/json' } }
      );
      clearTimeout(t);
      if (!res.ok) continue;
      const d = await res.json();
      /* Pilih pair dengan likuiditas tertinggi per token (bukan pair pertama):
         DexScreener bisa mengembalikan pair kecil/basi lebih dulu. */
      const best = new Map<string, { priceUsd: number | null; symbol?: string; name?: string; liq: number }>();
      for (const p of d.pairs || []) {
        if (p.chainId !== dexId) continue;
        const ba: string = p.baseToken?.address || '';
        const k = norm(chain, ba);
        if (!ba) continue;
        const price = p.priceUsd != null ? Number(p.priceUsd) : null;
        if (!Number.isFinite(price as number)) continue;
        const liq = typeof p.liquidity?.usd === 'number' ? p.liquidity.usd : 0;
        const cur = best.get(k);
        if (!cur || liq > cur.liq) {
          best.set(k, { priceUsd: price as number, symbol: p.baseToken?.symbol, name: p.baseToken?.name, liq });
        }
      }
      for (const [k, v] of best) {
        out.set(k, { priceUsd: v.priceUsd, symbol: v.symbol, name: v.name });
      }
    } catch {
      /* abaikan, lanjut chunk berikutnya */
    }
    await sleep(200);
  }
  for (const a of uniq) {
    const k = norm(chain, a);
    if (!out.has(k)) out.set(k, { priceUsd: null });
  }
  cache.set(key, { at: Date.now(), data: out });
  return out;
}


/** Harga dari satu pair DexScreener spesifik (deterministik: satu pair, satu harga).
 *  Dipakai untuk AGC karena endpoint /tokens kadang mengembalikan respons basi
 *  (harga $0.000003539 yang nyangkut) dari sisi DexScreener. */
export async function getPairPriceUsd(chain: Chain, pairAddress: string): Promise<number | null> {
  try {
    const dexId = dexChainId(chain);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/${dexId}/${pairAddress}`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const d = await res.json();
    const p = (d.pairs || [])[0];
    const price = p?.priceUsd != null ? Number(p.priceUsd) : null;
    return Number.isFinite(price as number) ? (price as number) : null;
  } catch {
    return null;
  }
}

/** CoinGecko id untuk fallback harga native. */
const COINGECKO_ID: Record<Chain, string> = {
  ethereum: 'ethereum',
  bsc: 'binancecoin',
  base: 'ethereum',
  arbitrum: 'ethereum',
  optimism: 'ethereum',
  polygon: 'polygon-ecosystem-token',
  avalanche: 'avalanche-2',
  linea: 'ethereum',
  zksync: 'ethereum',
  blast: 'ethereum',
  solana: 'solana',
};

const nativeCache = new Map<Chain, { at: number; price: number | null }>();

/** Harga native per chain. DexScreener dulu (via wrapped native), fallback CoinGecko gratis. */
export async function getNativePrice(chain: Chain): Promise<number | null> {
  const hit = nativeCache.get(chain);
  if (hit && Date.now() - hit.at < TTL) return hit.price;

  let price: number | null = null;
  try {
    const lookup =
      chain === 'solana' ? WSOL_MINT : EVM_CONFIG[chain as EvmChainId].wrappedNative;
    const m = await getTokenPrices(chain, [lookup]);
    price = m.get(norm(chain, lookup))?.priceUsd ?? null;
  } catch {
    /* fallback di bawah */
  }
  if (price == null) {
    try {
      const id = COINGECKO_ID[chain];
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
        { signal: ctrl.signal }
      );
      clearTimeout(t);
      if (res.ok) {
        const d = await res.json();
        const v = d[id]?.usd;
        price = typeof v === 'number' ? v : null;
      }
    } catch {
      /* tetap null */
    }
  }
  nativeCache.set(chain, { at: Date.now(), price });
  return price;
}
