import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded', timeout: 8000 });
await page.waitForSelector('#linesBody', { timeout: 5000 });

const ok = []; const fail = [];
const check = (l, v) => v ? (ok.push(l), console.log('  OK ' + l)) : (fail.push(l), console.log('  FAIL ' + l));

// m21: 71 spelling
const r21 = await page.evaluate(async () => { const m = await import('./js/utils.js'); return m.numberToWordsFR(71); });
check('m21: soixante-et-onze', r21 === 'soixante-et-onze');

// m22: contrast fallback
const r22 = await page.evaluate(async () => { const m = await import('./js/utils.js'); return m.getContrastColor('invalid'); });
check('m22: getContrastColor safe', r22 === '#333333');

// m10: scope=col
check('m10: scope=col', await page.evaluate(() => !!document.querySelector('table.lines th[scope]')));

// m13: Inter removed
check('m13: Inter removed', await page.evaluate(() => !getComputedStyle(document.body).fontFamily.includes('Inter')));

// Forms still work
await page.locator('[data-action="add-line"]').click();
check('forms still work', await page.evaluate(async () => { const m = await import('./js/lines.js'); return m.getLinesData().length > 0; }));

// Icons.js compiles (no more icon function)
check('icons clean', await page.evaluate(async () => { const m = await import('./js/icons.js'); return typeof m.ICONS.plus === 'string'; }));

console.log('\n' + '='.repeat(40));
console.log('PASSED:', ok.length, 'FAILED:', fail.length);
if (fail.length) fail.forEach(f => console.log('  FAIL:', f));
await browser.close();
process.exit(fail.length ? 1 : 0);
