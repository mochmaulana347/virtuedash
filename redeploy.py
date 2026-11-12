#!/usr/bin/env python3
"""Redeploy crypto-dashboard ke Vercel (project: crypto-dashboard, target: production).

1. Upload tiap file source via upload_file -> dapat SHA1.
2. create_deployment dengan referensi {file, sha, size} (payload kecil).
Vercel menjalankan npm install + next build di sisi mereka.
"""
import base64
import hashlib
import json
import os
import subprocess
import sys

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT = "virtuedash"
VERCEL = "/opt/hatch/bin/vercel"
EXCLUDE_DIRS = {"node_modules", ".next", ".git", ".vercel"}
EXCLUDE_FILES = {"tsconfig.tsbuildinfo", ".DS_Store", ".env.local"}


def call_tool(name, args):
    cmd = [VERCEL, "call-tool", "--name", name, "--arguments-json", json.dumps(args)]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if p.returncode != 0:
        raise RuntimeError(f"tool {name} gagal: {p.stderr[-500:]}")
    out = json.loads(p.stdout)
    txt = out["result"]["content"][0]["text"]
    try:
        inner = json.loads(txt)
    except json.JSONDecodeError:
        raise RuntimeError(f"tool {name} respons tak terduga: {txt[:300]}")
    if isinstance(inner, dict) and "error" in inner and "result" not in inner:
        raise RuntimeError(f"tool {name}: {json.dumps(inner['error'])[:500]}")
    return inner.get("result", inner)


def collect_files():
    found = []
    for root, dirs, names in os.walk(PROJECT_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for n in names:
            if n in EXCLUDE_FILES or n == os.path.basename(__file__):
                continue
            full = os.path.join(root, n)
            rel = os.path.relpath(full, PROJECT_DIR)
            with open(full, "rb") as f:
                raw = f.read()
            found.append((rel, raw))
    return found


def main():
    files = collect_files()
    print(f"upload {len(files)} file...", flush=True)
    refs = []
    for rel, raw in files:
        sha = hashlib.sha1(raw).hexdigest()
        res = call_tool("upload_file", {
            "requestBody": base64.b64encode(raw).decode(),
            "xVercelDigest": sha,
            "contentLength": len(raw),
        })
        # respons berisi sha yang dikonfirmasi server
        srv_sha = res.get("sha") or res.get("digest") or sha
        refs.append({"file": rel, "sha": srv_sha, "size": len(raw)})
        print(f"  ok {rel}", flush=True)

    print("membuat deployment...", flush=True)
    res = call_tool("create_deployment", {
        "requestBody": {
            "project": PROJECT,
            "target": "production",
            "name": PROJECT,
            "files": refs,
        }
    })
    dep = res.get("deployment") or res
    print("deployment id:", dep.get("id"))
    print("url:", dep.get("url"))
    print("status:", dep.get("status"))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("GAGAL:", e, file=sys.stderr)
        sys.exit(1)
