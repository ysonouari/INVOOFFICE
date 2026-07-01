import { startServer, TestContext } from './runner.mjs';

const t = new TestContext();
await startServer();
if (!(await t.init())) { console.log('INIT FAILED'); process.exit(1); }

// Set up data
if (await t.page.locator('#clientSelect option:nth-child(2)').count() === 0) {
  await t.page.locator('[data-action="add-client"]').click();
  await t.page.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
  await t.page.locator('#cClientNom').fill('زبون');
  await t.page.locator('[data-action="save-client"]').click();
  await t.page.waitForTimeout(800);
}
await t.page.selectOption('#clientSelect', { index: 1 });

const btns = t.page.locator('#linesBody tr .icon-btn');
while (await btns.count() > 0) { await btns.first().click(); await t.page.waitForTimeout(20); }

await t.page.locator('[data-action="add-line"]').click();
// Diacritized Arabic designation
await t.page.locator('#linesBody tr').first().locator('.line-desig').fill('\u0645\u064E\u0631\u0652\u062D\u064E\u0628\u064B\u0627');
await t.page.locator('#linesBody tr').first().locator('.line-prix').fill('100');
await t.page.locator('#linesBody tr').first().locator('.line-qte').fill('2');

// Also add conditions in diacritized Arabic
await t.page.fill('#conditions', '\u062F\u064E\u0641\u0652\u0639\u064C \u0646\u064E\u0642\u0652\u062F\u064B\u0627');
await t.page.fill('#modeReglement', '\u062A\u064E\u062D\u0652\u0648\u0650\u064A\u0644\u064C \u0628\u064E\u0646\u0652\u0643\u0650\u064A\u0651\u064C');

// Switch to Arabic
const lang = await t.page.evaluate(() => document.documentElement.lang);
if (lang !== 'ar') {
  await t.page.locator('#langSwitcher').click();
  await t.page.waitForTimeout(300);
}

// Generate PDF and check the HTML output
console.log('--- PDF generation with diacritics ---');
const result = await t.page.evaluate(async () => {
  return new Promise(res => {
    const orig = window.html2canvas;
    window.html2canvas = async (el) => {
      window.html2canvas = orig;
      const h = el.outerHTML;
      const hasTitle = h.includes('class="pdf-title"');
      const hasTable = h.includes('class="pdf-table"') && h.includes('\u0645\u064E\u0631\u0652\u062D\u064E\u0628\u064B\u0627');
      const hasConditions = h.includes('\u062F\u064E\u0641\u0652\u0639\u064C');
      const hasReglement = h.includes('\u062A\u064E\u062D\u0652\u0648\u0650\u064A\u0644\u064C');
      res({ hasTitle, hasTable, hasConditions, hasReglement });
      const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
    };
    document.querySelector('[data-action="generate-pdf"]').click();
  });
});

result.hasTitle ? t.pass('PDF title renders') : t.fail('PDF title');
result.hasTable ? t.pass('Diacritized designation in table') : t.fail('Diacritized designation');
result.hasConditions ? t.pass('Diacritized conditions') : t.fail('Diacritized conditions');
result.hasReglement ? t.pass('Diacritized payment mode') : t.fail('Diacritized payment mode');

await t.page.evaluate(() => { const s = document.getElementById('pdf-stage'); if (s) s.innerHTML = ''; });

// Regression: 4 types still work with Arabic
console.log('--- Regression: 4 types AR ---');
for (const type of ['devis', 'facture', 'bl', 'avoir']) {
  await t.page.selectOption('#docType', type);
  const r = await t.page.evaluate(async () => new Promise(res => {
    const orig = window.html2canvas;
    window.html2canvas = async (el) => {
      window.html2canvas = orig;
      res(el.outerHTML.includes('class="pdf-title"') && el.outerHTML.includes('class="pdf-table"'));
      const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
    };
    document.querySelector('[data-action="generate-pdf"]').click();
  }));
  r ? t.pass('AR ' + type) : t.fail('AR ' + type);
  await t.page.evaluate(() => { const s = document.getElementById('pdf-stage'); if (s) s.innerHTML = ''; });
}

const exitCode = (await t.done()) ? 0 : 1;
process.exit(exitCode);
