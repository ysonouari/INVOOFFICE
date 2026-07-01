import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8080';

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.click('#navInfos');
  await p.waitForTimeout(300);
  await p.locator('#cFontSizeOffset').fill('0');
  await p.click('[data-action="save-company"]');
  await p.waitForTimeout(500);
  await b.close();
  console.log('Reset to offset 0 done');
})();
