import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';

export class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.results = [];
    this.browser = null;
    this.page = null;
  }

  assert(condition, label, detail = '') {
    if (condition) { this.passed++; this.results.push(`✓ ${label}`); }
    else { this.failed++; this.results.push(`✗ ${label} ${detail}`); console.error(`FAIL: ${label} ${detail}`); }
    return condition;
  }

  async start() {
    this.browser = await chromium.launch({ headless: true });
    const ctx = await this.browser.newContext({ viewport: { width: 1280, height: 900 } });
    this.page = await ctx.newPage();
    await this.page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 8000 });
    await this.page.waitForSelector('#linesBody', { timeout: 8000 });
  }

  async stop() {
    if (this.browser) await this.browser.close();
    console.log(`\n${'='.repeat(50)}`);
    console.log(`RESULTS: ${this.passed} passed, ${this.failed} failed`);
    this.results.forEach(r => console.log(r));
    return this.failed === 0;
  }

  async addClient(name = 'Client Test') {
    await this.page.locator('[data-action="add-client"]').click();
    await this.page.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
    await this.page.fill('#cClientNom', name);
    await this.page.locator('[data-action="save-client"]').click();
    await this.page.waitForSelector('#clientModalOverlay:not(.open)', { timeout: 3000 });
  }

  async selectFirstClient() {
    const opts = this.page.locator('#clientSelect option');
    const count = await opts.count();
    if (count <= 1) {
      await this.addClient();
    }
    await this.page.selectOption('#clientSelect', { index: 1 });
  }

  async addLine(desig = 'Article', prix = '100', qte = '1') {
    await this.page.locator('[data-action="add-line"]').click();
    const rows = this.page.locator('#linesBody tr');
    const last = rows.last();
    await last.locator('.line-desig').fill(desig);
    await last.locator('.line-prix').fill(prix);
    await last.locator('.line-qte').fill(qte);
  }

  async clearLines() {
    const btns = this.page.locator('#linesBody tr .icon-btn');
    while (await btns.count() > 0) {
      await btns.first().click();
      await this.page.waitForTimeout(30);
    }
  }

  async evalModule(modulePath, fn) {
    return this.page.evaluate(async ({ modulePath, fnStr }) => {
      const mod = await import(modulePath);
      const fn = new Function('mod', fnStr);
      return fn(mod);
    }, { modulePath, fnStr: fn.toString().replace(/^\(.*?\)\s*=>\s*/, 'return (function(mod){').replace(/}$/, '})') });
  }
}
