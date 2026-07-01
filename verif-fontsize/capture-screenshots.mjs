import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

const BASE_URL = 'http://127.0.0.1:8080';
const OUT_DIR = join(import.meta.dirname, '..', 'verif-fontsize');
mkdirSync(OUT_DIR, { recursive: true });

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
    `#pdf-stage ${r.sel} { font-size: ${r.base + offset}px; }`).join('\n')}\n</style>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const longArabic = 'خدمات استشارية متخصصة في التسويق الرقمي والتطوير والبرمجة';

  // Switch to AR and reload once, then reuse the same page
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const currentLang = await page.evaluate(() => document.documentElement.lang);
  if (currentLang !== 'ar') {
    await page.click('#langSwitcher');
    await page.waitForTimeout(1000);
  }

  for (const offset of [-3, 0, 3]) {
    console.log(`\n--- Capturing offset ${offset} ---`);

    const stageExists = await page.locator('#pdf-stage').count();
    if (stageExists > 0) {
      await page.evaluate(() => {
        const s = document.getElementById('pdf-stage');
        s.innerHTML = ''; s.style.cssText = '';
      });
    }
    await page.waitForTimeout(200);

    // Direct inject PDF HTML + style into #pdf-stage
    await page.evaluate(({ styleBlock }) => {
      const stage = document.getElementById('pdf-stage');
      const i18n = window.i18next;

      const rowsHtml = `<tr><td>خدمات استشارية متخصصة في التسويق الرقمي والتطوير والبرمجة</td><td class="num">1000.00</td><td class="num">1</td><td class="num">1000.00</td></tr>`
        + `<tr><td>تدقيق تقني شامل</td><td class="num">2000.00</td><td class="num">3</td><td class="num">6000.00</td></tr>`;

      stage.innerHTML = styleBlock + `
      <div class="pdf-page" style="padding-top:14mm;" dir="rtl" lang="ar">
        <div class="pdf-content">
          <div class="doc-meta">
            <div><b>${i18n.t('pdf.label_numero')}</b> FAC-2026-0001</div>
            <div><b>${i18n.t('pdf.label_date')}</b> 01/07/2026</div>
          </div>
          <div class="pdf-title">${i18n.t('docTypes.facture')}</div>
          <div class="pdf-client">
            <span class="lbl">${i18n.t('pdf.label_client')}</span> زبون الاختبار<br>
            0600000000
          </div>
          <table class="pdf-table">
            <colgroup>
              <col style="width:42%"><col style="width:20%"><col style="width:15%"><col style="width:23%">
            </colgroup>
            <thead>
              <tr>
                <th style="background:#eef1f6;color:#333333;">${i18n.t('pdf.th_designation')}</th>
                <th class="num" style="background:#eef1f6;color:#333333;">${i18n.t('pdf.th_price')}</th>
                <th class="num" style="background:#eef1f6;color:#333333;">${i18n.t('pdf.th_qty')}</th>
                <th class="num" style="background:#eef1f6;color:#333333;">${i18n.t('pdf.th_total')}</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="pdf-totals"><table>
            <tr><td class="lbl">${i18n.t('pdf.total_ht')}</td><td class="val">7000.00 DH</td></tr>
            <tr><td class="lbl">${i18n.t('pdf.tva', {rate:20})}</td><td class="val">1400.00 DH</td></tr>
            <tr class="ttc"><td class="lbl">${i18n.t('pdf.total_ttc')}</td><td class="val">8400.00 DH</td></tr>
          </table></div>
          <div class="pdf-words">${i18n.t('pdf.words_prefix')} <b>HUIT MILLE QUATRE CENTS DIRHAMS</b></div>
          <div class="pdf-conditions">
            <div><b>${i18n.t('pdf.label_conditions')}</b> Paiement comptant</div>
            <div><b>${i18n.t('pdf.label_reglement')}</b> Virement bancaire</div>
          </div>
          <div class="pdf-note">Note de test arabe</div>
        </div>
        <div class="pdf-footer">شركة الاختبار</div>
      </div>`;

      stage.style.position = 'relative';
      stage.style.left = '0';
      stage.style.zIndex = '99999';
      stage.style.background = '#ffffff';
      document.body.style.overflow = 'visible';
    }, { styleBlock: buildScaleStyle(offset) });

    await page.waitForTimeout(500);

    const filename = `cellule-offset-${String(offset).replace('-','m')}.png`;
    await page.locator('#pdf-stage').screenshot({ path: join(OUT_DIR, filename) });
    console.log(`  Screenshot saved: ${filename}`);
  }

  console.log('\nAll done.');
  await browser.close();
})();
