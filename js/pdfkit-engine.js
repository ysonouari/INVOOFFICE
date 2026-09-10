import {
  buildPdfHtml,
  buildPages,
  prepareTextElements,
  resolveHeaderImage,
} from './pdf.js';
import {
  TAJAWAL_REGULAR_B64,
  TAJAWAL_BOLD_B64,
  TAJAWAL_EXTRA_BOLD_B64,
  TAJAWAL_BLACK_B64,
} from './pdf-font.js';
import { ensureHtml2Canvas } from './pdf-dependencies.js';

const MM = 72 / 25.4;
const A4_W_MM = 210;
const A4_H_MM = 297;
const BUNDLE_SRC = '/assets/lib/pdfkit.standalone.js';

const BG_KEY = 'fb_pdf_bg';
const BG_MODE_KEY = 'fb_pdf_bg_mode';
const BG_FMT_KEY = 'fb_pdf_bg_fmt';
const BG_DEFAULT = { src: '/entit.png', mode: 'full', fmt: 'jpeg' };

function getBgConfig(company) {
  try {
    const src = localStorage.getItem(BG_KEY);
    if (src === 'off' || src === 'none') return null;
    if (src) {
      const mode = localStorage.getItem(BG_MODE_KEY) === 'header' ? 'header' : 'full';
      const fmt = localStorage.getItem(BG_FMT_KEY) === 'png' ? 'png' : 'jpeg';
      return { src, mode, fmt, dflt: false };
    }
  } catch (_) {
    return null;
  }
  if (company && company.headerActive) return null;
  return Object.assign({}, BG_DEFAULT, { dflt: true });
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de charger le fond ' + src.slice(0, 80)));
    img.src = src;
  });
}

async function loadBgImage(src, toJpeg) {
  let dataUri = src;
  if (/^(https?:|blob:)/.test(src)) {
    const blob = await (await fetch(src)).blob();
    dataUri = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  const img = await loadImageEl(dataUri);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  let out = dataUri;
  let format = dataUri.includes('data:image/jpeg') ? 'JPEG' : 'PNG';
  if (toJpeg) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d').drawImage(img, 0, 0);
    out = c.toDataURL('image/jpeg', 0.88);
    format = 'JPEG';
    c.width = c.height = 0;
  }
  return { dataUri: out, format, width, height };
}

let pdfkitPromise = null;

export function ensurePdfKit() {
  if (window.PDFDocument) return Promise.resolve();
  if (!pdfkitPromise) {
    pdfkitPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = BUNDLE_SRC;
      script.onload = () => (
        window.PDFDocument ? resolve() : reject(new Error('PDFKit bundle chargé sans PDFDocument global'))
      );
      script.onerror = () => reject(new Error('Impossible de charger ' + BUNDLE_SRC));
      document.head.appendChild(script);
    });
  }
  return pdfkitPromise;
}

function b64ToU8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function registerFonts(doc) {
  doc.registerFont('Tajawal-Regular', b64ToU8(TAJAWAL_REGULAR_B64));
  doc.registerFont('Tajawal-Bold', b64ToU8(TAJAWAL_BOLD_B64));
  doc.registerFont('Tajawal-ExtraBold', b64ToU8(TAJAWAL_EXTRA_BOLD_B64));
  doc.registerFont('Tajawal-Black', b64ToU8(TAJAWAL_BLACK_B64));
}

function fontVariant(fontWeight) {
  if (fontWeight >= 900) return 'Tajawal-Black';
  if (fontWeight >= 800) return 'Tajawal-ExtraBold';
  if (fontWeight >= 700) return 'Tajawal-Bold';
  return 'Tajawal-Regular';
}

function writePageOverlayPdfkit(doc, textElements) {
  doc.fillColor('#ffffff');
  doc.fillOpacity(0);

  for (const el of textElements) {
    if (!el.text) continue;

    doc.font(fontVariant(el.fontWeight));
    doc.fontSize(Math.max(el.fontSizePt, 1));

    let x = el.x_mm;
    if (el.textAlign === 'right') x = el.x_mm + el.w_mm;
    else if (el.textAlign === 'center') x = el.x_mm + el.w_mm / 2;

    doc.text(el.text, x * MM, el.y_mm * MM, { lineBreak: false });
  }

  doc.fillOpacity(1);
  doc.fillColor('#000000');
}

function collectOutput(doc) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let length = 0;
    doc.on('data', (chunk) => {
      const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      parts.push(u8);
      length += u8.length;
    });
    doc.on('end', () => {
      const merged = new Uint8Array(length);
      let offset = 0;
      for (const part of parts) {
        merged.set(part, offset);
        offset += part.length;
      }
      resolve(merged);
    });
    doc.on('error', reject);
  });
}

function u8ToDataUri(u8) {
  let binary = '';
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return 'data:application/pdf;base64,' + btoa(binary);
}

function makeAdapter(merged, metrics) {
  return {
    _pdfkitMetrics: metrics,
    output(type) {
      if (type === 'blob') return new Blob([merged], { type: 'application/pdf' });
      if (type === 'datauristring') return u8ToDataUri(merged);
      throw new Error('output(' + type + ') non pris en charge par le moteur pdfkit');
    },
    save(filename) {
      const blob = new Blob([merged], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
  };
}

export async function renderPagesToPdfPdfkit(payload, headerUrl) {
  const now = () => (performance && performance.now ? performance.now() : Date.now());
  const metrics = { engine: 'pdfkit', steps: {} };
  const tWall0 = now();

  const f = buildPdfHtml(payload, headerUrl);

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = f.styleHtml;
  void stage.offsetHeight;
  await document.fonts.ready;
  const pages = buildPages(f, stage);
  metrics.steps.buildHtmlMs = now() - tWall0;

  await ensurePdfKit();
  await ensureHtml2Canvas();

  const scale = payload.company.pdfQuality || 2;
  const header = await resolveHeaderImage(headerUrl, payload.company);
  metrics.steps.headerResolveMs = now() - tWall0;

  const bgCfg = getBgConfig(payload.company);
  let bg = null;
  let bgEmbedMs = 0;
  if (bgCfg) {
    const tBg0 = now();
    const fullSrc = /^(data:|blob:|https?:)/.test(bgCfg.src)
      ? bgCfg.src
      : new URL(bgCfg.src, location.origin).href;
    bg = await loadBgImage(fullSrc, bgCfg.fmt === 'jpeg');
    metrics.steps.bgResolveMs = now() - tBg0;
    metrics.bg = { src: bgCfg.src, mode: bgCfg.mode, fmt: bgCfg.fmt, actualFmt: bg.format, width: bg.width, height: bg.height, dflt: !!bgCfg.dflt };
  }

  const doc = new window.PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    compress: true,
  });

  const tFonts0 = now();
  registerFonts(doc);
  metrics.steps.registerFontsMs = now() - tFonts0;

  let captureMs = 0;
  let embedMs = 0;
  let overlayMs = 0;

  for (let p = 0; p < pages.length; p++) {
    doc.addPage();

    if (bg) {
      const t0 = now();
      if (bgCfg.mode === 'full') {
        doc.image(bg.dataUri, 0, 0, { width: A4_W_MM * MM, height: A4_H_MM * MM });
      } else {
        doc.image(bg.dataUri, 0, 0, { width: A4_W_MM * MM, height: A4_W_MM * bg.height / bg.width * MM });
      }
      bgEmbedMs += now() - t0;
    }

    if (header) {
      const wMm = A4_W_MM;
      const hMm = A4_W_MM * header.height / header.width;
      const t0 = now();
      doc.image(header.dataUri, 0, 0, { width: wMm * MM, height: hMm * MM });
      embedMs += now() - t0;
    }

    const tCap = now();
    const canvas = await html2canvas(pages[p], {
      scale,
      useCORS: true,
      backgroundColor: header || bg ? null : '#ffffff',
      logging: false,
    });
    const imgData = canvas.toDataURL('image/png');
    captureMs += now() - tCap;

    const tEmb = now();
    doc.image(imgData, 0, 0, { width: A4_W_MM * MM, height: A4_H_MM * MM });
    embedMs += now() - tEmb;

    const tOv = now();
    writePageOverlayPdfkit(doc, prepareTextElements(pages[p]));
    overlayMs += now() - tOv;

    canvas.width = canvas.height = 0;
  }

  metrics.steps.captureMs = captureMs;
  metrics.steps.embedMs = embedMs;
  metrics.steps.overlayMs = overlayMs;
  if (bg) metrics.steps.bgEmbedMs = bgEmbedMs;

  const tOut = now();
  const outPromise = collectOutput(doc);
  doc.end();
  const merged = await outPromise;
  metrics.steps.outputMs = now() - tOut;
  metrics.steps.totalMs = now() - tWall0;
  metrics.pages = pages.length;
  metrics.sizeBytes = merged.length;

  try { window.__pdfkitEngineMetrics = metrics; } catch (_) {}

  return makeAdapter(merged, metrics);
}