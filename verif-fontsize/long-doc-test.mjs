import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';
const LINE_COUNT = 23;

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForTimeout(1000);

  for (const offset of [-3, 0, 3]) {
    console.log(`\n=== Offset ${offset}: ${LINE_COUNT} lines ===`);

    // Set via "Mes Informations" modal to properly persist through saveCompany()
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(500);

    // Open company modal
    await p.click('#navInfos');
    await p.waitForSelector('#companyModalOverlay.open', { timeout: 3000 });
    await p.waitForTimeout(300);

    // Set fontSizeOffset
    const input = p.locator('#cFontSizeOffset');
    await input.fill(String(offset));

    // Save
    await p.click('[data-action="save-company"]');
    await p.waitForTimeout(500);

    // Reload to pick up new company data
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(500);

    // Verify the value stuck
    const loadedVal = await p.evaluate(() => {
      const raw = localStorage.getItem('fb_company');
      return raw ? JSON.parse(raw).fontSizeOffset : 'NO KEY';
    });
    console.log('  localStorage fontSizeOffset:', loadedVal);

    // Add client
    const clientCount = await p.locator('#clientSelect option:nth-child(2)').count();
    if (clientCount === 0) {
      await p.click('button[data-action="add-client"]');
      await p.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
      await p.fill('#cClientNom', 'Client Pagination');
      await p.click('[data-action="save-client"]');
      await p.waitForTimeout(500);
    }
    await p.selectOption('#clientSelect', { index: 1 });
    await p.waitForTimeout(200);

    // Clear existing lines and add fresh ones
    let existingLines = await p.locator('#linesBody tr').count();
    while (existingLines > 0) {
      const delBtn = p.locator('#linesBody tr:first-child .icon-btn');
      if (await delBtn.count() > 0) {
        await delBtn.click();
        await p.waitForTimeout(50);
      }
      existingLines = await p.locator('#linesBody tr').count();
    }

    // Add LINE_COUNT lines
    for (let i = 1; i <= LINE_COUNT; i++) {
      await p.click('[data-action="add-line"]');
      await p.waitForTimeout(30);
      const row = p.locator('#linesBody tr').nth(i - 1);
      await row.locator('.line-desig').fill('Article numero ' + i);
      await row.locator('.line-prix').fill('100');
      await row.locator('.line-qte').fill('1');
    }

    await p.waitForTimeout(300);

    // Generate PDF with canvas interception
    const result = await p.evaluate(async () => {
      return new Promise((resolve) => {
        const original = window.html2canvas;
        window.html2canvas = async function(el, opts) {
          const stage = document.getElementById('pdf-stage');
          const hasStyle = stage.innerHTML.includes('fontsize-offset');
          const canvas = await original(el, opts);
          window.html2canvas = original;

          const imgHeightMm = canvas.height * 210 / canvas.width;
          const pages = Math.max(1, Math.ceil((imgHeightMm - 0.5) / 297));

          resolve({
            hasStyle,
            canvasW: canvas.width,
            canvasH: canvas.height,
            imgHeightMm: imgHeightMm.toFixed(1),
            pages,
          });
          return canvas;
        };
        document.querySelector('[data-action="generate-pdf"]').click();
      });
    });

    console.log(`  hasStyleBlock: ${result.hasStyle}`);
    console.log(`  Canvas: ${result.canvasW}x${result.canvasH}`);
    console.log(`  imgHeight: ${result.imgHeightMm} mm`);
    console.log(`  Pages: ${result.pages}`);

    await p.evaluate(() => { document.getElementById('pdf-stage').innerHTML = ''; });
    await p.waitForTimeout(300);
  }

  await b.close();
})();
