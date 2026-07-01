import { DOC_TYPES } from './config.js';
import { loadCompany } from './storage.js';
import { escapeHtml, currencySymbol, montantEnLettres, montantEnLettresAr, getContrastColor } from './utils.js';
import { recalcTotals } from './lines.js';
import { getSelectedClient } from './client.js';
import { saveToHistory } from './history.js';
import { showAlertDialog } from './dialog.js';
import { loadHeaderImage, savePdfFile } from './opfs-storage.js';
import { shapeArabic } from './arabic-shaper.js';

async function registerFontsForDoc(pdf) {
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

function collectTextElements(pageEl) {
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

export function buildPdfHtml(payload, headerImageUrl){
  const c = payload.company;
  const cfg = DOC_TYPES[payload.type];
  const t = payload.totals;

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
  const bgStyle = (c.headerActive && img)
    ? `background-image:url('${img}');`
    : '';
  const paddingTop = (c.headerActive && img) ? `${c.margeHaut}cm` : '14mm';

  const thBg = c.tableColor || '#eef1f6';
  const thColor = c.tableTextColor || getContrastColor(thBg);
  const thStyle = `background:${thBg};color:${thColor};`;

  let rowsHtml = t.lines.map(l=>`
    <tr>
      <td>${escapeHtml(l.desig)}</td>
      ${t.showPrices ? `<td class="num">${l.prix.toFixed(2)}</td><td class="num">${l.qte}</td><td class="num">${l.total.toFixed(2)}</td>` : `<td class="num">${l.qte}</td>`}
    </tr>`).join('');

  let totalsHtml = '';
  if(t.showPrices){
    totalsHtml = `
      <div class="pdf-totals"><table>
        <tr><td class="lbl">${i18next.t('pdf.total_ht')}</td><td class="val">${t.totalHT_brut.toFixed(2)} ${currencySymbol()}</td></tr>
        ${t.remisePct>0 ? `<tr><td class="lbl">${i18next.t('pdf.remise', {pct: t.remisePct})}</td><td class="val">- ${t.remiseMontant.toFixed(2)} ${currencySymbol()}</td></tr>` : ''}
        ${t.isExoneree ? '' : `<tr><td class="lbl">${i18next.t('pdf.tva', {rate: t.tvaTaux})}</td><td class="val">${t.tva.toFixed(2)} ${currencySymbol()}</td></tr>`}
        <tr class="ttc"><td class="lbl">${i18next.t('pdf.total_ttc')}</td><td class="val">${t.totalTTC.toFixed(2)} ${currencySymbol()}</td></tr>
        ${t.avance>0 ? `<tr><td class="lbl">${i18next.t('pdf.avance')}</td><td class="val">${t.avance.toFixed(2)} ${currencySymbol()}</td></tr>
        <tr class="ttc"><td class="lbl">${i18next.t('pdf.reste')}</td><td class="val">${t.reste.toFixed(2)} ${currencySymbol()}</td></tr>` : ''}
      </table></div>`;
  }

  const isRtl = i18next.language === 'ar';

  const wordsHtml = t.showPrices ? `<div class="pdf-words">${i18next.t('pdf.words_prefix')} <b>${isRtl ? montantEnLettresAr(t.totalTTC) : montantEnLettres(t.totalTTC)}</b></div>` : '';

  const footerParts = [
    c.nom ? escapeHtml(c.nom) : '',
    c.adresse ? escapeHtml(c.adresse) : '',
    c.contact ? escapeHtml(c.contact) : '',
  ].filter(Boolean).join(' \u2014 ');

  const legalParts = [
    c.ice ? `ICE: ${c.ice}` : '', c.if_ ? `IF: ${c.if_}` : '',
    c.rc ? `RC: ${c.rc}` : '', c.tp ? `TP: ${c.tp}` : '', c.cnss ? `CNSS: ${c.cnss}` : '',
  ].filter(Boolean).join(' \u2014 ');

  const footerLine = [footerParts, legalParts].filter(Boolean).join(' &nbsp;|&nbsp; ');

  return `
  ${fontScaleStyle}
  <div class="pdf-page" style="${bgStyle}padding-top:${paddingTop};" ${isRtl ? 'dir="rtl" lang="ar"' : 'dir="ltr" lang="fr"'}>
    <div class="pdf-content">
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
      ${payload.client.ref ? `<div class="pdf-ref">${escapeHtml(payload.client.ref)}</div>` : ''}

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
        <tbody>${rowsHtml}</tbody>
      </table>

      ${totalsHtml}
      ${wordsHtml}

      ${(payload.conditions || payload.modeReglement) ? `
      <div class="pdf-conditions">
        ${payload.conditions ? `<div><b>${i18next.t('pdf.label_conditions')}</b> ${escapeHtml(payload.conditions)}</div>` : ''}
        ${payload.modeReglement ? `<div><b>${i18next.t('pdf.label_reglement')}</b> ${escapeHtml(payload.modeReglement)}</div>` : ''}
      </div>` : ''}
      ${payload.notes ? `<div class="pdf-note">${escapeHtml(payload.notes)}</div>` : ''}
    </div>
    <div class="pdf-footer">${footerLine}</div>
  </div>`;
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
    ref: document.getElementById('clientRef') ? document.getElementById('clientRef').value : '',
  };
  return {
    type,
    numero: document.getElementById('docNumero').value,
    date: document.getElementById('docDate').value ? new Date(document.getElementById('docDate').value).toLocaleDateString('fr-FR') : '',
    status: document.getElementById('docStatus').value,
    client,
    conditions: document.getElementById('conditions').value,
    modeReglement: document.getElementById('modeReglement').value,
    notes: document.getElementById('notes').value,
    company: loadCompany(),
    totals,
  };
}

export async function generatePDF(){
  const payload = collectPayload();
  if(!payload.client.id){
    await showAlertDialog(i18next.t('pdf.alert_no_client'));
    return;
  }
  if(payload.totals.lines.length === 0 || payload.totals.lines.every(l=>!l.desig)){
    await showAlertDialog(i18next.t('pdf.alert_no_lines'));
    return;
  }
  if(payload.totals.lines.some(l => !(l.desig || '').trim())){
    await showAlertDialog(i18next.t('pdf.alert_empty_designation'));
    return;
  }
  if(payload.totals.lines.some(l => l.qte <= 0)){
    await showAlertDialog(i18next.t('pdf.alert_zero_qty'));
    return;
  }

  let headerBlob;
  try { headerBlob = await loadHeaderImage(); } catch (_) { headerBlob = null; }
  const headerUrl = headerBlob ? URL.createObjectURL(headerBlob) : null;

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = buildPdfHtml(payload, headerUrl);
  const pageEl = stage.querySelector('.pdf-page');

  await document.fonts.ready;
  await new Promise(r=>setTimeout(r, 150));

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

  const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210, pageHeight = 297;
  const imgWidth = pageWidth;
  const imgHeight = canvas.height * imgWidth / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  await registerFontsForDoc(pdf);

  const totalPages = Math.max(1, Math.ceil((imgHeight - 0.5) / pageHeight));
  const isRtl = i18next.language === 'ar';

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) pdf.addPage();

    if (p > 0) {
      pdf.addImage(imgData, 'JPEG', 0, -(p * pageHeight), imgWidth, imgHeight);
    } else {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    }

    pdf.setTextColor(255, 255, 255);
    pdf.internal.write('3 Tr');
    const pageTop = p * pageHeight;
    const pageBottom = (p + 1) * pageHeight;

    for (const el of textElements) {
      const elTop = el.y_mm;
      const elBottom = el.y_mm + el.h_mm;
      if (elBottom < pageTop + 1 || elTop > pageBottom - 1) continue;

      const pdfY = el.y_mm - pageTop;
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

  const filename = `${payload.numero}.pdf`;

  try {
    const pdfBlob = pdf.output('blob');
    await savePdfFile(filename, pdfBlob);
  } catch (_) {}

  try {
    pdf.save(filename);
  } catch(e) {}

  if (headerUrl) URL.revokeObjectURL(headerUrl);

  await saveToHistory(payload, filename);

  stage.innerHTML = '';
}
