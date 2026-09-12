#!/usr/bin/env bash
# Runs the worker protocol tests in a real browser against a local static server.
#
#   PORT           port for the static server (default 8123)
#   CHROMIUM_PATH  browser binary, when Playwright's own download is not present
set -euo pipefail

cd "$(dirname "$0")"
port="${PORT:-8123}"

python3 -m http.server "$port" --bind 127.0.0.1 > /dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT

for _ in $(seq 50); do
  curl -sf -o /dev/null "http://127.0.0.1:$port/web/test/blank.html" && break
  sleep 0.1
done

export TEST_ORIGIN="http://127.0.0.1:$port"
node test/worker-protocol.test.mjs
node test/demo-page.test.mjs
