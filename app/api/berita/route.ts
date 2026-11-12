import { NextRequest } from 'next/server';

/* GET /api/berita
 * Berita Indonesia hari ini dari RSS (parse server-side, TIDAK scrape halaman
 * artikel). Feed yang dipakai sesuai permintaan: Detik, Kompas, CNN Indonesia,
 * Antara. Setiap feed diambil terpisah dengan timeout; kalau satu feed mati,
 * feed lain tetap tampil dan status per-sumber dilaporkan apa adanya.
 *
 * CATATAN VERIFIKASI: tool riset (browser) di lingkungan ini memblokir domain
 * berita Indonesia (rss.detik.com, antaranews.com, cnnindonesia.com,
 * news.google.com, rss.tempo.co, okezone.com, republika.co.id, liputan6.com,
 * bbc.com, voaindonesia.com), jadi URL feed di bawah memakai endpoint RSS
 * publik standar masing-masing outlet dan BELUM sempat diverifikasi lewat
 * browser. Route ini melaporkan status tiap sumber secara live (ok/error +
 * jumlah item), jadi kalau ada feed yang mati akan terlihat jelas di halaman
 * Berita — bukan diam-diam kosong. */

export const dynamic = 'force-dynamic';
export const revalidate = 900;
export const maxDuration = 30;

type Feed = { nama: string; url: string };

const FEEDS: Feed[] = [
  { nama: 'Detik', url: 'https://rss.detik.com/index.php/detikcom' },
  { nama: 'Kompas', url: 'https://www.kompas.com/rss' },
  { nama: 'CNN Indonesia', url: 'https://www.cnnindonesia.com/rss' },
  { nama: 'Antara', url: 'https://www.antaranews.com/rss/terkini.xml' },
];

const UA = { 'User-Agent': 'VirtueDashboard/1.0 (berita-rss)' };
const PER_SOURCE = 12;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(Number(n));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      try {
        return String.fromCharCode(parseInt(n, 16));
      } catch {
        return '';
      }
    });
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function tagText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  return m ? decodeEntities(m[1]).trim() : null;
}

function linkOf(block: string): string | null {
  // Atom: <link href="..." rel="alternate" /> — utamakan rel alternate.
  const atom = [...block.matchAll(/<link\b[^>]*>/gi)];
  for (const a of atom) {
    const href = /href="([^"]+)"/i.exec(a[0]);
    if (!href) continue;
    const rel = /rel="([^"]+)"/i.exec(a[0]);
    if (!rel || rel[1] === 'alternate') return href[1].trim();
  }
  if (atom.length > 0) {
    const href = /href="([^"]+)"/i.exec(atom[0][0]);
    if (href) return href[1].trim();
  }
  const rss = tagText(block, 'link');
  return rss ? rss.trim() : null;
}

type NewsItem = {
  source: string;
  title: string;
  link: string;
  time: number | null;
  snippet: string | null;
};

function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks: string[] = [];
  const itemRe = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && blocks.length < PER_SOURCE * 2) blocks.push(m[1]);

  const items: NewsItem[] = [];
  for (const b of blocks) {
    const title = tagText(b, 'title');
    const link = linkOf(b);
    if (!title || !link) continue;
    const dateStr =
      tagText(b, 'pubDate') ?? tagText(b, 'updated') ?? tagText(b, 'published') ?? tagText(b, 'dc:date');
    let time: number | null = null;
    if (dateStr) {
      const t = Date.parse(dateStr);
      if (Number.isFinite(t)) time = t;
    }
    const desc = tagText(b, 'description') ?? tagText(b, 'summary');
    const snippet = desc ? stripTags(decodeEntities(desc)).slice(0, 200) || null : null;
    items.push({ source, title: stripTags(title), link, time, snippet });
    if (items.length >= PER_SOURCE) break;
  }
  items.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return items;
}

async function fetchFeed(f: Feed): Promise<{ feed: Feed; status: 'ok' | 'error'; items: NewsItem[]; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(f.url, { headers: UA, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return { feed: f, status: 'error', items: [], error: `HTTP ${res.status}` };
    const xml = await res.text();
    if (!/<(rss|feed|rdf)/i.test(xml.slice(0, 2000))) {
      return { feed: f, status: 'error', items: [], error: 'Bukan XML RSS/Atom.' };
    }
    const items = parseFeed(xml, f.nama);
    if (!items.length) return { feed: f, status: 'error', items: [], error: 'Feed kosong / tidak ada item.' };
    return { feed: f, status: 'ok', items };
  } catch (e) {
    return {
      feed: f,
      status: 'error',
      items: [],
      error: e instanceof Error ? e.message : 'Gagal mengambil feed.',
    };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(_req: NextRequest) {
  const fetchedAt = Date.now();
  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f)));
  const groups = results.map((r) => ({
    source: r.feed.nama,
    url: r.feed.url,
    status: r.status,
    count: r.items.length,
    error: r.error ?? null,
    items: r.items,
  }));
  const flat = groups.flatMap((g) => g.items).sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  const anyOk = results.some((r) => r.status === 'ok');

  return Response.json(
    {
      ok: anyOk,
      fetchedAt,
      sources: groups.map((g) => ({
        source: g.source,
        url: g.url,
        status: g.status,
        count: g.count,
        error: g.error,
      })),
      groups,
      items: flat,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=300' } }
  );
}
