'use client';

/* Tab Proyek — kartu per proyek (kategori): total modal, hasil, untung live,
   jumlah aktivitas, dan daftar entrinya. Dikelompokkan dari data rangkuman. */

import { useGarapan, CAT_COLOR, STATUS_BADGE, fmtDate, fmtNum } from '@/lib/garapan-data';

export default function ProyekPage() {
  const g = useGarapan();

  if (g.loading) {
    return (
      <div className="bi-wrap">
        <div className="bi-loading">
          <span className="bi-spinner" /> MEMUAT PROYEK…
        </div>
      </div>
    );
  }

  const byCat = new Map<string, typeof g.rangkuman>();
  for (const item of g.rangkuman) {
    const arr = byCat.get(item.kategori) ?? [];
    arr.push(item);
    byCat.set(item.kategori, arr);
  }
  const cats = g.catRows.filter((c) => c.cat !== 'Free NFT');

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Proyek <b>per kategori</b>
          </h1>
          <div className="bi-sub">
            {cats.length} proyek · untung dihitung live (AGC ikut harga saat ini, estimasi
            ditandai ~)
          </div>
        </div>
        <div className="bi-controls">
          <button className="bi-btn" onClick={g.refreshLive} disabled={g.refreshing}>
            {g.refreshing ? 'Memuat…' : 'Refresh harga'}
          </button>
        </div>
      </div>

      <div className="bi-grid cols-2">
        {cats.map((c) => {
          const items = [...(byCat.get(c.cat) ?? [])].sort((a, b) =>
            b.tanggal.localeCompare(a.tanggal)
          );
          const berjalan = items.filter((i) => i.status === 'berjalan').length;
          return (
            <div className="bi-card" key={c.cat}>
              <div className="bi-card-title">
                <span className="bi-cat-sq" style={{ background: CAT_COLOR[c.cat] ?? '#888' }} />{' '}
                {c.cat}
              </div>
              <div className="bi-card-sub">
                {c.count} aktivitas · {berjalan} masih berjalan
              </div>
              <div className="bi-lb-list" style={{ marginTop: 10 }}>
                <div className="bi-lb-row" style={{ cursor: 'default' }}>
                  <div className="bi-lb-head">
                    <span className="nm">Modal</span>
                    <span>{g.money2(c.modal)}</span>
                  </div>
                </div>
                <div className="bi-lb-row" style={{ cursor: 'default' }}>
                  <div className="bi-lb-head">
                    <span className="nm">Hasil</span>
                    <span>{c.hasil > 0 ? g.money2(c.hasil) : 'n/a'}</span>
                  </div>
                </div>
                <div className="bi-lb-row" style={{ cursor: 'default' }}>
                  <div className="bi-lb-head">
                    <span className="nm">Untung</span>
                    <span className={c.untung != null && c.untung > 0 ? 'bi-pos' : ''}>
                      {c.untung == null
                        ? 'n/a'
                        : c.untung > 0
                          ? `+${g.money2(c.untung)}${items.some((i) => i.keuntunganJenis === 'estimasi') ? ' ~' : ''}`
                          : g.money2(c.untung)}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                {items.map((it) => {
                  const b = STATUS_BADGE[it.status] ?? { label: it.status, cls: 'bi-badge' };
                  const lu = g.liveUntungOf(it);
                  return (
                    <div key={it.id} className="bi-d-line" style={{ padding: '6px 0', borderTop: '1px solid var(--color-rule)' }}>
                      <span className="bi-d-label" style={{ minWidth: 92 }}>{fmtDate(it.tanggal)}</span>
                      <span style={{ flex: 1 }}>
                        {it.nama}
                        <span className="bi-d-note"> — {it.detail}</span>
                      </span>
                      <span className={b.cls}>{b.label}</span>
                      <span className="bi-addr">
                        {lu == null ? '' : lu > 0 ? `+${g.money(lu)}` : g.money(0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="bi-card">
          <div className="bi-card-title">
            <span className="bi-cat-sq" style={{ background: CAT_COLOR['Free NFT'] ?? '#888' }} />{' '}
            Free NFT
          </div>
          <div className="bi-card-sub">
            {g.totals.nftCount} NFT dari riwayat on-chain · total gas{' '}
            {g.money2(g.totals.nftModal)}
          </div>
          <div className="bi-card-sub" style={{ marginTop: 10 }}>
            Daftar lengkap ada di tab <a href="/aset">Aset</a> dan{' '}
            <a href="/garapan">Garapan</a>. NFT belum terjual nilainya n/a — tidak ada sumber
            floor price gratis untuk koleksi-koleksi ini.
          </div>
          <div className="bi-lb-list" style={{ marginTop: 10 }}>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">Dipegang</span>
                <span>{g.nfts.filter((n) => !n.terjual).length}</span>
              </div>
            </div>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">Terjual</span>
                <span>{g.nfts.filter((n) => n.terjual).length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bi-foot">
        Angka untung AGC memakai harga live dan berubah tiap refresh. &lsquo;~&rsquo; = estimasi,
        baru jadi uang saat AGC terjual. {fmtNum(g.totals.agcEstAmount)} AGC sedang diestimasi.
      </div>
    </div>
  );
}
