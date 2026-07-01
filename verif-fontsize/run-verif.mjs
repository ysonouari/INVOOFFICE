import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://127.0.0.1:8080';
const OUT_DIR = join(import.meta.dirname, '..', 'verif-fontsize');
mkdirSync(OUT_DIR, { recursive: true });

const PAGE_SELECTOR = '#pdf-stage .pdf-page';
const TH_SELECTOR = '#pdf-stage table.pdf-table thead th';

function fsRule(base, offset) { return base + offset; }

const FONT_RULES = [
  { sel: '.pdf-page',               base: 11.5 },
  { sel: '.doc-meta',               base: 11   },
  { sel: '.pdf-title',              base: 22   },
  { sel: '.pdf-client',             base: 11   },
  { sel: '.pdf-ref',                base: 10.5 },
  { sel: 'table.pdf-table thead th',base: 10   },
  { sel: 'table.pdf-table td',      base: 11   },
  { sel: '.pdf-totals table',       base: 11.5 },
  { sel: '.pdf-totals tr.ttc td',   base: 13   },
  { sel: '.pdf-words',              base: 11   },
  { sel: '.pdf-note',               base: 10   },
  { sel: '.pdf-conditions',         base: 10.5 },
  { sel: '.pdf-footer',             base: 9.5  },
];

function buildScaleStyle(offset) {
  return `<style id="fontsize-offset-test">\n${FONT_RULES.map(r =>
    `#pdf-stage ${r.sel} { font-size: ${fsRule(r.base, offset)}px; }`).join('\n')}\n</style>`;
}

// ===========================================================================
// HELPERS
// ===========================================================================

async function fillClient(page) {
  await page.click('button[data-action="add-client"]');
  await page.waitForSelector('#clientModalOverlay.open', { timeout: 3000 });
  await page.fill('#cClientNom', 'Client Test Audit');
  await page.fill('#cClientTel', '0600000000');
  await page.click('[data-action="save-client"]');
  await page.waitForTimeout(500);
}

async function fillLine(page, designation, prix = '1500', qte = '5') {
  const linesBody = page.locator('#linesBody');
  const rows = await linesBody.locator('tr').count();
  if (rows === 0) {
    await page.click('[data-action="add-line"]');
    await page.waitForTimeout(300);
  }
  const firstDesig = linesBody.locator('tr:first-child .line-desig');
  const firstPrix = linesBody.locator('tr:first-child .line-prix');
  const firstQte = linesBody.locator('tr:first-child .line-qte');
  if (await firstDesig.count() > 0) await firstDesig.fill(designation);
  if (await firstPrix.count() > 0) await firstPrix.fill(prix);
  if (await firstQte.count() > 0) await firstQte.fill(qte);
  await page.waitForTimeout(200);
}

async function switchLang(page, lang) {
  const current = await page.evaluate(() => document.documentElement.lang);
  if (current !== lang) {
    await page.click('#langSwitcher');
    await page.waitForTimeout(800);
  }
}

function resetPdfStage(page) {
  return page.evaluate(() => {
    const stage = document.getElementById('pdf-stage');
    if (stage) stage.innerHTML = '';
    const oldStyle = document.getElementById('fontsize-offset-test');
    if (oldStyle) oldStyle.remove();
  });
}

// ===========================================================================
// TEST 1 — CASCADE ORDER
// ===========================================================================

async function testCascadeOrder(page) {
  console.log('\n=== TEST 1: CASCADE ORDER ===');

  // Clear any prior state
  await resetPdfStage(page);

  // Patch localStorage to set fontSizeOffset=3
  await page.evaluate(() => {
    const raw = localStorage.getItem('fb_company');
    if (raw) {
      const c = JSON.parse(raw);
      c.fontSizeOffset = 3;
      localStorage.setItem('fb_company', JSON.stringify(c));
    }
  });

  // Reload to pick up the new company data
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  if (await page.locator('#clientSelect option:nth-child(2)').count() === 0) {
    await fillClient(page);
  } else {
    await page.selectOption('#clientSelect', { index: 1 });
    await page.waitForTimeout(200);
  }

  await fillLine(page, 'Article Test Cascade', '1000', '2');

  // Now inject the test style AND intercept html2canvas BEFORE generation
  const cascadeData = await page.evaluate(async (scaleHtml) => {
    return new Promise((resolve) => {
      const original = window.html2canvas;

      window.html2canvas = function(el, opts) {
        // Inject our test style
        const stage = document.getElementById('pdf-stage');
        stage.insertAdjacentHTML('afterbegin', scaleHtml);

        // Check link positions
        const link = document.querySelector('link[href="css/styles.css"]');
        const injectedStyle = document.getElementById('fontsize-offset-test');

        // Check computed font-size
        const th = stage.querySelector('table.pdf-table thead th');
        const computed = th ? window.getComputedStyle(th).fontSize : 'N/A';

        // Capture DOM
        const stageHTML = stage.outerHTML;

        // Clean up the interception
        window.html2canvas = original;

        resolve({
          linkExists: !!link,
          linkInHead: link ? link.closest('head') !== null : false,
          injectedStyleExists: !!injectedStyle,
          injectedStyleInStage: injectedStyle ? injectedStyle.closest('#pdf-stage') !== null : false,
          linkBeforeStyleInDOM: link && injectedStyle
            ? (link.compareDocumentPosition(injectedStyle) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
            : 'N/A',
          computedTHFontSize: computed,
          expectedTHFontSize: '13px',
          stageHTML: stageHTML,
        });
      };

      // Trigger generation by clicking the button
      document.querySelector('[data-action="generate-pdf"]').click();
      // The interception's resolve will fire when html2canvas is called
    });
  }, buildScaleStyle(3));

  // Write the captured HTML
  writeFileSync(join(OUT_DIR, 'cascade-dom.html'), cascadeData.stageHTML, 'utf-8');

  // Clean up residual stage
  await page.evaluate(() => { document.getElementById('pdf-stage').innerHTML = ''; });
  await page.waitForTimeout(300);

  console.log('  linkExists:', cascadeData.linkExists);
  console.log('  linkInHead:', cascadeData.linkInHead);
  console.log('  injectedStyleExists:', cascadeData.injectedStyleExists);
  console.log('  injectedStyleInStage:', cascadeData.injectedStyleInStage);
  console.log('  linkBeforeStyleInDOM:', cascadeData.linkBeforeStyleInDOM);
  console.log('  computedTHFontSize:', cascadeData.computedTHFontSize);
  console.log('  expectedTHFontSize:', cascadeData.expectedTHFontSize);
  console.log('  CASCADE PASS:', cascadeData.computedTHFontSize === cascadeData.expectedTHFontSize);
  console.log('  DOM HTML saved to verif-fontsize/cascade-dom.html');

  // Clean the style element
  await page.evaluate(() => { const s = document.getElementById('fontsize-offset-test'); if (s) s.remove(); });

  return cascadeData;
}

// ===========================================================================
// TEST 2 — CELL OVERFLOW (ARABIC)
// ===========================================================================

async function testCellOverflow(page) {
  console.log('\n=== TEST 2: CELL OVERFLOW (ARABIC) ===');

  await switchLang(page, 'ar');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const longArabic = 'خدمات استشارية متخصصة في التسويق الرقمي والتطوير والبرمجة';

  if (await page.locator('#clientSelect option:nth-child(2)').count() === 0) {
    await fillClient(page);
  } else {
    await page.selectOption('#clientSelect', { index: 1 });
    await page.waitForTimeout(200);
  }

  const results = {};
  for (const offset of [-3, 0, 3]) {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.selectOption('#clientSelect', { index: 1 });
    await page.waitForTimeout(200);

    // Set offset in localStorage
    await page.evaluate((o) => {
      const raw = localStorage.getItem('fb_company');
      if (raw) {
        const c = JSON.parse(raw);
        c.fontSizeOffset = o;
        localStorage.setItem('fb_company', JSON.stringify(c));
      }
    }, offset);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.selectOption('#clientSelect', { index: 1 });
    await page.waitForTimeout(200);
    await fillLine(page, longArabic, '1000', '1');

    // Override html2canvas to make stage visible and inject style
    const result = await page.evaluate(async (scaleHtml) => {
      return new Promise((resolve) => {
        const original = window.html2canvas;
        window.html2canvas = async function(el, opts) {
          const stage = document.getElementById('pdf-stage');
          stage.insertAdjacentHTML('afterbegin', scaleHtml);

          // Temporarily make visible for screenshot
          const oldLeft = stage.style.left;
          stage.style.left = '0';
          stage.style.position = 'relative';
          stage.style.zIndex = '99999';
          document.body.style.overflow = 'visible';

          const td = stage.querySelector('table.pdf-table td');
          const tdRect = td ? td.getBoundingClientRect() : null;
          const textWidth = td ? td.scrollWidth : 0;
          const cellWidth = td ? td.clientWidth : 0;

          await new Promise(r => setTimeout(r, 100));

          // Restore
          stage.style.left = oldLeft;
          stage.style.position = 'fixed';
          stage.style.zIndex = '';
          document.body.style.overflow = '';

          window.html2canvas = original;

          const style = document.getElementById('fontsize-offset-test');
          if (style) style.remove();

          resolve({
            textWidth,
            cellWidth,
            overflows: textWidth > cellWidth,
            tdRect: tdRect ? { width: tdRect.width, height: tdRect.height } : null,
            hasTable: !!stage.querySelector('table.pdf-table'),
          });
        };
        document.querySelector('[data-action="generate-pdf"]').click();
      });
    }, buildScaleStyle(offset));

    results[offset] = result;

    let overflowFlag = result.overflows ? 'OVERFLOW' : 'OK';
    console.log(`  offset ${offset}: hasTable=${result.hasTable}, cellWidth=${result.cellWidth}px, textWidth=${result.textWidth}px, overflows=${overflowFlag}`);

    await page.evaluate(() => { document.getElementById('pdf-stage').innerHTML = ''; });
    await page.waitForTimeout(300);
  }

  return results;
}

// ===========================================================================
// TEST 3 — PAGE 2 FOR EACH OFFSET
// ===========================================================================

async function testPageCount(page) {
  console.log('\n=== TEST 3: PAGE COUNT PER OFFSET ===');

  await switchLang(page, 'fr');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  if (await page.locator('#clientSelect option:nth-child(2)').count() === 0) {
    await fillClient(page);
  }

  const pageResults = {};
  for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.selectOption('#clientSelect', { index: 1 });
    await page.waitForTimeout(200);

    await page.evaluate((o) => {
      const raw = localStorage.getItem('fb_company');
      if (raw) {
        const c = JSON.parse(raw);
        c.fontSizeOffset = o;
        localStorage.setItem('fb_company', JSON.stringify(c));
      }
    }, offset);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.selectOption('#clientSelect', { index: 1 });
    await page.waitForTimeout(200);
    await fillLine(page, 'Article minimal', '100', '1');

    const result = await page.evaluate(async (scaleHtml) => {
      return new Promise((resolve) => {
        const original = window.html2canvas;
        window.html2canvas = async function(el, opts) {
          // Inject style
          const stage = document.getElementById('pdf-stage');
          if (scaleHtml) stage.insertAdjacentHTML('afterbegin', scaleHtml);

          const canvas = await original(el, opts);
          const imgHeight = canvas.height * 210 / canvas.width;
          const totalPages = Math.max(1, Math.ceil((imgHeight - 0.5) / 297));

          window.html2canvas = original;

          const style = document.getElementById('fontsize-offset-test');
          if (style) style.remove();

          resolve({
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            imgHeightMm: imgHeight.toFixed(2),
            totalPages,
          });
        };
        document.querySelector('[data-action="generate-pdf"]').click();
      });
    }, offset === 0 ? '' : buildScaleStyle(offset));

    pageResults[offset] = result;
    console.log(`  offset ${offset}: canvas ${result.canvasWidth}x${result.canvasHeight}, imgHeight=${result.imgHeightMm}mm, pages=${result.totalPages}`);

    await page.evaluate(() => { document.getElementById('pdf-stage').innerHTML = ''; });
    await page.waitForTimeout(300);
  }

  return pageResults;
}

// ===========================================================================
// MAIN
// ===========================================================================

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // TEST 1: Cascade order
    const cascade = await testCascadeOrder(page);

    // TEST 2: Cell overflow
    const overflow = await testCellOverflow(page);

    // TEST 3: Page count
    const pageCounts = await testPageCount(page);

    // Write results JSON
    const results = {
      cascadeOrder: {
        linkExists: cascade.linkExists,
        linkInHead: cascade.linkInHead,
        injectedStyleExists: cascade.injectedStyleExists,
        injectedStyleInStage: cascade.injectedStyleInStage,
        linkBeforeStyleInDOM: cascade.linkBeforeStyleInDOM,
        computedTHFontSize: cascade.computedTHFontSize,
        expectedTHFontSize: cascade.expectedTHFontSize,
        pass: cascade.computedTHFontSize === cascade.expectedTHFontSize,
        domHTMLFile: 'verif-fontsize/cascade-dom.html',
      },
      cellOverflow: overflow,
      pageCount: pageCounts,
    };

    writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2), 'utf-8');
    console.log('\n=== RESULTS written to verif-fontsize/results.json ===');
  } catch (err) {
    console.error('FATAL:', err.message);
    // Attempt screenshot on error
    try { await page.screenshot({ path: join(OUT_DIR, 'error-screenshot.png') }); } catch (_) {}
  } finally {
    await browser.close();
  }
})();
