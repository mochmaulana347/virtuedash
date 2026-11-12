import { NextRequest } from 'next/server';

/* GET /api/pangan
 * Harga pangan Indonesia — sumber resmi Badan Pangan Nasional (BPN) lewat
 * portal data.go.id (CKAN, tanpa kunci/API key). Dataset: "Rata-rata Harga
 * Pangan Bulanan Tingkat Konsumen Nasional". Mengembalikan SELURUH daftar
 * komoditas dari sumber (bukan subset hardcode) supaya komoditas baru yang
 * ditambahkan BPN muncul otomatis.
 *
 * KETERBATASAN (jujur): ini data RATA-RATA BULANAN (periode terakhir yang
 * diterbitkan BPN, Juli 2026 saat ditulis), BUKAN harga harian. Tidak ada API
 * JSON publik gratis untuk harga harian PIHPS: hargapangan.id sedang tidak
 * bisa diakses (HTTP 521), halaman BI hargapangan hanya memuat harga lewat JS
 * (tidak ada JSON yang bisa diambil server-side), Panel Harga Bapanas tidak
 * bisa di-resolve, dan apiindonesia.id berbayar/pakai kunci. Kalau sumber
 * gagal, route mengembalikan items kosong + error — tidak pernah mengarang
 * harga.
 * Tambahan: kurs USD/IDR (exchangerate-api, fallback CoinGecko) + harga emas
 * spot (proxy token PAXG di CoinGecko, ≈ harga emas per troy ounce).
 */

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 30;

/** Dataset BPN di data.go.id (ID + slug dari halaman dataset). */
const BPN_DATASET_ID = 'bf3c4eaf-5ace-4551-b103-4de8929e8b22';
const BPN_DATASET_SLUG = 'rata-rata-harga-pangan-bulanan-tingkat-konsumen-nasional-update-harga-juli-2026';
/** Kandidat endpoint CKAN (data.go.id tidak mendokumentasikan API-nya; dicoba
 *  berurutan sampai ada yang mengembalikan metadata dataset). */
const CKAN_CANDIDATES = [
  `https://data.go.id/api/3/action/package_show?id=${BPN_DATASET_SLUG}`,
  `https://data.go.id/api/3/action/package_show?id=${BPN_DATASET_ID}`,
  `https://data.go.id/api/action/package_show?id=${BPN_DATASET_SLUG}`,
  `https://data.go.id/ckan/api/3/action/package_show?id=${BPN_DATASET_SLUG}`,
];

/** Ambil metadata dataset dari kandidat endpoint pertama yang berhasil. */
async function fetchPackage(): Promise<{ pkg: any; endpoint: string }> {
  let lastErr: Error | null = null;
  for (const url of CKAN_CANDIDATES) {
    try {
      const pkg = await fetchJson(url, 15000);
      if (pkg?.success !== false && pkg?.result?.resources?.length) return { pkg, endpoint: url };
      if (pkg?.result?.resources) return { pkg, endpoint: url };
      lastErr = new Error(`Endpoint merespons tapi tanpa resource: ${url}`);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('Semua endpoint data.go.id gagal.');
}

const UA = { 'User-Agent': 'VirtueDashboard/1.0 (pangan; +https://virtuedash-mochmaulana347s-projects.vercel.app)' };

async function fetchJson(url: string, timeoutMs = 15000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Cari nilai dari sebuah baris berdasarkan kata kunci di nama kolom. */
function pickByKey(row: Record<string, unknown>, needles: string[]): { key: string; val: unknown } | null {
  for (const k of Object.keys(row)) {
    const lk = k.toLowerCase();
    if (needles.some((n) => lk.includes(n))) return { key: k, val: row[k] };
  }
  return null;
}

/** Kolom periode (mis. "2026-07", "Jul 2026", "Juli 2026") -> skor urutan waktu. */
function periodScore(col: string): number {
  const s = col.trim();
  const m1 = /^(\d{4})[-/. ](\d{1,2})/.exec(s);
  if (m1) return Number(m1[1]) * 100 + Number(m1[2]);
  const months: Record<string, number> = {
    jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4,
    mei: 5, may: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agustus: 8, aug: 8,
    sep: 9, september: 9, okt: 10, oktober: 10, oct: 10, nov: 11, november: 11,
    des: 12, desember: 12, dec: 12,
  };
  const m2 = /([a-z]+)\s+(\d{4})/i.exec(s);
  if (m2 && months[m2[1].toLowerCase()]) return Number(m2[2]) * 100 + months[m2[1].toLowerCase()];
  const m3 = /(\d{4})\s+([a-z]+)/i.exec(s);
  if (m3 && months[m3[2].toLowerCase()]) return Number(m3[1]) * 100 + months[m3[2].toLowerCase()];
  return -1;
}

/** Ubah baris-baris mentah jadi { nama, harga, satuan, perubahanPct? }.
 *  Menangani: (a) satu kolom harga, (b) tabel lebar dengan kolom per periode
 *  (ambil periode terbaru + bandingkan dengan periode sebelumnya). */
function normalizeRows(rows: Record<string, unknown>[]): { nama: string; harga: number; satuan: string; perubahanPct: number | null }[] {
  const out: { nama: string; harga: number; satuan: string; perubahanPct: number | null }[] = [];
  if (!rows.length) return out;
  const cols = Object.keys(rows[0]);
  const periodCols = cols.filter((c) => periodScore(c) >= 0).sort((a, b) => periodScore(a) - periodScore(b));
  for (const row of rows) {
    const namaPick = pickByKey(row, ['komoditas', 'komoditi', 'nama', 'barang']);
    if (!namaPick) continue;
    const nama = String(namaPick.val ?? '').trim();
    if (!nama) continue;
    const satuanPick = pickByKey(row, ['satuan', 'unit']);
    const satuan = satuanPick ? String(satuanPick.val ?? '').trim() || '—' : '—';
    let harga: number | null = null;
    let perubahanPct: number | null = null;
    if (periodCols.length > 0) {
      const latest = periodCols[periodCols.length - 1];
      harga = toNum(row[latest]);
      if (periodCols.length > 1) {
        const prev = toNum(row[periodCols[periodCols.length - 2]]);
        if (harga != null && prev != null && prev > 0) perubahanPct = ((harga - prev) / prev) * 100;
      }
    } else {
      const hargaPick = pickByKey(row, ['harga', 'nilai', 'price']);
      harga = hargaPick ? toNum(hargaPick.val) : null;
      const ubahPick = pickByKey(row, ['perubahan', 'change', 'persen', 'naik', 'turun']);
      if (ubahPick) perubahanPct = toNum(ubahPick.val);
    }
    if (harga == null) continue;
    out.push({ nama, harga, satuan, perubahanPct });
  }
  return out;
}

/** Ambil array baris dari berbagai bentuk JSON. */
function extractRows(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['records', 'data', 'result', 'rows', 'items', 'values']) {
      const v = o[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === 'object') {
        const inner = extractRows(v);
        if (inner) return inner;
      }
    }
    // Objek { kolom: [nilai...] } (format kolom) -> ubah jadi baris.
    const keys = Object.keys(o);
    if (keys.length > 1 && keys.every((k) => Array.isArray(o[k]))) {
      const n = (o[keys[0]] as unknown[]).length;
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < n; i++) {
        const r: Record<string, unknown> = {};
        for (const k of keys) r[k] = (o[k] as unknown[])[i];
        rows.push(r);
      }
      return rows;
    }
  }
  return null;
}

/** Parser CSV sederhana (dipakai kalau resource berupa CSV). */
function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if ((ch === ',' || ch === ';') && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const r: Record<string, unknown> = {};
    head.forEach((h, i) => {
      r[h] = cells[i] ?? '';
    });
    return r;
  });
}

async function getUsdIdr(): Promise<number | null> {
  try {
    const d = await fetchJson('https://api.exchangerate-api.com/v4/latest/USD', 10000);
    const v = d?.rates?.IDR;
    if (typeof v === 'number' && v > 0) return v;
  } catch {
    /* fallback */
  }
  try {
    const d = await fetchJson(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr',
      10000
    );
    const v = d?.tether?.idr;
    if (typeof v === 'number' && v > 0) return v;
  } catch {
    /* abaikan */
  }
  return null;
}

async function getGoldUsdPerOz(): Promise<number | null> {
  try {
    const d = await fetchJson(
      'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd',
      10000
    );
    const v = d?.['pax-gold']?.usd;
    if (typeof v === 'number' && v > 0) return v;
  } catch {
    /* abaikan */
  }
  return null;
}

export async function GET(_req: NextRequest) {
  const fetchedAt = Date.now();
  let items: { nama: string; harga: number; satuan: string; perubahanPct: number | null }[] = [];
  let periode = '';
  let sourceNote = 'Badan Pangan Nasional via data.go.id';
  let error: string | null = null;
  let debug: Record<string, unknown> | null = null;

  try {
    const { pkg, endpoint } = await fetchPackage();
    debug = { endpoint };
    const resources: { url?: string; format?: string; name?: string }[] =
      pkg?.result?.resources ?? [];
    if (!resources.length) throw new Error('Dataset tidak punya resource (data.go.id).');
    const pick =
      resources.find((r) => (r.format ?? '').toLowerCase() === 'json') ??
      resources.find((r) => (r.format ?? '').toLowerCase() === 'csv') ??
      resources[0];
    if (!pick?.url) throw new Error('Resource dataset tidak punya URL unduhan.');
    const isCsv = (pick.format ?? '').toLowerCase() === 'csv' || /\.csv(\?|$)/i.test(pick.url);
    let rows: Record<string, unknown>[] | null = null;
    if (isCsv) {
      const text = await fetchText(pick.url, 20000);
      rows = parseCsv(text);
    } else {
      const data = await fetchJson(pick.url, 20000);
      rows = extractRows(data);
      if (!rows) {
        debug = {
          ...debug,
          resourceUrl: pick.url,
          resourceFormat: pick.format ?? null,
          resourceName: pick.name ?? null,
          topKeys: data && typeof data === 'object' ? Object.keys(data as Record<string, unknown>).slice(0, 12) : typeof data,
        };
        throw new Error('Struktur JSON resource tidak dikenali (bukan array/baris).');
      }
    }
    items = normalizeRows(rows ?? []);
    if (!items.length) {
      debug = {
        ...debug,
        resourceUrl: pick.url,
        resourceFormat: pick.format ?? null,
        rowCount: rows?.length ?? 0,
        sampleKeys: rows && rows.length > 0 ? Object.keys(rows[0]).slice(0, 15) : [],
      };
      throw new Error('Tidak ada baris harga yang bisa diparse dari resource.');
    }
    periode = (pkg?.result?.title as string) || '';
    const m = /juli|agustus|september|oktober|november|desember|januari|februari|maret|april|mei|juni/i.exec(periode);
    if (m) sourceNote = `Badan Pangan Nasional via data.go.id — ${periode}`;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Sumber harga pangan gagal dimuat.';
  }

  const [usdIdr, goldUsdPerOz] = await Promise.all([getUsdIdr(), getGoldUsdPerOz()]);
  const goldIdrPerGram =
    goldUsdPerOz != null && usdIdr != null ? (goldUsdPerOz / 31.1034768) * usdIdr : null;

  return Response.json(
    {
      ok: error == null,
      source: {
        name: sourceNote,
        dataset: 'Rata-rata Harga Pangan Bulanan Tingkat Konsumen Nasional',
        datasetId: BPN_DATASET_ID,
        datasetUrl: `https://data.go.id/dataset/dataset/rata-rata-harga-pangan-bulanan-tingkat-konsumen-nasional-update-harga-juli-2026`,
        level: 'Nasional · tingkat konsumen · rata-rata bulanan (bukan harga harian)',
      },
      items,
      usdIdr,
      emas: {
        hargaUsdPerOz: goldUsdPerOz,
        hargaIdrPerGram: goldIdrPerGram,
        sumber: 'CoinGecko — PAXG (token emas, ≈ harga emas spot per troy ounce)',
      },
      fetchedAt,
      error,
      debug,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
  );
}
