#!/usr/bin/env bash
# Release gate: runs the bundle under the real CheerpJ runtime in a browser and checks
# that its output matches the desktop JVM's on every self-test fixture.
#
# Needs network access to https://cjrtnc.leaningtech.com. Offline it fails saying so.
#
#   PORT                    static server port (default 8123)
#   CHEERPJ_BACKEND         worker (default) or main
#   CHEERPJ_JAVA_VERSION    8, 11 or 17 (default 17)
#   CHROMIUM_PATH           browser binary, when Playwright's own download is absent
set -euo pipefail

cd "$(dirname "$0")"
[ -f dist/gjf-cheerpj.jar ] || { echo "error: run ./build.sh first" >&2; exit 1; }
[ -f web/selftest.json ] || { echo "error: web/selftest.json missing, run ./build.sh" >&2; exit 1; }

port="${PORT:-8123}"
python3 -m http.server "$port" --bind 127.0.0.1 > /dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT

for _ in $(seq 50); do
  curl -sf -o /dev/null "http://127.0.0.1:$port/web/" && break
  sleep 0.1
done

TEST_ORIGIN="http://127.0.0.1:$port" node test/cheerpj-selftest.test.mjs
