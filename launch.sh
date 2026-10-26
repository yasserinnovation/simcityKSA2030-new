#!/bin/sh
# Keep this terminal open. Browser launch happens only after the server is verified.
cd "$(dirname "$0")" || exit 1
VN_PORT=${PORT:-8123}
if command -v node >/dev/null 2>&1; then exec node tools/serve.js "$VN_PORT" --open
elif command -v python3 >/dev/null 2>&1; then exec python3 tools/serve.py "$VN_PORT" --open
elif command -v python >/dev/null 2>&1; then exec python tools/serve.py "$VN_PORT" --open
else echo 'Node.js or Python 3 is needed to run this game.'; exit 1; fi
