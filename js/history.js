import { DOC_TYPES } from './config.js';
import { loadHistory, saveHistory, isNumeroUnique } from './storage.js';
import { escapeHtml, currencySymbol } from './utils.js';
import { buildPdfHtml, registerFontsForDoc, prepareTextElements, writePageTextOverlay } from './pdf.js';
import { ICONS } from './icons.js';
import { loadPdfFile, loadHeaderImage, deletePdfFile } from './opfs-storage.js';
import { showAlertDialog, showConfirmDialog } from './dialog.js';

let editingDocId = null;
let historyLock = Promise.resolve();

function withHistoryLock(fn) {
  historyLock = historyLock.then(fn, fn);
  return historyLock;
}

export function setEditingDocId(id) { editingDocId = id; }
export function getEditingDocId() { return editingDocId; }
export function clearEditingDocId() { editingDocId = null; }

export async function saveToHistory(payload, filename){
  if (!isNumeroUnique(payload.type, payload.numero, editingDocId)) {
    await showAlertDialog(i18next.t('form.numeroDuplicate'));
    return;
  }
  return withHistoryLock(async () => {
    const history = loadHistory();
    if (editingDocId) {
      const idx = history.findIndex(d => d.id === editingDocId);
      if (idx >= 0) {
        history[idx] = {
          ...history[idx],
          type: payload.type,
          numero: payload.numero,
          date: payload.date,
          client: payload.client.nom,
          totalTTC: payload.totals.showPrices ? payload.totals.totalTTC : null,
          filename,
          payload,
        };
        saveHistory(history);
        editingDocId = null;
        clearEditingBanner();
        return;
      }
      editingDocId = null;
      clearEditingBanner();
      await showAlertDialog(i18next.t('history.orphan_alert'));
      return;
    }
    history.unshift({
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2,9),
      type: payload.type,
      numero: payload.numero,
      date: payload.date,
      client: payload.client.nom,
      totalTTC: payload.totals.showPrices ? payload.totals.totalTTC : null,
      createdAt: new Date().toISOString(),
      filename,
      payload,
    });
    saveHistory(history);
  });
}

function clearEditingBanner() {
  const el = document.getElementById('editingBanner');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
}

/* ============================================================
   HISTORY PAGE — UX premium (Stripe/Linear-level)
   ============================================================ */

const PAGE_SIZE_KEY = 'fb_history_pageSize';

function loadPerPage() {
  try { const v = parseInt(localStorage.getItem(PAGE_SIZE_KEY), 10); if ([10,25,50,100].includes(v)) return v; } catch (_) {}
  return 10;
}
function savePerPage(n) { try { localStorage.setItem(PAGE_SIZE_KEY, String(n)); } catch (_) {} }

let historyState = {
  page: 1,
  perPage: loadPerPage(),
  sortBy: 'date-desc',
};

const FR_MONTHS = ['janvier','février','fevrier','mars','avril','mai','juin','juillet','aout','août','septembre','octobre','novembre','decembre','décembre'];
const EN_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function normalizeText(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseSearchDate(raw) {
  const q = raw.trim().toLowerCase();
  const num = q.replace(/[^\d]/g, '');
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(q)) {
    const parts = q.split(/[\/\-]/);
    return { day: +parts[0], month: +parts[1] - 1, year: +parts[2] < 100 ? 2000 + (+parts[2]) : +parts[2] };
  }
  if (/^\d{4}$/.test(num)) return { year: +num, month: null, day: null };
  if (/^\d{1,2}[\/\-]\d{4}$/.test(q)) {
    const parts = q.split(/[\/\-]/);
    return { month: +parts[0] - 1, year: +parts[1], day: null };
  }
  const frIdx = FR_MONTHS.indexOf(q);
  if (frIdx >= 0) return { month: frIdx % 12, year: null, day: null };
  const enIdx = EN_MONTHS.indexOf(q);
  if (enIdx >= 0) return { month: enIdx, year: null, day: null };
  const withYear = /^(janvier|février|fevrier|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i;
  const m = q.match(withYear);
  if (m) {
    const mIdx = FR_MONTHS.indexOf(m[1].toLowerCase());
    if (mIdx >= 0) return { month: mIdx % 12, year: +q.match(/\d{4}/)[0], day: null };
    const eIdx = EN_MONTHS.indexOf(m[1].toLowerCase());
    if (eIdx >= 0) return { month: eIdx, year: +q.match(/\d{4}/)[0], day: null };
  }
  return null;
}

function matchesSearch(doc, rawQuery) {
  const q = normalizeText(rawQuery);
  if (!q) return true;
  if (normalizeText(doc.numero).includes(q)) return true;
  if (normalizeText(doc.client || '').includes(q)) return true;
  const typeLabel = normalizeText(i18next.t('docTypes.' + DOC_TYPES[doc.type].i18nKey));
  if (typeLabel.includes(q)) return true;
  if (doc.totalTTC != null) {
    const amountStr = normalizeText(doc.totalTTC.toFixed(2) + ' ' + currencySymbol());
    const amountRaw = normalizeText(doc.totalTTC.toFixed(2));
    const amountInt = normalizeText(String(Math.round(doc.totalTTC)));
    if (amountStr.includes(q) || amountRaw.includes(q) || amountInt === q) return true;
  }
  const parsed = parseSearchDate(q);
  if (parsed && doc.date) {
    const parts = doc.date.split('/');
    const dYear = +parts[2], dMonth = +parts[1] - 1, dDay = +parts[0];
    if (parsed.year !== null && dYear !== parsed.year) return false;
    if (parsed.month !== null && dMonth !== parsed.month) return false;
    if (parsed.day !== null && dDay !== parsed.day) return false;
    return true;
  }
  return false;
}

function sortDocs(docs, sortBy) {
  const sorted = [...docs];
  switch (sortBy) {
    case 'date-desc': sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
    case 'date-asc':  sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); break;
    case 'amount-desc': sorted.sort((a, b) => (b.totalTTC || 0) - (a.totalTTC || 0)); break;
    case 'amount-asc':  sorted.sort((a, b) => (a.totalTTC || 0) - (b.totalTTC || 0)); break;
    case 'client-asc':  sorted.sort((a, b) => (a.client || '').localeCompare(b.client || '')); break;
    case 'client-desc': sorted.sort((a, b) => (b.client || '').localeCompare(a.client || '')); break;
    case 'numero-asc':  sorted.sort((a, b) => a.numero.localeCompare(b.numero)); break;
  }
  return sorted;
}

function highlightMatch(text, rawQuery) {
  if (!rawQuery.trim() || !text) return escapeHtml(text);
  const esc = escapeHtml(text);
  const q = normalizeText(rawQuery);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return esc;
  const pattern = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return esc.replace(new RegExp(`(${pattern})`, 'gi'), '<mark class="hist-highlight">$1</mark>');
}

function getSortArrow(col) {
  const map = {
    'date-asc':'date', 'date-desc':'date',
    'amount-asc':'amount', 'amount-desc':'amount',
    'client-asc':'client', 'client-desc':'client',
    'numero-asc':'numero',
  };
  if (map[historyState.sortBy] !== col) return '';
  return historyState.sortBy.endsWith('-desc') ? ' ▾' : ' ▴';
}

function cycleSort(col) {
  const cycles = {
    date:   ['date-desc', 'date-asc'],
    amount: ['amount-desc', 'amount-asc'],
    client: ['client-asc', 'client-desc'],
    numero: ['numero-asc'],
  };
  const options = cycles[col] || [];
  const cur = options.indexOf(historyState.sortBy);
  historyState.sortBy = options[(cur + 1) % options.length];
  historyState.page = 1;
  renderHistory();
}

function renderSummaryRow(filteredDocs, allDocs) {
  const cnt = filteredDocs.length;
  if (cnt === 0) return '';
  const byType = {};
  let sumTTC = 0, maxTTC = 0;
  let lastDoc = null;
  for (const d of filteredDocs) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    if (d.totalTTC != null) { sumTTC += d.totalTTC; if (d.totalTTC > maxTTC) maxTTC = d.totalTTC; }
    if (!lastDoc || d.createdAt > lastDoc.createdAt) lastDoc = d;
  }
  const avg = (sumTTC / cnt);
  const card = (label, value, muted) =>
    `<div class="hist-stat-card"><div class="hist-stat-label">${label}</div><div class="hist-stat-value${muted?' hist-stat-muted':''}">${value}</div></div>`;
  return `<div class="hist-summary" role="status" aria-live="polite">
    ${card(i18next.t('history.col_total'), cnt)}
    ${card(i18next.t('docTypes.facture'), byType['facture'] || 0)}
    ${card(i18next.t('docTypes.devis'), byType['devis'] || 0)}
    ${card(i18next.t('docTypes.bl'), byType['bl'] || 0)}
    ${card(i18next.t('docTypes.avoir'), byType['avoir'] || 0)}
    ${card('Total TTC', sumTTC.toLocaleString('fr-FR',{minimumFractionDigits:2}) + ' ' + currencySymbol())}
    ${card('Moyenne', avg.toLocaleString('fr-FR',{minimumFractionDigits:2}) + ' ' + currencySymbol(), true)}
    ${card('Max', maxTTC.toLocaleString('fr-FR',{minimumFractionDigits:2}) + ' ' + currencySymbol(), true)}
    ${lastDoc ? card('Dernier', escapeHtml(lastDoc.numero), true) : ''}
  </div>`;
}

function renderPaginationInfo(filteredCount, start, end) {
  return `<div class="hist-pagination-info">Affichage ${start}–${end} sur ${filteredCount} document${filteredCount>1?'s':''}</div>`;
}

function renderPageSizeSelect() {
  const opts = [10, 25, 50, 100];
  const options = opts.map(n => `<option value="${n}"${historyState.perPage===n?' selected':''}>${n} par page</option>`).join('');
  return `<select class="hist-page-size" aria-label="Nombre de documents par page">${options}</select>`;
}

function renderPagination(totalPages, currentPage) {
  if (totalPages <= 1) return '';
  const btns = [];
  btns.push(`<button${currentPage===1?' disabled':''} class="hist-page-first" aria-label="Première page" title="Première page">${ICONS['chevrons-left']}</button>`);
  btns.push(`<button${currentPage===1?' disabled':''} class="hist-page-prev" aria-label="Page précédente" title="Page précédente">${ICONS['chevron-left']}</button>`);
  const mid = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  if (start > 1) { mid.push(`<button data-page="1">1</button>`); if (start > 2) mid.push('<span class="hist-ellipsis">…</span>'); }
  for (let i = start; i <= end; i++) mid.push(`<button data-page="${i}"${i===currentPage?' class="active" aria-current="page"':''}>${i}</button>`);
  if (end < totalPages) { if (end < totalPages - 1) mid.push('<span class="hist-ellipsis">…</span>'); mid.push(`<button data-page="${totalPages}">${totalPages}</button>`); }
  btns.push(...mid);
  btns.push(`<button${currentPage===totalPages?' disabled':''} class="hist-page-next" aria-label="Page suivante" title="Page suivante">${ICONS['chevron-right']}</button>`);
  btns.push(`<button${currentPage===totalPages?' disabled':''} class="hist-page-last" aria-label="Dernière page" title="Dernière page">${ICONS['chevrons-right']}</button>`);
  return `<nav class="hist-pagination" aria-label="Pagination" role="navigation">${btns.join('')}</nav>`;
}

function renderTable(docs, rawQuery) {
  const sortArrow = (col) => getSortArrow(col);
  const th = (col, label) =>
    `<th class="hist-sortable" data-sort="${col}" role="columnheader" aria-sort="${historyState.sortBy.startsWith(col)?(historyState.sortBy.endsWith('desc')?'descending':'ascending'):'none'}" tabindex="0">${label}<span class="hist-sort-arrow">${sortArrow(col)}</span></th>`;
  const rows = docs.map(d => `
    <tr class="hist-row">
      <td class="hist-cell-type"><span class="badge ${DOC_TYPES[d.type].badge}">${i18next.t('docTypes.' + DOC_TYPES[d.type].i18nKey)}</span></td>
      <td class="hist-cell-numero">${highlightMatch(d.numero, rawQuery)}</td>
      <td class="hist-cell-client">${highlightMatch(d.client || '', rawQuery)}</td>
      <td class="hist-cell-date">${escapeHtml(d.date || '')}</td>
      <td class="hist-cell-amount">${d.totalTTC != null ? d.totalTTC.toLocaleString('fr-FR',{minimumFractionDigits:2}) + ' ' + currencySymbol() : i18next.t('history.empty_total')}</td>
      <td class="hist-cell-actions">
        <button class="btn btn-ghost hist-action-btn" data-action="edit" data-id="${d.id}" aria-label="${i18next.t('history.btn_edit')} ${escapeHtml(d.numero)}" title="Modifier">${ICONS.pencil}</button>
        <button class="btn btn-ghost hist-action-btn" data-action="reprint" data-id="${d.id}" aria-label="${i18next.t('history.btn_pdf')} ${escapeHtml(d.numero)}" title="Réimprimer PDF">${ICONS['rotate-cw']}</button>
        <button class="btn btn-danger hist-action-btn" data-action="delete" data-id="${d.id}" aria-label="${i18next.t('history.btn_delete')} ${escapeHtml(d.numero)}" title="Supprimer">${ICONS.x}</button>
      </td>
    </tr>`).join('');
  return `<div class="hist-table-wrap"><table class="hist">
    <thead><tr>${th('date','Date')}${th('numero','N°')}${th('client','Client')}${th('amount','Montant')}<th class="hist-th-type">${i18next.t('history.col_type')}</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderCards(docs, rawQuery) {
  return docs.map(d => `
    <div class="hist-card">
      <div class="hist-card-top">
        <span class="badge ${DOC_TYPES[d.type].badge}">${i18next.t('docTypes.' + DOC_TYPES[d.type].i18nKey)}</span>
        <strong>${highlightMatch(d.numero, rawQuery)}</strong>
      </div>
      <div class="hist-card-mid">${highlightMatch(d.client || '', rawQuery)} — ${escapeHtml(d.date || '')}</div>
      <div class="hist-card-bottom">
        <strong>${d.totalTTC != null ? d.totalTTC.toLocaleString('fr-FR',{minimumFractionDigits:2}) + ' ' + currencySymbol() : i18next.t('history.empty_total')}</strong>
        <div class="hist-card-actions">
          <button class="btn btn-ghost hist-action-btn" data-action="edit" data-id="${d.id}" aria-label="Modifier ${escapeHtml(d.numero)}" title="Modifier">${ICONS.pencil}</button>
          <button class="btn btn-ghost hist-action-btn" data-action="reprint" data-id="${d.id}" aria-label="PDF ${escapeHtml(d.numero)}" title="Réimprimer PDF">${ICONS['rotate-cw']} PDF</button>
          <button class="btn btn-danger hist-action-btn" data-action="delete" data-id="${d.id}" aria-label="Supprimer ${escapeHtml(d.numero)}" title="Supprimer">${ICONS.x}</button>
        </div>
      </div>
    </div>`).join('');
}

function renderEmptyState(hasSearch) {
  const svg = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>`;
  if (hasSearch) {
    return `<div class="hist-empty" role="status">${svg}<p>Aucun résultat pour votre recherche.</p><p class="hist-empty-hint">Essayez d'autres mots-clés ou vérifiez l'orthographe.</p></div>`;
  }
  return `<div class="hist-empty" role="status">${svg}<p>Aucun document enregistré.</p><p class="hist-empty-hint">Créez votre premier document pour le voir apparaître ici.</p></div>`;
}

export function renderHistory(){
  const wrap = document.getElementById('histTableWrap');
  const searchEl = document.getElementById('histSearch');
  const search = searchEl ? searchEl.value : '';
  const allDocs = loadHistory();
  const hasSearch = search.trim().length > 0;

  let filteredDocs = hasSearch ? allDocs.filter(d => matchesSearch(d, search)) : allDocs;
  filteredDocs = sortDocs(filteredDocs, historyState.sortBy);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / historyState.perPage));
  if (historyState.page > totalPages) historyState.page = totalPages;
  const startIdx = (historyState.page - 1) * historyState.perPage;
  const endIdx = Math.min(startIdx + historyState.perPage, filteredDocs.length);
  const pagedDocs = filteredDocs.slice(startIdx, endIdx);

  if (filteredDocs.length === 0) {
    wrap.innerHTML = renderEmptyState(hasSearch);
    if (!hasSearch) deleteSearchState();
    return;
  }

  const isMobile = window.innerWidth <= 480;
  const summaryHTML = renderSummaryRow(filteredDocs, allDocs);

  const infoHTML = renderPaginationInfo(filteredDocs.length, startIdx + 1, endIdx);
  const pageSizeHTML = filteredDocs.length > 10 ? renderPageSizeSelect() : '';
  const topBarHTML = `<div class="hist-topbar">${infoHTML}<div class="hist-topbar-right">${pageSizeHTML}</div></div>`;

  const tableHTML = isMobile ? renderCards(pagedDocs, search) : renderTable(pagedDocs, search);
  const paginationHTML = renderPagination(totalPages, historyState.page);
  const mobilePageInfo = totalPages > 1 ? `<div class="hist-mobile-page">${historyState.page} / ${totalPages}</div>` : '';

  wrap.innerHTML = `
    ${summaryHTML}
    ${topBarHTML}
    <div class="hist-table-fade">
      ${tableHTML}
    </div>
    ${paginationHTML}
    ${mobilePageInfo}
  `;

  requestAnimationFrame(() => {
    const fade = wrap.querySelector('.hist-table-fade');
    if (fade) fade.classList.add('visible');
  });

  wrap.querySelectorAll('.hist-sortable').forEach(th => {
    th.addEventListener('click', () => { cycleSort(th.dataset.sort); });
  });
  const firstBtn = wrap.querySelector('.hist-page-first');
  const prevBtn = wrap.querySelector('.hist-page-prev');
  const nextBtn = wrap.querySelector('.hist-page-next');
  const lastBtn = wrap.querySelector('.hist-page-last');
  if (firstBtn) firstBtn.addEventListener('click', () => { if (historyState.page > 1) { historyState.page = 1; renderHistory(); } });
  if (prevBtn) prevBtn.addEventListener('click', () => { if (historyState.page > 1) { historyState.page--; renderHistory(); } });
  if (nextBtn) nextBtn.addEventListener('click', () => { if (historyState.page < totalPages) { historyState.page++; renderHistory(); } });
  if (lastBtn) lastBtn.addEventListener('click', () => { if (historyState.page < totalPages) { historyState.page = totalPages; renderHistory(); } });
  wrap.querySelectorAll('.hist-pagination button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= totalPages) { historyState.page = p; renderHistory(); }
    });
  });
  const pageSizeEl = wrap.querySelector('.hist-page-size');
  if (pageSizeEl) {
    pageSizeEl.addEventListener('change', () => {
      historyState.perPage = parseInt(pageSizeEl.value, 10);
      savePerPage(historyState.perPage);
      historyState.page = 1;
      renderHistory();
    });
  }
}

function deleteSearchState() { historyState.page = 1; }

export async function reprintHistoryDoc(id){
  const history = loadHistory();
  const doc = history.find(d=>d.id === id);
  if(!doc) return;
  const filename = doc.filename || (doc.numero + '.pdf');

  let opfsBlob;
  try { opfsBlob = await loadPdfFile(filename); } catch (_) { opfsBlob = null; }
  if (opfsBlob) {
    const url = URL.createObjectURL(opfsBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  let headerBlob;
  try { headerBlob = await loadHeaderImage(); } catch (_) { headerBlob = null; }
  const headerUrl = headerBlob ? URL.createObjectURL(headerBlob) : null;

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = buildPdfHtml(doc.payload, headerUrl || doc.payload.company.headerImage);
  const pageEl = stage.querySelector('.pdf-page');
  await document.fonts.ready;
  await new Promise(r=>setTimeout(r, 150));

  const scale = (doc.payload.company && doc.payload.company.pdfQuality) || 2;
  const canvas = await html2canvas(pageEl, { scale, useCORS: true, backgroundColor: '#ffffff' });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p','mm','a4');
  const imgWidth = 210, pageHeight = 297;
  const imgHeight = canvas.height * imgWidth / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  await registerFontsForDoc(pdf);
  const textElements = prepareTextElements(pageEl);
  const totalPages = Math.max(1, Math.ceil((imgHeight - 0.5) / pageHeight));
  const isRtl = i18next.language === 'ar';

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, -(p * pageHeight), imgWidth, imgHeight);
    writePageTextOverlay(pdf, textElements, p, pageHeight, isRtl);
  }
  pdf.save(filename);
  stage.innerHTML = '';
  if (headerUrl) URL.revokeObjectURL(headerUrl);
}

export function getHistoryDoc(id){
  return loadHistory().find(d => d.id === id) || null;
}

export async function deleteHistoryDoc(id){
  if(!await showConfirmDialog(i18next.t('history.confirm_delete'))) return;
  return withHistoryLock(async () => {
    const history = loadHistory();
    const doc = history.find(d=>d.id === id);
    saveHistory(history.filter(d=>d.id !== id));
    if (doc) {
      const filename = doc.filename || (doc.numero + '.pdf');
      deletePdfFile(filename).catch(() => {});
    }
    const updatedDocs = loadHistory();
    const totalPages = Math.max(1, Math.ceil(updatedDocs.length / historyState.perPage));
    if (historyState.page > totalPages) historyState.page = totalPages;
    renderHistory();
  });
}
