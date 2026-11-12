'use client';

/* Tab Laporan — laporan P/L (modal, hasil, untung per kategori + total) dan
   unduh CSV dari seluruh history. CSV dibuat di browser dari data yang sama
   dengan Overview. */

import { useGarapan, CAT_COLOR, fmtDate } from '@/lib/garapan-data';

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function LaporanPage() {
  const g = useGarapan();
  const t = g.totals;

  if (g.loading) {
    return (
      <div className="bi-wrap">
        <div className="bi-loading">
          <span className="bi-spinner" /> MEMUAT LAPORAN…
        </div>
      </div>
    );
  }

  const downloadCsv = () => {
    const header = ['#', 'Nama', 'Kategori', 'Tipe', 'Tanggal', 'Modal USD', 'Hasil USD', 'Keuntungan USD', 'Jenis Keuntungan', 'Status', 'Tx Hash', 'Detail'];
    const lines = [header.map(csvCell).join(',')];
    g.allRows.forEach((r, i) => {
      const lu = g.liveUntungRow(r);
      lines.push(
        [
          i + 1,
          r.nama,
          r.kategori,
          r.tipe,
          r.tanggal,
          r.modalUsd,
          r.hasilUsd,
          lu,
          r.keuntunganJenis ?? '',
          r.status,
          r.txHash ?? '',
          r.detail,
        ]
          .map(csvCell)
          .join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `garapan-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const totalModal = g.allRows.reduce((s, r) => s + r.modalUsd, 0);
  const totalHasil = g.allRows.reduce((s, r) => s + (r.hasilUsd ?? 0), 0);

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Laporan <b>untung / rugi</b>
          </h1>
          <div className="bi-sub">
            {g.allRows.length} aktivitas · harga AGC live{' '}
            {t.agcPrice != null ? g.fmtUnitPrice(t.agcPrice) : 'n/a'} · estimasi AGC ditandai ~
          </div>
        </div>
        <div className="bi-controls">
          <button className="bi-btn" onClick={downloadCsv}>
            ⬇ Unduh CSV ({g.allRows.length} baris)
          </button>
        </div>
      </div>

      <div className="bi-totals">
        <div className="bi-total">
          <div className="bi-total-label">Modal awal (tunai)</div>
          <div className="bi-total-value">{g.money2(t.modalAwal)}</div>
          <div className="bi-total-sub">
            Uang tunai yang keluar. Deposit {g.money2(t.depositTotal)} tidak dihitung sebagai modal.
          </div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Total hasil tercatat</div>
          <div className="bi-total-value">{g.money2(totalHasil)}</div>
          <div className="bi-total-sub">Jumlah kolom hasil semua aktivitas ({g.money2(totalModal)} modal tercatat di tabel).</div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Untung terealisasi</div>
          <div className="bi-total-value pos">+{g.money2(t.untungReal)}</div>
          <div className="bi-total-sub">CENSUS — uang sudah di tangan.</div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Untung total (real + estimasi)</div>
          <div className="bi-total-value pos">
            {t.totalUntung != null ? `+${g.money2(t.totalUntung)}` : 'n/a'}
          </div>
          <div className="bi-total-sub">
            Estimasi AGC ~{t.untungEst != null ? g.money2(t.untungEst) : 'n/a'} (live, baru jadi uang saat terjual).
          </div>
        </div>
      </div>

      <div className="bi-history">
        <div className="bi-section-title">P/L per kategori</div>
        <div className="bi-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kategori</th>
                <th className="num">Aktivitas</th>
                <th className="num">Modal</th>
                <th className="num">Hasil</th>
                <th className="num">Untung</th>
              </tr>
            </thead>
            <tbody>
              {g.catRows.map((c) => (
                <tr key={c.cat}>
                  <td>
                    <div className="bi-act-name">
                      <span className="bi-cat-sq" style={{ background: CAT_COLOR[c.cat] ?? '#888' }} />{' '}
                      {c.cat}
                    </div>
                  </td>
                  <td className="num">{c.count}</td>
                  <td className="num">{g.money2(c.modal)}</td>
                  <td className="num">{c.hasil > 0 ? g.money2(c.hasil) : 'n/a'}</td>
                  <td className={`num ${c.untung != null && c.untung > 0 ? 'bi-pos' : ''}`}>
                    {c.untung == null ? 'n/a' : c.untung > 0 ? `+${g.money2(c.untung)}` : g.money2(c.untung)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bi-history">
        <div className="bi-section-title">Ringkasan posisi terkunci</div>
        <div className="bi-card-sub">
          {t.lockedEntries.length > 0
            ? `${t.lockedEntries.length} posisi masih jalan senilai ${t.totalTerkunci != null ? g.money2(t.totalTerkunci) : 'n/a'} (live). Nilai ini TIDAK masuk untung — BNB kembali hanya lewat withdraw LP setelah lock berakhir.`
            : 'Tidak ada posisi terkunci saat ini.'}
        </div>
        {t.lockedEntries.map((e) => (
          <div key={e.id} className="bi-d-line" style={{ padding: '6px 0' }}>
            <span className="bi-d-label" style={{ minWidth: 92 }}>{fmtDate(e.tanggal)}</span>
            <span style={{ flex: 1 }}>{e.nama}</span>
            <span className="bi-addr">
              {e.lockedBnb ? `${e.lockedBnb} BNB` : ''}
              {e.lockedBnb && e.lockedAgc ? ' + ' : ''}
              {e.lockedAgc ? `${new Intl.NumberFormat('id-ID').format(e.lockedAgc)} AGC` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="bi-foot">
        CSV berisi seluruh history (rangkuman + Free NFT) dengan keuntungan live saat unduh.
        Keuntungan estimasi AGC memakai harga live — nilainya berubah tiap refresh.
      </div>
    </div>
  );
}
