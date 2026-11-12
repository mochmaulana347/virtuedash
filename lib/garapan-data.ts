'use client';

/* Data garapan bersama untuk semua tab (Overview tetap pakai logika sendiri di
   app/page.tsx — file ini MENYALIN logika yang sama supaya tab baru konsisten
   tanpa mengubah halaman Overview). Sumber: public/rangkuman.json +
   public/auto-mints.json + overrides localStorage 'virtue_garapan_v1'.
   Harga/saldo live dari /api/live (tidak diubah). */

import { useCallback, useEffect, useMemo, useState } from 'react';

export const BSC_WALLET = '0xC905AA0F4E53f5A7F18335e0C33977d4a6783903';
export const AGC_TOKEN = '0x63dea5aCdbE1F27c968907D08610A5f0A0284bA6';
export const LS_KEY = 'virtue_garapan_v1';

export type RangkumanItem = {
  id: string;
  nama: string;
  tanggal: string;
  kategori: string;
  tipe: string;
  modalUsd: number;
  hasilUsd: number | null;
  status: string;
  txHash?: string;
  detail: string;
  modalDetail?: string;
  hasilDetail?: string;
  jumlah?: string;
  modalJenis?: 'tunai' | 'deposit';
  keuntunganUsd?: number | null;
  keuntunganJenis?: 'terealisasi' | 'estimasi' | null;
  keuntunganDetail?: string;
  agcAmount?: number;
  lockedBnb?: number;
  lockedAgc?: number;
};

export type NftItem = {
  id: string;
  nama: string;
  tanggal: string;
  modalUsd: number;
  hasilUsd: number | null;
  txHash?: string;
  terjual?: { hargaUsd: number } | null;
  catatan?: string;
  aset?: { tokenId?: string; contract?: string };
};

export type GarapanOverrides = { byId: Record<string, RangkumanItem | null> };

export type LiveData = {
  agcPriceUsd: number | null;
  bnbPriceUsd: number | null;
  balances: { bnb: number | null; agc: number | null; usdt: number | null };
  fetchedAt: number;
};

export type Row = RangkumanItem & {
  isRangkuman?: boolean;
  hasilUsd: number | null;
};

export type CatRow = { cat: string; modal: number; hasil: number; untung: number | null; count: number };

export function applyOverrides(base: RangkumanItem[], ov: GarapanOverrides): RangkumanItem[] {
  const map = new Map<string, RangkumanItem>(base.map((x): [string, RangkumanItem] => [x.id, x]));
  for (const [id, val] of Object.entries(ov.byId)) {
    if (val == null) map.delete(id);
    else map.set(id, val);
  }
  return [...map.values()];
}

export const usd = (v: number | null | undefined) =>
  v == null
    ? 'n/a'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: v < 1 ? 4 : 2,
      }).format(v);

export const usd2 = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(v);

export const fmtNum = (v: number) => new Intl.NumberFormat('id-ID').format(v);

export const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const CAT_COLOR: Record<string, string> = {
  'AGC Plan A': '#ff2e88',
  'AGC Plan B': '#ff8a3d',
  CENSUS: '#ffc53d',
  'CENSUS Trading': '#2dd4bf',
  'BNB Agent': '#b78cff',
  'Token Claim': '#ff5c7a',
  'Free NFT': '#8b9dff',
};

export const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  selesai: { label: 'Selesai', cls: 'bi-badge ok' },
  untung: { label: 'Untung', cls: 'bi-badge ok' },
  rugi: { label: 'Rugi', cls: 'bi-badge bad' },
  berjalan: { label: 'Berjalan', cls: 'bi-badge' },
};

export const STATUSES = ['selesai', 'untung', 'rugi', 'berjalan'] as const;
export const STATUS_LABEL: Record<string, string> = {
  selesai: 'Selesai',
  untung: 'Untung',
  rugi: 'Rugi',
  berjalan: 'Berjalan',
};

/** Keuntungan live sebuah entri: terealisasi = angka tetap; estimasi AGC = jumlah × harga live. */
export function liveUntungOf(g: RangkumanItem, agcPrice: number | null): number | null {
  if (g.keuntunganJenis === 'terealisasi') return g.keuntunganUsd ?? 0;
  if (g.keuntunganJenis === 'estimasi' && g.agcAmount != null) {
    return agcPrice != null ? g.agcAmount * agcPrice : null;
  }
  return null;
}

/** Gabungkan rangkuman + NFT jadi satu daftar baris, urut tanggal terbaru dulu. */
export function buildAllRows(rangkuman: RangkumanItem[], nfts: NftItem[], money: (v: number | null | undefined) => string): Row[] {
  const rows: Row[] = [
    ...rangkuman.map((g) => ({ ...g, isRangkuman: true as const })),
    ...nfts.map((g) => ({
      id: g.id,
      nama: g.nama,
      tanggal: g.tanggal,
      kategori: 'Free NFT',
      tipe: 'mint-gratis',
      modalUsd: g.modalUsd,
      hasilUsd: g.terjual?.hargaUsd ?? g.hasilUsd ?? null,
      status: g.terjual ? 'untung' : 'berjalan',
      txHash: g.txHash,
      detail: g.catatan ?? 'Free mint, gas only.',
      modalDetail: 'Gas only',
      hasilDetail: g.terjual ? `Terjual ${money(g.terjual.hargaUsd)}` : 'Belum terjual, masih dipegang',
      jumlah: g.aset?.tokenId ? `NFT #${String(g.aset.tokenId).slice(0, 20)}` : undefined,
      modalJenis: 'tunai' as const,
      isRangkuman: false as const,
    })),
  ];
  rows.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.nama.localeCompare(b.nama));
  return rows;
}

/** Semua angka total — rumus sama persis dengan Overview (modal/untung/terkunci terpisah). */
export function computeTotals(rangkuman: RangkumanItem[], nfts: NftItem[], live: LiveData | null) {
  const agcPrice = live?.agcPriceUsd ?? null;
  const bnbPrice = live?.bnbPriceUsd ?? null;
  const bal = live?.balances ?? { bnb: null, agc: null, usdt: null };

  const nftModal = nfts.reduce((s, g) => s + (g.modalUsd || 0), 0);
  const nftCount = nfts.length;
  const censusModal = rangkuman
    .filter((g) => g.kategori === 'CENSUS' || g.kategori === 'CENSUS Trading')
    .reduce((s, g) => s + g.modalUsd, 0);
  const bnbAgentModal = rangkuman
    .filter((g) => g.kategori === 'BNB Agent')
    .reduce((s, g) => s + g.modalUsd, 0);
  const gasModal =
    nftModal +
    rangkuman.filter((g) => g.kategori === 'Token Claim').reduce((s, g) => s + g.modalUsd, 0);

  const tunaiMajor = rangkuman.filter((g) => g.modalJenis !== 'deposit').reduce((s, g) => s + g.modalUsd, 0);
  const modalAwal = tunaiMajor + nftModal;
  const depositTotal = rangkuman
    .filter((g) => g.modalJenis === 'deposit')
    .reduce((s, g) => s + g.modalUsd, 0);

  const untungReal = rangkuman
    .filter((g) => g.keuntunganJenis === 'terealisasi')
    .reduce((s, g) => s + (g.keuntunganUsd ?? 0), 0);
  const agcEstAmount = rangkuman
    .filter((g) => g.keuntunganJenis === 'estimasi')
    .reduce((s, g) => s + (g.agcAmount ?? 0), 0);
  const untungEst = agcPrice != null ? agcEstAmount * agcPrice : null;
  const totalUntung = untungEst != null ? untungReal + untungEst : null;

  const bnbVal = bal.bnb != null && bnbPrice != null ? bal.bnb * bnbPrice : null;
  const agcVal = bal.agc != null && agcPrice != null ? bal.agc * agcPrice : null;
  const usdtVal = bal.usdt != null ? bal.usdt : null;
  const totalAset =
    bnbVal != null || agcVal != null || usdtVal != null
      ? (bnbVal ?? 0) + (agcVal ?? 0) + (usdtVal ?? 0)
      : null;

  const lockedEntries = rangkuman.filter(
    (g) => g.status === 'berjalan' && ((g.lockedBnb ?? 0) > 0 || (g.lockedAgc ?? 0) > 0)
  );
  const lockedBnbTotal = lockedEntries.reduce((s, g) => s + (g.lockedBnb ?? 0), 0);
  const lockedAgcTotal = lockedEntries.reduce((s, g) => s + (g.lockedAgc ?? 0), 0);
  const lockedBnbVal = bnbPrice != null ? lockedBnbTotal * bnbPrice : null;
  const lockedAgcVal = agcPrice != null ? lockedAgcTotal * agcPrice : null;
  const totalTerkunci =
    lockedBnbVal != null || lockedAgcVal != null ? (lockedBnbVal ?? 0) + (lockedAgcVal ?? 0) : null;

  return {
    agcPrice, bnbPrice, bal,
    nftModal, nftCount, censusModal, bnbAgentModal, gasModal,
    modalAwal, depositTotal,
    untungReal, agcEstAmount, untungEst, totalUntung,
    bnbVal, agcVal, usdtVal, totalAset,
    lockedEntries, lockedBnbTotal, lockedAgcTotal, lockedBnbVal, lockedAgcVal, totalTerkunci,
  };
}

/** Per-kategori (untuk /proyek dan kartu ringkas). */
export function computeCatRows(rangkuman: RangkumanItem[], nfts: NftItem[], agcPrice: number | null): CatRow[] {
  const byCat = new Map<string, { modal: number; hasil: number; untung: number | null; count: number }>();
  const pushCat = (cat: string, modal: number, hasil: number | null, untung: number | null) => {
    const cur = byCat.get(cat) ?? { modal: 0, hasil: 0, untung: 0, count: 0 };
    cur.modal += modal;
    cur.hasil += hasil ?? 0;
    if (untung != null) cur.untung = (cur.untung ?? 0) + untung;
    cur.count += 1;
    byCat.set(cat, cur);
  };
  rangkuman.forEach((g) => pushCat(g.kategori, g.modalUsd, g.hasilUsd, liveUntungOf(g, agcPrice)));
  const nftModal = nfts.reduce((s, g) => s + (g.modalUsd || 0), 0);
  pushCat('Free NFT', nftModal, 0, null);
  return [...byCat.entries()]
    .map(([cat, v]) => ({ cat, ...v }))
    .sort((a, b) => (b.untung ?? -1) - (a.untung ?? -1));
}

/* ---------- hook utama untuk semua tab garapan ---------- */
export function useGarapan() {
  const [baseRangkuman, setBaseRangkuman] = useState<RangkumanItem[]>([]);
  const [overrides, setOverrides] = useState<GarapanOverrides>({ byId: {} });
  const [overReady, setOverReady] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RangkumanItem | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [nfts, setNfts] = useState<NftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'semua' | 'untung' | 'rugi' | 'berjalan'>('semua');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [liveErr, setLiveErr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'IDR'>(() => {
    try {
      return localStorage.getItem('cd_currency') === 'IDR' ? 'IDR' : 'USD';
    } catch {
      return 'USD';
    }
  });
  const [rate, setRate] = useState<number | null>(null);
  const [rateErr, setRateErr] = useState(false);

  const rangkuman = useMemo(() => applyOverrides(baseRangkuman, overrides), [baseRangkuman, overrides]);
  const overrideCount = Object.keys(overrides.byId).length;
  const allCategories = useMemo(
    () => [...new Set(baseRangkuman.map((g) => g.kategori))].sort((a, b) => a.localeCompare(b)),
    [baseRangkuman]
  );
  const allTypes = useMemo(
    () => [...new Set(baseRangkuman.map((g) => g.tipe))].sort((a, b) => a.localeCompare(b)),
    [baseRangkuman]
  );

  useEffect(() => {
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch('/rangkuman.json', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/auto-mints.json', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        setBaseRangkuman(Array.isArray(r1) ? r1 : []);
        setNfts(Array.isArray(r2) ? r2 : []);
      } catch {
        /* abaikan */
      }
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as GarapanOverrides;
          if (parsed && typeof parsed.byId === 'object' && parsed.byId !== null) setOverrides(parsed);
        }
      } catch {
        /* abaikan, pakai data bawaan */
      }
      setOverReady(true);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!overReady) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(overrides));
    } catch {
      /* penyimpanan penuh / privat */
    }
  }, [overrides, overReady]);

  const saveEntry = (item: RangkumanItem) => {
    setOverrides((prev) => ({ byId: { ...prev.byId, [item.id]: item } }));
    setFormOpen(false);
    setEditingItem(null);
    setDeleteArmedId(null);
  };
  const openAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
    setDeleteArmedId(null);
  };
  const openEdit = (id: string) => {
    const item = rangkuman.find((g) => g.id === id);
    if (!item) return;
    setEditingItem(item);
    setFormOpen(true);
    setDeleteArmedId(null);
  };
  const handleDeleteClick = (id: string) => {
    if (deleteArmedId === id) {
      setOverrides((prev) => ({ byId: { ...prev.byId, [id]: null } }));
      setDeleteArmedId(null);
    } else {
      setDeleteArmedId(id);
    }
  };
  const handleResetClick = () => {
    if (resetArmed) {
      setOverrides({ byId: {} });
      setResetArmed(false);
    } else {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 4000);
    }
  };
  /** Reset paksa (dipakai /pengaturan) — tanpa dua langkah, pemanggil yang konfirmasi. */
  const resetAllNow = () => {
    setOverrides({ byId: {} });
    setResetArmed(false);
  };
  /** Terapkan overrides dari impor file (dipakai /pengaturan). */
  const importOverrides = (ov: GarapanOverrides) => {
    if (ov && typeof ov.byId === 'object' && ov.byId !== null) setOverrides(ov);
  };

  const fetchLive = useCallback(async () => {
    try {
      const r = await fetch(`/api/live?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('live gagal');
      const d = (await r.json()) as LiveData;
      setLive(d);
      setLiveErr(false);
    } catch {
      setLiveErr(true);
    }
  }, []);

  const fetchRate = useCallback(async (): Promise<number | null> => {
    try {
      const r1 = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr',
        { cache: 'no-store' }
      );
      if (r1.ok) {
        const d = await r1.json();
        const v = d?.tether?.idr;
        if (typeof v === 'number' && v > 0) {
          setRate(v);
          setRateErr(false);
          return v;
        }
      }
      throw new Error('coingecko gagal');
    } catch {
      try {
        const r2 = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { cache: 'no-store' });
        if (!r2.ok) throw new Error('exchangerate gagal');
        const d = await r2.json();
        const v = d?.rates?.IDR;
        if (typeof v === 'number' && v > 0) {
          setRate(v);
          setRateErr(false);
          return v;
        }
        throw new Error('tidak ada IDR');
      } catch {
        setRateErr(true);
        return null;
      }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cd_currency', currency);
    } catch {
      /* abaikan */
    }
  }, [currency]);

  useEffect(() => {
    fetchLive();
    fetchRate();
    const t = setInterval(() => {
      fetchLive();
      fetchRate();
    }, 60_000);
    return () => clearInterval(t);
  }, [fetchLive, fetchRate]);

  const refreshLive = async () => {
    setRefreshing(true);
    await fetchLive();
    await fetchRate();
    setRefreshing(false);
  };

  const switchToIdr = async () => {
    if (rate != null) {
      setCurrency('IDR');
      return;
    }
    const v = await fetchRate();
    if (v != null) setCurrency('IDR');
  };

  const effCurrency = currency === 'IDR' && rate != null ? 'IDR' : 'USD';

  const fmtIDR = (vUsd: number): string => {
    const v = vUsd * (rate ?? 0);
    const f =
      Math.abs(v) < 1000
        ? new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
    return 'Rp' + f.format(v);
  };
  const money = (v: number | null | undefined): string => {
    if (v == null) return 'n/a';
    return effCurrency === 'IDR' ? fmtIDR(v) : usd(v);
  };
  const money2 = (v: number): string => (effCurrency === 'IDR' ? fmtIDR(v) : usd2(v));
  const fmtUnitPrice = (vUsd: number): string =>
    effCurrency === 'IDR'
      ? 'Rp' +
        new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(vUsd * (rate ?? 0))
      : '$' + vUsd.toFixed(8);

  const totals = useMemo(() => computeTotals(rangkuman, nfts, live), [rangkuman, nfts, live]);
  const agcPrice = totals.agcPrice;
  const catRows = useMemo(() => computeCatRows(rangkuman, nfts, agcPrice), [rangkuman, nfts, agcPrice]);
  const allRows = useMemo(() => buildAllRows(rangkuman, nfts, money), [rangkuman, nfts, effCurrency, rate]);

  const liveUntungRow = (r: Row): number | null => liveUntungOf(r, agcPrice);

  const selectCat = (cat: string) => setFilterCat((cur) => (cur === cat ? null : cat));
  const resetFilter = () => {
    setFilterCat(null);
    setTab('semua');
  };
  const catFiltered = filterCat ? allRows.filter((r) => r.kategori === filterCat) : allRows;
  const counts = {
    semua: catFiltered.length,
    untung: catFiltered.filter((r) => (liveUntungRow(r) ?? 0) > 0.001).length,
    rugi: catFiltered.filter((r) => r.status === 'rugi').length,
    berjalan: catFiltered.filter((r) => r.status === 'berjalan').length,
  };
  const filtered =
    tab === 'semua'
      ? catFiltered
      : tab === 'untung'
        ? catFiltered.filter((r) => (liveUntungRow(r) ?? 0) > 0.001)
        : tab === 'rugi'
          ? catFiltered.filter((r) => r.status === 'rugi')
          : catFiltered.filter((r) => r.status === 'berjalan');

  return {
    loading, rangkuman, nfts, allRows, catRows, overrides, overrideCount,
    allCategories, allTypes,
    live, liveErr, refreshing, refreshLive,
    currency, setCurrency, switchToIdr, rate, rateErr, effCurrency,
    money, money2, fmtUnitPrice,
    totals, agcPrice, bnbPrice: totals.bnbPrice, bal: totals.bal,
    liveUntungOf: (g: RangkumanItem) => liveUntungOf(g, agcPrice),
    liveUntungRow,
    tab, setTab, filterCat, setFilterCat, filtered, counts, selectCat, resetFilter,
    formOpen, setFormOpen, editingItem, setEditingItem, deleteArmedId,
    resetArmed, saveEntry, openAdd, openEdit, handleDeleteClick, handleResetClick,
    resetAllNow, importOverrides,
  };
}

export type GarapanData = ReturnType<typeof useGarapan>;
