import { DOC_TYPES } from './config.js';
import { loadHistory, saveHistory } from './storage.js';
import { escapeHtml, currencySymbol } from './utils.js';
import { buildPdfHtml } from './pdf.js';
import { ICONS } from './icons.js';
import { loadPdfFile, loadHeaderImage, deletePdfFile } from './opfs-storage.js';
import { showAlertDialog, showConfirmDialog } from './dialog.js';

let editingDocId = null;

export function setEditingDocId(id) { editingDocId = id; }
export function getEditingDocId() { return editingDocId; }
export function clearEditingDocId() { editingDocId = null; }

export async function saveToHistory(payload, filename){
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
        status: payload.status,
        filename,
        payload,
      };
      saveHistory(history);
      editingDocId = null;
      clearEditingBanner();
      return;
    }
    await showAlertDialog(i18next.t('history.orphan_alert'));
    editingDocId = null;
    clearEditingBanner();
    return;
  }
  history.unshift({
    id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2,9),
    type: payload.type,
    numero: payload.numero,
    date: payload.date,
    client: payload.client.nom,
    totalTTC: payload.totals.showPrices ? payload.totals.totalTTC : null,
    status: payload.status,
    createdAt: new Date().toISOString(),
    filename,
    payload,
  });
  saveHistory(history);
}

function clearEditingBanner() {
  const el = document.getElementById('editingBanner');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
}

export function renderHistory(){
  const wrap = document.getElementById('histTableWrap');
  const search = (document.getElementById('histSearch').value || '').toLowerCase();
  let history = loadHistory();
  if(search){
    history = history.filter(d =>
      d.numero.toLowerCase().includes(search) ||
      (d.client || '').toLowerCase().includes(search)
    );
  }
  if(history.length === 0){
    wrap.innerHTML = `<div class="empty-state">${i18next.t('history.empty')}</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="hist">
      <thead><tr><th>${i18next.t('history.col_type')}</th><th>${i18next.t('history.col_numero')}</th><th>${i18next.t('history.col_client')}</th><th>${i18next.t('history.col_date')}</th><th>${i18next.t('history.col_total')}</th><th></th></tr></thead>
      <tbody>
        ${history.map(d => `
          <tr>
            <td><span class="badge ${DOC_TYPES[d.type].badge}">${i18next.t('docTypes.' + DOC_TYPES[d.type].i18nKey)}</span></td>
            <td>${escapeHtml(d.numero)}</td>
            <td>${escapeHtml(d.client || '')}</td>
            <td>${escapeHtml(d.date || '')}</td>
            <td>${d.totalTTC != null ? d.totalTTC.toLocaleString('fr-FR',{minimumFractionDigits:2}) + ' ' + currencySymbol() : i18next.t('history.empty_total')}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn btn-ghost" data-action="edit" data-id="${d.id}" style="padding:6px 10px;" aria-label="${i18next.t('history.btn_edit')}">${ICONS.pencil}</button>
              <button class="btn btn-ghost" data-action="reprint" data-id="${d.id}" style="padding:6px 10px;">${ICONS['rotate-cw']} ${i18next.t('history.btn_pdf')}</button>
              <button class="btn btn-danger" data-action="delete" data-id="${d.id}" style="padding:6px 10px;" aria-label="${i18next.t('history.btn_delete')}">${ICONS.x}</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

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
  await new Promise(r=>setTimeout(r, 150));
  const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p','mm','a4');
  const imgWidth = 210, imgHeight = canvas.height * imgWidth / canvas.width;
  let heightLeft = imgHeight, position = 0;
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= 297;
  while(heightLeft > 0.5){
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= 297;
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
  const history = loadHistory();
  const doc = history.find(d=>d.id === id);
  saveHistory(history.filter(d=>d.id !== id));
  if (doc) {
    const filename = doc.filename || (doc.numero + '.pdf');
    deletePdfFile(filename).catch(() => {});
  }
  renderHistory();
}
