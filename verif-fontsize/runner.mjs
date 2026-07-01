import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';
import net from 'net';

const PORT = 8080;
const ROOT = join(import.meta.dirname, '..');
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf',
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

async function isPortFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(port, '127.0.0.1');
  });
}

export async function startServer() {
  if (await isPortFree(PORT)) {
    createServer(serve).listen(PORT, '127.0.0.1', () => {});
    await new Promise(r => setTimeout(r, 200));
  }
}

export async function stopServer() {
  // Server stops when process exits
}

export class TestContext {
  constructor() {
    this.browser = null;
    this.page = null;
    this.ok = 0;
    this.failures = [];
  }

  pass(label) { this.ok++; console.log('  OK  ' + label); }
  fail(label, detail = '') { this.failures.push({ label, detail }); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
  rejectIf(predicate, label, detail) { if (predicate) { this.fail(label, detail); return true; } return false; }

  async init() {
    this.browser = await chromium.launch({ headless: true });
    const ctx = await this.browser.newContext({ viewport: { width: 1280, height: 900 } });
    this.page = await ctx.newPage();
    await this.page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await this.page.waitForSelector('#linesBody', { timeout: 5000 });
    if (this.failures.length) return false;
    return true;
  }

  async done() {
    const failed = this.failures.length;
    console.log('\n' + '='.repeat(50));
    console.log(`PASSED: ${this.ok}  FAILED: ${failed}`);
    if (failed) this.failures.forEach(f => console.log('  FAIL: ' + f.label + ' — ' + f.detail));
    if (this.browser) await this.browser.close();
    return failed === 0;
  }
}
