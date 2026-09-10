import { loadHistory, nextNumero } from './storage.js';
import { renderPagesToPdf, generateAndSave, todayFr } from './pdf.js';
import { loadPdfFile, loadHeaderImage } from './opfs-storage.js';
import { showConfirmDialog } from './dialog.js';
import { renderHistory } from './history-view.js';

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

  try {
    const pdf = await renderPagesToPdf(doc.payload, headerBlob || doc.payload.company.headerImage);
    pdf.save(filename);
  } finally {
    const stage = document.getElementById('pdf-stage');
    if (stage) stage.innerHTML = '';
  }
}

export function getHistoryDoc(id){
  return loadHistory().find(d => d.id === id) || null;
}

export async function duplicateHistoryDoc(id){
  const doc = getHistoryDoc(id);
  if (!doc) return;
  const newPayload = structuredClone(doc.payload);
  newPayload.numero = nextNumero(doc.payload.type).display;
  newPayload.date = todayFr();
  try {
    await generateAndSave(newPayload, { mode: 'create', download: false });
  } finally {
    renderHistory();
  }
}

export async function convertToInvoice(id){
  const doc = getHistoryDoc(id);
  if (!doc || doc.type !== 'devis') return;
  if (!await showConfirmDialog(i18next.t('history.confirm_convert'))) return;
  const newPayload = structuredClone(doc.payload);
  newPayload.type = 'facture';
  newPayload.numero = nextNumero('facture').display;
  newPayload.date = todayFr();
  try {
    await generateAndSave(newPayload, { mode: 'create', download: false });
  } finally {
    renderHistory();
  }
}