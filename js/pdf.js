import { DOC_TYPES } from './config.js';
import { loadCompany, isNumeroUnique } from './storage.js';
import { escapeHtml, currencySymbol, montantEnLettres, montantEnLettresAr, getContrastColor } from './utils.js';
import { recalcTotals } from './lines.js';
import { getSelectedClient } from './client.js';
import { saveToHistory, getEditingDocId } from './history.js';
import { showAlertDialog } from './dialog.js';
import { loadHeaderImage, savePdfFile } from './opfs-storage.js';

export async function registerFontsForDoc(pdf) {
  const f = await import('./pdf-font.js');
  pdf.addFileToVFS('Tajawal-Regular.ttf', f.TAJAWAL_REGULAR_B64);
  pdf.addFileToVFS('Tajawal-Bold.ttf', f.TAJAWAL_BOLD_B64);
  pdf.addFileToVFS('Tajawal-ExtraBold.ttf', f.TAJAWAL_EXTRA_BOLD_B64);
  pdf.addFileToVFS('Tajawal-Black.ttf', f.TAJAWAL_BLACK_B64);
  pdf.addFont('Tajawal-Regular.ttf', 'Tajawal', 'normal');
  pdf.addFont('Tajawal-Bold.ttf', 'Tajawal', 'bold');
  pdf.addFont('Tajawal-ExtraBold.ttf', 'Tajawal', '800');
  pdf.addFont('Tajawal-Black.ttf', 'Tajawal', '900');
}

const TEXT_CONTAINER_SELECTORS = [
  '.doc-meta > div',
  '.pdf-title',
  '.pdf-client',
  '.pdf-ref',
  '.pdf-table thead th',
  '.pdf-table tbody td',
  '.pdf-totals td',
  '.pdf-words',
  '.pdf-conditions > div',
  '.pdf-note',
  '.pdf-footer',
];

export function collectTextElements(pageEl) {
  const pageRect = pageEl.getBoundingClientRect();
  const elements = [];
  const seen = new Set();

  for (const selector of TEXT_CONTAINER_SELECTORS) {
    const nodes = pageEl.querySelectorAll(selector);
    for (const el of nodes) {
      if (seen.has(el)) continue;
      seen.add(el);
      const text = el.textContent.trim();
      if (!text) continue;

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      const bg = style.backgroundColor;
      const isBgWhite = !bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || bg === 'rgb(255, 255, 255)';
      if (!isBgWhite) continue;

      const parentStyle = window.getComputedStyle(el.parentElement);

      const x = rect.left - pageRect.left;
      const y = rect.top - pageRect.top;
      const w = rect.width;
      const h = rect.height;

      if (w <= 0 || h <= 0) continue;

      let textAlign = style.textAlign;
      if (textAlign === 'start' || textAlign === 'end') {
        textAlign = style.direction === 'rtl'
          ? (textAlign === 'start' ? 'right' : 'left')
          : (textAlign === 'start' ? 'left' : 'right');
      }
      if (textAlign !== 'left' && textAlign !== 'right' && textAlign !== 'center') {
        if (parentStyle.textAlign === 'right' || parentStyle.textAlign === 'center') {
          textAlign = parentStyle.textAlign;
        } else {
          textAlign = style.direction === 'rtl' ? 'right' : 'left';
        }
      }

      elements.push({
        text,
        x,
        y,
        width: w,
        height: h,
        fontSize: parseFloat(style.fontSize),
        fontWeight: parseInt(style.fontWeight) || 400,
        textAlign,
        direction: style.direction,
      });
    }
  }

  return elements;
}

export function prepareTextElements(pageEl) {
  const textElements = collectTextElements(pageEl);
  const pageRect = pageEl.getBoundingClientRect();
  const pxToMm = 210 / pageRect.width;

  for (const el of textElements) {
    el.x_mm = el.x * pxToMm;
    el.y_mm = el.y * pxToMm;
    el.w_mm = el.width * pxToMm;
    el.h_mm = el.height * pxToMm;
    el.fontSizePt = el.fontSize * 0.75;
  }

  return textElements;
}

export function writePageOverlay(pdf, textElements, isRtl) {
  pdf.setTextColor(255, 255, 255);
  pdf.internal.write('3 Tr');

  for (const el of textElements) {
    const pdfY = el.y_mm;
    const pdfX = el.x_mm;

    let variant = 'normal';
    if (el.fontWeight >= 900) variant = '900';
    else if (el.fontWeight >= 800) variant = '800';
    else if (el.fontWeight >= 700) variant = 'bold';
    pdf.setFont('Tajawal', variant);
    pdf.setFontSize(Math.max(el.fontSizePt, 1));

    const align = el.textAlign;
    const useRtl = isRtl || el.direction === 'rtl';

    let x;
    if (align === 'right') {
      x = pdfX + el.w_mm;
    } else if (align === 'center') {
      x = pdfX + el.w_mm / 2;
    } else {
      x = pdfX;
    }

    pdf.text(el.text, x, pdfY, {
      align: align,
      maxWidth: align === 'left' ? el.w_mm : undefined,
      isRTL: useRtl,
    });
  }
  pdf.internal.write('0 Tr');
}

function getRegimeConfig(regime) {
  if (regime === 'exoneree') {
    return {
      showHT: false,
      showTVA: false,
      totalLabel: 'pdf.total',
      amountSuffix: '',
    };
  }
  return {
    showHT: true,
    showTVA: true,
    totalLabel: 'pdf.total_ttc',
    amountSuffix: i18next.t('utils.ttc_suffix'),
  };
}

function buildFooterLine(c) {
  const footerParts = [
    c.nom ? escapeHtml(c.nom) : '',
    c.adresse ? escapeHtml(c.adresse) : '',
    c.contact ? escapeHtml(c.contact) : '',
  ].filter(Boolean).join(' \u2014 ');

  const legalParts = [
    c.ice ? `ICE: ${escapeHtml(c.ice)}` : '', c.if_ ? `IF: ${escapeHtml(c.if_)}` : '',
    c.rc ? `RC: ${escapeHtml(c.rc)}` : '', c.tp ? `TP: ${escapeHtml(c.tp)}` : '', c.cnss ? `CNSS: ${escapeHtml(c.cnss)}` : '',
  ].filter(Boolean).join(' \u2014 ');

  return [footerParts, legalParts].filter(Boolean).join(' &nbsp;|&nbsp; ');
}

export function buildPdfHtml(payload, headerImageUrl){
  const c = payload.company;
  const cfg = DOC_TYPES[payload.type];
  const t = payload.totals;
  const rc = getRegimeConfig(c.regimeTva);

  const fso = c.fontSizeOffset || 0;
  const fs = (base) => (base + fso) + 'px';
  const fontScaleStyle = fso !== 0 ? `
<style id="fontsize-offset">
#pdf-stage .pdf-page{font-size:${fs(11.5)};}
#pdf-stage .doc-meta{font-size:${fs(11)};}
#pdf-stage .pdf-title{font-size:${fs(22)};}
#pdf-stage .pdf-client{font-size:${fs(11)};}
#pdf-stage .pdf-ref{font-size:${fs(10.5)};}
#pdf-stage table.pdf-table thead th{font-size:${fs(10)};}
#pdf-stage table.pdf-table td{font-size:${fs(11)};}
#pdf-stage .pdf-totals table{font-size:${fs(11.5)};}
#pdf-stage .pdf-totals tr.ttc td{font-size:${fs(13)};}
#pdf-stage .pdf-words{font-size:${fs(11)};}
#pdf-stage .pdf-note{font-size:${fs(10)};}
#pdf-stage .pdf-conditions{font-size:${fs(10.5)};}
#pdf-stage .pdf-footer{font-size:${fs(9.5)};}
</style>` : '';

  const img = headerImageUrl || c.headerImage || '';
  const hasHeader = c.headerActive && !!img;
  const bgStyle = hasHeader ? 'background:transparent;' : '';
  const paddingTop = hasHeader ? `${c.margeHaut}cm` : '14mm';

  const thBg = c.tableColor || '#eef1f6';
  const thColor = c.tableTextColor || getContrastColor(thBg);
  const thStyle = `background:${thBg};color:${thColor};`;

  const rowsHtml = t.lines.map(l=>`
    <tr>
      <td>${escapeHtml(l.desig)}</td>
      ${t.showPrices ? `<td class="num">${l.prix.toFixed(2)}</td><td class="num">${l.qte}</td><td class="num">${l.total.toFixed(2)}</td>` : `<td class="num">${l.qte}</td>`}
    </tr>`);

  let totalsHtml = '';
  if(t.showPrices){
    totalsHtml = `
      <div class="pdf-totals"><table>
        ${rc.showHT ? `<tr><td class="lbl">${i18next.t('pdf.total_ht')}</td><td class="val">${t.totalHT_brut.toFixed(2)} ${currencySymbol()}</td></tr>` : ''}
        ${t.remisePct>0 ? `<tr><td class="lbl">${i18next.t('pdf.remise', {pct: t.remisePct})}</td><td class="val">- ${t.remiseMontant.toFixed(2)} ${currencySymbol()}</td></tr>` : ''}
        ${rc.showTVA ? `<tr><td class="lbl">${i18next.t('pdf.tva', {rate: t.tvaTaux})}</td><td class="val">${t.tva.toFixed(2)} ${currencySymbol()}</td></tr>` : ''}
        <tr class="ttc"><td class="lbl">${i18next.t(rc.totalLabel)}</td><td class="val">${t.totalTTC.toFixed(2)} ${currencySymbol()}</td></tr>
        ${t.avance>0 ? `<tr><td class="lbl">${i18next.t('pdf.avance')}</td><td class="val">${t.avance.toFixed(2)} ${currencySymbol()}</td></tr>
        <tr class="ttc"><td class="lbl">${i18next.t('pdf.reste')}</td><td class="val">${t.reste.toFixed(2)} ${currencySymbol()}</td></tr>` : ''}
      </table></div>`;
  }

  const isRtl = i18next.language === 'ar';

  const wordsHtml = t.showPrices ? `<div class="pdf-words">${i18next.t('pdf.words_prefix')} <b>${isRtl ? montantEnLettresAr(t.totalTTC, rc.amountSuffix) : montantEnLettres(t.totalTTC, rc.amountSuffix)}</b></div>` : '';

  const footerLine = buildFooterLine(c);

  const conditionsHtml = (payload.conditions || payload.modeReglement) ? `
      <div class="pdf-conditions">
        ${payload.conditions ? `<div><b>${i18next.t('pdf.label_conditions')}</b> ${escapeHtml(payload.conditions)}</div>` : ''}
        ${payload.modeReglement ? `<div><b>${i18next.t('pdf.label_reglement')}</b> ${escapeHtml(payload.modeReglement)}</div>` : ''}
      </div>` : '';

  const headerBlockHtml = `
      <div class="doc-meta">
        <div><b>${i18next.t('pdf.label_numero')}</b> ${escapeHtml(payload.numero)}</div>
        <div><b>${i18next.t('pdf.label_date')}</b> ${escapeHtml(payload.date)}</div>
      </div>

      <div class="pdf-title">${i18next.t('docTypes.' + cfg.i18nKey)}</div>

      <div class="pdf-client">
        <span class="lbl">${i18next.t('pdf.label_client')}</span> ${escapeHtml(payload.client.nom)}<br>
        ${payload.client.ice ? i18next.t('pdf.label_ice') + escapeHtml(payload.client.ice) + '<br>' : ''}
        ${payload.client.adresse ? escapeHtml(payload.client.adresse) + '<br>' : ''}
        ${payload.client.tel ? escapeHtml(payload.client.tel) : ''}
      </div>
      ${payload.client.ref ? `<div class="pdf-ref">${escapeHtml(payload.client.ref)}</div>` : ''}`;

  const tableStartHtml = `
      <table class="pdf-table">
        <colgroup>
          <col style="width:${t.showPrices ? '42%' : '75%'}">
          ${t.showPrices ? '<col style="width:20%"><col style="width:15%"><col style="width:23%">' : '<col style="width:25%">'}
        </colgroup>
        <thead>
          <tr>
            <th style="${thStyle}">${i18next.t('pdf.th_designation')}</th>
            ${t.showPrices ? `<th class="num" style="${thStyle}">${i18next.t('pdf.th_price')}</th><th class="num" style="${thStyle}">${i18next.t('pdf.th_qty')}</th><th class="num" style="${thStyle}">${i18next.t('pdf.th_total')}</th>` : `<th class="num" style="${thStyle}">${i18next.t('pdf.th_qty')}</th>`}
          </tr>
        </thead>
        <tbody></tbody>
      </table>`;

  const finalBlockHtml = totalsHtml + wordsHtml + conditionsHtml +
    (payload.notes ? `<div class="pdf-note">${escapeHtml(payload.notes)}</div>` : '');

  return {
    styleHtml: fontScaleStyle,
    headerBlockHtml,
    tableStartHtml,
    rowsHtml,
    finalBlockHtml,
    footerHtml: `<div class="pdf-footer">${footerLine}</div>`,
    bgStyle,
    paddingTop,
    isRtl,
  };
}

const MM_TO_PX = 96 / 25.4;
const SAFETY_MM = 8;

function contentEl(pageEl){
  return pageEl.querySelector('.pdf-content');
}

function overflows(pageEl){
  const c = contentEl(pageEl);
  return c.scrollHeight > c.clientHeight;
}

function usableInnerHeight(pageEl){
  return contentEl(pageEl).clientHeight - (SAFETY_MM * MM_TO_PX);
}

function newPage(f, stage){
  const el = document.createElement('div');
  el.className = 'pdf-page';
  el.setAttribute('dir', f.isRtl ? 'rtl' : 'ltr');
  el.setAttribute('lang', f.isRtl ? 'ar' : 'fr');
  el.style.cssText = `${f.bgStyle}padding-top:${f.paddingTop};`;
  el.innerHTML = '<div class="pdf-content"></div>' + f.footerHtml;
  stage.appendChild(el);
  return el;
}

function openTable(content, f){
  content.insertAdjacentHTML('beforeend', f.tableStartHtml);
  return content.querySelector('.pdf-table tbody');
}

function buildPages(f, stage){
  const pages = [];
  let page = newPage(f, stage);
  let content = page.querySelector('.pdf-content');

  content.insertAdjacentHTML('beforeend', f.headerBlockHtml);
  let tBody = openTable(content, f);

  let i = 0;
  while (i < f.rowsHtml.length){
    tBody.insertAdjacentHTML('beforeend', f.rowsHtml[i]);
    if (overflows(page)){
      if (tBody.lastElementChild) tBody.lastElementChild.remove();
      if (tBody.children.length === 0){
        tBody.insertAdjacentHTML('beforeend', f.rowsHtml[i]);
        i++;
      }
      pages.push(page);
      page = newPage(f, stage);
      content = page.querySelector('.pdf-content');
      tBody = openTable(content, f);
      continue;
    }
    i++;
  }

  const finalBlock = document.createElement('div');
  finalBlock.className = 'pdf-final-block';
  finalBlock.innerHTML = f.finalBlockHtml;
  content.appendChild(finalBlock);

  let guard = 0;
  while (overflows(page) && guard < 1000){
    const trs = content.querySelectorAll('.pdf-table tbody tr');
    if (trs.length <= 1) break;
    if (finalBlock.offsetHeight > usableInnerHeight(page)) break;
    finalBlock.remove();
    const lastRow = trs[trs.length - 1];
    lastRow.remove();
    pages.push(page);
    page = newPage(f, stage);
    content = page.querySelector('.pdf-content');
    tBody = openTable(content, f);
    tBody.appendChild(lastRow);
    content.appendChild(finalBlock);
    guard++;
  }

  pages.push(page);
  return pages;
}

export function collectPayload(){
  const type = document.getElementById('docType').value;
  const totals = recalcTotals();
  const sel = getSelectedClient();
  const client = {
    id: sel ? sel.id : null,
    nom: sel ? sel.nom : i18next.t('pdf.client_fallback'),
    tel: sel ? (sel.tel || '') : '',
    ice: sel ? (sel.ice || '') : '',
    adresse: sel ? (sel.adresse || '') : '',
    ref: (cr => cr ? cr.value : '')(document.getElementById('clientRef')),
  };
  return {
    type,
    numero: document.getElementById('docNumero').value,
    date: (dv => dv ? new Date(dv).toLocaleDateString('fr-FR') : '')(document.getElementById('docDate').value),
    client,
    conditions: document.getElementById('conditions').value,
    modeReglement: document.getElementById('modeReglement').value,
    notes: document.getElementById('notes').value,
    company: loadCompany(),
    totals,
  };
}

async function validatePayload(payload){
  if(!payload.client.id){
    await showAlertDialog(i18next.t('pdf.alert_no_client'));
    return false;
  }
  if(payload.totals.lines.length === 0 || payload.totals.lines.every(l=>!l.desig)){
    await showAlertDialog(i18next.t('pdf.alert_no_lines'));
    return false;
  }
  if(payload.totals.lines.some(l => !(l.desig || '').trim())){
    await showAlertDialog(i18next.t('pdf.alert_empty_designation'));
    return false;
  }
  if(payload.totals.lines.some(l => l.qte <= 0)){
    await showAlertDialog(i18next.t('pdf.alert_zero_qty'));
    return false;
  }
  if(!isNumeroUnique(payload.type, payload.numero, getEditingDocId())){
    await showAlertDialog(i18next.t('form.numeroDuplicate'));
    return false;
  }
  return true;
}

let generating = false;

function blobToDataUri(blob){
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

async function headerToDataUri(src){
  if (src instanceof Blob) return blobToDataUri(src);
  if (typeof src !== 'string') return null;
  if (src.startsWith('data:image')) return src;
  if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const resp = await fetch(src);
      if (!resp.ok) return null;
      return blobToDataUri(await resp.blob());
    } catch (_) { return null; }
  }
  return null;
}

function headerFormat(dataUri){
  if (/^data:image\/png/i.test(dataUri)) return 'PNG';
  if (/^data:image\/jpe?g/i.test(dataUri)) return 'JPEG';
  if (/^data:image\/webp/i.test(dataUri)) return 'WEBP';
  return null;
}

function loadImageDims(src){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function dataUriToPng(src){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (_) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function resolveHeaderImage(src, company){
  if (!company.headerActive) return null;
  let dataUri = await headerToDataUri(src);
  if (!dataUri) dataUri = await headerToDataUri(company.headerImage || '');
  if (!dataUri) return null;
  const dims = await loadImageDims(dataUri);
  if (!dims || !dims.width || !dims.height) return null;
  let format = headerFormat(dataUri);
  if (format !== 'PNG' && format !== 'JPEG') {
    const png = await dataUriToPng(dataUri);
    if (!png) return null;
    dataUri = png;
    format = 'PNG';
  }
  return { dataUri, format, width: dims.width, height: dims.height };
}

export async function renderPagesToPdf(payload, headerUrl){
  const f = buildPdfHtml(payload, headerUrl);

  await document.fonts.ready;
  await new Promise(r=>setTimeout(r, 150));

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = f.styleHtml;
  const pages = buildPages(f, stage);

  const scale = payload.company.pdfQuality || 2;
  const isRtl = i18next.language === 'ar';
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');

  await registerFontsForDoc(pdf);

  const header = await resolveHeaderImage(headerUrl, payload.company);
  let headerPngFallback = null;

  for (let p = 0; p < pages.length; p++) {
    const textElements = prepareTextElements(pages[p]);
    if (p > 0) pdf.addPage();
    if (header) {
      const wMm = 210;
      const hMm = 210 * header.height / header.width;
      try {
        pdf.addImage(header.dataUri, header.format, 0, 0, wMm, hMm);
      } catch (_) {
        if (!headerPngFallback) headerPngFallback = await dataUriToPng(header.dataUri);
        pdf.addImage(headerPngFallback, 'PNG', 0, 0, wMm, hMm);
      }
    }
    const canvas = await html2canvas(pages[p], { scale, useCORS: true, backgroundColor: header ? null : '#ffffff' });
    const imgData = header ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, header ? 'PNG' : 'JPEG', 0, 0, 210, 297);
    writePageOverlay(pdf, textElements, isRtl);
    canvas.width = canvas.height = 0;
  }

  return pdf;
}

export async function generatePDF(){
  if (generating) return;
  generating = true;
  try {
  const payload = collectPayload();
  if (!await validatePayload(payload)) return;

  let headerBlob;
  try { headerBlob = await loadHeaderImage(); } catch (_) { headerBlob = null; }

  const pdf = await renderPagesToPdf(payload, headerBlob);

  const filename = `${payload.numero}.pdf`;

  try {
    const pdfBlob = pdf.output('blob');
    await savePdfFile(filename, pdfBlob);
  } catch (_) {
    await showAlertDialog(i18next.t('pdf.alert_save_failed'));
  }

  try {
    pdf.save(filename);
  } catch(e) {
    await showAlertDialog(i18next.t('pdf.alert_save_failed'));
  }

  await saveToHistory(payload, filename);

  } finally {
    const stage = document.getElementById('pdf-stage');
    if (stage) stage.innerHTML = '';
    generating = false;
  }
}
