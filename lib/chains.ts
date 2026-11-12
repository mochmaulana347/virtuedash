import type { AssetEntry, Chain, EvmChainId, ScanResult } from './types';
import { NATIVE_SYMBOL } from './types';
import { getNativePrice, getTokenPrices } from './prices';

const SOL_RPC = 'https://api.mainnet-beta.solana.com';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkHGjY90iPewvMPYQz9mZ6m';

export interface EvmChainConfig {
  id: EvmChainId;
  label: string;
  chainId: number;
  /** chainId 1inch untuk discovery token; null = tidak didukung (hanya native). */
  inchChainId: number | null;
  /** slug chainId di DexScreener untuk harga. */
  dexChainId: string;
  /** Public RPC — dicoba berurutan sampai ada yang merespons. */
  rpcs: string[];
  /** Wrapped native untuk lookup harga. */
  wrappedNative: string;
  /** Watchlist NFT yang selalu diverifikasi on-chain (opsional). */
  nftWatchlist?: { contract: string; knownTokenIds?: string[] }[];
}

/**
 * Konfigurasi 10 jaringan EVM populer ("yang viral").
 * Semua sumber data gratis tanpa API key:
 * - saldo native: public RPC (dengan fallback)
 * - discovery token: 1inch balances API (Blast belum didukung 1inch -> native saja)
 * - harga: DexScreener (+ fallback CoinGecko di lib/prices)
 *
 * TAHAP BERIKUTNYA (belum didukung): Tron & Bitcoin — format alamat dan
 * API-nya berbeda, butuh scanner terpisah.
 */
export const EVM_CONFIG: Record<EvmChainId, EvmChainConfig> = {
  ethereum: {
    id: 'ethereum',
    label: 'Ethereum',
    chainId: 1,
    inchChainId: 1,
    dexChainId: 'ethereum',
    rpcs: ['https://ethereum.publicnode.com', 'https://eth.llamarpc.com'],
    wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  bsc: {
    id: 'bsc',
    label: 'BNB Chain',
    chainId: 56,
    inchChainId: 56,
    dexChainId: 'bsc',
    rpcs: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io'],
    wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    nftWatchlist: [
      // Cast Deep — token #2163 terverifikasi milik wallet via ownerOf
      { contract: '0x37f8f181ab2f2b2D4209AA9c77c34d8E8566C360', knownTokenIds: ['2163'] },
    ],
  },
  base: {
    id: 'base',
    label: 'Base',
    chainId: 8453,
    inchChainId: 8453,
    dexChainId: 'base',
    rpcs: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  arbitrum: {
    id: 'arbitrum',
    label: 'Arbitrum',
    chainId: 42161,
    inchChainId: 42161,
    dexChainId: 'arbitrum',
    rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],
    wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  optimism: {
    id: 'optimism',
    label: 'Optimism',
    chainId: 10,
    inchChainId: 10,
    dexChainId: 'optimism',
    rpcs: ['https://mainnet.optimism.io', 'https://optimism.llamarpc.com'],
    wrappedNative: '0x4200000000000000000000000000000000000006',
  },
  polygon: {
    id: 'polygon',
    label: 'Polygon',
    chainId: 137,
    inchChainId: 137,
    dexChainId: 'polygon',
    rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.llamarpc.com'],
    wrappedNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  },
  avalanche: {
    id: 'avalanche',
    label: 'Avalanche',
    chainId: 43114,
    inchChainId: 43114,
    dexChainId: 'avalanche',
    rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche.public-rpc.com'],
    wrappedNative: '0xB31f54cA6FaAaaB9c90DA9Fc7E2C025B9aD2B9eb0',
  },
  linea: {
    id: 'linea',
    label: 'Linea',
    chainId: 59144,
    inchChainId: 59144,
    dexChainId: 'linea',
    rpcs: ['https://rpc.linea.build', 'https://linea-rpc.publicnode.com'],
    wrappedNative: '0xe5D7C2a44FfDDf6b295A15c528D5d28dF9152014',
  },
  zksync: {
    id: 'zksync',
    label: 'zkSync Era',
    chainId: 324,
    inchChainId: 324,
    dexChainId: 'zksync',
    rpcs: ['https://mainnet.era.zksync.io', 'https://zksync-era.blockpi.network/v1/rpc/public'],
    wrappedNative: '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9A91',
  },
  blast: {
    id: 'blast',
    label: 'Blast',
    chainId: 81457,
    inchChainId: null, // 1inch belum mendukung Blast -> discovery token nonaktif
    dexChainId: 'blast',
    rpcs: ['https://rpc.blast.io', 'https://blast.llamarpc.com'],
    wrappedNative: '0x4300000000000000000000000000000000000004',
  },
};

/** Placeholder native di API 1inch — bukan token, harus diabaikan. */
const INCH_NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Panggil RPC EVM — coba tiap endpoint berurutan sampai ada yang berhasil. */
async function rpcEvm(cfg: EvmChainConfig, method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown = null;
  for (const url of cfg.rpcs) {
    try {
      return await rpcOnce(url, { jsonrpc: '2.0', id: 1, method, params }, 15000);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Semua RPC gagal');
}

async function rpcSol(method: string, params: unknown[]): Promise<any> {
  return rpcOnce(SOL_RPC, { jsonrpc: '2.0', id: 1, method, params }, 25000);
}

const padAddr = (a: string) => '0'.repeat(24) + a.toLowerCase().replace(/^0x/, '');

function decodeAbiString(hex: string): string {
  try {
    const b = Buffer.from(hex.replace(/^0x/, ''), 'hex');
    if (b.length < 64) return '';
    const len = Number(BigInt('0x' + b.subarray(32, 64).toString('hex')));
    return b.subarray(64, 64 + len).toString('utf8');
  } catch {
    return '';
  }
}

/* ---------- 1inch (gratis, tanpa key) ---------- */

const inchListCache = new Map<string, { at: number; map: Map<string, { symbol: string; decimals: number; name: string }> }>();

async function getInchTokenList(inchChainId: number) {
  const key = String(inchChainId);
  const hit = inchListCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.map;
  const map = new Map<string, { symbol: string; decimals: number; name: string }>();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`https://tokens.1inch.io/v1.1/${inchChainId}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const d = await res.json();
      for (const t of Object.values(d) as any[]) {
        map.set(String(t.address).toLowerCase(), {
          symbol: t.symbol,
          decimals: Number(t.decimals),
          name: t.name || '',
        });
      }
    }
  } catch {
    /* daftar kosong, lanjut */
  }
  inchListCache.set(key, { at: Date.now(), map });
  return map;
}

async function getInchBalances(inchChainId: number, addr: string): Promise<Record<string, string> | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`https://balances.1inch.io/v1.1/${inchChainId}/balances/${addr}`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------- Scanner EVM generik ---------- */

async function scanEvm(cfg: EvmChainConfig, address: string, extraNft: string[]): Promise<ScanResult> {
  const addr = address.trim();
  const addrL = addr.toLowerCase();
  const sym = NATIVE_SYMBOL[cfg.id];
  const ethCall = (to: string, data: string) => rpcEvm(cfg, 'eth_call', [{ to, data }, 'latest']);

  const [balHex, nativePrice] = await Promise.all([
    rpcEvm(cfg, 'eth_getBalance', [addr, 'latest']),
    getNativePrice(cfg.id),
  ]);
  const nativeAmt = Number(BigInt(balHex as string)) / 1e18;

  // Token ERC-20 dari 1inch (bila chain didukung)
  const tokens: AssetEntry[] = [];
  if (cfg.inchChainId != null) {
    const [inchBalances, meta] = await Promise.all([
      getInchBalances(cfg.inchChainId, addrL),
      getInchTokenList(cfg.inchChainId),
    ]);
    const tokenAddrs: string[] = [];
    if (inchBalances) {
      for (const [a, raw] of Object.entries(inchBalances)) {
        const al = a.toLowerCase();
        if (al === INCH_NATIVE) continue; // placeholder native, bukan token
        try {
          if (BigInt(raw as string) > BigInt(0)) tokenAddrs.push(al);
        } catch {
          /* abaikan */
        }
      }
    }
    const priceMap = await getTokenPrices(cfg.id, tokenAddrs);
    for (const a of tokenAddrs.slice(0, 80)) {
      const m = meta.get(a);
      const decimals = m?.decimals ?? 18;
      let amount = 0;
      try {
        amount = Number(BigInt((inchBalances as Record<string, string>)[a])) / 10 ** decimals;
      } catch {
        continue;
      }
      const p = priceMap.get(a);
      const priceUsd = p?.priceUsd ?? null;
      tokens.push({
        id: `${cfg.id}:token:${a}`,
        kind: 'token',
        symbol: m?.symbol || `${a.slice(0, 6)}…`,
        name: m?.name,
        contract: a,
        amount,
        priceUsd,
        valueUsd: priceUsd != null ? amount * priceUsd : null,
      });
    }
  }

  // NFT: watchlist + kontrak tambahan dari user (saat ini hanya BSC yang punya watchlist).
  // Urutan: (1) enumerasi ERC721Enumerable bila didukung,
  // (2) verifikasi ownerOf untuk token ID yang diketahui,
  // (3) fallback tampilan jumlah saja (public RPC memblokir eth_getLogs).
  const nfts: AssetEntry[] = [];
  const watchContracts = (cfg.nftWatchlist || []).map((x) => x.contract.toLowerCase());
  const nftContracts = [...new Set([...watchContracts, ...extraNft.map((x) => x.toLowerCase())])];
  if (nftContracts.length) {
    const nftPrices = await getTokenPrices(cfg.id, nftContracts);
    for (const c of nftContracts) {
      let bal = 0;
      try {
        const hex = await ethCall(c, '0x70a08231' + padAddr(addrL));
        bal = Number(BigInt(hex));
      } catch {
        continue;
      }
      if (bal <= 0) continue;
      const name = await ethCall(c, '0x06fdde03').then(decodeAbiString).catch(() => '');

      const ids: string[] = [];
      // (1) coba enumerasi
      for (let i = 0; i < Math.min(bal, 50); i++) {
        try {
          const t = await ethCall(
            c,
            '0x2f745c59' + padAddr(addrL) + i.toString(16).padStart(64, '0')
          );
          ids.push(BigInt(t).toString());
        } catch {
          break;
        }
        await sleep(120);
      }
      // (2) verifikasi token ID yang diketahui
      if (!ids.length) {
        const known = (cfg.nftWatchlist || []).find((x) => x.contract.toLowerCase() === c)?.knownTokenIds || [];
        for (const tid of known) {
          try {
            const o = await ethCall(c, '0x6352211e' + BigInt(tid).toString(16).padStart(64, '0'));
            if (o.toLowerCase().endsWith(addrL.replace(/^0x/, ''))) ids.push(tid);
          } catch {
            /* abaikan */
          }
          await sleep(120);
        }
      }

      const p = nftPrices.get(c);
      const priceUsd = p?.priceUsd ?? null;
      if (ids.length) {
        for (const tid of ids) {
          nfts.push({
            id: `${cfg.id}:nft:${c}:${tid}`,
            kind: 'nft',
            symbol: name ? `${name} #${tid}` : `NFT #${tid}`,
            name: name || undefined,
            contract: c,
            tokenId: tid,
            amount: 1,
            priceUsd,
            valueUsd: null, // NFT tanpa harga pasar: tidak dihitung
          });
        }
        if (bal > ids.length) {
          nfts.push({
            id: `${cfg.id}:nft:${c}:rest`,
            kind: 'nft',
            symbol: name ? `${name} (+${bal - ids.length} lainnya)` : `NFT (+${bal - ids.length} lainnya)`,
            name: name || undefined,
            contract: c,
            amount: bal - ids.length,
            priceUsd,
            valueUsd: null,
          });
        }
      } else {
        // (3) fallback: jumlah saja
        nfts.push({
          id: `${cfg.id}:nft:${c}:count`,
          kind: 'nft',
          symbol: name ? `${name} ×${bal}` : `NFT ×${bal}`,
          name: name || undefined,
          contract: c,
          amount: bal,
          priceUsd,
          valueUsd: null,
        });
      }
    }
  }

  const native: AssetEntry = {
    id: `${cfg.id}:native`,
    kind: 'native',
    symbol: sym,
    amount: nativeAmt,
    priceUsd: nativePrice,
    valueUsd: nativePrice != null ? nativeAmt * nativePrice : null,
  };
  const totalUsd =
    (native.valueUsd ?? 0) + tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  return {
    chain: cfg.id,
    address: addr,
    native,
    tokens: tokens.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)),
    nfts,
    totalUsd,
    scannedAt: Date.now(),
  };
}

/* ---------- Solana (tidak berubah) ---------- */

async function scanSolana(address: string): Promise<ScanResult> {
  const addr = address.trim();
  const [balRes, tokRes, tok22Res, solPrice] = await Promise.all([
    rpcSol('getBalance', [addr]),
    rpcSol('getTokenAccountsByOwner', [
      addr,
      { programId: TOKEN_PROGRAM },
      { encoding: 'jsonParsed' },
    ]).catch(() => ({ value: [] })),
    rpcSol('getTokenAccountsByOwner', [
      addr,
      { programId: TOKEN_2022_PROGRAM },
      { encoding: 'jsonParsed' },
    ]).catch(() => ({ value: [] })),
    getNativePrice('solana'),
  ]);
  const sol = (balRes.value as number) / 1e9;

  const byMint = new Map<string, { amount: number; decimals: number }>();
  for (const acc of [...(tokRes.value as any[]), ...(tok22Res.value as any[])]) {
    try {
      const info = acc.account.data.parsed.info;
      const ta = info.tokenAmount;
      const amt = Number(ta.uiAmountString ?? ta.uiAmount ?? 0);
      if (!(amt > 0)) continue;
      const prev = byMint.get(info.mint) || { amount: 0, decimals: ta.decimals };
      prev.amount += amt;
      byMint.set(info.mint, prev);
    } catch {
      /* abaikan */
    }
  }

  const mints = [...byMint.keys()];
  const priceMap = await getTokenPrices('solana', mints);
  const tokens: AssetEntry[] = [];
  const nfts: AssetEntry[] = [];
  for (const mint of mints) {
    const { amount, decimals } = byMint.get(mint)!;
    const p = priceMap.get(mint);
    const priceUsd = p?.priceUsd ?? null;
    const symbol = p?.symbol || `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    if (decimals === 0 && amount === 1) {
      nfts.push({
        id: `solana:nft:${mint}`,
        kind: 'nft',
        symbol,
        name: p?.name,
        contract: mint,
        tokenId: '1',
        amount: 1,
        priceUsd,
        valueUsd: null,
      });
    } else {
      tokens.push({
        id: `solana:token:${mint}`,
        kind: 'token',
        symbol,
        name: p?.name,
        contract: mint,
        amount,
        priceUsd,
        valueUsd: priceUsd != null ? amount * priceUsd : null,
      });
    }
  }

  const native: AssetEntry = {
    id: 'solana:native',
    kind: 'native',
    symbol: 'SOL',
    amount: sol,
    priceUsd: solPrice,
    valueUsd: solPrice != null ? sol * solPrice : null,
  };
  const totalUsd =
    (native.valueUsd ?? 0) + tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  return {
    chain: 'solana',
    address: addr,
    native,
    tokens: tokens.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)),
    nfts,
    totalUsd,
    scannedAt: Date.now(),
  };
}

export async function scanWallet(
  chain: Chain,
  address: string,
  extraNft: string[] = []
): Promise<ScanResult> {
  if (chain === 'solana') return scanSolana(address);
  const cfg = EVM_CONFIG[chain];
  if (!cfg) throw new Error(`Chain tidak didukung: ${chain}`);
  return scanEvm(cfg, address, extraNft);
}

/* ---------- Cek kepemilikan NFT (untuk refresh nilai garapan) ---------- */

/**
 * Cek apakah address masih memiliki tokenId pada kontrak ERC-721 (ownerOf).
 * Mengembalikan true/false; throw bila RPC gagal.
 */
export async function checkNftOwner(
  chain: EvmChainId,
  contract: string,
  tokenId: string,
  address: string
): Promise<boolean> {
  const cfg = EVM_CONFIG[chain];
  if (!cfg) throw new Error(`Chain tidak didukung: ${chain}`);
  const data = '0x6352211e' + BigInt(tokenId).toString(16).padStart(64, '0');
  const hex = (await rpcEvm(cfg, 'eth_call', [{ to: contract, data }, 'latest'])) as string;
  const owner = '0x' + hex.slice(-40);
  return owner.toLowerCase() === address.trim().toLowerCase();
}

/**
 * Cek apakah address masih memegang 1 unit mint NFT di Solana.
 * Mengembalikan true/false/null (null = tidak bisa dicek).
 */
export async function checkSolanaNftOwner(
  address: string,
  mint: string
): Promise<boolean | null> {
  try {
    const res = await rpcSol('getTokenAccountsByOwner', [
      address.trim(),
      { mint: mint.trim() },
      { encoding: 'jsonParsed' },
    ]);
    const accs = (res.value as any[]) || [];
    return accs.some((a) => {
      try {
        const ta = a.account.data.parsed.info.tokenAmount;
        return Number(ta.uiAmount ?? ta.amount ?? 0) >= 1;
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }
}
