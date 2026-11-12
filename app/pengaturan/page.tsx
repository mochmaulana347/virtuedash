'use client';

/* Tab Pengaturan — wallet, mata uang default, reset data, dan manajemen data
   (ekspor/impor overrides localStorage). Tidak mengubah data bawaan. */

import { useRef, useState } from 'react';
import { useGarapan, BSC_WALLET, LS_KEY } from '@/lib/garapan-data';

export default function PengaturanPage() {
  const g = useGarapan();
  const [resetArmed, setResetArmed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      overrides: g.overrides,
      merged: g.rangkuman,
      nfts: g.nfts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `garapan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg('Backup terunduh (JSON). Simpan file itu untuk mengembalikan perubahan nanti.');
  };

  const importFile = async (f: File) => {
    try {
      const text = await f.text();
      const d = JSON.parse(text);
      const ov = d?.overrides ?? d;
      if (!ov || typeof ov.byId !== 'object') throw new Error('Format tidak dikenali.');
      g.importOverrides(ov);
      setMsg(`Impor berhasil: ${Object.keys(ov.byId).length} perubahan diterapkan.`);
    } catch (e) {
      setMsg(`Impor gagal: ${e instanceof Error ? e.message : 'file tidak valid'}.`);
    }
  };

  const doReset = () => {
    if (resetArmed) {
      g.resetAllNow();
      setResetArmed(false);
      setMsg('Semua perubahan dihapus — data kembali ke bawaan.');
    } else {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 4000);
    }
  };

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Pengaturan <b>dashboard</b>
          </h1>
          <div className="bi-sub">Wallet, mata uang, dan manajemen data. Semua tersimpan di browser ini.</div>
        </div>
      </div>

      {msg && (
        <div className="bi-card" style={{ marginBottom: 12 }}>
          <div className="bi-card-sub">{msg}</div>
        </div>
      )}

      <div className="bi-grid cols-2">
        <div className="bi-card">
          <div className="bi-card-title">Wallet utama</div>
          <div className="bi-card-sub">Wallet BSC yang dimonitor (garapan).</div>
          <div className="bi-lb-list" style={{ marginTop: 10 }}>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">Alamat</span>
                <a className="bi-tx" href={`https://bscscan.com/address/${BSC_WALLET}`} target="_blank" rel="noreferrer">
                  {BSC_WALLET.slice(0, 10)}…{BSC_WALLET.slice(-6)}
                </a>
              </div>
            </div>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">Agent ID</span>
                <span>virtue.ai</span>
              </div>
            </div>
            <div className="bi-lb-row" style={{ cursor: 'default' }}>
              <div className="bi-lb-head">
                <span className="nm">Chain</span>
                <span>BSC + Elysium</span>
              </div>
            </div>
          </div>
          <div className="bi-card-sub" style={{ marginTop: 10 }}>
            Wallet lain (Binance Web3 / MetaMask) tidak dimonitor otomatis di dashboard ini.
          </div>
        </div>

        <div className="bi-card">
          <div className="bi-card-title">Mata uang tampilan</div>
          <div className="bi-card-sub">
            Default nominal di semua tab. Kurs USD→IDR live (CoinGecko / exchangerate-api).
          </div>
          <div className="bi-controls" style={{ marginTop: 12 }}>
            <div className="bi-toggle" role="group" aria-label="Mata uang">
              <button className={g.effCurrency === 'USD' ? 'active' : ''} onClick={() => g.setCurrency('USD')}>
                USD
              </button>
              <button className={g.effCurrency === 'IDR' ? 'active' : ''} onClick={g.switchToIdr}>
                IDR
              </button>
            </div>
            {g.rate != null ? (
              <span className="bi-chip">1 USD = Rp{new Intl.NumberFormat('id-ID').format(Math.round(g.rate))} (live)</span>
            ) : g.rateErr ? (
              <span className="bi-chip">
                <span className="dot err" /> Kurs IDR tidak tersedia
              </span>
            ) : (
              <span className="bi-chip">Memuat kurs…</span>
            )}
          </div>
          <div className="bi-card-sub" style={{ marginTop: 10 }}>
            Pilihan tersimpan di browser (cd_currency) dan berlaku di semua tab.
          </div>
        </div>

        <div className="bi-card">
          <div className="bi-card-title">Manajemen data</div>
          <div className="bi-card-sub">
            Data garapan tersimpan di browser ini (localStorage, kunci <code>{LS_KEY}</code>).
            Saat ini ada <b>{g.overrideCount} perubahan</b> dari data bawaan.
          </div>
          <div className="bi-actions-row" style={{ marginTop: 12 }}>
            <button className="bi-btn" onClick={exportData}>
              ⬇ Ekspor backup (JSON)
            </button>
            <button className="bi-btn ghost" onClick={() => fileRef.current?.click()}>
              ⬆ Impor backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="bi-card-sub" style={{ marginTop: 10 }}>
            Backup berisi perubahanmu (tambah/edit/hapus). Impor menimpa perubahan yang ada di
            browser ini. Data bawaan (rangkuman.json) tidak pernah diubah.
          </div>
        </div>

        <div className="bi-card">
          <div className="bi-card-title">Reset data</div>
          <div className="bi-card-sub">
            Hapus semua perubahan dan kembalikan data bawaan. Tindakan ini tidak bisa dibatalkan
            — ekspor backup dulu kalau ragu.
          </div>
          <div className="bi-actions-row" style={{ marginTop: 12 }}>
            <button className="bi-btn ghost" onClick={doReset}>
              {resetArmed ? 'Yakin reset? Klik lagi' : 'Reset data'}
            </button>
          </div>
          <div className="bi-card-sub" style={{ marginTop: 10 }}>
            Reset hanya menghapus perubahan di browser ini (localStorage). Perangkat lain tidak
            terpengaruh.
          </div>
        </div>
      </div>

      <div className="bi-foot">
        DASHBOARD VIRTUE // PENGATURAN. Data per-browser (localStorage) — perubahan di laptop
        tidak muncul otomatis di HP, dan sebaliknya.
      </div>
    </div>
  );
}
