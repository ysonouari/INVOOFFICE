/**
 * server.js — Serveur de développement local INVOOFFICE
 * Reproduit le comportement Vercel (rewrites) avec Node.js natif.
 * Aucune dépendance externe requise.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Rewrites identiques à vercel.json
const REWRITES = {
  '/': '/landing.html',
  '/app': '/app.html',
  '/admin': '/admin/index.html',
  '/confirmation': '/confirmation/index.html',
};

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url.endsWith('/') && url.length > 1) url = url.slice(0, -1);

  // Appliquer les rewrites
  let filePath = REWRITES[url] || url;

  // Sécurité : empêcher directory traversal
  const resolved = path.normalize(path.join(ROOT, filePath));
  if (!resolved.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  // Servir le fichier
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(resolved, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback: si le chemin est un dossier, servir index.html
        const indexFile = path.join(resolved, 'index.html');
        fs.readFile(indexFile, (err2, data2) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data2);
        });
        return;
      }
      res.writeHead(500); res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  INVOOFFICE v1.0');
  console.log('  Server running');
  console.log('');
  console.log('  Landing :       http://localhost:' + PORT + '/');
  console.log('  Application :   http://localhost:' + PORT + '/app');
  console.log('  Admin :         http://localhost:' + PORT + '/admin');
  console.log('  Confirmation :  http://localhost:' + PORT + '/confirmation');
  console.log('========================================');
  console.log('');
  console.log('Press Ctrl+C to stop.');
});
