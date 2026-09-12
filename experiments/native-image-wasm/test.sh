#!/usr/bin/env bash
# Runs the WebAssembly image in a browser and compares it with the official jar.
set -euo pipefail
cd "$(dirname "$0")"
[ -f dist/gjf-wasm.js ] || { echo "error: run TARGET=wasm ./build.sh first" >&2; exit 1; }
port="${PORT:-8124}"
python3 -m http.server "$port" --bind 127.0.0.1 > /dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf -o /dev/null "http://127.0.0.1:$port/web/" && break; sleep 0.1; done
TEST_ORIGIN="http://127.0.0.1:$port" node test/browser.test.mjs
