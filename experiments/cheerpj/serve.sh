#!/usr/bin/env bash
# Serves this directory so the demo page can fetch the bundle from /app/.
# Open http://localhost:${PORT:-8000}/web/
set -euo pipefail
cd "$(dirname "$0")"
port="${PORT:-8000}"
echo "serving $(pwd) at http://localhost:$port/web/"
exec python3 -m http.server "$port"
