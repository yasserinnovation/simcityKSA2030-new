#!/bin/sh
# Vision Nexus 2030 — start a local server and open the game (macOS / Linux). Works offline.
cd "$(dirname "$0")" || exit 1
PORT=${PORT:-8123}
URL="http://127.0.0.1:$PORT/index.html"
if command -v node >/dev/null 2>&1; then node tools/serve.js "$PORT" >/dev/null 2>&1 &   # no-cache headers: updates always load
elif command -v python3 >/dev/null 2>&1; then python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
elif command -v python >/dev/null 2>&1; then python -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
else echo "Python 3 or Node.js is needed to run the local server."; exit 1; fi
SERVER=$!
sleep 1
if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; else echo "Open $URL in your browser."; fi
echo "Vision Nexus 2030 is running at $URL — press Ctrl+C to stop."
trap 'kill $SERVER 2>/dev/null' INT TERM EXIT
wait $SERVER
