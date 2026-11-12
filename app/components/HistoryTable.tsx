'use client';

/* Tabel history aktivitas — dipakai /garapan (dan bisa dipakai tab lain).
   Markup & perilaku sama dengan tabel di Overview. */

import type { GarapanData } from '@/lib/garapan-data';
import { CAT_COLOR, STATUS_BADGE, fmtDate } from '@/lib/garapan-data';
import GarapanFormModal from './GarapanForm';

export default function HistoryTable({ g }: { g: GarapanData }) {
  const { money, liveUntungRow } = g;
  return (
    <div className="bi-history">
      <div className="bi-table-head">
        <div className="bi-section-title">History semua aktivitas, termasuk yang sudah selesai</div>
        <div className="bi-tabs">
          {(['semua', 'untung', 'rugi', 'berjalan'] as const).map((t) => (
            <button key={t} className={`bi-tab ${g.tab === t ? 'active' : ''}`} onClick={() => g.setTab(t)}>
              {t === 'semua'
                ? `Semua (${g.counts.semua})`
                : `${t[0].toUpperCase() + t.slice(1)} (${g.counts[t]})`}
            </button>
          ))}
        </div>
      </div>
      <div className="bi-actions-row">
        <button className="bi-btn" onClick={g.openAdd}>
          ＋ Tambah Aktivitas
        </button>
        <button className="bi-btn ghost" onClick={g.handleResetClick}>
          {g.resetArmed ? 'Yakin reset? Klik lagi' : 'Reset data'}
        </button>
        <span className="bi-save-note">
          {g.overrideCount > 0
            ? `${g.overrideCount} perubahan tersimpan di browser ini (localStorage)`
            : 'Data bawaan · perubahan tersimpan di browser ini'}
        </span>
      </div>
      {g.filterCat != null && (
        <div className="bi-filterbar">
          <span className="bi-filter-chip">
            Filter: {g.filterCat}
            <button onClick={() => g.setFilterCat(null)} aria-label="Hapus filter kategori">×</button>
          </span>
          <button className="bi-btn ghost" onClick={g.resetFilter}>
            Reset filter
          </button>
          <span className="bi-card-note">
            {g.filtered.length} dari {g.allRows.length} aktivitas.
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
            {g.filtered.map((r, i) => {
              const b = STATUS_BADGE[r.status] ?? { label: r.status, cls: 'bi-badge' };
              const lu = liveUntungRow(r);
              return (
                <tr key={r.id} className={g.filterCat != null ? 'hl' : ''}>
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
                        <button className="bi-mini-btn" onClick={() => g.openEdit(r.id)}>
                          Edit
                        </button>
                        <button
                          className={`bi-mini-btn danger${g.deleteArmedId === r.id ? ' armed' : ''}`}
                          onClick={() => g.handleDeleteClick(r.id)}
                        >
                          {g.deleteArmedId === r.id ? 'Yakin?' : 'Hapus'}
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
      {g.formOpen && (
        <GarapanFormModal
          key={g.editingItem ? g.editingItem.id : 'new'}
          initial={g.editingItem}
          categories={g.allCategories}
          types={g.allTypes}
          onSave={g.saveEntry}
          onClose={() => {
            g.setFormOpen(false);
            g.setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}
