import { NextRequest } from 'next/server';
import { scanWallet } from '@/lib/chains';
import { isValidAddress, isValidEvmAddress } from '@/lib/validate';
import type { Chain } from '@/lib/types';
import { CHAIN_LABEL, EVM_CHAINS } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALL_CHAINS: Chain[] = [...EVM_CHAINS, 'solana'];

/**
 * GET /api/scan?chain=ethereum|bsc|base|...|solana&address=0x...&nfts=0x..,0x..
 * Mengembalikan rincian aset wallet: native, token, NFT + total USD.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const chain = (q.get('chain') || '') as Chain;
  const address = (q.get('address') || '').trim();
  const nfts = (q.get('nfts') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => isValidEvmAddress(s));

  if (!ALL_CHAINS.includes(chain)) {
    return Response.json(
      { error: `Chain tidak valid. Pilihan: ${ALL_CHAINS.map((c) => CHAIN_LABEL[c]).join(', ')}.` },
      { status: 400 }
    );
  }
  if (!isValidAddress(chain, address)) {
    return Response.json({ error: 'Format alamat wallet tidak valid.' }, { status: 400 });
  }

  try {
    const result = await scanWallet(chain, address, nfts);
    return Response.json(result);
  } catch (e: any) {
    return Response.json(
      { error: `Gagal memindai wallet: ${e?.message || 'kesalahan jaringan'}` },
      { status: 502 }
    );
  }
}
