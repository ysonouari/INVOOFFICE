import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForTimeout(1000);

  for (const offset of [-3, 3]) {
    console.log(`\n=== Debug offset ${offset} ===`);

    await p.evaluate((o) => {
      const raw = localStorage.getItem('fb_company');
      if (raw) {
        const c = JSON.parse(raw);
        c.fontSizeOffset = o;
        localStorage.setItem('fb_company', JSON.stringify(c));
        console.log('[DEBUG] localStorage set fontSizeOffset=' + o);
      }
    }, offset);

    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(500);

    // Check what loadCompany returns
    const companyData = await p.evaluate(async () => {
      const mod = await import('./js/storage.js');
      const c = mod.loadCompany();
      return { fontSizeOffset: c.fontSizeOffset, hasKey: 'fontSizeOffset' in c };
    });
    console.log('  loadCompany():', JSON.stringify(companyData));

    // Add client if needed
    const clientCount = await p.locator('#clientSelect option:nth-child(2)').count();
    if (clientCount === 0) {
      await p.click('button[data-action="add-client"]');
      await p.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
      await p.fill('#cClientNom', 'Client Test');
      await p.click('[data-action="save-client"]');
      await p.waitForTimeout(500);
    }
    await p.selectOption('#clientSelect', { index: 1 });
    await p.waitForTimeout(200);

    // Add 1 line
    const existing = await p.locator('#linesBody tr').count();
    if (existing === 0) {
      await p.click('[data-action="add-line"]');
      await p.waitForTimeout(200);
    }
    await p.locator('#linesBody tr:first-child .line-desig').fill('Test Article');
    await p.locator('#linesBody tr:first-child .line-prix').fill('100');
    await p.locator('#linesBody tr:first-child .line-qte').fill('1');

    // Intercept html2canvas and check the injected style
    const debugData = await p.evaluate(async () => {
      return new Promise((resolve) => {
        const original = window.html2canvas;
        window.html2canvas = async function(el, opts) {
          const stage = document.getElementById('pdf-stage');
          const styleEl = stage.querySelector('style#fontsize-offset');
          const thEl = stage.querySelector('table.pdf-table thead th');
          const cs = thEl ? window.getComputedStyle(thEl).fontSize : 'N/A';
          const hasStyleBlock = stage.innerHTML.includes('fontsize-offset');
          
          window.html2canvas = original;
          resolve({
            hasStyleBlock,
            styleContent: styleEl ? styleEl.textContent.substring(0, 200) : 'NOT FOUND',
            computedTHFontSize: cs,
            stageInnerHTML_first500: stage.innerHTML.substring(0, 500),
          });
          return { width: 1, height: 1 };
        };
        document.querySelector('[data-action="generate-pdf"]').click();
      });
    });

    console.log('  hasStyleBlock:', debugData.hasStyleBlock);
    console.log('  styleEl:', debugData.styleContent ? 'PRESENT' : 'ABSENT');
    console.log('  computedTHFontSize:', debugData.computedTHFontSize);
    console.log('  HTML preview:', debugData.stageInnerHTML_first500);

    await p.evaluate(() => { document.getElementById('pdf-stage').innerHTML = ''; });
    await p.waitForTimeout(300);
  }

  await b.close();
})();
