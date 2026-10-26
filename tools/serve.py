"""Offline Python 3 fallback, with the same verified startup as the Node launcher."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import errno, hashlib, json, os, re, sys, urllib.request, webbrowser

ROOT = Path(__file__).resolve().parent.parent
BUILD = re.search(r"const BUILD = '([^']+)'", (ROOT / 'boot.js').read_text(encoding='utf-8')).group(1)
IDENTITY = dict(service='vision-nexus-2030', build=BUILD, rootId=hashlib.sha256(str(ROOT).encode()).hexdigest())
PORT = next((int(a) for a in sys.argv[1:] if a.isdigit()), 8123)
URL = f'http://127.0.0.1:{PORT}/index.html'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.split('?')[0] == '/__vision_build':
            body = json.dumps(IDENTITY).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

def open_verified():
    if '--open' in sys.argv:
        print('Opening verified game: ' + URL, flush=True)
        if os.getenv('VN_NO_BROWSER') != '1':
            webbrowser.open(URL)

try:
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
except OSError as error:
    if error.errno != errno.EADDRINUSE:
        raise
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/__vision_build', timeout=1.6) as response:
            running = json.loads(response.read(4096))
    except Exception:
        running = None
    if running == IDENTITY:
        print(f'Already running this copy ({BUILD}) at {URL}', flush=True)
        open_verified()
        sys.exit(0)
    print(f'Port {PORT} is serving another copy or application. The game was NOT opened.\n'
          'Close the previous game server window (Ctrl+C), then launch this folder again.\n'
          f'Keep http://127.0.0.1:{PORT} to retain browser saves.', file=sys.stderr)
    sys.exit(1)

print(f'Vision Nexus 2030 {BUILD} -> {URL} (Ctrl+C to stop)', flush=True)
open_verified()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
