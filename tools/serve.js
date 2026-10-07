// Tiny static file server for Vision Nexus 2030 (used when Python is not installed). No dependencies.
//   node tools/serve.js [port]      → serves the game folder at http://localhost:<port> (default 8000)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), port = +process.argv[2] || 8000;
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json',
  '.bin':'application/octet-stream', '.hdr':'application/octet-stream', '.ktx2':'image/ktx2', '.wasm':'application/wasm', '.mp4':'video/mp4', '.webp':'image/webp'};
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type':TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-cache'}); res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Vision Nexus 2030 → http://localhost:${port}  (Ctrl+C to stop)`));
