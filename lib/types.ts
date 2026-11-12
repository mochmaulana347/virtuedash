export type EvmChainId =
  | 'ethereum'
  | 'bsc'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'polygon'
  | 'avalanche'
  | 'linea'
  | 'zksync'
  | 'blast';

export type Chain = EvmChainId | 'solana';

export interface Wallet {
  id: string;
  chain: Chain;
  address: string;
  label?: string;
  /** Kontrak NFT tambahan (BSC) yang mau dicek manual */
  nftContracts?: string[];
}

export type AssetKind = 'native' | 'token' | 'nft';

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  symbol: string;
  name?: string;
  contract?: string;
  tokenId?: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface ScanResult {
  chain: Chain;
  address: string;
  native: AssetEntry;
  tokens: AssetEntry[];
  nfts: AssetEntry[];
  totalUsd: number;
  scannedAt: number;
}

export interface SnapshotPoint {
  ts: number;
  totalUsd: number;
  assets: { id: string; symbol: string; valueUsd: number | null }[];
}

export interface AppState {
  wallets: Wallet[];
  /** key: `${chain}:${address.toLowerCase()}` */
  snapshots: Record<string, SnapshotPoint[]>;
  garapan: Garapan[];
}
export const EVM_CHAINS: EvmChainId[] = [
  'ethereum',
  'bsc',
  'base',
  'arbitrum',
  'optimism',
  'polygon',
  'avalanche',
  'linea',
  'zksync',
  'blast',
];

export function isEvmChain(c: Chain): c is EvmChainId {
  return c !== 'solana';
}

export const CHAIN_LABEL: Record<Chain, string> = {
  ethereum: 'Ethereum',
  bsc: 'BNB Chain',
  base: 'Base',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  linea: 'Linea',
  zksync: 'zkSync Era',
  blast: 'Blast',
  solana: 'Solana',
};

export const NATIVE_SYMBOL: Record<Chain, string> = {
  ethereum: 'ETH',
  bsc: 'BNB',
  base: 'ETH',
  arbitrum: 'ETH',
  optimism: 'ETH',
  polygon: 'POL',
  avalanche: 'AVAX',
  linea: 'ETH',
  zksync: 'ETH',
  blast: 'ETH',
  solana: 'SOL',
};

/* ---------- Garapan (log aktivitas ngemint) ---------- */

export type GarapanType = 'mint-gratis' | 'mint-berbayar' | 'airdrop' | 'beli';

export const GARAPAN_TIPE_LABEL: Record<GarapanType, string> = {
  'mint-gratis': 'Mint gratis',
  'mint-berbayar': 'Mint berbayar',
  airdrop: 'Airdrop',
  beli: 'Beli',
};

export const GARAPAN_TIPES: GarapanType[] = [
  'mint-gratis',
  'mint-berbayar',
  'airdrop',
  'beli',
];

/** Aset yang ditautkan ke sebuah garapan (untuk refresh nilai otomatis). */
export interface GarapanAset {
  kind: 'nft' | 'token';
  /** wallet pemilik — dipakai untuk cek kepemilikan NFT on-chain */
  address?: string;
  contract?: string;
  tokenId?: string;
  /** untuk token: jumlah yang didapat dari aktivitas */
  amount?: number;
  symbol?: string;
}

/** Satu entri aktivitas: mint, airdrop, beli, dsb. */
export interface Garapan {
  id: string;
  nama: string;
  /** ISO YYYY-MM-DD */
  tanggal: string;
  chain: Chain;
  tipe: GarapanType;
  /** total modal (gas/fee/harga) dalam USD saat aktivitas dilakukan */
  modalUsd: number;
  /** nilai hasil saat ini dalam USD; null = belum ada harga pasar */
  hasilUsd: number | null;
  hasilDiperbaruiPada?: number;
  /** hasil cek kepemilikan aset terakhir (NFT): true = masih di wallet */
  asetAda?: boolean | null;
  aset?: GarapanAset;
  txHash?: string;
  catatan?: string;
  /** tercatat saat NFT terjual (terdeteksi otomatis dari riwayat wallet) */
  terjual?: {
    /** harga jual dalam USD */
    hargaUsd: number | null;
    /** ISO YYYY-MM-DD */
    tanggal: string;
    txHash: string;
    /** simbol token pembayaran, mis. WBNB */
    bayarDengan?: string;
  } | null;
}
