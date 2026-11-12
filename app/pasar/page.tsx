'use client';

/* Tab Pasar — harga pangan Indonesia (BPN via data.go.id) + kurs USD/IDR +
   harga emas. Semua dari /api/pangan; kalau sumber mati, tampil "—", bukan
   angka karangan. */

import { useEffect, useMemo, useState } from 'react';

type PanganItem = { nama: string; harga: number; satuan: string; perubahanPct: number | null };
type PanganData = {
  ok: boolean;
  source: { name: string; dataset: string; datasetId: string; datasetUrl: string; level: string };
  items: PanganItem[];
  usdIdr: number | null;
  emas: { hargaUsdPerOz: number | null; hargaIdrPerGram: number | null; sumber: string };
  fetchedAt: number;
  error: string | null;
};

const fmtRp = (v: number) =>
  'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat('id-ID').format(v);

export default function PasarPage() {
  const [data, setData] = useState<PanganData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'nama' | 'harga' | 'naik'>('nama');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/pangan', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as PanganData;
        if (alive) setData(d);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat harga pangan.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    let list = data.items.filter((i) => !query || i.nama.toLowerCase().includes(query));
    if (sort === 'nama') list = [...list].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    if (sort === 'harga') list = [...list].sort((a, b) => b.harga - a.harga);
    if (sort === 'naik')
      list = [...list].sort((a, b) => (b.perubahanPct ?? -Infinity) - (a.perubahanPct ?? -Infinity));
    return list;
  }, [data, q, sort]);

  const naik = data?.items.filter((i) => (i.perubahanPct ?? 0) > 0.05).length ?? 0;
  const turun = data?.items.filter((i) => (i.perubahanPct ?? 0) < -0.05).length ?? 0;

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Pasar <b>harga pangan Indonesia</b>
          </h1>
          <div className="bi-sub">
            Ayam, sayur, beras, telur, dan komoditas lain — dari Badan Pangan Nasional.
            {data && (
              <>
                {' '}
                · diperbarui {new Date(data.fetchedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} WIB
              </>
            )}
          </div>
        </div>
      </div>

      {!data && !err && (
        <div className="bi-loading">
          <span className="bi-spinner" /> MEMUAT HARGA PANGAN…
        </div>
      )}
      {err && !data && (
        <div className="bi-card">
          <div className="bi-card-title">Harga pangan tidak bisa dimuat</div>
          <div className="bi-card-sub">{err}</div>
        </div>
      )}

      {data && (
        <>
          <div className="bi-totals">
            <div className="bi-total">
              <div className="bi-total-label">Kurs USD → IDR</div>
              <div className="bi-total-value">{data.usdIdr != null ? fmtRp(data.usdIdr) : '—'}</div>
              <div className="bi-total-sub">Live (exchangerate-api / CoinGecko).</div>
            </div>
            <div className="bi-total">
              <div className="bi-total-label">Emas (per gram, IDR)</div>
              <div className="bi-total-value">
                {data.emas.hargaIdrPerGram != null ? fmtRp(data.emas.hargaIdrPerGram) : '—'}
              </div>
              <div className="bi-total-sub">{data.emas.sumber}</div>
            </div>
            <div className="bi-total">
              <div className="bi-total-label">Emas (per troy ounce, USD)</div>
              <div className="bi-total-value">
                {data.emas.hargaUsdPerOz != null ? `$${fmtNum(Math.round(data.emas.hargaUsdPerOz))}` : '—'}
              </div>
              <div className="bi-total-sub">Proxy PAXG (CoinGecko), ≈ harga spot.</div>
            </div>
            <div className="bi-total">
              <div className="bi-total-label">Komoditas</div>
              <div className="bi-total-value">{data.items.length}</div>
              <div className="bi-total-sub">
                {naik} naik · {turun} turun (vs periode sebelumnya).
              </div>
            </div>
          </div>

          <div className="bi-card">
            <div className="bi-card-title">Sumber data</div>
            <div className="bi-card-sub">
              {data.source.name} · {data.source.level}
            </div>
            <div className="bi-card-sub">
              Dataset:{' '}
              <a href={data.source.datasetUrl} target="_blank" rel="noreferrer">
                {data.source.dataset}
              </a>
            </div>
            {data.error && (
              <div className="bi-form-err" style={{ marginTop: 8 }}>
                Sumber pangan bermasalah: {data.error} — harga di bawah tidak ditampilkan karena
                tidak ada data yang bisa dipercaya.
              </div>
            )}
            {!data.error && (
              <div className="bi-card-sub" style={{ marginTop: 8 }}>
                <b>Catatan:</b> ini rata-rata <b>bulanan</b> tingkat konsumen nasional — bukan
                harga harian per pasar. Tidak ada API JSON publik gratis untuk harga harian PIHPS
                (hargapangan.id tidak bisa diakses, halaman BI hanya memuat harga lewat JS, Panel
                Harga Bapanas tidak bisa di-resolve). Daftar di bawah adalah SELURUH komoditas
                dari dataset BPN, jadi komoditas baru muncul otomatis saat BPN memperbarui data.
              </div>
            )}
          </div>

          {data.items.length > 0 && (
            <div className="bi-history">
              <div className="bi-table-head">
                <div className="bi-section-title">Daftar harga pangan ({items.length})</div>
                <div className="bi-controls">
                  <input
                    className="bi-input"
                    style={{ minWidth: 200 }}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari komoditas… (cth: ayam)"
                  />
                  <select className="bi-select" value={sort} onChange={(e) => setSort(e.target.value as 'nama' | 'harga' | 'naik')}>
                    <option value="nama">Urut: nama</option>
                    <option value="harga">Urut: harga tertinggi</option>
                    <option value="naik">Urut: kenaikan terbesar</option>
                  </select>
                </div>
              </div>
              <div className="bi-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Komoditas</th>
                      <th>Satuan</th>
                      <th className="num">Harga (Rp)</th>
                      <th className="num">Perubahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.nama}>
                        <td>
                          <div className="bi-act-name">{i.nama}</div>
                        </td>
                        <td className="bi-addr">{i.satuan}</td>
                        <td className="num">{fmtRp(i.harga)}</td>
                        <td className={`num ${i.perubahanPct != null && i.perubahanPct > 0 ? 'bi-pos' : ''}`}>
                          {i.perubahanPct == null
                            ? '—'
                            : `${i.perubahanPct > 0 ? '+' : ''}${i.perubahanPct.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="bi-addr">
                          Tidak ada komoditas yang cocok dengan &ldquo;{q}&rdquo;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="bi-foot">
        Harga pangan: Badan Pangan Nasional (data.go.id). Kurs: exchangerate-api / CoinGecko.
        Emas: CoinGecko PAXG (proxy spot). Bukan harga pasar harian per daerah.
      </div>
    </div>
  );
}
