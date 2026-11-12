'use client';

import type { AppState, Garapan, SnapshotPoint, Wallet } from './types';

const LS_KEY = 'crypto-dashboard:v1';
const SNAP_INTERVAL = 3600_000; // 1 jam
const MAX_SNAPS = 720; // ~30 hari

export const PRELOAD_WALLETS: Wallet[] = [
  {
    id: 'bsc-main',
    chain: 'bsc',
    address: '0xC905AA0F4E53f5A7F18335e0C33977d4a6783903',
    label: 'Wallet utama',
  },
];

/**
 * Garapan bawaan: Cast Deep #2163 (BSC), mint gratis 2026-10-31.
 * Modal = biaya gas aktual dari tx 0x5b0724…e297 (193278 gas @ 0.068 gwei
 * = 0.00001315 BNB ≈ $0.0093). Zona Abyss (31 zero bits).
 */
export const PRELOAD_GARAPAN: Garapan[] = [
  {
    id: 'garapan-castdeep-2163',
    nama: 'Cast Deep #2163',
    tanggal: '2026-10-31',
    chain: 'bsc',
    tipe: 'mint-gratis',
    modalUsd: 0.0093,
    hasilUsd: null,
    asetAda: true,
    aset: {
      kind: 'nft',
      address: '0xC905AA0F4E53f5A7F18335e0C33977d4a6783903',
      contract: '0x37f8f181ab2f2b2D4209AA9c77c34d8E8566C360',
      tokenId: '2163',
      symbol: 'Cast Deep #2163',
    },
    txHash: '0x5b0724848716f71758e81990d968a74a3a2b35d9cced6fda9877378ebcf0e297',
    catatan: 'Zona Abyss (31 zero bits). 1 free cast per wallet sudah terpakai.',
  },
];

export function snapKey(w: Pick<Wallet, 'chain' | 'address'>): string {
  return `${w.chain}:${w.address.trim().toLowerCase()}`;
}

function seed(): AppState {
  return { wallets: PRELOAD_WALLETS, snapshots: {}, garapan: PRELOAD_GARAPAN };
}

/**
 * Migrasi state lama -> baru. State yang belum punya field `garapan`
 * (dibuat sebelum fitur log garapan ada) mendapat entri bawaan sekali;
 * state yang sudah punya (walau array kosong) dibiarkan apa adanya
 * supaya entri yang sengaja dihapus tidak muncul lagi.
 */
function withGarapan(d: any): AppState {
  const garapan: Garapan[] = Array.isArray(d.garapan) ? d.garapan : PRELOAD_GARAPAN;
  return { wallets: d.wallets, snapshots: d.snapshots || {}, garapan };
}

function readLocal(): AppState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!Array.isArray(d.wallets)) return null;
    return withGarapan(d);
  } catch {
    return null;
  }
}

function writeLocal(s: AppState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* storage penuh / privat */
  }
}

async function pushServer(s: AppState) {
  try {
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
  } catch {
    /* best-effort */
  }
}

/** Muat state: server (bila blob aktif) -> localStorage -> seed preload. */
export async function loadState(): Promise<AppState> {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.wallets)) {
        const s = withGarapan(d);
        writeLocal(s);
        return s;
      }
    }
  } catch {
    /* lanjut ke local */
  }
  const local = readLocal();
  if (local) return local;
  const s = seed();
  writeLocal(s);
  return s;
}

/** Simpan state ke local + server (best-effort). */
export function saveState(s: AppState) {
  writeLocal(s);
  pushServer(s);
}

export function addSnapshot(
  s: AppState,
  w: Wallet,
  totalUsd: number,
  assets: { id: string; symbol: string; valueUsd: number | null }[]
): AppState {
  const k = snapKey(w);
  const arr = [...(s.snapshots[k] || [])];
  const last = arr[arr.length - 1];
  // snapshot baru bila belum ada atau sudah > 1 jam dari terakhir
  if (last && Date.now() - last.ts < SNAP_INTERVAL) return s;
  const pt: SnapshotPoint = { ts: Date.now(), totalUsd, assets };
  arr.push(pt);
  while (arr.length > MAX_SNAPS) arr.shift();
  return { ...s, snapshots: { ...s.snapshots, [k]: arr } };
}

export interface PlResult {
  diff: number | null;
  pct: number | null;
  hasHistory: boolean;
}

/** Untung/rugi: snapshot terakhir vs pertama. */
export function calcPl(points: SnapshotPoint[] | undefined): PlResult {
  if (!points || points.length < 2) return { diff: null, pct: null, hasHistory: false };
  const first = points[0].totalUsd;
  const last = points[points.length - 1].totalUsd;
  const diff = last - first;
  const pct = first > 0 ? (diff / first) * 100 : null;
  return { diff, pct, hasHistory: true };
}

/** P/L per aset: bandingkan valueUsd aset di snapshot pertama vs terakhir. */
export function calcAssetPl(
  points: SnapshotPoint[] | undefined,
  assetId: string
): number | null {
  if (!points || points.length < 2) return null;
  const f = points[0].assets.find((a) => a.id === assetId)?.valueUsd;
  const l = points[points.length - 1].assets.find((a) => a.id === assetId)?.valueUsd;
  if (f == null || l == null) return null;
  return l - f;
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
