import type { Chain } from './types';
import { isEvmChain } from './types';

export function isValidEvmAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a.trim());
}

/** Alias lama — dipakai route & UI versi sebelumnya. */
export const isValidBscAddress = isValidEvmAddress;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(s: string): Uint8Array | null {
  const out: number[] = [0];
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    let carry = v;
    for (let i = 0; i < out.length; i++) {
      carry += out[i] * 58;
      out[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      out.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // leading '1's = leading zero bytes
  let zeros = 0;
  for (const ch of s) {
    if (ch === '1') zeros++;
    else break;
  }
  const bytes = new Uint8Array(zeros + out.length);
  for (let i = 0; i < out.length; i++) bytes[bytes.length - 1 - i] = out[i];
  return bytes;
}

export function isValidSolanaAddress(a: string): boolean {
  const s = a.trim();
  if (s.length < 32 || s.length > 44) return false;
  const b = base58Decode(s);
  return b !== null && b.length === 32;
}

export function isValidAddress(chain: Chain, a: string): boolean {
  return isEvmChain(chain) ? isValidEvmAddress(a) : isValidSolanaAddress(a);
}

export function shortAddress(a: string): string {
  const s = a.trim();
  if (s.length <= 13) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
