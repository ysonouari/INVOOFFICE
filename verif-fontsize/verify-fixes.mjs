import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForTimeout(1000);

  const failures = [];
  const passed = [];

  // ======== SETUP: add client once ========
  await p.click('button[data-action="add-client"]');
  await p.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
  await p.fill('#cClientNom', 'Client Verification');
  await p.click('[data-action="save-client"]');
  await p.waitForTimeout(500);

  // ======== TEST 1: I1 - round2 verification with decimal inputs ========
  console.log('\n--- TEST I1: Floating-point rounding ---');
  await p.selectOption('#clientSelect', { index: 1 });
  await p.waitForTimeout(200);

  if (await p.locator('#linesBody tr').count() > 0) {
    const delBtns = p.locator('#linesBody tr .icon-btn');
    const count = await delBtns.count();
    for (let i = 0; i < count; i++) { await delBtns.first().click(); await p.waitForTimeout(30); }
  }

  await p.click('[data-action="add-line"]');
  await p.waitForTimeout(100);
  await p.locator('#linesBody tr:first-child .line-prix').fill('19.99');
  await p.locator('#linesBody tr:first-child .line-qte').fill('3');
  await p.waitForTimeout(200);

  const data = await p.evaluate(async () => {
    const m = await import('./js/lines.js');
    const lines = m.getLinesData();
    const totals = m.recalcTotals();
    return {
      lineTotal: lines[0].total,
      totalHT: totals.totalHT_brut,
      tva: totals.tva,
      totalTTC: totals.totalTTC,
    };
  });

  const r = data.lineTotal === 59.97 && data.totalHT === 59.97;
  console.log(`  19.99 * 3 = ${data.lineTotal} (expected 59.97)`);
  console.log(`  totalHT = ${data.totalHT} (expected 59.97)`);
  console.log(`  tva 20% = ${data.tva} (expected 12.00)`);
  console.log(`  totalTTC = ${data.totalTTC} (expected 71.97)`);
  if (r) passed.push('I1-round2');
  else failures.push({ test: 'I1-round2', actual: JSON.stringify(data) });

  // ======== TEST 2: I2 - negative values clamped ========
  console.log('\n--- TEST I2: Negative values clamped ---');
  await p.locator('#linesBody tr:first-child .line-prix').fill('-50');
  await p.locator('#linesBody tr:first-child .line-qte').fill('-3');
  await p.waitForTimeout(200);

  const data2 = await p.evaluate(async () => {
    const m = await import('./js/lines.js');
    const lines = m.getLinesData();
    return { prix: lines[0].prix, qte: lines[0].qte, total: lines[0].total };
  });
  const r2 = data2.prix === 0 && data2.qte === 0 && data2.total === 0;
  console.log(`  prix=-50 clamped to: ${data2.prix} (expected 0)`);
  console.log(`  qte=-3 clamped to: ${data2.qte} (expected 0)`);
  console.log(`  total: ${data2.total} (expected 0)`);
  if (r2) passed.push('I2-negative-clamp');
  else failures.push({ test: 'I2-negative-clamp', actual: JSON.stringify(data2) });

  // Reset to valid data
  await p.locator('#linesBody tr:first-child .line-prix').fill('100');
  await p.locator('#linesBody tr:first-child .line-qte').fill('2');
  await p.waitForTimeout(200);

  // ======== TEST 3: I19 - qte=0 blocked ========
  console.log('\n--- TEST I19: Zero quantity blocked ---');
  await p.locator('#linesBody tr:first-child .line-qte').fill('0');
  await p.waitForTimeout(200);

  let zeroQtyBlocked = false;
  try {
    await p.evaluate(() => { return new Promise((res, rej) => {
      const timeout = setTimeout(() => rej('timeout'), 5000);
      const orig = window.html2canvas;
      window.html2canvas = async (el, opts) => { clearTimeout(timeout); window.html2canvas = orig; res('generated'); return orig(el, opts); };
      document.querySelector('[data-action="generate-pdf"]').click();
    });});
  } catch (_) {
    zeroQtyBlocked = true;
  }

  // Check if dialog appeared
  const hasDialog = await p.locator('.dialog-overlay').count();
  console.log(`  Dialog visible: ${hasDialog > 0}`);
  console.log(`  Generation blocked: ${hasDialog > 0}`);
  if (hasDialog > 0) {
    passed.push('I19-zero-qty-blocked');
    await p.click('.dialog-overlay .btn');
    await p.waitForTimeout(300);
  } else {
    failures.push({ test: 'I19-zero-qty-blocked', actual: 'dialog not shown' });
  }

  // ======== TEST 4: All 4 doc types generate correctly ========
  console.log('\n--- TEST: All 4 doc types FR ---');
  await p.locator('#linesBody tr:first-child .line-qte').fill('2');
  await p.waitForTimeout(200);

  for (const type of ['devis', 'facture', 'bl', 'avoir']) {
    await p.selectOption('#docType', type);
    await p.waitForTimeout(100);
    
    const sections = await p.evaluate(async () => {
      return new Promise((res) => {
        const orig = window.html2canvas;
        window.html2canvas = async (el, opts) => {
          const html = el.outerHTML;
          window.html2canvas = orig;
          const has = (s) => html.includes(s);
          res({
            docMeta: has('class="doc-meta"'),
            pdfTitle: has('class="pdf-title"'),
            pdfClient: has('class="pdf-client"'),
            pdfTable: has('class="pdf-table"'),
            pdfTotals: has('class="pdf-totals"'),
            pdfWords: has('class="pdf-words"'),
            pdfFooter: has('class="pdf-footer"'),
          });
          const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
        };
        document.querySelector('[data-action="generate-pdf"]').click();
      });
    });

    const allOk = Object.values(sections).every(Boolean);
    console.log(`  ${type}: ${allOk ? 'OK' : 'MISSING SECTIONS'} ${JSON.stringify(sections)}`);
    if (allOk) passed.push(`all-types-${type}-fr`);
    else failures.push({ test: `all-types-${type}-fr`, actual: JSON.stringify(sections) });

    await p.evaluate(() => { document.getElementById('pdf-stage').innerHTML = ''; });
    await p.waitForTimeout(200);
  }

  // ======== TEST 5: AR language compatibility ========
  console.log('\n--- TEST: AR language ---');
  await p.click('#langSwitcher');
  await p.waitForTimeout(1000);

  await p.selectOption('#docType', 'devis');
  await p.waitForTimeout(100);

  const arSections = await p.evaluate(async () => {
    return new Promise((res) => {
      const orig = window.html2canvas;
      window.html2canvas = async (el, opts) => {
        const html = el.outerHTML;
        window.html2canvas = orig;
        res({
          hasDirRtl: html.includes('dir="rtl"'),
          hasArTitle: html.includes('عرض سعر'),
          hasDocMeta: html.includes('class="doc-meta"'),
          hasTotals: html.includes('class="pdf-totals"'),
        });
        const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
      };
      document.querySelector('[data-action="generate-pdf"]').click();
    });
  });
  
  console.log(`  AR: ${JSON.stringify(arSections)}`);
  if (arSections.hasDirRtl && arSections.hasArTitle) passed.push('ar-compat');
  else failures.push({ test: 'ar-compat', actual: JSON.stringify(arSections) });

  await p.evaluate(() => { document.getElementById('pdf-stage').innerHTML = ''; });

  // ======== TEST 6: I3 - DOC_TYPES fallback ========
  console.log('\n--- TEST I3: DOC_TYPES fallback ---');
  const fallbackWorks = await p.evaluate(async () => {
    // Simulate corrupted docType value
    const sel = document.getElementById('docType');
    const original = sel.value;
    sel.value = 'nonexistent_type';

    // Import lines module and call recalcTotals — should not crash
    try {
      const m = await import('./js/lines.js');
      const r = m.recalcTotals();
      sel.value = original;
      return { ok: true, showPrices: r.showPrices };
    } catch (e) {
      sel.value = original;
      return { ok: false, error: e.message };
    }
  });
  
  console.log(`  Fallback: ${JSON.stringify(fallbackWorks)}`);
  if (fallbackWorks.ok) passed.push('I3-fallback');
  else failures.push({ test: 'I3-fallback', actual: JSON.stringify(fallbackWorks) });

  // ======== TEST 7: Historic PDF still generates (regression check) ========
  console.log('\n--- TEST 7: Historic PDF regression check ---');
  await p.selectOption('#docType', 'facture');
  await p.waitForTimeout(100);
  await p.locator('#linesBody tr:first-child .line-prix').fill('150');
  await p.locator('#linesBody tr:first-child .line-qte').fill('4');
  await p.waitForTimeout(200);

  const histResult = await p.evaluate(async () => {
    return new Promise((res) => {
      const orig = window.html2canvas;
      window.html2canvas = async (el, opts) => {
        const stageHTML = document.getElementById('pdf-stage').innerHTML;
        window.html2canvas = orig;
        const hasStyle = stageHTML.includes('fontsize-offset');
        const hasPdfPage = stageHTML.includes('class="pdf-page"');
        res({ hasStyle, hasPdfPage, htmlLength: stageHTML.length });
        const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
      };
      document.querySelector('[data-action="generate-pdf"]').click();
    });
  });
  
  console.log(`  PDF structure: ${JSON.stringify(histResult)}`);
  if (histResult.hasPdfPage) passed.push('regression-pdf-structure');
  else failures.push({ test: 'regression-pdf-structure', actual: JSON.stringify(histResult) });

  // ======== REPORT ========
  console.log('\n========================================');
  console.log(`PASSED: ${passed.length} | FAILED: ${failures.length}`);
  console.log(`Passed: ${passed.join(', ')}`);
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach(f => console.log(`  ${f.test}: ${f.actual}`));
  }
  console.log('========================================');

  await b.close();
  process.exit(failures.length > 0 ? 1 : 0);
})();
