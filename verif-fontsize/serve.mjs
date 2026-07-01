import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';
import { lookup } from 'mime-types';

const PORT = 8080;
const ROOT = join(import.meta.dirname, '..');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function serve(req, res) {
  let path = req.url.split('?')[0];
  if (path === '/') path = '/index.html';
  const file = join(ROOT, path);
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  const ext = extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(file));
}

// Check if port is already in use
const net = await import('net');
function isPortFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(port, '127.0.0.1');
  });
}

if (await isPortFree(PORT)) {
  createServer(serve).listen(PORT, '127.0.0.1', () => {
    console.log(`[serve] http://127.0.0.1:${PORT}`);
  });
} else {
  console.log('[serve] already running');
}
