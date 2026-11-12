'use client';

/* Form tambah / edit aktivitas — salinan persis dari form di Overview
   (app/page.tsx) supaya perilaku & validasi sama di semua tab. */

import { useState } from 'react';
import type { RangkumanItem } from '@/lib/garapan-data';
import { STATUSES, STATUS_LABEL } from '@/lib/garapan-data';

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

const parseNumField = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export default function GarapanFormModal({
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
