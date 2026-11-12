'use client';

/* Tab Garapan — semua posisi/aktivitas: tabel history + tambah/edit/hapus/reset.
   Data & CRUD sama dengan Overview (lib/garapan-data + HistoryTable). */

import { useGarapan } from '@/lib/garapan-data';
import HistoryTable from '@/app/components/HistoryTable';

export default function GarapanPage() {
  const g = useGarapan();

  if (g.loading) {
    return (
      <div className="bi-wrap">
        <div className="bi-loading">
          <span className="bi-spinner" /> MEMUAT GARAPAN…
        </div>
      </div>
    );
  }

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Garapan <b>semua aktivitas</b>
          </h1>
          <div className="bi-sub">
            {g.allRows.length} aktivitas · {g.nfts.length} Free NFT · modal awal{' '}
            {g.money2(g.totals.modalAwal)} · untung{' '}
            {g.totals.totalUntung != null ? `+${g.money2(g.totals.totalUntung)}` : 'n/a'}
          </div>
        </div>
        <div className="bi-controls">
          <span className="bi-chip">
            <span className={`dot${g.liveErr ? ' err' : ''}`} />
            {g.live ? `Live · diperbarui ${g.live ? new Date(g.live.fetchedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''} WIB` : g.liveErr ? 'Harga live tidak tersedia' : 'Memuat harga…'}
          </span>
          <button className="bi-btn" onClick={g.refreshLive} disabled={g.refreshing}>
            {g.refreshing ? 'Memuat…' : 'Refresh'}
          </button>
        </div>
      </div>
      <HistoryTable g={g} />
      <div className="bi-foot">
        Data tersimpan di browser ini (localStorage, kunci virtue_garapan_v1). Perubahan di satu
        perangkat tidak otomatis muncul di perangkat lain.
      </div>
    </div>
  );
}
