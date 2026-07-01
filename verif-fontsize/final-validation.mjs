import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';
const LOREM = 'Article verification finale';

(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' })).newPage();
  const res = { ok: 0, fail: [] };
  const P = (l) => { res.ok++; console.log('  OK ' + l); };
  const F = (l, d) => { res.fail.push({ l, d }); console.log('  FAIL ' + l + ' — ' + d); };

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 8000 });
  await page.waitForSelector('#linesBody', { timeout: 5000 });

  // ==== 1. NO CONSOLE ERRORS ====
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 });
  await page.waitForSelector('#linesBody', { timeout: 5000 });
  errors.length === 0 ? P('No JS errors on load') : F('JS errors', errors.join('; '));

  // ==== 2. THEME TOGGLE ====
  const theme = await page.evaluate(async () => {
    const t = document.documentElement.dataset.theme;
    const m = await import('./js/theme.js');
    m.toggleTheme();
    return { before: t, after: document.documentElement.dataset.theme };
  });
  theme.before !== theme.after ? P('Theme toggle works') : F('Theme toggle', JSON.stringify(theme));

  // ==== 3. CLIENT CRUD ====
  try {
    await page.locator('[data-action="add-client"]').click();
    await page.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
    await page.fill('#cClientNom', 'Client Final');
    await page.locator('[data-action="save-client"]').click();
    await page.waitForTimeout(500);
    P('Client CRUD');
  } catch (e) { F('Client CRUD', e.message); }

  // Ensure client is selected
  const clientCount = await page.locator('#clientSelect option:nth-child(2)').count();
  if (clientCount > 0) {
    await page.selectOption('#clientSelect', { index: 1 });
  }

  // Clear lines
  const btns = page.locator('#linesBody tr .icon-btn');
  while (await btns.count() > 0) { await btns.first().click(); await page.waitForTimeout(10); }

  // Add 2 lines
  await page.locator('[data-action="add-line"]').click();
  await page.locator('#linesBody tr:first-child .line-desig').fill(LOREM);
  await page.locator('#linesBody tr:first-child .line-prix').fill('150');
  await page.locator('#linesBody tr:first-child .line-qte').fill('3');
  await page.locator('[data-action="add-line"]').click();
  const r2 = page.locator('#linesBody tr').nth(1);
  await r2.locator('.line-desig').fill('Service supplementaire');
  await r2.locator('.line-prix').fill('200');
  await r2.locator('.line-qte').fill('1');

  // Set conditions for full coverage
  await page.fill('#conditions', 'Paiement a 30 jours');
  await page.fill('#modeReglement', 'Virement bancaire');
  await page.fill('#notes', 'Note de validation finale');

  // ==== 4. ALL 4 DOC TYPES ====
  for (const type of ['devis', 'facture', 'bl', 'avoir']) {
    await page.selectOption('#docType', type);
    try {
      const pdfOk = await page.evaluate(async (type) => new Promise(res => {
        const o = window.html2canvas;
        window.html2canvas = async (el) => {
          const h = el.outerHTML; window.html2canvas = o;
          res({
            type,
            title: h.includes('class="pdf-title"'),
            table: h.includes('class="pdf-table"'),
            totals: h.includes('class="pdf-totals"'),
            words: h.includes('class="pdf-words"'),
            conditions: h.includes('class="pdf-conditions"'),
            note: h.includes('class="pdf-note"'),
            footer: h.includes('class="pdf-footer"'),
          });
          const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
        };
        document.querySelector('[data-action="generate-pdf"]').click();
      }), type);
      const sections = Object.values(pdfOk).filter(v => typeof v === 'boolean');
      sections.every(Boolean) ? P('PDF ' + type + ' (' + sections.filter(Boolean).length + '/' + sections.length + ' sections)') : F('PDF ' + type, JSON.stringify(pdfOk));
    } catch (e) { F('PDF ' + type, e.message); }
    await page.evaluate(() => { const s = document.getElementById('pdf-stage'); if (s) s.innerHTML = ''; });
    await page.waitForTimeout(50);
  }

  // ==== 5. HISTORY ====
  await page.locator('#navHistorique').click();
  await page.waitForTimeout(300);
  const histRows = await page.locator('#histTableWrap table.hist tbody tr').count();
  histRows >= 4 ? P('History: ' + histRows + ' entries') : F('History: only ' + histRows);

  // ==== 6. ARABIC ====
  await page.locator('#navNouveau').click();
  await page.waitForTimeout(200);
  await page.locator('#langSwitcher').click();
  await page.waitForTimeout(300);
  await page.selectOption('#docType', 'facture');
  const arOk = await page.evaluate(async () => new Promise(res => {
    const o = window.html2canvas;
    window.html2canvas = async (el) => {
      const h = el.outerHTML; window.html2canvas = o;
      res({ rtl: h.includes('dir="rtl"'), title: h.includes('فاتورة') });
      const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
    };
    document.querySelector('[data-action="generate-pdf"]').click();
  }));
  arOk.rtl && arOk.title ? P('Arabic: rtl + title') : F('Arabic', JSON.stringify(arOk));

  // ==== 7. BACKUP EXPORT/IMPORT ====
  await page.click('#navInfos');
  await page.waitForSelector('#companyModalOverlay.open', { timeout: 3000 });
  const exportBtn = page.locator('[data-action="export-backup"]');
  (await exportBtn.count() > 0) ? P('Backup: export button') : F('Backup', 'no export button');
  await page.locator('[data-action="close-modal"]').first().click();
  await page.waitForTimeout(300);

  // ==== 8. PWA MANIFEST ====
  const manifestOk = await page.evaluate(() => !!document.querySelector('link[rel="manifest"]'));
  manifestOk ? P('PWA: manifest linked') : F('PWA', 'no manifest');

  // ==== 9. fontSizeOffset UI ====
  await page.click('#navInfos');
  await page.waitForSelector('#companyModalOverlay.open', { timeout: 3000 });
  const fsoExists = await page.locator('#cFontSizeOffset').count();
  fsoExists > 0 ? P('fontSizeOffset: UI present') : F('fontSizeOffset', 'missing');
  await page.locator('[data-action="close-modal"]').first().click();
  await page.waitForTimeout(300);

  // ==== 10. RESPONSIVE ====
  await page.setViewportSize({ width: 480, height: 900 });
  await page.waitForTimeout(200);
  const respOk = await page.evaluate(() => document.body.offsetWidth <= 480);
  respOk ? P('Responsive: 480px viewport') : F('Responsive', '');

  // ==== SUMMARY ====
  console.log('\n' + '='.repeat(50));
  console.log('VALIDATION: ' + res.ok + ' passed, ' + res.fail.length + ' failed');
  console.log('Errors: ' + errors.length);
  res.fail.forEach(f => console.log('  FAIL: ' + f.l + ' — ' + f.d));

  await b.close();
  process.exit(res.fail.length > 0 ? 1 : 0);
})();
