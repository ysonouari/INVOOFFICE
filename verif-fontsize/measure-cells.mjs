import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';
const ARABIC = 'خدمات استشارية متخصصة في التسويق الرقمي والتطوير والبرمجة';

const RULES = [
  '.pdf-page:11.5', '.doc-meta:11', '.pdf-title:22', '.pdf-client:11',
  '.pdf-ref:10.5', 'table.pdf-table thead th:10', 'table.pdf-table td:11',
  '.pdf-totals table:11.5', '.pdf-totals tr.ttc td:13', '.pdf-words:11',
  '.pdf-note:10', '.pdf-conditions:10.5', '.pdf-footer:9.5',
];

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForTimeout(1000);
  await p.click('#langSwitcher');
  await p.waitForTimeout(1000);

  console.log('offset,fontSize(px),cellWidth(px),scrollWidth(px),overflows');
  for (const offset of [-3, -2, -1, 0, 1, 2, 3]) {
    const cssBlock = RULES.map(r => {
      const parts = r.split(':');
      return '#pdf-stage ' + parts[0] + ' { font-size: ' + (parseFloat(parts[1]) + offset) + 'px; }';
    }).join('\n');

    const styleBlock = '<style>' + cssBlock + '</style>';

    const data = await p.evaluate(({ styleBlock }) => {
      const s = document.getElementById('pdf-stage');
      s.innerHTML = styleBlock
        + '<div class="pdf-page" style="padding-top:14mm;" dir="rtl" lang="ar">'
        + '<div class="pdf-content"><table class="pdf-table">'
        + '<colgroup><col style="width:42%"><col style="width:20%"><col style="width:15%"><col style="width:23%"></colgroup>'
        + '<tbody><tr>'
        + '<td>'+ decodeURIComponent('%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%20%D8%A7%D8%B3%D8%AA%D8%B4%D8%A7%D8%B1%D9%8A%D8%A9%20%D9%85%D8%AA%D8%AE%D8%B5%D8%B5%D8%A9%20%D9%81%D9%8A%20%D8%A7%D9%84%D8%AA%D8%B3%D9%88%D9%8A%D9%82%20%D8%A7%D9%84%D8%B1%D9%82%D9%85%D9%8A%20%D9%88%D8%A7%D9%84%D8%AA%D8%B7%D9%88%D9%8A%D8%B1%20%D9%88%D8%A7%D9%84%D8%A8%D8%B1%D9%85%D8%AC%D8%A9') +'</td>'
        + '<td class="num">1000.00</td><td class="num">1</td><td class="num">1000.00</td>'
        + '</tr></tbody></table></div></div>';
      s.style.position = 'relative'; s.style.left = '0'; s.style.zIndex = '99999'; s.style.background = '#fff';

      const td = s.querySelector('table.pdf-table td:first-child');
      const cs = window.getComputedStyle(td);
      return { fontSize: cs.fontSize, cw: td.clientWidth, sw: td.scrollWidth, ov: td.scrollWidth > td.clientWidth + 1 };
    }, { styleBlock });

    console.log(offset + ',' + data.fontSize + ',' + data.cw + ',' + data.sw + ',' + data.ov);
    await p.evaluate(() => { const s = document.getElementById('pdf-stage'); s.innerHTML = ''; s.style.cssText = ''; });
  }
  await b.close();
})();
