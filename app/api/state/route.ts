import { NextRequest } from 'next/server';
import { list, put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const PATH = 'state/state.json';

/**
 * Penyimpanan state terpusat (wallets + snapshots) via Vercel Blob.
 * Aktif hanya bila env BLOB_READ_WRITE_TOKEN disetel; bila tidak,
 * API mengembalikan 501 dan aplikasi memakai localStorage browser.
 */
function token(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN || null;
}

export async function GET() {
  const t = token();
  if (!t) return Response.json({ error: 'blob tidak dikonfigurasi' }, { status: 501 });
  try {
    const { blobs } = await list({ prefix: PATH, token: t });
    if (!blobs.length) return Response.json({ error: 'kosong' }, { status: 404 });
    const data = await (await fetch(blobs[0].url, { cache: 'no-store' })).json();
    return Response.json(data);
  } catch (e: any) {
    return Response.json({ error: e?.message || 'gagal membaca' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const t = token();
  if (!t) return Response.json({ error: 'blob tidak dikonfigurasi' }, { status: 501 });
  try {
    const body = await req.json();
    await put(PATH, JSON.stringify(body), {
      access: 'public',
      token: t,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'gagal menyimpan' }, { status: 500 });
  }
}
