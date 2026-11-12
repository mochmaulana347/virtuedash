'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BSC_WALLET = '0xC905AA0F4E53f5A7F18335e0C33977d4a6783903';
const AGC_TOKEN = '0x63dea5aCdbE1F27c968907D08610A5f0A0284bA6';

/* Aset terkunci dihitung dari DATA (bukan konstanta hardcode): entri dengan status
   'berjalan' yang punya lockedBnb / lockedAgc (lihat public/rangkuman.json, mis.
   Plan B #1 dan #2). Kalau sebuah posisi diubah jadi 'selesai', nilainya otomatis
   keluar dari kartu Aset Terkunci. */
const LS_KEY = 'virtue_garapan_v1';

type GarapanOverrides = { byId: Record<string, RangkumanItem | null> };

/* Gabungkan data bawaan dengan perubahan user (localStorage): null = dihapus,
   objek = entri baru / hasil edit. Entri user baru menempel di akhir. */
function applyOverrides(base: RangkumanItem[], ov: GarapanOverrides): RangkumanItem[] {
  const map = new Map<string, RangkumanItem>(base.map((x): [string, RangkumanItem] => [x.id, x]));
  for (const [id, val] of Object.entries(ov.byId)) {
    if (val == null) map.delete(id);
    else map.set(id, val);
  }
  return [...map.values()];
}

type RangkumanItem = {
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

type NftItem = {
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

type LiveData = {
  agcPriceUsd: number | null;
  bnbPriceUsd: number | null;
  balances: { bnb: number | null; agc: number | null; usdt: number | null };
  fetchedAt: number;
};

const usd = (v: number | null | undefined) =>
  v == null
    ? 'n/a'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: v < 1 ? 4 : 2,
      }).format(v);

const usd2 = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(v);

const fmtNum = (v: number) => new Intl.NumberFormat('id-ID').format(v);

const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const CAT_COLOR: Record<string, string> = {
  'AGC Plan A': '#ff2e88',
  'AGC Plan B': '#ff8a3d',
  CENSUS: '#ffc53d',
  'CENSUS Trading': '#2dd4bf',
  'BNB Agent': '#b78cff',
  'Token Claim': '#ff5c7a',
  'Free NFT': '#8b9dff',
};

const CAT_SHORT: Record<string, string> = {
  'AGC Plan A': 'Plan A',
  'AGC Plan B': 'Plan B',
  CENSUS: 'CENSUS',
  'CENSUS Trading': 'Trading',
  'BNB Agent': 'BNB Agent',
  'Token Claim': 'Klaim',
  'Free NFT': 'NFT',
};

/* Warna segmen treemap (oranye, kuning, teal, lavender, pink). */
const SEG_COLORS = ['#ff8a3d', '#ffc53d', '#2dd4bf', '#b78cff', '#ff2e88'];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  selesai: { label: 'Selesai', cls: 'bi-badge ok' },
  untung: { label: 'Untung', cls: 'bi-badge ok' },
  rugi: { label: 'Rugi', cls: 'bi-badge bad' },
  berjalan: { label: 'Berjalan', cls: 'bi-badge' },
};

const STATUSES = ['selesai', 'untung', 'rugi', 'berjalan'] as const;
const STATUS_LABEL: Record<string, string> = {
  selesai: 'Selesai',
  untung: 'Untung',
  rugi: 'Rugi',
  berjalan: 'Berjalan',
};

type CatRow = { cat: string; modal: number; hasil: number; untung: number | null; count: number };

/* Angka yang menghitung naik/turun halus tiap nilai berubah. */
function useAnimatedNumber(value: number | null, duration = 700) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    if (value == null) return;
    const from = prevRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prevRef.current = to;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

/* ---------- tooltip bersama untuk semua chart ---------- */
type Tip = { x: number; y: number; title: string; lines: { label: string; value: string }[] };

function placeTip(e: React.MouseEvent, ref: React.RefObject<HTMLDivElement>): { x: number; y: number } {
  const el = ref.current;
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  let x = e.clientX - r.left + 14;
  let y = e.clientY - r.top + 14;
  if (x > r.width - 200) x = e.clientX - r.left - 210;
  if (y > r.height - 120) y = e.clientY - r.top - 120;
  return { x: Math.max(4, x), y: Math.max(4, y) };
}

function ChartTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="bi-tip" style={{ left: tip.x, top: tip.y }}>
      <div className="bi-tip-title">{tip.title}</div>
      {tip.lines.map((l) => (
        <div key={l.label} className="bi-tip-line">
          <span>{l.label}</span>
          <b>{l.value}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------- geometri SVG ---------- */
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

const arcPath = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string => {
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r1} ${r1} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} A ${r0} ${r0} 0 ${large} 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
};

/* ---------- KARTU 1: leaderboard kategori (stacked bar modal/hasil/untung) ---------- */
function LeaderboardCard({
  rows,
  filterCat,
  onSelect,
  money2,
}: {
  rows: CatRow[];
  filterCat: string | null;
  onSelect: (cat: string) => void;
  money2: (v: number) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const totals = rows.map((r) => r.modal + r.hasil + Math.max(r.untung ?? 0, 0));
  const maxT = Math.max(...totals, 1);
  return (
    <div className="bi-card" ref={boxRef} onMouseLeave={() => setTip(null)}>
      <div className="bi-card-title">Leaderboard kategori</div>
      <div className="bi-card-sub">Modal, hasil, dan untung per kategori. Klik kartu untuk memfilter tabel.</div>
      {rows.map((r) => {
        const u = Math.max(r.untung ?? 0, 0);
        const sel = filterCat === r.cat;
        const dim = filterCat != null && !sel;
        return (
          <div
            key={r.cat}
            className={`bi-lb-row bi-clickable${sel ? ' selected' : ''}${dim ? ' dimmed' : ''}`}
            onClick={() => onSelect(r.cat)}
            onMouseMove={(e) =>
              setTip({
                ...placeTip(e, boxRef),
                title: r.cat,
                lines: [
                  { label: 'Modal', value: money2(r.modal) },
                  { label: 'Hasil', value: money2(r.hasil) },
                  { label: 'Untung', value: r.untung != null && r.untung > 0 ? `+${money2(r.untung)}` : 'n/a' },
                  { label: 'Aktivitas', value: `${r.count}` },
                ],
              })
            }
          >
            <div className="bi-lb-head">
              <span className="nm">
                <span className="bi-cat-sq" style={{ background: CAT_COLOR[r.cat] ?? '#888' }} />
                {r.cat}
              </span>
              <span className="vl">
                {r.untung != null && r.untung > 0 ? `+${money2(r.untung)}` : money2(r.modal)}
              </span>
            </div>
            <div className="bi-lb-track">
              <div className="bi-lb-seg" style={{ width: `${(r.modal / maxT) * 100}%`, background: '#ff2e88' }} />
              <div className="bi-lb-seg" style={{ width: `${(r.hasil / maxT) * 100}%`, background: '#2dd4bf' }} />
              <div className="bi-lb-seg" style={{ width: `${(u / maxT) * 100}%`, background: '#ffc53d' }} />
            </div>
            <div className="bi-lb-meta">
              <span>Modal <b>{money2(r.modal)}</b></span>
              <span>Hasil <b>{money2(r.hasil)}</b></span>
              <span>Untung <b>{r.untung != null && r.untung > 0 ? `+${money2(r.untung)}` : 'n/a'}</b></span>
              <span><b>{r.count}</b> aktivitas</span>
            </div>
          </div>
        );
      })}
      <div className="bi-legend">
        <span className="bi-leg"><span className="bi-leg-sq" style={{ background: '#ff2e88' }} />Modal</span>
        <span className="bi-leg"><span className="bi-leg-sq" style={{ background: '#2dd4bf' }} />Hasil</span>
        <span className="bi-leg"><span className="bi-leg-sq" style={{ background: '#ffc53d' }} />Untung</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- KARTU 2: heatmap kategori × status ---------- */
function HeatmapCard({
  rows,
  cats,
  filterCat,
  onSelectCell,
}: {
  rows: { kategori: string; status: string }[];
  cats: CatRow[];
  filterCat: string | null;
  onSelectCell: (cat: string, status: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const catNames = cats.map((c) => c.cat);
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const k = `${r.kategori}||${r.status}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const maxC = Math.max(...[...counts.values()], 1);
  return (
    <div className="bi-card" ref={boxRef} onMouseLeave={() => setTip(null)}>
      <div className="bi-card-title">Heatmap kategori × status</div>
      <div className="bi-card-sub">Jumlah aktivitas per kategori dan status. Klik sel untuk memfilter.</div>
      <div className="bi-heat">
        <div className="bi-heat-h left">Kategori</div>
        {STATUSES.map((s) => (
          <div key={s} className="bi-heat-h">{STATUS_LABEL[s]}</div>
        ))}
        {catNames.map((cat) => (
          <div key={cat} style={{ display: 'contents' }}>
            <div className="bi-heat-row">
              <span className="bi-cat-sq" style={{ background: CAT_COLOR[cat] ?? '#888' }} />
              <span>{CAT_SHORT[cat] ?? cat}</span>
            </div>
            {STATUSES.map((s) => {
              const n = counts.get(`${cat}||${s}`) ?? 0;
              const alpha = n > 0 ? 0.18 + 0.82 * (n / maxC) : 0;
              const sel = filterCat === cat;
              const dim = filterCat != null && !sel;
              return (
                <div
                  key={s}
                  className={`bi-heat-cell${n === 0 ? ' zero' : ' hot'}${sel ? ' sel' : ''}${dim ? ' dimmed' : ''}`}
                  style={n > 0 ? { background: `rgba(255,46,136,${alpha.toFixed(2)})` } : undefined}
                  onClick={() => n > 0 && onSelectCell(cat, s)}
                  onMouseMove={(e) =>
                    n > 0 &&
                    setTip({
                      ...placeTip(e, boxRef),
                      title: `${cat} × ${STATUS_LABEL[s]}`,
                      lines: [{ label: 'Aktivitas', value: `${n}` }],
                    })
                  }
                >
                  {n > 0 ? n : '–'}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="bi-legend">
        <span className="bi-leg">Warna makin pekat = makin banyak aktivitas (maks {maxC}).</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- KARTU 3: treemap alokasi keuntungan ---------- */
function TreemapCard({
  rows,
  filterCat,
  onSelect,
  money2,
}: {
  rows: CatRow[];
  filterCat: string | null;
  onSelect: (cat: string) => void;
  money2: (v: number) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const prof = rows.filter((r) => (r.untung ?? 0) > 0.001);
  const total = prof.reduce((s, r) => s + (r.untung ?? 0), 0);
  const W = 600;
  const H = 150;
  let x = 0;
  return (
    <div className="bi-card" ref={boxRef} onMouseLeave={() => setTip(null)}>
      <div className="bi-card-title">Alokasi keuntungan</div>
      <div className="bi-card-sub">Treemap keuntungan per kategori (hanya yang untung). Klik kotak untuk memfilter.</div>
      {prof.length === 0 || total <= 0 ? (
        <div className="bi-empty">Belum ada kategori untung.</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="bi-svg" width="100%" role="img" aria-label="Treemap keuntungan per kategori">
          {prof.map((r, i) => {
            const w = ((r.untung ?? 0) / total) * W;
            const rx = x;
            x += w;
            const sel = filterCat === r.cat;
            const dim = filterCat != null && !sel;
            return (
              <g key={r.cat}>
                <rect
                  x={rx + 1}
                  y={1}
                  width={Math.max(0, w - 2)}
                  height={H - 2}
                  rx={6}
                  fill={SEG_COLORS[i % SEG_COLORS.length]}
                  className={`bi-tree-rect${sel ? ' sel' : ''}${dim ? ' dimmed' : ''}`}
                  onClick={() => onSelect(r.cat)}
                  onMouseMove={(e) =>
                    setTip({
                      ...placeTip(e, boxRef),
                      title: r.cat,
                      lines: [
                        { label: 'Untung', value: `+${money2(r.untung ?? 0)}${r.cat.startsWith('AGC') ? ' ~' : ''}` },
                        { label: 'Pangsa', value: `${(((r.untung ?? 0) / total) * 100).toFixed(1)}%` },
                      ],
                    })
                  }
                />
                {w >= 110 && (
                  <>
                    <text x={rx + w / 2} y={H / 2 - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
                      {r.cat}
                    </text>
                    <text x={rx + w / 2} y={H / 2 + 14} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.85)">
                      +{money2(r.untung ?? 0)}
                    </text>
                  </>
                )}
                {w < 110 && w >= 64 && (
                  <text x={rx + w / 2} y={H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
                    +{money2(r.untung ?? 0)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="bi-legend">
        {prof.map((r, i) => (
          <span key={r.cat} className="bi-leg">
            <span className="bi-leg-sq" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />
            {r.cat} <b>+{money2(r.untung ?? 0)}</b>
          </span>
        ))}
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- KARTU 4: untung per kategori (bar vertikal pink) ---------- */
function ProfitBarCard({
  rows,
  filterCat,
  onSelect,
  money2,
}: {
  rows: CatRow[];
  filterCat: string | null;
  onSelect: (cat: string) => void;
  money2: (v: number) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 600;
  const H = 230;
  const padL = 46;
  const padB = 34;
  const plotW = W - padL - 8;
  const plotH = H - 16 - padB;
  const maxU = Math.max(...rows.map((r) => r.untung ?? 0), 1);
  const band = plotW / rows.length;
  const bw = Math.min(44, band * 0.55);
  return (
    <div className="bi-card" ref={boxRef} onMouseLeave={() => setTip(null)}>
      <div className="bi-card-title">Untung per kategori</div>
      <div className="bi-card-sub">Keuntungan live; estimasi AGC ikut harga saat ini. Klik bar untuk memfilter.</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bi-svg" width="100%" role="img" aria-label="Untung per kategori">
        <defs>
          <linearGradient id="bi-pink-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5c9d" />
            <stop offset="100%" stopColor="#ff2e88" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = 16 + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={W - 8} y2={y} className="bi-gridline" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="bi-axis">
                {money2(maxU * f)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const u = Math.max(r.untung ?? 0, 0);
          const bh = (u / maxU) * plotH;
          const cx = padL + band * i + band / 2;
          const sel = filterCat === r.cat;
          const dim = filterCat != null && !sel;
          return (
            <g key={r.cat}>
              <rect
                x={cx - bw / 2}
                y={16 + plotH - Math.max(bh, u > 0 ? 2 : 0)}
                width={bw}
                height={Math.max(bh, u > 0 ? 2 : 0)}
                rx={4}
                fill={u > 0 ? 'url(#bi-pink-grad)' : '#352a44'}
                className={`bi-bar-rect${sel ? ' sel' : ''}${dim ? ' dimmed' : ''}`}
                onClick={() => onSelect(r.cat)}
                onMouseMove={(e) =>
                  setTip({
                    ...placeTip(e, boxRef),
                    title: r.cat,
                    lines: [
                      { label: 'Untung', value: r.untung != null && r.untung > 0 ? `+${money2(r.untung)}${r.cat.startsWith('AGC') ? ' ~' : ''}` : 'n/a' },
                      { label: 'Modal', value: money2(r.modal) },
                      { label: 'Aktivitas', value: `${r.count}` },
                    ],
                  })
                }
              />
              {u > 0 && (
                <text x={cx} y={16 + plotH - bh - 6} textAnchor="middle" className="bi-vlabel">
                  +{money2(u)}
                </text>
              )}
              <text x={cx} y={H - 20} textAnchor="middle" className="bi-clabel">
                {CAT_SHORT[r.cat] ?? r.cat}
              </text>
              <text x={cx} y={H - 7} textAnchor="middle" className="bi-clabel">
                {r.count} akt
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- KARTU 5: sunburst kategori → aktivitas ---------- */
type SunRow = { kategori: string; nama: string; modalUsd: number; status: string };

function SunburstCard({
  rows,
  cats,
  filterCat,
  onSelect,
  money2,
}: {
  rows: SunRow[];
  cats: CatRow[];
  filterCat: string | null;
  onSelect: (cat: string) => void;
  money2: (v: number) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hoverCat, setHoverCat] = useState<string | null>(null);
  const cx = 170;
  const cy = 170;
  const r0 = 54;
  const r1 = 106;
  const r2 = 158;
  const totalModal = cats.reduce((s, c) => s + c.modal, 0) || 1;
  let a = 0;
  const inner = cats.map((c) => {
    const span = (c.modal / totalModal) * 360;
    const s = { cat: c.cat, a0: a, a1: a + span, modal: c.modal };
    a += span;
    return s;
  });
  const outer: { cat: string; nama: string; modal: number; status: string; a0: number; a1: number }[] = [];
  inner.forEach((ic) => {
    const acts = rows.filter((r) => r.kategori === ic.cat);
    let oa = ic.a0;
    acts.forEach((act) => {
      const span = (act.modalUsd / totalModal) * 360;
      outer.push({ cat: act.kategori, nama: act.nama, modal: act.modalUsd, status: act.status, a0: oa, a1: oa + span });
      oa += span;
    });
  });
  const dimFor = (cat: string) => {
    if (hoverCat != null) return hoverCat !== cat;
    if (filterCat != null) return filterCat !== cat;
    return false;
  };
  return (
    <div className="bi-card" ref={boxRef} onMouseLeave={() => { setTip(null); setHoverCat(null); }}>
      <div className="bi-card-title">Sunburst aktivitas</div>
      <div className="bi-card-sub">Kategori di dalam, aktivitas di luar. Arahkan untuk detail, klik untuk memfilter.</div>
      <svg viewBox="0 0 340 340" className="bi-svg" width="100%" style={{ maxWidth: 340, margin: '0 auto' }} role="img" aria-label="Sunburst kategori dan aktivitas">
        {outer.map((o, i) => {
          const hot = hoverCat === o.cat;
          return (
            <path
              key={`o-${i}`}
              d={arcPath(cx, cy, r1, hot ? r2 + 8 : r2, o.a0, Math.max(o.a1, o.a0 + 0.4))}
              fill={CAT_COLOR[o.cat] ?? '#888'}
              opacity={dimFor(o.cat) ? 0.25 : 0.9}
              className="bi-sun-slice"
              onClick={() => onSelect(o.cat)}
              onMouseEnter={() => setHoverCat(o.cat)}
              onMouseMove={(e) =>
                setTip({
                  ...placeTip(e, boxRef),
                  title: o.nama,
                  lines: [
                    { label: 'Kategori', value: o.cat },
                    { label: 'Modal', value: money2(o.modal) },
                    { label: 'Status', value: STATUS_LABEL[o.status] ?? o.status },
                  ],
                })
              }
            />
          );
        })}
        {inner.map((ic) => {
          const mid = (ic.a0 + ic.a1) / 2;
          const [lx, ly] = polar(cx, cy, (r0 + r1) / 2, mid);
          const span = ic.a1 - ic.a0;
          return (
            <g key={ic.cat}>
              <path
                d={arcPath(cx, cy, r0, r1, ic.a0, Math.max(ic.a1, ic.a0 + 0.4))}
                fill={CAT_COLOR[ic.cat] ?? '#888'}
                opacity={dimFor(ic.cat) ? 0.25 : 1}
                className="bi-sun-slice"
                onClick={() => onSelect(ic.cat)}
                onMouseEnter={() => setHoverCat(ic.cat)}
                onMouseMove={(e) =>
                  setTip({
                    ...placeTip(e, boxRef),
                    title: ic.cat,
                    lines: [
                      { label: 'Modal', value: money2(ic.modal) },
                      { label: 'Aktivitas', value: `${rows.filter((r) => r.kategori === ic.cat).length}` },
                    ],
                  })
                }
              />
              {span > 16 && (
                <text x={lx} y={ly + 3} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                  {CAT_SHORT[ic.cat] ?? ic.cat}
                </text>
              )}
            </g>
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#f6f1f8">
          {filterCat ?? `${rows.length} aktivitas`}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize={10} fill="#8f819f">
          {filterCat ? 'kategori terpilih' : 'klik irisan = filter'}
        </text>
      </svg>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- KARTU 6: combo modal (bar) + keuntungan kumulatif (garis) ---------- */
function ComboCard({
  rows,
  filterCat,
  onSelect,
  money2,
  totalUntung,
}: {
  rows: CatRow[];
  filterCat: string | null;
  onSelect: (cat: string) => void;
  money2: (v: number) => string;
  totalUntung: number | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const sorted = [...rows].sort((a, b) => b.modal - a.modal);
  const W = 600;
  const H = 230;
  const padL = 46;
  const padR = 46;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - 16 - padB;
  const maxM = Math.max(...sorted.map((r) => r.modal), 1);
  const band = plotW / sorted.length;
  const bw = Math.min(40, band * 0.55);
  let run = 0;
  const cum = sorted.map((r) => {
    run += Math.max(r.untung ?? 0, 0);
    return totalUntung != null && totalUntung > 0 ? (run / totalUntung) * 100 : 0;
  });
  const pts = sorted.map((_, i) => {
    const cx = padL + band * i + band / 2;
    const cy = 16 + plotH - (cum[i] / 100) * plotH;
    return `${cx.toFixed(1)},${cy.toFixed(1)}`;
  });
  return (
    <div className="bi-card" ref={boxRef} onMouseLeave={() => setTip(null)}>
      <div className="bi-card-title">Modal &amp; keuntungan kumulatif</div>
      <div className="bi-card-sub">
        Modal per kategori (bar pink, menurun) + keuntungan kumulatif (garis oranye, sumbu kanan %).
        {totalUntung == null && ' Garis kumulatif n/a — harga AGC tidak tersedia.'}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bi-svg" width="100%" role="img" aria-label="Modal per kategori dan keuntungan kumulatif">
        <defs>
          <linearGradient id="bi-pink-grad-6" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5c9d" />
            <stop offset="100%" stopColor="#ff2e88" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = 16 + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} className="bi-gridline" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="bi-axis">
                {money2(maxM * f)}
              </text>
              <text x={W - padR + 6} y={y + 3} textAnchor="start" className="bi-axis">
                {`${Math.round(f * 100)}%`}
              </text>
            </g>
          );
        })}
        {sorted.map((r, i) => {
          const bh = (r.modal / maxM) * plotH;
          const cx = padL + band * i + band / 2;
          const sel = filterCat === r.cat;
          const dim = filterCat != null && !sel;
          return (
            <g key={r.cat}>
              <rect
                x={cx - bw / 2}
                y={16 + plotH - Math.max(bh, 2)}
                width={bw}
                height={Math.max(bh, 2)}
                rx={4}
                fill="url(#bi-pink-grad-6)"
                className={`bi-bar-rect${sel ? ' sel' : ''}${dim ? ' dimmed' : ''}`}
                onClick={() => onSelect(r.cat)}
                onMouseMove={(e) =>
                  setTip({
                    ...placeTip(e, boxRef),
                    title: r.cat,
                    lines: [
                      { label: 'Modal', value: money2(r.modal) },
                      { label: 'Untung kumulatif', value: totalUntung != null ? `${cum[i].toFixed(1)}%` : 'n/a' },
                      { label: 'Untung', value: r.untung != null && r.untung > 0 ? `+${money2(r.untung)}` : 'n/a' },
                    ],
                  })
                }
              />
              <text x={cx} y={16 + plotH - bh - 6} textAnchor="middle" className="bi-vlabel">
                {money2(r.modal)}
              </text>
              <text x={cx} y={H - 20} textAnchor="middle" className="bi-clabel">
                {CAT_SHORT[r.cat] ?? r.cat}
              </text>
              <text x={cx} y={H - 7} textAnchor="middle" className="bi-clabel">
                {r.count} akt
              </text>
            </g>
          );
        })}
        {totalUntung != null && totalUntung > 0 && (
          <>
            <polyline points={pts.join(' ')} fill="none" stroke="#ff8a3d" strokeWidth="2.5" strokeLinejoin="round" />
            {sorted.map((r, i) => {
              const [px, py] = pts[i].split(',').map(Number);
              return (
                <circle
                  key={r.cat}
                  cx={px}
                  cy={py}
                  r={4}
                  fill="#ff8a3d"
                  stroke="#17101f"
                  strokeWidth={1.5}
                  onMouseMove={(e) =>
                    setTip({
                      ...placeTip(e, boxRef),
                      title: r.cat,
                      lines: [{ label: 'Untung kumulatif', value: `${cum[i].toFixed(1)}%` }],
                    })
                  }
                />
              );
            })}
          </>
        )}
      </svg>
      <div className="bi-legend">
        <span className="bi-leg"><span className="bi-leg-sq" style={{ background: '#ff2e88' }} />Modal</span>
        <span className="bi-leg"><span className="bi-leg-sq" style={{ background: '#ff8a3d' }} />Keuntungan kumulatif (%)</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- KARTU 7: hasil vs modal per kategori ---------- */
function HasilModalCard({
  rows,
  filterCat,
  onSelect,
  money2,
}: {
  rows: CatRow[];
  filterCat: string | null;
  onSelect: (cat: string) => void;
  money2: (v: number) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const sorted = [...rows].sort((a, b) => b.modal - a.modal);
  const W = 600;
  const H = 230;
  const padL = 46;
  const padB = 34;
  const plotW = W - padL - 8;
  const plotH = H - 16 - padB;
  const maxV = Math.max(...sorted.map((r) => Math.max(r.modal, r.hasil)), 1);
  const band = plotW / sorted.length;
  const bw = Math.min(18, band * 0.28);
  return (
    <div className="bi-card" ref={boxRef} onMouseLeave={() => setTip(null)}>
      <div className="bi-card-title">Hasil vs modal</div>
      <div className="bi-card-sub">Hasil yang sudah kembali dibanding modal per kategori. Klik grup untuk memfilter.</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bi-svg" width="100%" role="img" aria-label="Hasil vs modal per kategori">
        <defs>
          <linearGradient id="bi-pink-grad-7" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5c9d" />
            <stop offset="100%" stopColor="#ff2e88" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = 16 + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={W - 8} y2={y} className="bi-gridline" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="bi-axis">
                {money2(maxV * f)}
              </text>
            </g>
          );
        })}
        {sorted.map((r, i) => {
          const cx = padL + band * i + band / 2;
          const mh = (r.modal / maxV) * plotH;
          const hh = (r.hasil / maxV) * plotH;
          const sel = filterCat === r.cat;
          const dim = filterCat != null && !sel;
          const tipFor = (e: React.MouseEvent) =>
            setTip({
              ...placeTip(e, boxRef),
              title: r.cat,
              lines: [
                { label: 'Modal', value: money2(r.modal) },
                { label: 'Hasil', value: money2(r.hasil) },
              ],
            });
          return (
            <g key={r.cat}>
              <rect
                x={cx - bw - 2}
                y={16 + plotH - Math.max(mh, 2)}
                width={bw}
                height={Math.max(mh, 2)}
                rx={3}
                fill="url(#bi-pink-grad-7)"
                className={`bi-bar-rect${sel ? ' sel' : ''}${dim ? ' dimmed' : ''}`}
                onClick={() => onSelect(r.cat)}
                onMouseMove={tipFor}
              />
              <rect
                x={cx + 2}
                y={16 + plotH - Math.max(hh, r.hasil > 0 ? 2 : 0)}
                width={bw}
                height={Math.max(hh, r.hasil > 0 ? 2 : 0)}
                rx={3}
                fill="#2dd4bf"
                className={`bi-bar-rect${sel ? ' sel' : ''}${dim ? ' dimmed' : ''}`}
                onClick={() => onSelect(r.cat)}
                onMouseMove={tipFor}
              />
              <text x={cx} y={H - 20} textAnchor="middle" className="bi-clabel">
                {CAT_SHORT[r.cat] ?? r.cat}
              </text>
              <text x={cx} y={H - 7} textAnchor="middle" className="bi-clabel">
                {r.count} akt
              </text>
            </g>
          );
        })}
      </svg>
      <div className="bi-legend">
        <span className="bi-leg"><span className="bi-leg-sq" style={{ background: '#ff2e88' }} />Modal</span>
        <span className="bi-leg"><span className="bi-leg-sq" style={{ background: '#2dd4bf' }} />Hasil</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- KARTU 8 (lebar): harga AGC live, area pink ---------- */
function AgcAreaCard({
  data,
  times,
  price,
  fmtUnitPrice,
}: {
  data: number[];
  times: number[];
  price: number | null;
  fmtUnitPrice: (v: number) => string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const change =
    data.length >= 2 && data[0] > 0 ? ((data[data.length - 1] - data[0]) / data[0]) * 100 : null;
  const W = 600;
  const H = 190;
  const padB = 22;
  const plotH = H - 14 - padB;
  if (data.length < 2) {
    return (
      <div className="bi-card wide" ref={boxRef}>
        <div className="bi-card-title">Harga AGC — live</div>
        <div className="bi-card-sub">Riwayat poll 60 detik, terisi otomatis. DexScreener.</div>
        <div className="bi-empty">Grafik terisi otomatis seiring refresh live (60 detik).</div>
      </div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  /* Rentang tampil: kalau harga datar (span 0), lebarkan sedikit di sekitar nilai
     supaya garis tidak menempel di bawah dan label sumbu-Y tetap masuk akal
     (span fallback 1 bikin label $0.00000354 / $0.50 / $1.00 untuk harga mikro). */
  const rawSpan = max - min;
  const span = rawSpan > 0 ? rawSpan : Math.max(Math.abs(min) * 0.02, 1e-12);
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const dispSpan = hi - lo;
  const px = (i: number) => (i / (data.length - 1)) * W;
  const py = (v: number) => 14 + plotH - ((v - lo) / dispSpan) * plotH;
  const line = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <div className="bi-card wide" ref={boxRef} onMouseLeave={() => { setTip(null); setHoverI(null); }}>
      <div className="bi-card-head">
        <div>
          <div className="bi-card-title">Harga AGC — live</div>
          <div className="bi-card-sub">Riwayat poll 60 detik, terisi otomatis. DexScreener.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f6f1f8', fontVariantNumeric: 'tabular-nums' }}>
            {price != null ? fmtUnitPrice(price) : 'n/a'}
          </div>
          <div style={{ fontSize: '0.78rem', color: change != null && change >= 0 ? '#2dd4a7' : '#ff5c7a' }}>
            {change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}% sejak poll pertama` : '—'}
          </div>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="bi-svg"
        width="100%"
        role="img"
        aria-label="Riwayat harga AGC"
        onMouseMove={(e) => {
          const svg = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const relX = ((e.clientX - svg.left) / svg.width) * W;
          const i = Math.max(0, Math.min(data.length - 1, Math.round((relX / W) * (data.length - 1))));
          setHoverI(i);
          setTip({
            ...placeTip(e, boxRef),
            title: times[i] ? fmtTime(times[i]) : `Poll #${i + 1}`,
            lines: [{ label: 'Harga AGC', value: fmtUnitPrice(data[i]) }],
          });
        }}
      >
        <defs>
          <linearGradient id="bi-agc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff2e88" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ff2e88" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = 14 + plotH - f * plotH;
          return (
            <g key={f}>
              <line x1={0} y1={y} x2={W} y2={y} className="bi-gridline" />
              <text x={2} y={y - 3} className="bi-axis">
                {fmtUnitPrice(lo + f * dispSpan)}
              </text>
            </g>
          );
        })}
        <polygon points={area} fill="url(#bi-agc-grad)" />
        <polyline points={line} fill="none" stroke="#ff2e88" strokeWidth="2.5" strokeLinejoin="round" />
        {hoverI != null && (
          <g>
            <line x1={px(hoverI)} y1={14} x2={px(hoverI)} y2={14 + plotH} stroke="#f6f1f8" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            <circle cx={px(hoverI)} cy={py(data[hoverI])} r={4.5} fill="#ff2e88" stroke="#17101f" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      <div className="bi-legend" style={{ justifyContent: 'space-between' }}>
        <span className="bi-leg">AWAL {fmtUnitPrice(data[0])}</span>
        <span className="bi-leg">AKHIR {fmtUnitPrice(data[data.length - 1])}</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ---------- form tambah / edit aktivitas (localStorage) ---------- */
type GarapanFormValues = {
  id: string | null;
  nama: string;
  kategori: string;
  kategoriCustom: string;
  tipe: string;
  tipeCustom: string;
  tanggal: string;
  modalUsd: string;
  modalJenis: 'tunai' | 'deposit';
  modalDetail: string;
  hasilUsd: string;
  hasilDetail: string;
  status: string;
  txHash: string;
  detail: string;
  keuntunganUsd: string;
  keuntunganJenis: '' | 'terealisasi' | 'estimasi';
  keuntunganDetail: string;
  agcAmount: string;
  jumlah: string;
  lockedBnb: string;
  lockedAgc: string;
};

const todayIso = () => {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const toFormValues = (item: RangkumanItem | null): GarapanFormValues => ({
  id: item?.id ?? null,
  nama: item?.nama ?? '',
  kategori: item?.kategori ?? '',
  kategoriCustom: '',
  tipe: item?.tipe ?? '',
  tipeCustom: '',
  tanggal: item?.tanggal ?? todayIso(),
  modalUsd: item != null ? String(item.modalUsd) : '',
  modalJenis: item?.modalJenis ?? 'tunai',
  modalDetail: item?.modalDetail ?? '',
  hasilUsd: item?.hasilUsd != null ? String(item.hasilUsd) : '',
  hasilDetail: item?.hasilDetail ?? '',
  status: item?.status ?? 'berjalan',
  txHash: item?.txHash ?? '',
  detail: item?.detail ?? '',
  keuntunganUsd: item?.keuntunganUsd != null ? String(item.keuntunganUsd) : '',
  keuntunganJenis: item?.keuntunganJenis ?? '',
  keuntunganDetail: item?.keuntunganDetail ?? '',
  agcAmount: item?.agcAmount != null ? String(item.agcAmount) : '',
  jumlah: item?.jumlah ?? '',
  lockedBnb: item?.lockedBnb != null ? String(item.lockedBnb) : '',
  lockedAgc: item?.lockedAgc != null ? String(item.lockedAgc) : '',
});

/* Angka boleh kosong (= tidak ada nilai); kalau diisi harus bisa diparse.
   Koma desimal Indonesia diterima (1,5 -> 1.5). */
const parseNumField = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function GarapanFormModal({
  initial,
  categories,
  types,
  onSave,
  onClose,
}: {
  initial: RangkumanItem | null;
  categories: string[];
  types: string[];
  onSave: (item: RangkumanItem) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<GarapanFormValues>(() => toFormValues(initial));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof GarapanFormValues, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }) as GarapanFormValues);

  const handleSave = () => {
    const numFields: [keyof GarapanFormValues, string][] = [
      ['modalUsd', 'Modal (USD)'],
      ['hasilUsd', 'Hasil (USD)'],
      ['keuntunganUsd', 'Keuntungan (USD)'],
      ['agcAmount', 'Jumlah AGC'],
      ['lockedBnb', 'BNB terkunci'],
      ['lockedAgc', 'AGC terkunci'],
    ];
    if (f.nama.trim() === '') return setErr('Nama wajib diisi.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tanggal)) return setErr('Tanggal wajib diisi.');
    for (const [k, label] of numFields) {
      const v = (f[k] ?? '').trim();
      if (v !== '' && parseNumField(v) == null) return setErr(`${label} harus angka.`);
    }
    const cat = f.kategori === '__custom__' ? f.kategoriCustom.trim() : f.kategori;
    if (cat === '') return setErr('Kategori wajib dipilih atau diisi.');
    const tip = f.tipe === '__custom__' ? f.tipeCustom.trim() : f.tipe;
    if (tip === '') return setErr('Tipe wajib dipilih atau diisi.');
    const item: RangkumanItem = {
      id: f.id ?? `user-${Date.now()}`,
      nama: f.nama.trim(),
      kategori: cat,
      tipe: tip,
      tanggal: f.tanggal,
      modalUsd: parseNumField(f.modalUsd) ?? 0,
      hasilUsd: parseNumField(f.hasilUsd),
      status: f.status,
      txHash: f.txHash.trim() || undefined,
      detail: f.detail.trim(),
      modalDetail: f.modalDetail.trim() || undefined,
      hasilDetail: f.hasilDetail.trim() || undefined,
      jumlah: f.jumlah.trim() || undefined,
      modalJenis: f.modalJenis,
      keuntunganUsd: parseNumField(f.keuntunganUsd),
      keuntunganJenis: f.keuntunganJenis === '' ? null : f.keuntunganJenis,
      keuntunganDetail: f.keuntunganDetail.trim() || undefined,
      agcAmount: parseNumField(f.agcAmount) ?? undefined,
      lockedBnb: parseNumField(f.lockedBnb) ?? undefined,
      lockedAgc: parseNumField(f.lockedAgc) ?? undefined,
    };
    onSave(item);
  };

  return (
    <div className="bi-modal-backdrop" onClick={onClose}>
      <div className="bi-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="bi-modal-head">
          <div className="bi-card-title">{f.id ? 'Edit Aktivitas' : 'Tambah Aktivitas'}</div>
          <button className="bi-modal-close" onClick={onClose} aria-label="Tutup">
            ×
          </button>
        </div>
        <div className="bi-card-sub">Perubahan tersimpan di browser ini (localStorage). Data bawaan tidak diubah.</div>
        <div className="bi-form-grid">
          <div className="bi-field full">
            <label>
              Nama <span className="req">*</span>
            </label>
            <input className="bi-input" value={f.nama} onChange={(e) => set('nama', e.target.value)} placeholder="cth: AGC Plan B, 2 shares" />
          </div>
          <div className="bi-field">
            <label>Kategori</label>
            <select className="bi-select" value={f.kategori} onChange={(e) => set('kategori', e.target.value)}>
              <option value="">— Pilih —</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__custom__">＋ Kategori baru…</option>
            </select>
            {f.kategori === '__custom__' && (
              <input className="bi-input" value={f.kategoriCustom} onChange={(e) => set('kategoriCustom', e.target.value)} placeholder="Nama kategori baru" />
            )}
          </div>
          <div className="bi-field">
            <label>Tipe</label>
            <select className="bi-select" value={f.tipe} onChange={(e) => set('tipe', e.target.value)}>
              <option value="">— Pilih —</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__custom__">＋ Tipe baru…</option>
            </select>
            {f.tipe === '__custom__' && (
              <input className="bi-input" value={f.tipeCustom} onChange={(e) => set('tipeCustom', e.target.value)} placeholder="Nama tipe baru" />
            )}
          </div>
          <div className="bi-field">
            <label>
              Tanggal <span className="req">*</span>
            </label>
            <input className="bi-input" type="date" value={f.tanggal} onChange={(e) => set('tanggal', e.target.value)} />
          </div>
          <div className="bi-field">
            <label>Status</label>
            <select className="bi-select" value={f.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="bi-field">
            <label>Modal (USD)</label>
            <input className="bi-input" inputMode="decimal" value={f.modalUsd} onChange={(e) => set('modalUsd', e.target.value)} placeholder="0" />
          </div>
          <div className="bi-field">
            <label>Jenis modal</label>
            <select className="bi-select" value={f.modalJenis} onChange={(e) => set('modalJenis', e.target.value)}>
              <option value="tunai">Tunai (dihitung jadi modal)</option>
              <option value="deposit">Deposit (bukan modal)</option>
            </select>
          </div>
          <div className="bi-field full">
            <label>Detail modal</label>
            <input className="bi-input" value={f.modalDetail} onChange={(e) => set('modalDetail', e.target.value)} placeholder="cth: 0,01 BNB (~$7,17) + gas" />
          </div>
          <div className="bi-field">
            <label>Hasil (USD)</label>
            <input className="bi-input" inputMode="decimal" value={f.hasilUsd} onChange={(e) => set('hasilUsd', e.target.value)} placeholder="kosong = belum ada hasil" />
          </div>
          <div className="bi-field full">
            <label>Detail hasil</label>
            <input className="bi-input" value={f.hasilDetail} onChange={(e) => set('hasilDetail', e.target.value)} placeholder="cth: LP terkunci 14 hari" />
          </div>
          <div className="bi-field">
            <label>Keuntungan (USD)</label>
            <input className="bi-input" inputMode="decimal" value={f.keuntunganUsd} onChange={(e) => set('keuntunganUsd', e.target.value)} placeholder="kosong = n/a" />
          </div>
          <div className="bi-field">
            <label>Jenis keuntungan</label>
            <select className="bi-select" value={f.keuntunganJenis} onChange={(e) => set('keuntunganJenis', e.target.value)}>
              <option value="">— Kosong —</option>
              <option value="terealisasi">Terealisasi (uang sudah di tangan)</option>
              <option value="estimasi">Estimasi (AGC, ikut harga live)</option>
            </select>
          </div>
          <div className="bi-field">
            <label>Jumlah AGC (untuk estimasi)</label>
            <input className="bi-input" inputMode="decimal" value={f.agcAmount} onChange={(e) => set('agcAmount', e.target.value)} placeholder="cth: 350000" />
          </div>
          <div className="bi-field">
            <label>Jumlah</label>
            <input className="bi-input" value={f.jumlah} onChange={(e) => set('jumlah', e.target.value)} placeholder="cth: 5 shares jadi 350.000 AGC" />
          </div>
          <div className="bi-field full">
            <label>Detail keuntungan</label>
            <input className="bi-input" value={f.keuntunganDetail} onChange={(e) => set('keuntunganDetail', e.target.value)} placeholder="cth: 350.000 AGC, nilai ikut harga live" />
          </div>
          <div className="bi-field">
            <label>BNB terkunci (lockedBnb)</label>
            <input className="bi-input" inputMode="decimal" value={f.lockedBnb} onChange={(e) => set('lockedBnb', e.target.value)} placeholder="cth: 0.01" />
          </div>
          <div className="bi-field">
            <label>AGC terkunci (lockedAgc)</label>
            <input className="bi-input" inputMode="decimal" value={f.lockedAgc} onChange={(e) => set('lockedAgc', e.target.value)} placeholder="cth: 245491" />
          </div>
          <div className="bi-field full">
            <label>Tx hash</label>
            <input className="bi-input" value={f.txHash} onChange={(e) => set('txHash', e.target.value)} placeholder="0x…" />
          </div>
          <div className="bi-field full">
            <label>Detail / catatan</label>
            <textarea className="bi-textarea" value={f.detail} onChange={(e) => set('detail', e.target.value)} placeholder="Catatan bebas tentang aktivitas ini" />
          </div>
        </div>
        {err != null && <div className="bi-form-err">{err}</div>}
        <div className="bi-form-actions">
          <button className="bi-btn ghost" onClick={onClose}>
            Batal
          </button>
          <button className="bi-btn" onClick={handleSave}>
            Simpan
          </button>
        </div>
        <div className="bi-form-note">
          Posisi terkunci: isi BNB/AGC terkunci hanya kalau posisinya masih jalan (status
          &lsquo;berjalan&rsquo;). Begitu status diubah jadi &lsquo;selesai&rsquo;, nilainya
          otomatis keluar dari kartu Aset Terkunci.
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [baseRangkuman, setBaseRangkuman] = useState<RangkumanItem[]>([]);
  const [overrides, setOverrides] = useState<GarapanOverrides>({ byId: {} });
  const [overReady, setOverReady] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RangkumanItem | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  /* Data yang dipakai semua total/chart/tabel = data bawaan + perubahan user. */
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
  const [nfts, setNfts] = useState<NftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'semua' | 'untung' | 'rugi' | 'berjalan'>('semua');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [liveErr, setLiveErr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [agcHist, setAgcHist] = useState<number[]>([]);
  const [agcHistTimes, setAgcHistTimes] = useState<number[]>([]);
  const [bnbHist, setBnbHist] = useState<number[]>([]);
  const [currency, setCurrency] = useState<'USD' | 'IDR'>(() => {
    try {
      return localStorage.getItem('cd_currency') === 'IDR' ? 'IDR' : 'USD';
    } catch {
      return 'USD';
    }
  });
  const [rate, setRate] = useState<number | null>(null);
  const [rateErr, setRateErr] = useState(false);

  /* ---------- data statis (riwayat) + perubahan user di localStorage ---------- */
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
          if (parsed && typeof parsed.byId === 'object' && parsed.byId !== null) {
            setOverrides(parsed);
          }
        }
      } catch {
        /* abaikan, pakai data bawaan */
      }
      setOverReady(true);
      setLoading(false);
    })();
  }, []);

  /* Simpan tiap perubahan ke localStorage (baru setelah muat awal selesai). */
  useEffect(() => {
    if (!overReady) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(overrides));
    } catch {
      /* penyimpanan penuh / privat — perubahan tetap berlaku sesi ini */
    }
  }, [overrides, overReady]);

  /* ---------- CRUD aktivitas (tambah / edit / hapus / reset) ---------- */
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

  /* ---------- harga dan saldo LIVE (60 detik) ---------- */
  const fetchLive = useCallback(async () => {
    try {
      const r = await fetch(`/api/live?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('live gagal');
      const d = (await r.json()) as LiveData;
      if (d.agcPriceUsd != null) {
        setAgcHist((h) => [...h, d.agcPriceUsd as number].slice(-30));
        setAgcHistTimes((h) => [...h, d.fetchedAt].slice(-30));
      }
      if (d.bnbPriceUsd != null) {
        setBnbHist((h) => [...h, d.bnbPriceUsd as number].slice(-30));
      }
      setLive(d);
      setLiveErr(false);
    } catch {
      setLiveErr(true);
    }
  }, []);

  /* ---------- kurs USD ke IDR LIVE (CoinGecko, fallback exchangerate-api) ---------- */
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
        const r2 = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
          cache: 'no-store',
        });
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

  /* IDR hanya aktif kalau kurs live tersedia; kalau tidak, tampil tetap USD. */
  const effCurrency = currency === 'IDR' && rate != null ? 'IDR' : 'USD';

  const agcPrice = live?.agcPriceUsd ?? null;
  const bnbPrice = live?.bnbPriceUsd ?? null;
  const bal = live?.balances ?? { bnb: null, agc: null, usdt: null };

  /* ---------- format nominal sesuai mata uang aktif ---------- */
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
        new Intl.NumberFormat('id-ID', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(vUsd * (rate ?? 0))
      : '$' + vUsd.toFixed(8);

  /* ---------- totals: pisah Tunai vs Deposit ---------- */
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
    rangkuman
      .filter((g) => g.kategori === 'Token Claim')
      .reduce((s, g) => s + g.modalUsd, 0);

  const tunaiMajor = rangkuman
    .filter((g) => g.modalJenis !== 'deposit')
    .reduce((s, g) => s + g.modalUsd, 0);
  const modalAwal = tunaiMajor + nftModal;
  const depositTotal = rangkuman
    .filter((g) => g.modalJenis === 'deposit')
    .reduce((s, g) => s + g.modalUsd, 0);

  /* ---------- KEUNTUNGAN LIVE ---------- */
  const untungReal = rangkuman
    .filter((g) => g.keuntunganJenis === 'terealisasi')
    .reduce((s, g) => s + (g.keuntunganUsd ?? 0), 0);
  /* Estimasi AGC = jumlah AGC dikali HARGA LIVE (bukan snapshot lama) */
  const agcEstAmount = rangkuman
    .filter((g) => g.keuntunganJenis === 'estimasi')
    .reduce((s, g) => s + (g.agcAmount ?? 0), 0);
  const untungEst = agcPrice != null ? agcEstAmount * agcPrice : null;
  const totalUntung = untungEst != null ? untungReal + untungEst : null;

  /* ---------- TOTAL ASET SAAT INI (live) ---------- */
  const bnbVal = bal.bnb != null && bnbPrice != null ? bal.bnb * bnbPrice : null;
  const agcVal = bal.agc != null && agcPrice != null ? bal.agc * agcPrice : null;
  const usdtVal = bal.usdt != null ? bal.usdt : null; /* USDT sekitar $1 */
  const totalAset =
    bnbVal != null || agcVal != null || usdtVal != null
      ? (bnbVal ?? 0) + (agcVal ?? 0) + (usdtVal ?? 0)
      : null;

  /* ---------- ASET TERKUNCI (live), HANYA posisi masih jalan ----------
     Data-driven: jumlahkan lockedBnb/lockedAgc dari entri berstatus 'berjalan'.
     Kalau sebuah posisi diubah jadi 'selesai' (lewat Edit), otomatis keluar. */
  const lockedEntries = rangkuman.filter(
    (g) => g.status === 'berjalan' && ((g.lockedBnb ?? 0) > 0 || (g.lockedAgc ?? 0) > 0)
  );
  const lockedBnbTotal = lockedEntries.reduce((s, g) => s + (g.lockedBnb ?? 0), 0);
  const lockedAgcTotal = lockedEntries.reduce((s, g) => s + (g.lockedAgc ?? 0), 0);
  const lockedBnbVal = bnbPrice != null ? lockedBnbTotal * bnbPrice : null;
  const lockedAgcVal = agcPrice != null ? lockedAgcTotal * agcPrice : null;
  const totalTerkunci =
    lockedBnbVal != null || lockedAgcVal != null ? (lockedBnbVal ?? 0) + (lockedAgcVal ?? 0) : null;

  /* Angka total menghitung naik/turun halus tiap harga live berubah. */
  const animAset = useAnimatedNumber(totalAset);
  const animTerkunci = useAnimatedNumber(totalTerkunci);
  const animUntung = useAnimatedNumber(totalUntung);

  if (loading) {
    return (
      <div className="bi-wrap">
        <div className="bi-loading">
          <span className="bi-spinner" /> MEMUAT RANGKUMAN…
        </div>
      </div>
    );
  }

  /* ---------- per kategori ---------- */
  const liveUntungOf = (g: RangkumanItem): number | null => {
    if (g.keuntunganJenis === 'terealisasi') return g.keuntunganUsd ?? 0;
    if (g.keuntunganJenis === 'estimasi' && g.agcAmount != null) {
      return agcPrice != null ? g.agcAmount * agcPrice : null;
    }
    return null;
  };
  const byCat = new Map<string, { modal: number; hasil: number; untung: number | null; count: number }>();
  const pushCat = (cat: string, modal: number, hasil: number | null, untung: number | null) => {
    const cur = byCat.get(cat) ?? { modal: 0, hasil: 0, untung: 0, count: 0 };
    cur.modal += modal;
    cur.hasil += hasil ?? 0;
    if (untung != null) cur.untung = (cur.untung ?? 0) + untung;
    cur.count += 1;
    byCat.set(cat, cur);
  };
  rangkuman.forEach((g) => pushCat(g.kategori, g.modalUsd, g.hasilUsd, liveUntungOf(g)));
  pushCat('Free NFT', nftModal, 0, null);
  const catRows: CatRow[] = [...byCat.entries()]
    .map(([cat, v]) => ({ cat, ...v }))
    .sort((a, b) => (b.untung ?? -1) - (a.untung ?? -1));

  /* ---------- semua baris ---------- */
  type Row = {
    id: string;
    nama: string;
    tanggal: string;
    kategori: string;
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
    isRangkuman?: boolean;
  };
  const allRows: Row[] = [
    ...rangkuman.map((g) => ({ ...g, isRangkuman: true })),
    ...nfts.map((g) => ({
      id: g.id,
      nama: g.nama,
      tanggal: g.tanggal,
      kategori: 'Free NFT',
      modalUsd: g.modalUsd,
      hasilUsd: g.terjual?.hargaUsd ?? g.hasilUsd ?? null,
      status: g.terjual ? 'untung' : 'berjalan',
      txHash: g.txHash,
      detail: g.catatan ?? 'Free mint, gas only.',
      modalDetail: 'Gas only',
      hasilDetail: g.terjual ? `Terjual ${money(g.terjual.hargaUsd)}` : 'Belum terjual, masih dipegang',
      jumlah: g.aset?.tokenId ? `NFT #${String(g.aset.tokenId).slice(0, 20)}` : undefined,
      modalJenis: 'tunai' as const,
    })),
  ].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.nama.localeCompare(b.nama));

  const liveUntungRow = (r: Row): number | null => {
    if (r.keuntunganJenis === 'terealisasi') return r.keuntunganUsd ?? 0;
    if (r.keuntunganJenis === 'estimasi' && r.agcAmount != null) {
      return agcPrice != null ? r.agcAmount * agcPrice : null;
    }
    return null;
  };

  /* ---------- cross-filter: klik kategori di chart = filter tabel ---------- */
  const selectCat = (cat: string) => setFilterCat((cur) => (cur === cat ? null : cat));
  const selectCell = (cat: string, status: string) => {
    setFilterCat(cat);
    /* Tab hanya punya semua/untung/rugi/berjalan; sel 'selesai' pakai 'semua'
       supaya semua baris kategori itu tetap terlihat. */
    if (status === 'untung' || status === 'rugi' || status === 'berjalan') {
      setTab(status);
    } else {
      setTab('semua');
    }
  };
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

  return (
    <div className="bi-wrap">
      {/* ===== UTIL BAR ===== */}
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Dashboard <b>Virtue</b>
          </h1>
          <div className="bi-sub">
            Garapan Monitor · BSC + Elysium · Wallet{' '}
            <a href={`https://bscscan.com/address/${BSC_WALLET}`} target="_blank" rel="noreferrer">
              0xC905…3903
            </a>
          </div>
        </div>
        <div className="bi-controls">
          <span className="bi-chip">
            <span className={`dot${liveErr ? ' err' : ''}`} />
            {live ? `Live · diperbarui ${fmtTime(live.fetchedAt)} WIB` : liveErr ? 'Harga live tidak tersedia' : 'Memuat harga…'}
          </span>
          <a className="bi-link" href={`https://bscscan.com/address/${BSC_WALLET}`} target="_blank" rel="noreferrer">
            BscScan
          </a>
          <a className="bi-link" href="/keuangan">
            Keuangan
          </a>
          <div className="bi-toggle" role="group" aria-label="Mata uang">
            <button className={effCurrency === 'USD' ? 'active' : ''} onClick={() => setCurrency('USD')}>
              USD
            </button>
            <button className={effCurrency === 'IDR' ? 'active' : ''} onClick={switchToIdr}>
              IDR
            </button>
          </div>
          {rate != null ? (
            <span className="bi-chip">1 USD = {fmtIDR(1)} (live)</span>
          ) : rateErr ? (
            <span className="bi-chip"><span className="dot err" />Kurs IDR tidak tersedia</span>
          ) : (
            <span className="bi-chip">Memuat kurs…</span>
          )}
          <button className="bi-btn" onClick={refreshLive} disabled={refreshing}>
            {refreshing ? 'Memuat…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ===== STRIP TOTAL: empat angka terpisah, tidak saling dijumlah ===== */}
      <div className="bi-totals">
        <div className="bi-total">
          <div className="bi-total-label">Modal awal</div>
          <div className="bi-total-value">{money2(modalAwal)}</div>
          <div className="bi-total-sub">
            Uang tunai yang keluar dari kantong. CENSUS {money2(censusModal)}, BNB Agent{' '}
            {money2(bnbAgentModal)}, gas {money2(gasModal)}.
          </div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Total aset saat ini</div>
          <div className="bi-total-value">{totalAset != null ? money2(animAset) : 'n/a'}</div>
          <div className="bi-total-sub">
            Saldo wallet × harga live. BNB {bnbVal != null ? money2(bnbVal) : 'n/a'} · AGC{' '}
            {agcVal != null ? money2(agcVal) : 'n/a'} · USDT {usdtVal != null ? money2(usdtVal) : 'n/a'}.
          </div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Aset terkunci</div>
          <div className="bi-total-value">{totalTerkunci != null ? money2(animTerkunci) : 'n/a'}</div>
          <div className="bi-total-sub">
            Hanya posisi yang masih jalan, nilai live.{' '}
            {lockedEntries.length > 0
              ? `${lockedEntries.length} posisi · ${Number(lockedBnbTotal.toFixed(4))} BNB + ${fmtNum(lockedAgcTotal)} AGC`
              : 'Tidak ada posisi terkunci.'}
          </div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Untung dan rugi</div>
          <div className="bi-total-value pos">{totalUntung != null ? `+${money2(animUntung)}` : 'n/a'}</div>
          <div className="bi-total-sub">
            Terealisasi (CENSUS) <b>+{money2(untungReal)}</b> · Estimasi (AGC, live){' '}
            <b>{untungEst != null ? `~${money2(untungEst)}` : 'n/a'}</b>
            {untungEst != null && <span className="bi-est-tag">~ masih estimasi</span>}
          </div>
        </div>
      </div>

      {/* ===== GRID 8 KARTU ===== */}
      <div className="bi-grid">
        <LeaderboardCard rows={catRows} filterCat={filterCat} onSelect={selectCat} money2={money2} />
        <HeatmapCard rows={allRows} cats={catRows} filterCat={filterCat} onSelectCell={selectCell} />
        <TreemapCard rows={catRows} filterCat={filterCat} onSelect={selectCat} money2={money2} />
        <ProfitBarCard rows={catRows} filterCat={filterCat} onSelect={selectCat} money2={money2} />
        <SunburstCard
          rows={allRows}
          cats={catRows}
          filterCat={filterCat}
          onSelect={selectCat}
          money2={money2}
        />
        <ComboCard rows={catRows} filterCat={filterCat} onSelect={selectCat} money2={money2} totalUntung={totalUntung} />
        <HasilModalCard rows={catRows} filterCat={filterCat} onSelect={selectCat} money2={money2} />
        <AgcAreaCard data={agcHist} times={agcHistTimes} price={agcPrice} fmtUnitPrice={fmtUnitPrice} />
      </div>

      {/* ===== TABEL AKTIVITAS (target cross-filter) ===== */}
      <div className="bi-history">
        <div className="bi-table-head">
          <div className="bi-section-title">History semua aktivitas, termasuk yang sudah selesai</div>
          <div className="bi-tabs">
            {(['semua', 'untung', 'rugi', 'berjalan'] as const).map((t) => (
              <button key={t} className={`bi-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'semua'
                  ? `Semua (${counts.semua})`
                  : `${t[0].toUpperCase() + t.slice(1)} (${counts[t]})`}
              </button>
            ))}
          </div>
        </div>
        <div className="bi-actions-row">
          <button className="bi-btn" onClick={openAdd}>
            ＋ Tambah Aktivitas
          </button>
          <button className="bi-btn ghost" onClick={handleResetClick}>
            {resetArmed ? 'Yakin reset? Klik lagi' : 'Reset data'}
          </button>
          <span className="bi-save-note">
            {overrideCount > 0
              ? `${overrideCount} perubahan tersimpan di browser ini (localStorage)`
              : 'Data bawaan · perubahan tersimpan di browser ini'}
          </span>
        </div>
        {filterCat != null && (
          <div className="bi-filterbar">
            <span className="bi-filter-chip">
              Filter: {filterCat}
              <button onClick={() => setFilterCat(null)} aria-label="Hapus filter kategori">×</button>
            </span>
            <button className="bi-btn ghost" onClick={resetFilter}>
              Reset filter
            </button>
            <span className="bi-card-note">
              {filtered.length} dari {allRows.length} aktivitas · klik kategori yang sama di chart untuk melepas filter.
            </span>
          </div>
        )}
        <div className="bi-table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Aktivitas</th>
                <th>Detail jumlah, modal, hasil, dan keuntungan</th>
                <th>Tanggal</th>
                <th className="num">Modal</th>
                <th className="num">Keuntungan</th>
                <th>Jenis</th>
                <th>Status</th>
                <th>Tx</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const b = STATUS_BADGE[r.status] ?? { label: r.status, cls: 'bi-badge' };
                const lu = liveUntungRow(r);
                return (
                  <tr key={r.id} className={filterCat != null ? 'hl' : ''}>
                    <td className="bi-addr">{i + 1}</td>
                    <td>
                      <div className="bi-act-name">{r.nama}</div>
                      <div className="bi-cat-tag">
                        <span className="bi-cat-sq" style={{ background: CAT_COLOR[r.kategori] ?? '#888' }} />
                        {r.kategori}
                      </div>
                    </td>
                    <td className="bi-detail">
                      {r.jumlah && (
                        <div className="bi-d-line">
                          <span className="bi-d-label">Jumlah</span> {r.jumlah}
                        </div>
                      )}
                      {r.modalDetail && (
                        <div className="bi-d-line">
                          <span className="bi-d-label">Modal</span> {r.modalDetail}
                        </div>
                      )}
                      {r.hasilDetail && (
                        <div className="bi-d-line">
                          <span className="bi-d-label">Hasil</span> {r.hasilDetail}
                        </div>
                      )}
                      {r.keuntunganDetail && (
                        <div className="bi-d-line">
                          <span className="bi-d-label">Untung</span> {r.keuntunganDetail}
                          {r.keuntunganJenis === 'estimasi' && (
                            <span className="bi-est-tag">estimasi live</span>
                          )}
                        </div>
                      )}
                      <div className="bi-d-note">{r.detail}</div>
                    </td>
                    <td className="bi-nowrap">{fmtDate(r.tanggal)}</td>
                    <td className="num">{money(r.modalUsd)}</td>
                    <td className={`num ${lu != null && lu > 0 ? 'bi-pos' : ''}`}>
                      {lu == null ? (
                        <span className="bi-addr">n/a</span>
                      ) : lu > 0 ? (
                        `+${money(lu)}${r.keuntunganJenis === 'estimasi' ? ' ~' : ''}`
                      ) : (
                        money(0)
                      )}
                    </td>
                    <td>
                      {r.modalJenis === 'deposit' ? (
                        <span className="bi-badge deposit">Deposit</span>
                      ) : (
                        <span className="bi-badge tunai">Tunai</span>
                      )}
                    </td>
                    <td>
                      <span className={b.cls}>{b.label}</span>
                    </td>
                    <td>
                      {r.txHash ? (
                        <a
                          className="bi-tx"
                          href={`https://bscscan.com/tx/${r.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.txHash.slice(0, 6)}…{r.txHash.slice(-4)}
                        </a>
                      ) : (
                        <span className="bi-addr">n/a</span>
                      )}
                    </td>
                    <td>
                      {r.isRangkuman ? (
                        <div className="bi-row-actions">
                          <button className="bi-mini-btn" onClick={() => openEdit(r.id)}>
                            Edit
                          </button>
                          <button
                            className={`bi-mini-btn danger${deleteArmedId === r.id ? ' armed' : ''}`}
                            onClick={() => handleDeleteClick(r.id)}
                          >
                            {deleteArmedId === r.id ? 'Yakin?' : 'Hapus'}
                          </button>
                        </div>
                      ) : (
                        <span className="bi-addr">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== SUMBER DATA ===== */}
      <div className="bi-sumber">
        <div className="bi-section-title">Sumber data dan cara hitung</div>
        <ol className="bi-sumber-list">
          <li>
            <b>Semua harga live, dan tidak ada harga yang di-hardcode.</b> Harga AGC diambil dari{' '}
            <b>DexScreener</b> (pair AGC/WBNB PancakeSwap), harga BNB dari <b>CoinGecko</b>.
            Diperbarui otomatis tiap 60 detik, plus tombol Refresh. Saldo wallet (BNB, AGC, USDT)
            dibaca on-chain lewat RPC BSC tiap refresh (mayoritas dari 5 RPC independen:
            publicnode, 1rpc, dan dataseed). Kalau API harga gagal, nilainya tampil n/a, bukan angka lama.
          </li>
          <li>
            <b>Strip total di atas terpisah penuh dan tidak saling dijumlah.</b> Total Aset Saat Ini
            adalah saldo wallet saja. Aset Terkunci adalah posisi yang masih jalan saja. Untung Total
            adalah terealisasi {money2(untungReal)} (CENSUS, uang sudah di tangan) ditambah estimasi live
            {untungEst != null ? ` ~${money2(untungEst)}` : ' n/a'} (AGC dikali harga live saat ini).
            Modal Awal {money2(modalAwal)} tampil sendiri, tidak dicampur ke PnL.
          </li>
          <li>
            <b>Total Aset Saat Ini</b> adalah saldo wallet (BNB, AGC, USDT) dikali harga live. AGC yang
            dihitung adalah saldo AGC di wallet saat ini (dari RPC, bukan angka tetap), termasuk
            1.890.000 AGC hasil claim Plan A #1, #2, dan #3.
          </li>
          <li>
            <b>Aset Terkunci, hanya posisi yang masih jalan.</b> Dihitung dari data aktivitas:
            entri dengan status &lsquo;berjalan&rsquo; yang punya BNB/AGC terkunci
            (lockedBnb/lockedAgc).{' '}
            {lockedEntries.length > 0 ? (
              <>
                Saat ini:{' '}
                {lockedEntries
                  .map(
                    (g) =>
                      `${g.nama} (${[
                        g.lockedBnb ? `${g.lockedBnb} BNB` : '',
                        g.lockedAgc ? `${fmtNum(g.lockedAgc)} AGC` : '',
                      ]
                        .filter(Boolean)
                        .join(' + ')})`
                  )
                  .join(', ')}
                .
              </>
            ) : (
              'Saat ini tidak ada posisi terkunci.'
            )}{' '}
            Nilai USD adalah BNB terkunci dikali harga BNB live ditambah AGC terkunci dikali harga
            AGC live. Kalau sebuah posisi diubah jadi &lsquo;selesai&rsquo; (lewat tombol Edit di
            tabel), nilainya otomatis keluar dari kartu ini. <b>Plan A #1, #2, dan #3 sudah
            di-claim semua, jadi tidak ada di kartu ini sama sekali.</b>{' '} Mereka hanya muncul
            di tabel History di bawah, dan nilainya sudah menyatu ke Total Aset (AGC di wallet) dan
            Total Keuntungan.
          </li>
          <li>
            <b>Keuntungan estimasi (AGC) memakai harga live, bukan snapshot lama.</b> Tiap AGC
            dinilai ulang tiap refresh. Label estimasi dan tanda ~ berarti nilainya baru jadi uang
            saat AGC terjual. Reward Plan B yang sedang berjalan belum dinilai karena belum ada angka pastinya.
          </li>
          <li>
            <b>AGC Plan A dan B tidak dihitung sebagai modal, karena itu deposit, bukan biaya.</b> BNB
            Plan A kembali penuh setelah 24 jam (refund), BNB Plan B terkunci di LP 14 hari lalu kembali
            saat withdraw LP. Catatan: total deposit AGC yang pernah dibayar (termasuk #1 dan #2
            yang sudah kembali) adalah {money2(depositTotal)}. Angka ini hanya arsip, bukan aset
            yang masih terkunci.
          </li>
          <li>
            <b>{nftCount} entri Free NFT</b> berasal dari <b>riwayat transaksi wallet on-chain</b>{' '}
            (<code>baw wallet tx-history</code> di BSC). Setiap mint terverifikasi lewat receipt
            transaksi dan gas aktual yang dibayar.
          </li>
          <li>
            <b>Aktivitas besar (AGC, CENSUS, BNB Agent, klaim token)</b> masing-masing sudah{' '}
            <b>diverifikasi on-chain saat eksekusi</b> (status receipt dan cek saldo atau Transfer event),
            lalu dirangkum dari catatan percakapan. Jumlah BNB, USDT, dan token di kolom Detail adalah
            angka asli dari transaksi tersebut.
          </li>
          <li>
            <b>Tombol USD/IDR</b> mengubah semua nominal di halaman, dan pilihan tersimpan di
            browser. Kurs USD ke IDR diambil live dari <b>CoinGecko</b> (USDT/IDR) dengan fallback
            ke <b>exchangerate-api</b>, diperbarui tiap 60 detik bersama harga live. Kalau kurs
            gagal dimuat, tombol IDR tidak mengubah apa pun dan nominal tetap dalam USD, tidak ada
            kurs karangan.
          </li>
          <li>
            <b>Cross-filter:</b> klik kategori, bar, sel heatmap, kotak treemap, atau irisan sunburst
            untuk memfilter tabel History ke kategori itu (klik lagi untuk melepas). Sel heatmap juga
            mengatur tab status. Angka di kartu tidak berubah saat filter aktif — hanya kategori yang
            dipilih tetap terang, yang lain meredup.
          </li>
          <li>
            <b>Data bisa diubah dari halaman ini.</b> Tombol <b>Tambah Aktivitas</b> di atas tabel
            untuk entri baru, tombol <b>Edit</b>/<b>Hapus</b> di tiap baris untuk mengubah atau
            menghapus aktivitas. Perubahan tersimpan di <b>browser ini</b> (localStorage, kunci{' '}
            <code>virtue_garapan_v1</code>) dan menimpa data bawaan — file data tidak diubah. Tombol{' '}
            <b>Reset data</b> menghapus semua perubahan dan mengembalikan data bawaan. Karena
            tersimpan di browser, perubahan di satu perangkat tidak otomatis muncul di perangkat
            lain (misalnya HP).
          </li>
        </ol>
      </div>

      <div className="bi-foot">
        DASHBOARD VIRTUE // GARAPAN MONITOR. Harga live dari DexScreener dan CoinGecko, kurs USD/IDR live. Wallet 0xC905…3903. BSC + Elysium.
      </div>

      {formOpen && (
        <GarapanFormModal
          key={editingItem ? editingItem.id : 'new'}
          initial={editingItem}
          categories={allCategories}
          types={allTypes}
          onSave={saveEntry}
          onClose={() => {
            setFormOpen(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}
