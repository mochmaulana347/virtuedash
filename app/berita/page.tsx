'use client';

/* Tab Berita — headline Indonesia hari ini dari RSS (Detik, Kompas, CNN
   Indonesia, Antara) via /api/berita. Dikelompokkan per sumber; link buka di
   tab baru. Status tiap sumber tampil apa adanya. */

import { useEffect, useState } from 'react';

type NewsItem = {
  source: string;
  title: string;
  link: string;
  time: number | null;
  snippet: string | null;
};
type SourceStatus = { source: string; url: string; status: 'ok' | 'error'; count: number; error: string | null };
type BeritaData = {
  ok: boolean;
  fetchedAt: number;
  sources: SourceStatus[];
  groups: { source: string; url: string; status: 'ok' | 'error'; count: number; error: string | null; items: NewsItem[] }[];
  items: NewsItem[];
};

const fmtTime = (ts: number | null) => {
  if (ts == null) return 'waktu tidak diketahui';
  return new Date(ts).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function BeritaPage() {
  const [data, setData] = useState<BeritaData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/berita', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = (await r.json()) as BeritaData;
        if (alive) setData(d);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat berita.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="bi-wrap">
      <div className="bi-util">
        <div>
          <h1 className="bi-title">
            Berita <b>hari ini</b>
          </h1>
          <div className="bi-sub">
            Headline Indonesia dari RSS (Detik, Kompas, CNN Indonesia, Antara).
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
          <span className="bi-spinner" /> MEMUAT BERITA…
        </div>
      )}
      {err && !data && (
        <div className="bi-card">
          <div className="bi-card-title">Berita tidak bisa dimuat</div>
          <div className="bi-card-sub">{err}</div>
        </div>
      )}

      {data && (
        <>
          <div className="bi-totals">
            {data.sources.map((s) => (
              <div className="bi-total" key={s.source}>
                <div className="bi-total-label">{s.source}</div>
                <div className="bi-total-value" style={{ fontSize: '1.1rem' }}>
                  {s.status === 'ok' ? `${s.count} berita` : '—'}
                </div>
                <div className="bi-total-sub">
                  {s.status === 'ok' ? (
                    <span>
                      <span className="bi-badge ok">Live</span>
                    </span>
                  ) : (
                    <span>
                      <span className="bi-badge bad">Mati</span> {s.error ?? ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!data.ok && (
            <div className="bi-card">
              <div className="bi-card-title">Semua feed berita sedang tidak bisa diakses</div>
              <div className="bi-card-sub">
                Feed RSS outlet di atas tidak merespons saat ini. Halaman ini tidak menampilkan
                berita lama sebagai berita baru — coba refresh nanti.
              </div>
            </div>
          )}

          {data.groups.map((grp) => (
            <div className="bi-history" key={grp.source}>
              <div className="bi-section-title">
                {grp.source} ({grp.count})
              </div>
              {grp.status !== 'ok' ? (
                <div className="bi-card-sub" style={{ padding: '8px 0' }}>
                  Feed {grp.source} tidak bisa dimuat: {grp.error ?? 'tidak diketahui'}.
                </div>
              ) : (
                <div className="bi-lb-list">
                  {grp.items.map((it) => (
                    <a
                      key={it.link}
                      href={it.link}
                      target="_blank"
                      rel="noreferrer"
                      className="bi-lb-row bi-clickable"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="bi-lb-head">
                        <span className="nm" style={{ flex: 1 }}>{it.title}</span>
                        <span className="bi-addr" style={{ whiteSpace: 'nowrap' }}>{fmtTime(it.time)}</span>
                      </div>
                      {it.snippet && <div className="bi-d-note">{it.snippet}</div>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <div className="bi-foot">
        Berita diambil dari feed RSS resmi masing-masing outlet (parse server-side, bukan scrape
        halaman artikel). Klik judul untuk membaca artikel lengkap di situs aslinya.
      </div>
    </div>
  );
}
