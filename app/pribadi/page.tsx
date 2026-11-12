'use client';

/* Tab Pribadi — monitoring diri sendiri: ringkasan garapan + ringkasan keuangan
   (dari /keuangan, localStorage virtue_keuangan_v1) + pengingat/tugas.
   Angka garapan & keuangan dibaca dari data yang sudah ada; pengingat adalah
   status faktual yang sudah diketahui (bukan data baru yang dikarang). */

import { useEffect, useState } from 'react';
import { useGarapan, fmtNum } from '@/lib/garapan-data';

type KeuanganStore = {
  ledger: { id: string; tanggal: string; tipe: 'masuk' | 'keluar'; kategori: string; keterangan: string; jumlahIdr: number | null }[];
  assets: { id: string; nama: string; jenis: string; jumlah: number | null; satuan: string; nilaiIdr: number | null }[];
  seededAt: number;
};

const fmtRp = (v: number | null | undefined) =>
  v == null
    ? '—'
    : 'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v);

export default function PribadiPage() {
  const g = useGarapan();
  const [keu, setKeu] = useState<KeuanganStore | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('virtue_keuangan_v1');
      if (raw) setKeu(JSON.parse(raw) as KeuanganStore);
    } catch {
      /* abaikan */
    }
  }, []);

  const totalMasuk = keu?.ledger.filter((e) => e.tipe === 'masuk').reduce((s, e) => s + (e.jumlahIdr ?? 0), 0) ?? null;
  const totalKeluar = keu?.ledger.filter((e) => e.tipe === 'keluar').reduce((s, e) => s + (e.jumlahIdr ?? 0), 0) ?? null;
  const saldoKeu = totalMasuk != null && totalKeluar != null ? totalMasuk - totalKeluar : null;

  const berjalan = g.allRows.filter((r) => r.status === 'berjalan').length;
  const selesai = g.allRows.filter((r) => r.status === 'selesai' || r.status === 'untung').length;

  // Plan B unlock: posisi terkunci dibuat ~5 Nov 2026, lock 14 hari -> ~19 Nov 2026.
  const unlockDate = new Date(2026, 10, 19);
  const daysLeft = Math.max(
    0,
    Math.ceil((unlockDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  if (g.loading) {
    return (
      <div className="bi-wrap">
        <div className="bi-loading">
          <span className="bi-spinner" /> MEMUAT PRIBADI…
        </div>
      </div>
    );
  }

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Pribadi <b>monitoring pribadi</b>
          </h1>
          <div className="bi-sub">Ringkasan garapan, keuangan, dan pengingat — semua dari data yang sudah ada.</div>
        </div>
      </div>

      <div className="bi-totals">
        <div className="bi-total">
          <div className="bi-total-label">Total aset saat ini</div>
          <div className="bi-total-value">{g.totals.totalAset != null ? g.money2(g.totals.totalAset) : 'n/a'}</div>
          <div className="bi-total-sub">Wallet BSC × harga live.</div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Untung / rugi</div>
          <div className="bi-total-value pos">
            {g.totals.totalUntung != null ? `+${g.money2(g.totals.totalUntung)}` : 'n/a'}
          </div>
          <div className="bi-total-sub">
            Terealisasi +{g.money2(g.totals.untungReal)} · estimasi AGC{' '}
            {g.totals.untungEst != null ? `~${g.money2(g.totals.untungEst)}` : 'n/a'}
          </div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Aktivitas</div>
          <div className="bi-total-value">{g.allRows.length}</div>
          <div className="bi-total-sub">
            {berjalan} berjalan · {selesai} selesai/untung · {g.totals.nftCount} NFT.
          </div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Aset terkunci</div>
          <div className="bi-total-value">{g.totals.totalTerkunci != null ? g.money2(g.totals.totalTerkunci) : 'n/a'}</div>
          <div className="bi-total-sub">
            {g.totals.lockedEntries.length > 0
              ? `${g.totals.lockedEntries.length} posisi Plan B · buka ~19 Nov 2026 (${daysLeft} hari lagi)`
              : 'Tidak ada posisi terkunci.'}
          </div>
        </div>
      </div>

      <div className="bi-grid cols-2">
        <div className="bi-card">
          <div className="bi-card-title">Keuangan (dari /keuangan)</div>
          <div className="bi-card-sub">Ringkasan catatan pemasukan &amp; pengeluaran di browser ini.</div>
          {keu == null ? (
            <div className="bi-card-sub" style={{ marginTop: 10 }}>
              Belum ada data keuangan di browser ini. Buka{' '}
              <a href="/keuangan">Keuangan</a> untuk mengisi.
            </div>
          ) : (
            <div className="bi-lb-list" style={{ marginTop: 10 }}>
              <div className="bi-lb-row" style={{ cursor: 'default' }}>
                <div className="bi-lb-head">
                  <span className="nm">Pemasukan</span>
                  <span>{fmtRp(totalMasuk)}</span>
                </div>
              </div>
              <div className="bi-lb-row" style={{ cursor: 'default' }}>
                <div className="bi-lb-head">
                  <span className="nm">Pengeluaran</span>
                  <span>{fmtRp(totalKeluar)}</span>
                </div>
              </div>
              <div className="bi-lb-row" style={{ cursor: 'default' }}>
                <div className="bi-lb-head">
                  <span className="nm">Saldo (masuk − keluar)</span>
                  <span className={saldoKeu != null && saldoKeu >= 0 ? 'bi-pos' : ''}>{fmtRp(saldoKeu)}</span>
                </div>
              </div>
              <div className="bi-lb-row" style={{ cursor: 'default' }}>
                <div className="bi-lb-head">
                  <span className="nm">Entri tercatat</span>
                  <span>{keu.ledger.length} · {keu.assets.length} aset</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <a className="bi-btn" href="/keuangan" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Buka Keuangan →
            </a>
          </div>
        </div>

        <div className="bi-card">
          <div className="bi-card-title">Pengingat &amp; tugas</div>
          <div className="bi-card-sub">Status terakhir yang diketahui — bukan janji, cek lagi sebelum bertindak.</div>
          <div className="bi-lb-list" style={{ marginTop: 10 }}>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">BAGENT — klaim harian</span>
                <span className="bi-badge bad">Terkunci</span>
              </div>
              <div className="bi-d-note">
                Mining butuh 5 paid shares (~53 USDT). Auto-claim jalan tiap 07:00 WIB tapi selalu
                gagal di gate. Jangan beli tanpa konfirmasi.
              </div>
            </div>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">BNB Agent — reward ~3,77 USDT</span>
                <span className="bi-badge">Menunggu pool</span>
              </div>
              <div className="bi-d-note">
                Pool reward hampir kosong (terakhir dicek ~0,003 USDT). Ada watch tiap 30 menit;
                klaim kalau pool terisi.
              </div>
            </div>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">Plan B — unlock LP ~19 Nov 2026</span>
                <span className="bi-badge">{daysLeft > 0 ? `${daysLeft} hari lagi` : 'Sudah lewat'}</span>
              </div>
              <div className="bi-d-note">
                {g.totals.lockedEntries.length > 0
                  ? `${g.totals.lockedEntries.length} posisi: ${fmtNum(g.totals.lockedBnbTotal)} BNB + ${fmtNum(g.totals.lockedAgcTotal)} AGC terkunci. BNB kembali hanya lewat withdraw LP setelah lock berakhir.`
                  : 'Tidak ada posisi terkunci saat ini.'}
              </div>
            </div>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">AGIO — klaim free share</span>
                <span className="bi-badge bad">Backend mati</span>
              </div>
              <div className="bi-d-note">
                Misi X sudah selesai; claim tertahan karena API signature agio.family mati. Coba
                lagi saat traffic sepi.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bi-foot">
        Ringkasan ini membaca data yang sama dengan Overview dan Keuangan — tidak ada data pribadi
        baru yang dibuat di halaman ini.
      </div>
    </div>
  );
}
