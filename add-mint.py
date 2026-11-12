#!/usr/bin/env python3
"""Tambah entri garapan ke public/auto-mints.json (dedupe kontrak+tokenId).

Dipakai oleh cron freemint-monitor: setiap auto-mint sukses -> catat di sini
agar otomatis nongol di dashboard (halaman menggabungkan feed saat dibuka).

Usage:
    add-mint.py '<json-entry>'
Contoh entry:
    {"id":"garapan-x-1","nama":"X #1","tanggal":"2026-10-31","chain":"bsc",
     "tipe":"mint-gratis","modalUsd":0.007,"hasilUsd":null,"asetAda":true,
     "aset":{"kind":"nft","address":"0x...","contract":"0x...","tokenId":"1","symbol":"X #1"},
     "txHash":"0x...","catatan":"..."}
"""
import json
import os
import sys

FEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "auto-mints.json")


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    entry = json.loads(sys.argv[1])
    with open(FEED) as f:
        feed = json.load(f)
    c = (entry.get("aset") or {}).get("contract", "").lower()
    t = (entry.get("aset") or {}).get("tokenId", "")
    if any(
        (x.get("aset") or {}).get("contract", "").lower() == c
        and (x.get("aset") or {}).get("tokenId", "") == t
        for x in feed
    ):
        print(f"sudah ada: {entry.get('nama')} — dilewati")
        return
    feed.append(entry)
    with open(FEED, "w") as f:
        json.dump(feed, f, indent=1, ensure_ascii=False)
    print(f"ditambahkan: {entry.get('nama')} (total {len(feed)})")


if __name__ == "__main__":
    main()
