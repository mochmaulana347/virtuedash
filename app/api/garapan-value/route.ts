import { NextRequest } from 'next/server';
import { checkNftOwner, checkSolanaNftOwner } from '@/lib/chains';
import { getTokenPrices } from '@/lib/prices';
import { EVM_CHAINS, isEvmChain } from '@/lib/types';
import { isValidEvmAddress, isValidSolanaAddress } from '@/lib/validate';
import type { Chain } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALL_CHAINS: Chain[] = [...EVM_CHAINS, 'solana'];

/**
 * GET /api/garapan-value?chain=bsc&kind=nft&contract=0x..&tokenId=2163&address=0x..
 * GET /api/garapan-value?chain=bsc&kind=token&contract=0x..&amount=100
 *
 * Nilai terkini aset yang ditautkan ke sebuah garapan.
 * - NFT: valueUsd selalu null (belum ada harga pasar) + owned (masih di wallet?)
 * - token: valueUsd = amount * harga saat ini
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const chain = (q.get('chain') || '') as Chain;
  const kind = q.get('kind') || '';
  const contract = (q.get('contract') || '').trim();
  const tokenId = (q.get('tokenId') || '').trim();
  const address = (q.get('address') || '').trim();
  const amount = Number(q.get('amount') || '0');

  if (!ALL_CHAINS.includes(chain)) {
    return Response.json({ error: 'Chain tidak valid.' }, { status: 400 });
  }
  if (kind !== 'nft' && kind !== 'token') {
    return Response.json({ error: 'kind harus "nft" atau "token".' }, { status: 400 });
  }
  if (!contract) {
    return Response.json({ error: 'contract wajib diisi.' }, { status: 400 });
  }

  try {
    if (kind === 'nft') {
      let owned: boolean | null = null;
      if (address) {
        if (isEvmChain(chain)) {
          if (!isValidEvmAddress(contract) || !isValidEvmAddress(address) || !/^\d+$/.test(tokenId)) {
            return Response.json(
              { error: 'Parameter NFT tidak valid (butuh contract, tokenId angka, dan address).' },
              { status: 400 }
            );
          }
          owned = await checkNftOwner(chain, contract, tokenId, address);
        } else {
          if (!isValidSolanaAddress(address)) {
            return Response.json({ error: 'Alamat Solana tidak valid.' }, { status: 400 });
          }
          owned = await checkSolanaNftOwner(address, contract);
        }
      }
      return Response.json({ valueUsd: null, owned });
    }

    // kind === 'token'
    if (!(amount > 0)) {
      return Response.json({ error: 'amount harus lebih dari 0.' }, { status: 400 });
    }
    if (isEvmChain(chain) && !isValidEvmAddress(contract)) {
      return Response.json({ error: 'Contract token tidak valid.' }, { status: 400 });
    }
    const prices = await getTokenPrices(chain, [contract]);
    const key = chain === 'solana' ? contract : contract.toLowerCase();
    const info = prices.get(key);
    const priceUsd = info?.priceUsd ?? null;
    return Response.json({
      valueUsd: priceUsd != null ? amount * priceUsd : null,
      owned: null,
      symbol: info?.symbol,
    });
  } catch (e: any) {
    return Response.json(
      { error: `Gagal memeriksa nilai: ${e?.message || 'kesalahan jaringan'}` },
      { status: 502 }
    );
  }
}
