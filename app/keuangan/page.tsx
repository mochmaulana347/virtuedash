'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const LS_KEY = 'virtue_keuangan_v1';

/* ---------- tipe ---------- */
type LedgerEntry = {
  id: string;
  tanggal: string; // YYYY-MM-DD
  tipe: 'masuk' | 'keluar';
  kategori: string;
  keterangan: string;
  jumlahIdr: number | null;
  seed?: boolean;
};

type Asset = {
  id: string;
  nama: string;
  jenis: 'crypto' | 'cash' | 'lainnya';
  jumlah: number | null;
  satuan: string;
  nilaiIdr: number | null; // nilai manual (dipakai kalau tanpa liveKey)
  liveKey?: 'AGC' | 'BNB' | 'USDT' | 'HYPE';
  keterangan: string;
  seed?: boolean;
};

type Store = { ledger: LedgerEntry[]; assets: Asset[]; seededAt: number };

type LiveMini = {
  agcPriceUsd: number | null;
  bnbPriceUsd: number | null;
  balances: { bnb: number | null; agc: number | null; usdt: number | null };
};

const MASUK_CATS = ['Trading', 'Claim', 'Gaji', 'Hadiah', 'Lainnya'];
const KELUAR_CATS = ['Modal garapan', 'Gas', 'Trading', 'Langganan', 'Harian', 'Lainnya'];
const ASSET_COLORS = ['#ff2e88', '#b78cff', '#ff8a3d', '#2dd4bf', '#ffc53d', '#8b9dff', '#2dd4a7'];

/* ---------- format ---------- */
const fmtRp = (v: number | null | undefined) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(v);

const fmtRpCompact = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}Rp${(abs / 1e9).toFixed(1)} M`;
  if (abs >= 1e6) return `${sign}Rp${(abs / 1e6).toFixed(1)} jt`;
  if (abs >= 1e3) return `${sign}Rp${Math.round(abs / 1e3)} rb`;
  return `${sign}Rp${Math.round(abs)}`;
};

const fmtNum = (v: number) => new Intl.NumberFormat('id-ID').format(v);

const fmtDateId = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const fmtMonth = (key: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('id-ID', {
    month: 'short',
    year: '2-digit',
  });
};

const todayWIB = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
const monthNowWIB = () => todayWIB().slice(0, 7);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ---------- sumber live (pola yang sama seperti halaman utama) ---------- */
async function fetchRate(): Promise<number | null> {
  try {
    const r1 = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr',
      { cache: 'no-store' }
    );
    if (r1.ok) {
      const d = await r1.json();
      const v = d?.tether?.idr;
      if (typeof v === 'number' && v > 0) return v;
    }
  } catch { /* fallback di bawah */ }
  try {
    const r2 = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { cache: 'no-store' });
    if (!r2.ok) throw new Error('exchangerate gagal');
    const d = await r2.json();
    const v = d?.rates?.IDR;
    if (typeof v === 'number' && v > 0) return v;
  } catch { /* tetap null */ }
  return null;
}

async function fetchHypeUsd(): Promise<number | null> {
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=hyperliquid&vs_currencies=usd',
      { cache: 'no-store' }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const v = d?.hyperliquid?.usd;
    return typeof v === 'number' && v > 0 ? v : null;
  } catch {
    return null;
  }
}

async function fetchLive(): Promise<LiveMini | null> {
  try {
    const r = await fetch(`/api/live?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      agcPriceUsd: typeof d?.agcPriceUsd === 'number' ? d.agcPriceUsd : null,
      bnbPriceUsd: typeof d?.bnbPriceUsd === 'number' ? d.bnbPriceUsd : null,
      balances: {
        bnb: typeof d?.balances?.bnb === 'number' ? d.balances.bnb : null,
        agc: typeof d?.balances?.agc === 'number' ? d.balances.agc : null,
        usdt: typeof d?.balances?.usdt === 'number' ? d.balances.usdt : null,
      },
    };
  } catch {
    return null;
  }
}

/* ---------- seed data awal (HANYA fakta dari dashboard, tanpa angka karangan) ---------- */
function buildSeeds(
  live: LiveMini | null,
  rate: number | null,
  nftCount: number | null
): Store {
  const toIdr = (usd: number) => (rate != null ? Math.round(usd * rate) : null);
  const ledger: LedgerEntry[] = [
    {
      id: 'seed-modal-awal',
      tanggal: '2026-10-31',
      tipe: 'keluar',
      kategori: 'Modal garapan',
      keterangan: 'Modal awal garapan $42.22 (data awal dari dashboard)',
      jumlahIdr: toIdr(42.22),
      seed: true,
    },
    {
      id: 'seed-census-trading',
      tanggal: '2026-11-03',
      tipe: 'masuk',
      kategori: 'Trading',
      keterangan: 'Untung terealisasi trading CENSUS +$20.12 (data awal dari dashboard)',
      jumlahIdr: toIdr(20.12),
      seed: true,
    },
  ];
  const assets: Asset[] = [
    {
      id: 'seed-agc',
      nama: 'AGC',
      jenis: 'crypto',
      jumlah: 1_890_000,
      satuan: 'AGC',
      nilaiIdr: null,
      liveKey: 'AGC',
      keterangan: 'Hasil claim Plan A ×3 (data awal dari dashboard)',
      seed: true,
    },
    {
      id: 'seed-bnb',
      nama: 'BNB',
      jenis: 'crypto',
      jumlah: live?.balances?.bnb ?? null,
      satuan: 'BNB',
      nilaiIdr: null,
      liveKey: 'BNB',
      keterangan: 'Saldo wallet BSC (data awal dari dashboard)',
      seed: true,
    },
    {
      id: 'seed-usdt',
      nama: 'USDT',
      jenis: 'crypto',
      jumlah: live?.balances?.usdt ?? null,
      satuan: 'USDT',
      nilaiIdr: null,
      liveKey: 'USDT',
      keterangan: 'Saldo wallet BSC (data awal dari dashboard)',
      seed: true,
    },
    {
      id: 'seed-hype',
      nama: 'HYPE',
      jenis: 'crypto',
      jumlah: 0.09,
      satuan: 'HYPE',
      nilaiIdr: null,
      liveKey: 'HYPE',
      keterangan: '~0.09 HYPE di Elysium (data awal dari dashboard)',
      seed: true,
    },
    {
      id: 'seed-nft',
      nama: 'NFT Free-Mint',
      jenis: 'lainnya',
      jumlah: nftCount,
      satuan: 'NFT',
      nilaiIdr: null,
      keterangan: 'NFT free-mint, nilai pasar tidak tersedia (data awal dari dashboard)',
      seed: true,
    },
    {
      id: 'seed-census',
      nama: 'CENSUS (registrasi)',
      jenis: 'lainnya',
      jumlah: 5,
      satuan: 'registrasi',
      nilaiIdr: null,
      keterangan: 'Registrasi No.03404–03408, token sudah habis (data awal dari dashboard)',
      seed: true,
    },
  ];
  return { ledger, assets, seededAt: Date.now() };
}

/* ---------- grafik SVG (pola yang sama seperti halaman utama) ---------- */
function KeuDonut({
  parts,
}: {
  parts: { label: string; value: number; color: string; text: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <div className="nx-empty">Belum ada nilai aset.</div>;
  const R = 62;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const circles = parts.map((p) => {
    const frac = p.value / total;
    const el = (
      <circle
        key={p.label}
        cx="90"
        cy="90"
        r={R}
        fill="none"
        stroke={p.color}
        strokeWidth="24"
        strokeDasharray={`${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`}
        strokeDashoffset={(-acc * C).toFixed(2)}
        transform="rotate(-90 90 90)"
      />
    );
    acc += frac;
    return el;
  });
  return (
    <div className="nx-donut-wrap">
      <svg viewBox="0 0 180 180" className="nx-donut" aria-hidden="true">
        <circle cx="90" cy="90" r={R} fill="none" stroke="#352a44" strokeWidth="24" />
        {circles}
        <text x="90" y="86" textAnchor="middle" fill="#f6f1f8" fontSize="14" fontWeight="800">
          TOTAL
        </text>
        <text x="90" y="106" textAnchor="middle" fill="#8f819f" fontSize="11">
          aset (Rp)
        </text>
      </svg>
      <div className="nx-donut-legend">
        {parts.map((p) => (
          <span key={p.label} className="leg">
            <span className="nx-leg-sq" style={{ background: p.color }} />
            {p.label}
            <b>
              {p.text} · {((p.value / total) * 100).toFixed(0)}%
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

function KeuArea({ data }: { data: { label: string; value: number }[] }) {
  if (data.length < 2) {
    return (
      <div className="nx-empty">
        Grafik terisi kalau sudah ada entri di 2 bulan berbeda.
      </div>
    );
  }
  const w = 600;
  const h = 180;
  const min = Math.min(0, ...data.map((d) => d.value));
  const max = Math.max(0, ...data.map((d) => d.value));
  const span = max - min || 1;
  const y = (v: number) => h - 12 - ((v - min) / span) * (h - 24);
  const pts = data
    .map((d, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;
  const zeroY = y(0);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="nx-area" aria-hidden="true">
        <defs>
          <linearGradient id="nx-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff2e88" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff2e88" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {min < 0 && max > 0 && (
          <line x1="0" x2={w} y1={zeroY} y2={zeroY} stroke="#ff5c7a" strokeWidth="1" strokeDasharray="5 4" opacity="0.6" />
        )}
        <polygon points={area} fill="url(#nx-area)" />
        <polyline points={pts} fill="none" stroke="#ff2e88" strokeWidth="2.5" />
        {data.map((d, i) => (
          <circle
            key={d.label}
            cx={(i / (data.length - 1)) * w}
            cy={y(d.value)}
            r="3.5"
            fill="#17101f"
            stroke="#ff2e88"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="nx-area-foot">
        <span>
          {data[0].label} · {fmtRpCompact(data[0].value)}
        </span>
        <span>
          {data[data.length - 1].label} · {fmtRpCompact(data[data.length - 1].value)}
        </span>
      </div>
    </div>
  );
}

function KeuBars({
  months,
}: {
  months: { key: string; masuk: number; keluar: number }[];
}) {
  if (months.length === 0) {
    return <div className="nx-empty">Belum ada entri pemasukan/pengeluaran.</div>;
  }
  const w = 600;
  const h = 200;
  const padB = 28;
  const maxV = Math.max(1, ...months.flatMap((m) => [m.masuk, m.keluar]));
  const slot = w / months.length;
  const bw = Math.min(34, slot / 4);
  const y = (v: number) => h - padB - (v / maxV) * (h - padB - 30);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="nx-area" aria-hidden="true">
        {months.map((m, i) => {
          const cx = slot * i + slot / 2;
          return (
            <g key={m.key}>
              <rect
                x={cx - bw - 3}
                y={y(m.masuk)}
                width={bw}
                height={Math.max(0, h - padB - y(m.masuk))}
                fill="#2dd4a7"
                opacity="0.85"
              />
              <rect
                x={cx + 3}
                y={y(m.keluar)}
                width={bw}
                height={Math.max(0, h - padB - y(m.keluar))}
                fill="#ff5c7a"
                opacity="0.85"
              />
              <text x={cx} y={h - 8} textAnchor="middle" className="nx-bar-label">
                {fmtMonth(m.key)}
              </text>
              <text x={cx} y={Math.max(12, y(Math.max(m.masuk, m.keluar)) - 6)} textAnchor="middle" className="nx-bar-val">
                {fmtRpCompact(m.masuk - m.keluar)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="nx-area-foot">
        <span>
          <span style={{ color: '#2dd4a7' }}>■</span> MASUK
        </span>
        <span>
          <span style={{ color: '#ff5c7a' }}>■</span> KELUAR
        </span>
        <span>ANGKA DI ATAS BAR = SELISIH BULAN ITU</span>
      </div>
    </div>
  );
}

/* ---------- halaman ---------- */
export default function KeuanganPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [ready, setReady] = useState(false);
  const [seedNote, setSeedNote] = useState('');
  const [live, setLive] = useState<LiveMini | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [hypeUsd, setHypeUsd] = useState<number | null>(null);
  const [liveErr, setLiveErr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [fTanggal, setFTanggal] = useState(todayWIB());
  const [fTipe, setFTipe] = useState<'masuk' | 'keluar'>('keluar');
  const [fKategori, setFKategori] = useState(KELUAR_CATS[0]);
  const [fKet, setFKet] = useState('');
  const [fJumlah, setFJumlah] = useState('');
  const [editLedgerId, setEditLedgerId] = useState<string | null>(null);

  const [aNama, setANama] = useState('');
  const [aJenis, setAJenis] = useState<'crypto' | 'cash' | 'lainnya'>('crypto');
  const [aJumlah, setAJumlah] = useState('');
  const [aSatuan, setASatuan] = useState('');
  const [aNilai, setANilai] = useState('');
  const [aLive, setALive] = useState<'' | 'AGC' | 'BNB' | 'USDT' | 'HYPE'>('');
  const [aKet, setAKet] = useState('');
  const [editAssetId, setEditAssetId] = useState<string | null>(null);

  const seededRef = useRef(false);

  /* Muat dari localStorage; kalau belum ada, buat data awal dari fakta dashboard. */
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    let cancelled = false;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Store;
        if (parsed && Array.isArray(parsed.ledger) && Array.isArray(parsed.assets)) {
          setStore(parsed);
          setReady(true);
          return;
        }
      }
    } catch {
      /* lanjut ke seeding */
    }
    (async () => {
      const [liveR, rateR, hypeR, mintsR] = await Promise.allSettled([
        fetchLive(),
        fetchRate(),
        fetchHypeUsd(),
        fetch('/auto-mints.json', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (cancelled) return;
      const lv = liveR.status === 'fulfilled' ? liveR.value : null;
      const rt = rateR.status === 'fulfilled' ? rateR.value : null;
      const hp = hypeR.status === 'fulfilled' ? hypeR.value : null;
      const nftCount =
        mintsR.status === 'fulfilled' && Array.isArray(mintsR.value) ? mintsR.value.length : null;
      if (lv) setLive(lv);
      if (rt != null) setRate(rt);
      if (hp != null) setHypeUsd(hp);
      const seeds = buildSeeds(lv, rt, nftCount);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(seeds));
      } catch {
        /* penyimpanan penuh / privat — data tetap dipakai sesi ini */
      }
      if (rt == null) {
        setSeedNote(
          'Kurs live tidak tersedia saat data awal dibuat, jadi jumlah Rp entri awal kosong (—). Edit entrinya untuk isi jumlah Rp manual.'
        );
      }
      setStore(seeds);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Harga live + kurs: muat ulang tiap 60 detik + tombol refresh manual. */
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const load = async () => {
      const [lv, rt, hp] = await Promise.all([fetchLive(), fetchRate(), fetchHypeUsd()]);
      if (cancelled) return;
      if (lv) setLive(lv);
      if (rt != null) setRate(rt);
      if (hp != null) setHypeUsd(hp);
      setLiveErr(lv == null && rt == null && hp == null);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [ready]);

  /* Simpan tiap perubahan ke localStorage. */
  useEffect(() => {
    if (!ready || !store) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store));
    } catch {
      /* abaikan */
    }
  }, [store, ready]);

  const refreshLive = async () => {
    setRefreshing(true);
    const [lv, rt, hp] = await Promise.all([fetchLive(), fetchRate(), fetchHypeUsd()]);
    if (lv) setLive(lv);
    if (rt != null) setRate(rt);
    if (hp != null) setHypeUsd(hp);
    setLiveErr(lv == null && rt == null && hp == null);
    setRefreshing(false);
  };

  /* Nilai aset: crypto ikut harga live, sisanya nilai manual. */
  const assetValue = (a: Asset): number | null => {
    if (a.liveKey === 'AGC')
      return a.jumlah != null && live?.agcPriceUsd != null && rate != null
        ? a.jumlah * live.agcPriceUsd * rate
        : null;
    if (a.liveKey === 'BNB')
      return a.jumlah != null && live?.bnbPriceUsd != null && rate != null
        ? a.jumlah * live.bnbPriceUsd * rate
        : null;
    if (a.liveKey === 'USDT')
      return a.jumlah != null && rate != null ? a.jumlah * rate : null;
    if (a.liveKey === 'HYPE')
      return a.jumlah != null && hypeUsd != null && rate != null
        ? a.jumlah * hypeUsd * rate
        : null;
    return a.nilaiIdr;
  };

  const valuedAssets = useMemo(
    () =>
      (store?.assets ?? []).map((a) => ({ asset: a, value: assetValue(a) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, live, rate, hypeUsd]
  );

  const totalAset = useMemo(
    () => valuedAssets.reduce((s, v) => s + (v.value ?? 0), 0),
    [valuedAssets]
  );
  const totalMasuk = useMemo(
    () =>
      (store?.ledger ?? []).reduce(
        (s, e) => s + (e.tipe === 'masuk' && e.jumlahIdr != null ? e.jumlahIdr : 0),
        0
      ),
    [store]
  );
  const totalKeluar = useMemo(
    () =>
      (store?.ledger ?? []).reduce(
        (s, e) => s + (e.tipe === 'keluar' && e.jumlahIdr != null ? e.jumlahIdr : 0),
        0
      ),
    [store]
  );
  const pnl = totalMasuk - totalKeluar;
  const monthNow = monthNowWIB();
  const pnlBulanIni = useMemo(
    () =>
      (store?.ledger ?? []).reduce((s, e) => {
        if (e.tanggal.slice(0, 7) !== monthNow || e.jumlahIdr == null) return s;
        return s + (e.tipe === 'masuk' ? e.jumlahIdr : -e.jumlahIdr);
      }, 0),
    [store, monthNow]
  );

  const months = useMemo(() => {
    const map = new Map<string, { masuk: number; keluar: number }>();
    for (const e of store?.ledger ?? []) {
      if (e.jumlahIdr == null) continue;
      const k = e.tanggal.slice(0, 7);
      const cur = map.get(k) ?? { masuk: 0, keluar: 0 };
      if (e.tipe === 'masuk') cur.masuk += e.jumlahIdr;
      else cur.keluar += e.jumlahIdr;
      map.set(k, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ key, ...v, pnl: v.masuk - v.keluar }));
  }, [store]);

  const cumulative = useMemo(() => {
    let acc = 0;
    return months.map((m) => {
      acc += m.pnl;
      return { label: fmtMonth(m.key), value: acc };
    });
  }, [months]);

  /* Delta KPI vs bulan lalu (hanya dari data nyata; null kalau belum ada bulan lalu). */
  const prevMonthKey = useMemo(() => {
    const [y, m] = monthNow.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [monthNow]);
  const curMonth = useMemo(() => months.find((mm) => mm.key === monthNow), [months, monthNow]);
  const prevMonth = useMemo(
    () => months.find((mm) => mm.key === prevMonthKey),
    [months, prevMonthKey]
  );
  const deltaMasuk = useMemo(() => {
    const prev = prevMonth?.masuk;
    if (prev == null || prev === 0) return null;
    return (((curMonth?.masuk ?? 0) - prev) / prev) * 100;
  }, [curMonth, prevMonth]);
  const deltaKeluar = useMemo(() => {
    const prev = prevMonth?.keluar;
    if (prev == null || prev === 0) return null;
    return (((curMonth?.keluar ?? 0) - prev) / prev) * 100;
  }, [curMonth, prevMonth]);

  const donutParts = useMemo(
    () =>
      valuedAssets
        .filter((v) => v.value != null && v.value > 0)
        .map((v, i) => ({
          label: v.asset.nama,
          value: v.value as number,
          color: ASSET_COLORS[i % ASSET_COLORS.length],
          text: fmtRp(v.value),
        })),
    [valuedAssets]
  );

  const noValueAssets = useMemo(
    () => valuedAssets.filter((v) => v.value == null).map((v) => v.asset.nama),
    [valuedAssets]
  );

  /* ---------- evaluasi otomatis ---------- */
  const evaluasi = useMemo(() => {
    const lines: string[] = [];
    const ledger = store?.ledger ?? [];
    if (ledger.length === 0) return lines;
    const byCat = new Map<string, number>();
    for (const e of ledger) {
      if (e.tipe !== 'keluar' || e.jumlahIdr == null) continue;
      byCat.set(e.kategori, (byCat.get(e.kategori) ?? 0) + e.jumlahIdr);
    }
    if (byCat.size > 0) {
      const [cat, val] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
      lines.push(
        `Pengeluaran terbesarmu: ${cat} (${fmtRp(val)} dari total ${fmtRp(totalKeluar)}).`
      );
    }
    if (months.length >= 2) {
      const best = [...months].sort((a, b) => b.pnl - a.pnl)[0];
      const worst = [...months].sort((a, b) => a.pnl - b.pnl)[0];
      lines.push(
        `Bulan paling profit: ${fmtMonth(best.key)} (+${fmtRp(best.pnl)}). Bulan paling rugi: ${fmtMonth(worst.key)} (${fmtRp(worst.pnl)}).`
      );
    }
    if (months.length > 0) {
      const avgIn = totalMasuk / months.length;
      const avgOut = totalKeluar / months.length;
      lines.push(
        `Rata-rata pemasukan ${fmtRp(avgIn)}/bulan, pengeluaran ${fmtRp(avgOut)}/bulan (dari ${months.length} bulan tercatat).`
      );
    }
    if (donutParts.length > 0 && totalAset > 0) {
      const top = [...donutParts].sort((a, b) => b.value - a.value)[0];
      lines.push(
        `Aset terbesarmu: ${top.label} (${fmtRp(top.value)}, ${((top.value / totalAset) * 100).toFixed(0)}% dari total aset).`
      );
    }
    if (pnlBulanIni < 0) {
      lines.push(`Bulan ini (${fmtMonth(monthNow)}) kamu masih rugi ${fmtRp(-pnlBulanIni)} — cek pengeluaran bulan ini di daftar aktivitas.`);
    } else if (pnlBulanIni > 0) {
      lines.push(`Bulan ini (${fmtMonth(monthNow)}) kamu profit ${fmtRp(pnlBulanIni)}. Pertahankan.`);
    }
    return lines;
  }, [store, months, totalKeluar, totalMasuk, donutParts, totalAset, pnlBulanIni, monthNow]);

  /* Aktivitas terakhir, difilter oleh pencarian topbar (keterangan / kategori). */
  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...(store?.ledger ?? [])].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const filtered = q
      ? all.filter((e) => `${e.keterangan} ${e.kategori}`.toLowerCase().includes(q))
      : all;
    return filtered.slice(0, 8);
  }, [store, query]);

  /* ---------- aksi form ---------- */
  const submitLedger = () => {
    const jumlah = Number(fJumlah);
    if (!store || !fTanggal || !fKet.trim() || !Number.isFinite(jumlah) || jumlah <= 0) return;
    if (editLedgerId) {
      setStore({
        ...store,
        ledger: store.ledger.map((e) =>
          e.id === editLedgerId
            ? { ...e, tanggal: fTanggal, tipe: fTipe, kategori: fKategori, keterangan: fKet.trim(), jumlahIdr: Math.round(jumlah) }
            : e
        ),
      });
      setEditLedgerId(null);
    } else {
      setStore({
        ...store,
        ledger: [
          {
            id: uid(),
            tanggal: fTanggal,
            tipe: fTipe,
            kategori: fKategori,
            keterangan: fKet.trim(),
            jumlahIdr: Math.round(jumlah),
          },
          ...store.ledger,
        ],
      });
    }
    setFKet('');
    setFJumlah('');
  };

  const startEditLedger = (e: LedgerEntry) => {
    setFTanggal(e.tanggal);
    setFTipe(e.tipe);
    setFKategori(e.kategori);
    setFKet(e.keterangan);
    setFJumlah(e.jumlahIdr != null ? String(e.jumlahIdr) : '');
    setEditLedgerId(e.id);
    document.getElementById('keu-form-entri')?.scrollIntoView({ behavior: 'smooth' });
  };

  const deleteLedger = (id: string) => {
    if (!store || !window.confirm('Hapus entri ini?')) return;
    setStore({ ...store, ledger: store.ledger.filter((e) => e.id !== id) });
    if (editLedgerId === id) {
      setEditLedgerId(null);
      setFKet('');
      setFJumlah('');
    }
  };

  const submitAsset = () => {
    if (!store || !aNama.trim()) return;
    const jumlah = aJumlah === '' ? null : Number(aJumlah);
    const nilai = aNilai === '' ? null : Number(aNilai);
    if (jumlah != null && (!Number.isFinite(jumlah) || jumlah < 0)) return;
    if (nilai != null && (!Number.isFinite(nilai) || nilai < 0)) return;
    if (aLive === '' && nilai == null) return;
    const base = {
      nama: aNama.trim(),
      jenis: aJenis,
      jumlah,
      satuan: aSatuan.trim() || (aLive !== '' ? aLive : 'unit'),
      nilaiIdr: aLive === '' ? nilai : null,
      liveKey: aLive === '' ? undefined : (aLive as Asset['liveKey']),
      keterangan: aKet.trim(),
    };
    if (editAssetId) {
      setStore({
        ...store,
        assets: store.assets.map((a) => (a.id === editAssetId ? { ...a, ...base } : a)),
      });
      setEditAssetId(null);
    } else {
      setStore({ ...store, assets: [{ id: uid(), ...base }, ...store.assets] });
    }
    setANama('');
    setAJumlah('');
    setASatuan('');
    setANilai('');
    setALive('');
    setAKet('');
  };

  const startEditAsset = (a: Asset) => {
    setANama(a.nama);
    setAJenis(a.jenis);
    setAJumlah(a.jumlah != null ? String(a.jumlah) : '');
    setASatuan(a.satuan);
    setANilai(a.nilaiIdr != null ? String(a.nilaiIdr) : '');
    setALive(a.liveKey ?? '');
    setAKet(a.keterangan);
    setEditAssetId(a.id);
    document.getElementById('keu-form-aset')?.scrollIntoView({ behavior: 'smooth' });
  };

  const deleteAsset = (id: string) => {
    if (!store || !window.confirm('Hapus aset ini?')) return;
    setStore({ ...store, assets: store.assets.filter((a) => a.id !== id) });
    if (editAssetId === id) {
      setEditAssetId(null);
      setANama('');
      setAJumlah('');
      setANilai('');
      setAKet('');
    }
  };

  const resetData = () => {
    if (!window.confirm('Reset semua data keuangan ke data awal dashboard? Entri manualmu akan hilang.')) return;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* abaikan */
    }
    window.location.reload();
  };

  /* ---------- render ---------- */
  if (!ready || !store) {
    return (
      <div className="nx-page">
        <div className="nx-loading">
          <span className="nx-spinner" /> MEMUAT KEUANGAN…
        </div>
      </div>
    );
  }

  const cats = fTipe === 'masuk' ? MASUK_CATS : KELUAR_CATS;
  const qActive = query.trim() !== '';

  /* Teks delta KPI: % vs bulan lalu kalau ada data bulan lalu, kalau tidak teks netral. */
  const deltaText = (d: number | null, curVal: number, invert: boolean) => {
    if (d == null) return { cls: 'neutral', text: `bulan ini ${fmtRp(curVal)}` };
    const good = invert ? d < 0 : d >= 0;
    return {
      cls: good ? 'good' : 'bad',
      text: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}% vs bulan lalu`,
    };
  };
  const dMasuk = deltaText(deltaMasuk, curMonth?.masuk ?? 0, false);
  const dKeluar = deltaText(deltaKeluar, curMonth?.keluar ?? 0, true);

  return (
    <div className="nx-page">
        <header className="nx-topbar">
          <div>
            <h1>Keuangan</h1>
            <div className="nx-topbar-sub">Aset · Pemasukan · Pengeluaran</div>
          </div>
          <div className="nx-top-right">
            <label className="nx-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
              <input
                type="text"
                placeholder="Cari entri…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Cari entri keuangan"
              />
            </label>
            <span className="nx-rate">
              {rate != null ? `1 USD = ${fmtRp(rate)} (live)` : liveErr ? 'kurs live tidak tersedia' : 'memuat kurs…'}
            </span>
            <button type="button" className="nx-btn-ghost" onClick={refreshLive} disabled={refreshing}>
              {refreshing ? 'MEMUAT…' : '↻ REFRESH'}
            </button>
          </div>
        </header>

        {seedNote ? <div className="nx-note">{seedNote}</div> : null}
        <div className="nx-note">
          Data tersimpan di browser ini (localStorage). Harga crypto ikut harga live; semua entri
          manual bisa diedit dan dihapus. Data awal di bawah ini diambil dari dashboard garapanmu.
        </div>

        {/* ===== KPI ===== */}
        <div className="nx-kpis">
          <div className="nx-kpi">
            <span className="nx-kpi-icon" style={{ background: 'linear-gradient(135deg,#ff2e88,#b78cff)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </span>
            <div className="nx-kpi-label">Total Aset</div>
            <div className="nx-kpi-value">{fmtRp(totalAset)}</div>
            <div className="nx-kpi-delta neutral">
              {valuedAssets.filter((v) => v.value != null).length} aset bernilai
              {noValueAssets.length > 0 ? ` · tidak termasuk: ${noValueAssets.join(', ')} (nilai —)` : ''}
            </div>
          </div>
          <div className="nx-kpi">
            <span className="nx-kpi-icon" style={{ background: 'linear-gradient(135deg,#2dd4a7,#16a34a)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </span>
            <div className="nx-kpi-label">Total Pemasukan</div>
            <div className="nx-kpi-value" style={{ color: '#2dd4a7' }}>{fmtRp(totalMasuk)}</div>
            <div className={`nx-kpi-delta ${dMasuk.cls}`}>{dMasuk.text}</div>
          </div>
          <div className="nx-kpi">
            <span className="nx-kpi-icon" style={{ background: 'linear-gradient(135deg,#ff8a3d,#f97316)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                <polyline points="17 18 23 18 23 12" />
              </svg>
            </span>
            <div className="nx-kpi-label">Total Pengeluaran</div>
            <div className="nx-kpi-value" style={{ color: '#ff5c7a' }}>{fmtRp(totalKeluar)}</div>
            <div className={`nx-kpi-delta ${dKeluar.cls}`}>{dKeluar.text}</div>
          </div>
          <div className="nx-kpi">
            <span className="nx-kpi-icon" style={{ background: 'linear-gradient(135deg,#b78cff,#ff2e88)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
            <div className="nx-kpi-label">Profit / Rugi</div>
            <div className="nx-kpi-value" style={{ color: pnl >= 0 ? '#2dd4a7' : '#ff5c7a' }}>
              {pnl >= 0 ? '+' : '−'}{fmtRp(Math.abs(pnl))}
            </div>
            <div className={`nx-kpi-delta ${pnlBulanIni === 0 ? 'neutral' : pnlBulanIni > 0 ? 'good' : 'bad'}`}>
              bulan ini {pnlBulanIni >= 0 ? '+' : '−'}{fmtRp(Math.abs(pnlBulanIni))}
            </div>
          </div>
        </div>

        {/* ===== Grafik ===== */}
        <div className="nx-charts">
          <div className="nx-panel">
            <div className="nx-panel-title">Alokasi Aset</div>
            <div className="nx-panel-sub">Pembagian nilai asetmu saat ini (harga live).</div>
            <KeuDonut parts={donutParts} />
          </div>
          <div className="nx-panel">
            <div className="nx-panel-title">Saldo Kumulatif</div>
            <div className="nx-panel-sub">Profit/rugi kumulatif per bulan dari catatanmu.</div>
            <KeuArea data={cumulative} />
          </div>
          <div className="nx-panel">
            <div className="nx-panel-title">Masuk vs Keluar / Bulan</div>
            <div className="nx-panel-sub">Pemasukan vs pengeluaran tiap bulan.</div>
            <KeuBars months={months} />
          </div>
        </div>

        {/* ===== Evaluasi ===== */}
        <section className="nx-section" id="evaluasi">
          <h2 className="nx-section-title">Evaluasi Otomatis</h2>
          <div className="nx-panel">
            {evaluasi.length === 0 ? (
              <div className="nx-empty">
                Belum ada data untuk dievaluasi. Tambah entri pemasukan/pengeluaran di bawah.
              </div>
            ) : (
              <ul className="nx-insight">
                {evaluasi.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ===== Form input ===== */}
        <div className="nx-forms">
          <section className="nx-panel" id="keu-form-entri">
            <div className="nx-form-title">
              {editLedgerId ? 'Edit Entri' : 'Tambah Pemasukan / Pengeluaran'}
            </div>
            <div className="nx-form-grid">
              <div className="nx-field">
                <label htmlFor="keu-tanggal">Tanggal</label>
                <input
                  id="keu-tanggal"
                  className="nx-input"
                  type="date"
                  value={fTanggal}
                  onChange={(e) => setFTanggal(e.target.value)}
                />
              </div>
              <div className="nx-field">
                <label htmlFor="keu-tipe">Jenis</label>
                <select
                  id="keu-tipe"
                  className="nx-select"
                  value={fTipe}
                  onChange={(e) => {
                    const t = e.target.value as 'masuk' | 'keluar';
                    setFTipe(t);
                    setFKategori(t === 'masuk' ? MASUK_CATS[0] : KELUAR_CATS[0]);
                  }}
                >
                  <option value="keluar">Pengeluaran</option>
                  <option value="masuk">Pemasukan</option>
                </select>
              </div>
              <div className="nx-field">
                <label htmlFor="keu-kategori">Kategori</label>
                <select
                  id="keu-kategori"
                  className="nx-select"
                  value={fKategori}
                  onChange={(e) => setFKategori(e.target.value)}
                >
                  {cats.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="nx-field">
                <label htmlFor="keu-jumlah">Jumlah (Rp)</label>
                <input
                  id="keu-jumlah"
                  className="nx-input"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="contoh: 50000"
                  value={fJumlah}
                  onChange={(e) => setFJumlah(e.target.value)}
                />
              </div>
              <div className="nx-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="keu-ket">Keterangan</label>
                <input
                  id="keu-ket"
                  className="nx-input"
                  type="text"
                  placeholder="contoh: beli USDT / jual AGC"
                  value={fKet}
                  onChange={(e) => setFKet(e.target.value)}
                />
              </div>
              <div>
                <button type="button" className="nx-btn" onClick={submitLedger}>
                  {editLedgerId ? 'SIMPAN EDIT' : 'TAMBAH ENTRI'}
                </button>
                {editLedgerId ? (
                  <button
                    type="button"
                    className="nx-btn-ghost"
                    onClick={() => {
                      setEditLedgerId(null);
                      setFKet('');
                      setFJumlah('');
                    }}
                  >
                    BATAL
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="nx-panel" id="keu-form-aset">
            <div className="nx-form-title">
              {editAssetId ? 'Edit Aset' : 'Tambah / Edit Aset'}
            </div>
            <div className="nx-form-grid">
              <div className="nx-field">
                <label htmlFor="keu-anama">Nama aset</label>
                <input
                  id="keu-anama"
                  className="nx-input"
                  type="text"
                  placeholder="contoh: USDT / Tabungan"
                  value={aNama}
                  onChange={(e) => setANama(e.target.value)}
                />
              </div>
              <div className="nx-field">
                <label htmlFor="keu-ajenis">Jenis</label>
                <select
                  id="keu-ajenis"
                  className="nx-select"
                  value={aJenis}
                  onChange={(e) => setAJenis(e.target.value as 'crypto' | 'cash' | 'lainnya')}
                >
                  <option value="crypto">Crypto</option>
                  <option value="cash">Tunai / Bank</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>
              <div className="nx-field">
                <label htmlFor="keu-alive">Harga live</label>
                <select
                  id="keu-alive"
                  className="nx-select"
                  value={aLive}
                  onChange={(e) => {
                    const v = e.target.value as '' | 'AGC' | 'BNB' | 'USDT' | 'HYPE';
                    setALive(v);
                    if (v !== '') setASatuan(v);
                  }}
                >
                  <option value="">Manual (isi nilai Rp)</option>
                  <option value="AGC">AGC (live)</option>
                  <option value="BNB">BNB (live)</option>
                  <option value="USDT">USDT (live)</option>
                  <option value="HYPE">HYPE (live)</option>
                </select>
              </div>
              <div className="nx-field">
                <label htmlFor="keu-ajumlah">Jumlah</label>
                <input
                  id="keu-ajumlah"
                  className="nx-input"
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="contoh: 0.05"
                  value={aJumlah}
                  onChange={(e) => setAJumlah(e.target.value)}
                />
              </div>
              <div className="nx-field">
                <label htmlFor="keu-asatuan">Satuan</label>
                <input
                  id="keu-asatuan"
                  className="nx-input"
                  type="text"
                  placeholder="BNB / USDT / unit"
                  value={aSatuan}
                  onChange={(e) => setASatuan(e.target.value)}
                />
              </div>
              <div className="nx-field">
                <label htmlFor="keu-anilai">Nilai (Rp) — kalau manual</label>
                <input
                  id="keu-anilai"
                  className="nx-input"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="contoh: 1000000"
                  value={aNilai}
                  disabled={aLive !== ''}
                  onChange={(e) => setANilai(e.target.value)}
                />
              </div>
              <div className="nx-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="keu-aketerangan">Keterangan</label>
                <input
                  id="keu-aketerangan"
                  className="nx-input"
                  type="text"
                  placeholder="contoh: saldo wallet BSC"
                  value={aKet}
                  onChange={(e) => setAKet(e.target.value)}
                />
              </div>
              <div>
                <button type="button" className="nx-btn" onClick={submitAsset}>
                  {editAssetId ? 'SIMPAN EDIT' : 'TAMBAH ASET'}
                </button>
                {editAssetId ? (
                  <button
                    type="button"
                    className="nx-btn-ghost"
                    onClick={() => {
                      setEditAssetId(null);
                      setANama('');
                      setAJumlah('');
                      setANilai('');
                      setAKet('');
                    }}
                  >
                    BATAL
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {/* ===== Aktivitas terakhir ===== */}
        <section className="nx-section">
          <h2 className="nx-section-title">Aktivitas Terakhir</h2>
          {qActive ? (
            <div className="nx-panel-sub">
              Hasil untuk “{query.trim()}” · {recent.length} entri
            </div>
          ) : null}
          <div className="nx-panel">
            {recent.length === 0 ? (
              <div className="nx-empty">
                {qActive
                  ? `Tidak ada entri yang cocok dengan “${query.trim()}”.`
                  : 'Belum ada entri. Tambah pemasukan atau pengeluaran di atas.'}
              </div>
            ) : (
              recent.map((e) => (
                <div key={e.id} className="nx-row">
                  <span className="nx-date">{fmtDateId(e.tanggal)}</span>
                  <span className="nx-cat">{e.kategori}</span>
                  <span className="nx-note">
                    {e.keterangan} {e.seed ? <span className="nx-badge seed">DATA AWAL</span> : null}
                  </span>
                  <span className={`nx-badge ${e.tipe === 'masuk' ? 'masuk' : 'keluar'}`}>
                    {e.tipe === 'masuk' ? 'MASUK' : 'KELUAR'}
                  </span>
                  <span className={`nx-amt ${e.tipe === 'masuk' ? 'in' : 'out'}`}>
                    {e.tipe === 'masuk' ? '+' : '−'}{fmtRp(e.jumlahIdr)}
                  </span>
                  <span className="nx-actions">
                    <button type="button" onClick={() => startEditLedger(e)}>EDIT</button>
                    <button type="button" className="danger" onClick={() => deleteLedger(e.id)}>HAPUS</button>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ===== Daftar aset ===== */}
        <section className="nx-section">
          <h2 className="nx-section-title">Daftar Aset</h2>
          <div className="nx-panel">
            {valuedAssets.length === 0 ? (
              <div className="nx-empty">Belum ada aset. Tambah aset di atas.</div>
            ) : (
              valuedAssets.map(({ asset: a, value }) => (
                <div key={a.id} className="nx-row">
                  <span className="nx-cat">{a.jenis.toUpperCase()}</span>
                  <span className="nx-note">
                    <b>{a.nama}</b>
                    {a.jumlah != null ? ` · ${fmtNum(a.jumlah)} ${a.satuan}` : ''}
                    {a.keterangan ? ` — ${a.keterangan}` : ''}
                    {a.seed ? <span className="nx-badge seed"> DATA AWAL</span> : null}
                    {a.liveKey ? <span className="nx-badge live"> LIVE</span> : null}
                  </span>
                  <span className="nx-amt">{fmtRp(value)}</span>
                  <span className="nx-actions">
                    <button type="button" onClick={() => startEditAsset(a)}>EDIT</button>
                    <button type="button" className="danger" onClick={() => deleteAsset(a.id)}>HAPUS</button>
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="nx-hint">
            Aset crypto (AGC, BNB, USDT, HYPE) dinilai dengan harga live saat halaman dibuka dan
            di-refresh tiap 60 detik. Aset tanpa nilai (“—”) tidak masuk ke Total Aset.
          </p>
        </section>

        <div className="nx-note">
          Sumber harga live: AGC &amp; BNB dari /api/live (DexScreener/CoinGecko), HYPE dari
          CoinGecko, kurs USD/IDR live. Kalau harga live tidak tersedia, nilainya tampil “—”.
        </div>
        <button type="button" className="nx-btn-danger" onClick={resetData}>
          RESET KE DATA AWAL
        </button>

        <div className="nx-foot">
          DASHBOARD VIRTUE // KEUANGAN. Data tersimpan lokal di browser (localStorage: virtue_keuangan_v1).
        </div>
      </div>
  );
}
