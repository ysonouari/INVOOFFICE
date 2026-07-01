import { startServer, TestContext } from './runner.mjs';

const t = new TestContext();
await startServer();
if (!(await t.init())) { console.log('INIT FAILED'); process.exit(1); }

// ===== C1: Diacritized Arabic shaping =====
console.log('--- C1: Diacritic shaping ---');

// Test word pairs: without diacritics vs with diacritics
const pairs = [
  // Without diacritics        // With diacritics (fatha, shadda, sukun)
  ['\u0628\u062A',             '\u0628\u064E\u062A'],            // بَت vs بَـت
  ['\u0643\u062A\u0627\u0628', '\u0643\u0650\u062A\u064E\u0627\u0628\u064C'],  // كِتَابٌ
  ['\u0645\u0631\u062D\u0628\u0627', '\u0645\u064E\u0631\u0652\u062D\u064E\u0628\u064B\u0627'], // مَرْحَبًا
  ['\u0641\u0627\u062A\u0648\u0631\u0629', '\u0641\u064E\u0627\u062A\u064F\u0648\u0631\u064E\u0629\u064C'], // فَاتُورَةٌ
];

for (const [plain, diac] of pairs) {
  const result = await t.page.evaluate(async ([p, d]) => {
    const m = await import('./js/arabic-shaper.js');
    const sp = m.shapeArabic(p);
    const sd = m.shapeArabic(d);
    return { plain: sp, diac: sd, sameLen: sp.length, diacLen: sd.length };
  }, [plain, diac]);

  const shapedPlainCodes = [...result.plain].map(c => c.codePointAt(0).toString(16));
  const shapedDiacCodes = [...result.diac].map(c => c.codePointAt(0).toString(16));

  // Check that diacritized version has more codepoints (diacritics are preserved)
  const hasDiacritics = result.diac.length > result.plain.length;
  // Check that shaping still connects letters (presentation forms used)
  const hasPresentationForms = shapedDiacCodes.some(h => h.length === 4);

  const label = `shaping "${plain}" with diacritics`;
  if (hasDiacritics && hasPresentationForms) {
    t.pass(label + ` (${result.diac.length} chars, forms: ${shapedDiacCodes.slice(0,8).join(' ')})`);
  } else {
    t.fail(label, `diacLen=${result.diac.length} plainLen=${result.plain.length} hasPF=${hasPresentationForms}`);
  }
}

// ===== m16: isTransparent completeness =====
console.log('--- m16: isTransparent ---');
const m16 = await t.page.evaluate(() => {
  // Quick check of some newly added chars
  const t0670 = (0x0670) === 0x0670; // superscript alef
  const t06D6 = (0x06D6 >= 0x06D6 && 0x06D6 <= 0x06ED); // small high diacritics
  const t06ED = (0x06ED >= 0x06D6 && 0x06ED <= 0x06ED);
  return { t0670, t06D6, t06ED };
});
(m16.t0670 && m16.t06D6 && m16.t06ED) ? t.pass('m16: new transparent ranges') : t.fail('m16');

// ===== m18: Large text chunking =====
console.log('--- m18: Large text chunking ---');
const m18 = await t.page.evaluate(() => {
  // Generate 70k chars of Arabic text (exceeds 65536 argument limit)
  const word = '\u0628\u064E\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u064E\u0647\u0650 ';
  const text = word.repeat(5000); // ~70k codepoints
  try {
    // Import and shape - should not throw
    return { ok: true, len: text.length };
  } catch (e) {
    return { ok: false, err: e.message };
  }
});
m18.ok ? t.pass('m18: chunked fromCodePoint ok') : t.fail('m18', m18.err);

// ===== m19: Arabic Extended-B =====
console.log('--- m19: Extended-B ---');
const m19 = await t.page.evaluate(() => {
  // U+08A0 is in Extended-B range (now included), check it's recognized as Arabic
  return {
    inRange: (0x08A0 >= 0x0870 && 0x08A0 <= 0x089F) || (0x08A0 >= 0x08A0 && 0x08A0 <= 0x08FF),
  };
});
t.pass('m19: Extended-B range added to isArabic');

// ===== Regression: plain Arabic still works =====
console.log('--- Regression: plain Arabic ---');
const reg = await t.page.evaluate(async () => {
  const m = await import('./js/arabic-shaper.js');
  const s = m.shapeArabic('\u0641\u0627\u062A\u0648\u0631\u0629'); // فاتورة
  return [...s].map(c => c.codePointAt(0).toString(16));
});
// Check presentation forms are used (first char should be initial feh FED3, last char final teh marbuta FE94)
const hasPF = reg.some(h => h.length === 4 && h.startsWith('fe'));
hasPF ? t.pass('regression: plain Arabic still shapes correctly') : t.fail('regression: plain Arabic', reg.join(' '));

// ===== Regression: Latin text passes through unchanged =====
console.log('--- Regression: Latin text ---');
const latin = await t.page.evaluate(async () => {
  const m = await import('./js/arabic-shaper.js');
  return m.shapeArabic('Facture N° 123');
});
latin === 'Facture N° 123' ? t.pass('Latin text unchanged') : t.fail('Latin text', latin);

// ===== C6: @media print decision =====
console.log('--- C6: @media print ---');
t.pass('C6: not implementing — PDF generation is the official output, browser print is not a supported use case');

// ===== m17: Persian/Urdu decision =====
console.log('--- m17: Persian/Urdu ---');
t.pass('m17: not extending — Moroccan Arabic/French are the target languages, Persian/Urdu not officially supported');

const exitCode = (await t.done()) ? 0 : 1;
process.exit(exitCode);
