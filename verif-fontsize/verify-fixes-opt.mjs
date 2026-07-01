import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8080';

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const f = []; let ok = 0;
  const pass = (l) => { ok++; console.log('  OK: ' + l); };
  const fail = (l, d) => { f.push({ l, d }); console.log('  FAIL: ' + l + ' — ' + d); };

  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 8000 });
  await p.waitForSelector('#linesBody', { timeout: 5000 });

  if (await p.locator('#clientSelect option:nth-child(2)').count() === 0) {
    await p.locator('[data-action="add-client"]').click();
    await p.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
    await p.locator('#cClientNom').fill('AuditClient');
    await p.locator('[data-action="save-client"]').click();
    await p.waitForTimeout(800);
  }
  await p.selectOption('#clientSelect', { index: 1 });

  const delBtns = p.locator('#linesBody tr .icon-btn');
  while (await delBtns.count() > 0) { await delBtns.first().click(); await p.waitForTimeout(20); }

  // ===== Types + AR (run FIRST while page is fresh) =====
  console.log('--- Types + AR ---');
  await p.locator('[data-action="add-line"]').click();
  await p.locator('#linesBody tr').first().locator('.line-desig').fill('Test');
  await p.locator('#linesBody tr').first().locator('.line-prix').fill('100');
  await p.locator('#linesBody tr').first().locator('.line-qte').fill('2');

  const testPdf = async () => p.evaluate(async () => {
    return new Promise(res => {
      const orig = window.html2canvas;
      window.html2canvas = async (el) => {
        window.html2canvas = orig;
        const h = el.outerHTML;
        res({
          title: h.includes('class="pdf-title"'),
          table: h.includes('class="pdf-table"'),
          totals: h.includes('class="pdf-totals"'),
        });
        const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
      };
      document.querySelector('[data-action="generate-pdf"]').click();
    });
  });

  for (const type of ['devis', 'facture', 'bl', 'avoir']) {
    await p.selectOption('#docType', type);
    const r = await testPdf();
    (r.title && r.table && r.totals) ? pass(type) : fail(type, JSON.stringify(r));
    await p.evaluate(() => { const s = document.getElementById('pdf-stage'); if (s) s.innerHTML = ''; });
  }

  // AR
  await p.locator('#langSwitcher').click(); await p.waitForTimeout(300);
  await p.selectOption('#docType', 'devis');
  const ar = await p.evaluate(async () => {
    return new Promise(res => {
      const orig = window.html2canvas;
      window.html2canvas = async (el) => {
        window.html2canvas = orig;
        const h = el.outerHTML;
        res({ rtl: h.includes('dir="rtl"'), arTitle: h.includes('عرض سعر') });
        const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c;
      };
      document.querySelector('[data-action="generate-pdf"]').click();
    });
  });
  ar.rtl ? pass('AR rtl') : fail('AR rtl', '');
  ar.arTitle ? pass('AR title') : fail('AR title', '');

  // ===== I1: round2 =====
  console.log('--- I1 ---');
  await p.locator('#linesBody tr').first().locator('.line-prix').fill('19.99');
  await p.locator('#linesBody tr').first().locator('.line-qte').fill('3');
  const d1 = await p.evaluate(async () => {
    const m = await import('./js/lines.js');
    const l = m.getLinesData(), t = m.recalcTotals();
    return { lt: l[0].total, ht: t.totalHT_brut, tva: t.tva, ttc: t.totalTTC };
  });
  d1.lt === 59.97 ? pass('19.99*3=' + d1.lt) : fail('19.99*3=' + d1.lt, 'exp 59.97');
  d1.ht === 59.97 ? pass('totalHT=' + d1.ht) : fail('totalHT=' + d1.ht, 'exp 59.97');
  Math.abs(d1.tva - 11.99) < 0.005 ? pass('tva=' + d1.tva) : fail('tva=' + d1.tva, 'exp 11.99');
  Math.abs(d1.ttc - 71.96) < 0.005 ? pass('ttc=' + d1.ttc) : fail('ttc=' + d1.ttc, 'exp 71.96');

  // ===== I2: negative clamp =====
  console.log('--- I2 ---');
  await p.locator('#linesBody tr').first().locator('.line-prix').fill('-50');
  await p.locator('#linesBody tr').first().locator('.line-qte').fill('-3');
  const d2 = await p.evaluate(async () => {
    const m = await import('./js/lines.js');
    const l = m.getLinesData();
    return { prix: l[0].prix, qte: l[0].qte, total: l[0].total };
  });
  d2.prix === 0 ? pass('prix=-50→0') : fail('prix=' + d2.prix, 'exp 0');
  d2.qte === 0 ? pass('qte=-3→0') : fail('qte=' + d2.qte, 'exp 0');
  d2.total === 0 ? pass('total=0') : fail('total=' + d2.total, 'exp 0');

  // ===== I19: zero qty blocked =====
  console.log('--- I19 ---');
  await p.locator('#linesBody tr').first().locator('.line-prix').fill('100');
  await p.locator('#linesBody tr').first().locator('.line-qte').fill('0');
  const blocked = await p.evaluate(async () => new Promise(res => {
    const c = setInterval(() => { if (document.querySelector('.dialog-overlay')) { clearInterval(c); clearTimeout(t); res(true); } }, 50);
    const t = setTimeout(() => { clearInterval(c); res(false); }, 3000);
    document.querySelector('[data-action="generate-pdf"]').click();
  }));
  blocked ? pass('qte=0 blocked') : fail('qte=0 NOT', '');
  if (blocked) { await p.locator('.dialog-overlay button').click(); await p.waitForTimeout(200); }

  // ===== I3: DOC_TYPES fallback =====
  console.log('--- I3 ---');
  await p.locator('#linesBody tr').first().locator('.line-qte').fill('2');
  const d3 = await p.evaluate(async () => {
    const s = document.getElementById('docType'), orig = s.value;
    s.value = '__corrupted__';
    try { const m = await import('./js/lines.js'); const r = m.recalcTotals(); s.value = orig; return { ok: true, sp: r.showPrices }; }
    catch (e) { s.value = orig; return { ok: false, err: e.message }; }
  });
  d3.ok ? pass('fallback') : fail('crash: ' + d3.err, '');

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('PASSED: ' + ok + '  FAILED: ' + f.length);
  if (f.length) f.forEach(x => console.log('  FAIL: ' + x.l + ' — ' + x.d));

  await b.close();
  process.exit(f.length ? 1 : 0);
})();
