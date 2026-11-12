'use client';

/* Tab Aset — wallet & holdings: saldo live (BNB, AGC, USDT), posisi terkunci,
   dan daftar NFT yang dipegang (dari riwayat on-chain). */

import { useGarapan, BSC_WALLET, fmtNum, fmtDate } from '@/lib/garapan-data';

export default function AsetPage() {
  const g = useGarapan();
  const t = g.totals;

  if (g.loading) {
    return (
      <div className="bi-wrap">
        <div className="bi-loading">
          <span className="bi-spinner" /> MEMUAT ASET…
        </div>
      </div>
    );
  }

  const nftsHeld = g.nfts.filter((n) => !n.terjual);
  const nftsSold = g.nfts.filter((n) => n.terjual);

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Aset <b>wallet &amp; holdings</b>
          </h1>
          <div className="bi-sub">
            Wallet{' '}
            <a href={`https://bscscan.com/address/${BSC_WALLET}`} target="_blank" rel="noreferrer">
              0xC905…3903
            </a>{' '}
            · BSC · saldo dibaca on-chain, harga live
          </div>
        </div>
        <div className="bi-controls">
          <span className="bi-chip">
            <span className={`dot${g.liveErr ? ' err' : ''}`} />
            {g.live ? `Live · ${new Date(g.live.fetchedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB` : g.liveErr ? 'Harga live tidak tersedia' : 'Memuat harga…'}
          </span>
          <button className="bi-btn" onClick={g.refreshLive} disabled={g.refreshing}>
            {g.refreshing ? 'Memuat…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="bi-totals">
        <div className="bi-total">
          <div className="bi-total-label">Total aset saat ini</div>
          <div className="bi-total-value">{t.totalAset != null ? g.money2(t.totalAset) : 'n/a'}</div>
          <div className="bi-total-sub">Saldo wallet × harga live.</div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Aset terkunci</div>
          <div className="bi-total-value">{t.totalTerkunci != null ? g.money2(t.totalTerkunci) : 'n/a'}</div>
          <div className="bi-total-sub">
            {t.lockedEntries.length > 0
              ? `${t.lockedEntries.length} posisi · ${Number(t.lockedBnbTotal.toFixed(4))} BNB + ${fmtNum(t.lockedAgcTotal)} AGC`
              : 'Tidak ada posisi terkunci.'}
          </div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Harga AGC (live)</div>
          <div className="bi-total-value">{t.agcPrice != null ? g.fmtUnitPrice(t.agcPrice) : 'n/a'}</div>
          <div className="bi-total-sub">DexScreener, pair AGC/WBNB PancakeSwap.</div>
        </div>
        <div className="bi-total">
          <div className="bi-total-label">Harga BNB (live)</div>
          <div className="bi-total-value">{t.bnbPrice != null ? g.money2(t.bnbPrice) : 'n/a'}</div>
          <div className="bi-total-sub">CoinGecko.</div>
        </div>
      </div>

      <div className="bi-grid">
        <div className="bi-card">
          <div className="bi-card-title">BNB</div>
          <div className="bi-card-sub">Saldo wallet</div>
          <div className="bi-total-value" style={{ fontSize: '1.5rem' }}>
            {t.bal.bnb != null ? fmtNum(Number(t.bal.bnb.toFixed(6))) : 'n/a'}
          </div>
          <div className="bi-card-sub">≈ {t.bnbVal != null ? g.money2(t.bnbVal) : 'n/a'}</div>
        </div>
        <div className="bi-card">
          <div className="bi-card-title">AGC</div>
          <div className="bi-card-sub">Saldo wallet (termasuk 1.890.000 hasil claim Plan A)</div>
          <div className="bi-total-value" style={{ fontSize: '1.5rem' }}>
            {t.bal.agc != null ? fmtNum(Math.round(t.bal.agc)) : 'n/a'}
          </div>
          <div className="bi-card-sub">≈ {t.agcVal != null ? g.money2(t.agcVal) : 'n/a'}</div>
        </div>
        <div className="bi-card">
          <div className="bi-card-title">USDT</div>
          <div className="bi-card-sub">Saldo wallet (BSC)</div>
          <div className="bi-total-value" style={{ fontSize: '1.5rem' }}>
            {t.bal.usdt != null ? g.money2(t.bal.usdt) : 'n/a'}
          </div>
          <div className="bi-card-sub">≈ $1 per USDT.</div>
        </div>
      </div>

      {t.lockedEntries.length > 0 && (
        <div className="bi-history">
          <div className="bi-section-title">Posisi terkunci (masih berjalan)</div>
          <div className="bi-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Posisi</th>
                  <th>Tanggal</th>
                  <th className="num">BNB terkunci</th>
                  <th className="num">AGC terkunci</th>
                  <th className="num">Nilai live</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {t.lockedEntries.map((e) => {
                  const v =
                    (e.lockedBnb && t.bnbPrice ? e.lockedBnb * t.bnbPrice : 0) +
                    (e.lockedAgc && t.agcPrice ? e.lockedAgc * t.agcPrice : 0);
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="bi-act-name">{e.nama}</div>
                        <div className="bi-d-note">{e.detail}</div>
                      </td>
                      <td className="bi-nowrap">{fmtDate(e.tanggal)}</td>
                      <td className="num">{e.lockedBnb != null ? e.lockedBnb : '—'}</td>
                      <td className="num">{e.lockedAgc != null ? fmtNum(e.lockedAgc) : '—'}</td>
                      <td className="num">{g.money2(v)}</td>
                      <td>
                        <span className="bi-badge">Berjalan</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bi-card-sub" style={{ marginTop: 8 }}>
            Plan B: BNB tidak kembali kecuali lewat withdraw LP setelah lock 14 hari berakhir
            (sekitar 19 Nov 2026). Reward AGC rilis linear dan bisa di-claim kapan saja.
          </div>
        </div>
      )}

      <div className="bi-history">
        <div className="bi-section-title">
          NFT dipegang ({nftsHeld.length}) · terjual ({nftsSold.length})
        </div>
        <div className="bi-card-sub" style={{ marginBottom: 10 }}>
          Dari riwayat transaksi wallet on-chain (baw wallet tx-history, BSC). Harga jual NFT tidak
          ada sumber floor gratis — nilai tampil n/a sampai terjual.
        </div>
        <div className="bi-table-wrap">
          <table>
            <thead>
              <tr>
                <th>NFT</th>
                <th>Tanggal</th>
                <th className="num">Modal (gas)</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {g.nfts.map((n) => (
                <tr key={n.id}>
                  <td>
                    <div className="bi-act-name">{n.nama}</div>
                    <div className="bi-d-note">{n.catatan ?? ''}</div>
                  </td>
                  <td className="bi-nowrap">{fmtDate(n.tanggal)}</td>
                  <td className="num">{g.money(n.modalUsd)}</td>
                  <td>
                    {n.terjual ? (
                      <span className="bi-badge ok">Terjual {g.money(n.terjual.hargaUsd)}</span>
                    ) : (
                      <span className="bi-badge">Dipegang</span>
                    )}
                  </td>
                  <td>
                    {n.txHash ? (
                      <a className="bi-tx" href={`https://bscscan.com/tx/${n.txHash}`} target="_blank" rel="noreferrer">
                        {n.txHash.slice(0, 6)}…{n.txHash.slice(-4)}
                      </a>
                    ) : (
                      <span className="bi-addr">n/a</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bi-foot">
        <a href={`https://bscscan.com/address/${BSC_WALLET}`} target="_blank" rel="noreferrer">
          Lihat wallet di BscScan
        </a>{' '}
        · Wallet lain (Binance Web3 / MetaMask) tidak dimonitor di sini.
      </div>
    </div>
  );
}
