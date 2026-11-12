#!/usr/bin/env python3
"""Sinkron feed dashboard dari riwayat wallet (baw wallet tx-history).

- Menangkap SEMUA mint (termasuk manual) -> append ke feed.
- Mendeteksi PENJUALAN: NFT keluar dari wallet + ada pembayaran masuk
  di tx yang sama -> tandai terjual + harga jual + untung.
Tanpa API key berbayar. Dijalankan cron tiap jam; bila berubah -> redeploy.

Output: 'changed' bila ada perubahan, 'no-change' bila tidak.
"""
import json
import os
import subprocess
import sys
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
BAW = os.path.expanduser("~/workspace/tools/baw/node_modules/.bin/baw")
FEED = os.path.join(BASE, "public", "auto-mints.json")
STATE = os.path.join(BASE, "sync-state.json")
WALLET = "0xC905AA0F4E53f5A7F18335e0C33977d4a6783903"
WALLET_TOPIC = "0x" + "0" * 24 + WALLET[2:].lower()
ZERO_TOPIC = "0x" + "0" * 64
RPC = "https://bsc-dataseed.binance.org/"
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4a5c20"

# token pembayaran yang dikenal di BSC -> (decimals, cara hitung USD)
WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"
USDT = "0x55d398326f99059f775485246999027b3197955"


def rpc_call(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=payload, headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def baw_history():
    txs = []
    cursor = None
    while True:
        cmd = [BAW, "wallet", "tx-history", "--binanceChainId", "56", "--size", "100", "--json"]
        if cursor:
            cmd += ["--nextCursor", cursor]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        d = json.loads(p.stdout)
        if not d.get("success"):
            err = d.get("error", {})
            raise SystemExit(
                "sync-gagal: baw auth kadaluarsa (%s - %s). "
                "Butuh re-login user (scan QR di Binance app)."
                % (err.get("code"), err.get("name"))
            )
        batch = d["data"]["transactions"]
        txs.extend(batch)
        cursor = d["data"].get("nextCursor")
        if not cursor or not batch:
            break
    return txs


def bnb_price():
    try:
        req = urllib.request.Request(
            "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd"
        )
        return json.load(urllib.request.urlopen(req, timeout=20))["binancecoin"]["usd"]
    except Exception:
        return 700.0


def token_name(contract):
    for sig in ("0x06fdde03", "0x95d89b41"):
        try:
            hx = rpc_call("eth_call", [{"to": contract, "data": sig}, "latest"])
            if hx.startswith("0x") and len(hx) > 130:
                b = bytes.fromhex(hx[2:])
                ln = int.from_bytes(b[32:64], "big")
                if 0 < ln < 64:
                    return b[64 : 64 + ln].decode()
        except Exception:
            pass
    return None


def main():
    feed = json.load(open(FEED))
    st = json.load(open(STATE)) if os.path.exists(STATE) else {"seen_tx": []}
    seen_tx = set(st.get("seen_tx", []))
    price = bnb_price()
    changed = 0
    notes = []

    # peta entri yang belum terjual: (contract, tokenId) -> entry
    unsold = {}
    for x in feed:
        if x.get("terjual"):
            continue
        a = x.get("aset") or {}
        if a.get("contract") and a.get("tokenId"):
            unsold[(a["contract"].lower(), str(a["tokenId"]))] = x

    for t in baw_history():
        h = t.get("txHash", "")
        if not h or h.lower() in seen_tx:
            continue
        if t.get("status") != "confirmed":
            seen_tx.add(h.lower())
            continue
        try:
            r = rpc_call("eth_getTransactionReceipt", [h])["result"]
            tx = rpc_call("eth_getTransactionByHash", [h])["result"]
        except Exception:
            continue
        if not r or r.get("status") != "0x1":
            seen_tx.add(h.lower())
            continue

        logs = r.get("logs", [])
        # --- 1) mint: Transfer dari 0x0 ke wallet (4 topics = NFT) ---
        if h.lower() not in {(x.get("txHash") or "").lower() for x in feed}:
            for l in logs:
                tp = l.get("topics", [])
                if (
                    len(tp) == 4
                    and tp[0].lower() == TRANSFER_TOPIC
                    and tp[1].lower() == ZERO_TOPIC
                    and tp[2].lower() == WALLET_TOPIC
                ):
                    contract, token_id = l["address"], str(int(tp[3], 16))
                    gas = int(r["gasUsed"], 16) * int(tx["gasPrice"], 16) / 1e18
                    ts = t.get("txTime", "")[:10] or "2026-10-31"
                    name = token_name(contract)
                    label = name or f"NFT {contract[:6]}…{contract[-4:]}"
                    nama = f"{label} #{token_id[:12]}"
                    entry = {
                        "id": f"garapan-sync-{h[2:10]}-{token_id[:8]}",
                        "nama": nama,
                        "tanggal": ts,
                        "chain": "bsc",
                        "tipe": "mint-gratis" if int(tx["value"], 16) == 0 else "mint-berbayar",
                        "modalUsd": round(gas * price, 5),
                        "hasilUsd": None,
                        "asetAda": True,
                        "aset": {
                            "kind": "nft",
                            "address": WALLET,
                            "contract": contract,
                            "tokenId": token_id,
                            "symbol": nama,
                        },
                        "txHash": h,
                        "catatan": (
                            "Sinkron otomatis dari riwayat wallet. "
                            f"Modal = gas aktual {gas:.6f} BNB (@ ${price})."
                        ),
                    }
                    feed.append(entry)
                    unsold[(contract.lower(), token_id)] = entry
                    changed += 1
                    notes.append(f"mint baru: {nama}")

        # --- 2) penjualan: NFT keluar dari wallet ---
        for l in logs:
            tp = l.get("topics", [])
            if not (
                len(tp) == 4
                and tp[0].lower() == TRANSFER_TOPIC
                and tp[1].lower() == WALLET_TOPIC
                and tp[2].lower() != WALLET_TOPIC
            ):
                continue
            contract, token_id = l["address"], str(int(tp[3], 16))
            entry = unsold.pop((contract.lower(), token_id), None)
            if not entry:
                continue
            # cari pembayaran: transfer ERC20 (3 topics) ke wallet di tx yang sama
            pay_usd, pay_sym = None, None
            for pl in logs:
                ptp = pl.get("topics", [])
                if (
                    len(ptp) == 3
                    and ptp[0].lower() == TRANSFER_TOPIC
                    and ptp[2].lower() == WALLET_TOPIC
                ):
                    pc = pl["address"].lower()
                    amt = int(pl.get("data", "0x0"), 16)
                    if pc == WBNB:
                        pay_usd, pay_sym = amt / 1e18 * price, "WBNB"
                    elif pc == USDT:
                        pay_usd, pay_sym = amt / 1e18, "USDT"
                    elif pay_usd is None:
                        pay_sym = pc[:10] + "…"
                    break
            ts = t.get("txTime", "")[:10] or "2026-10-31"
            if pay_usd is not None:
                entry["terjual"] = {
                    "hargaUsd": round(pay_usd, 4),
                    "tanggal": ts,
                    "txHash": h,
                    "bayarDengan": pay_sym,
                }
                untung = round(pay_usd - entry.get("modalUsd", 0), 4)
                notes.append(f"TERJUAL: {entry['nama']} -> ${pay_usd:.4f} (untung ${untung:.4f})")
            else:
                notes.append(f"pindah (bukan jual terdeteksi): {entry['nama']}")
            entry["asetAda"] = False
            changed += 1

        seen_tx.add(h.lower())

    if changed:
        json.dump(feed, open(FEED, "w"), indent=1, ensure_ascii=False)
        json.dump({"seen_tx": sorted(seen_tx)}, open(STATE, "w"))
        print(f"changed ({changed} perubahan, total {len(feed)} entri)")
        for n in notes:
            print(" -", n)
    else:
        # tetap simpan seen agar tidak fetch ulang
        json.dump({"seen_tx": sorted(seen_tx)}, open(STATE, "w"))
        print("no-change")


if __name__ == "__main__":
    sys.exit(main())
