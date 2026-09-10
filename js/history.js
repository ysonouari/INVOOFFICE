import { loadHistory, saveHistory, loadCompany, saveCompany, isNumeroUnique } from './storage.js';
import { showAlertDialog } from './dialog.js';
import { loadHeaderImage, migrateHeaderFromCompany } from './opfs-storage.js';

let editingDocId = null;
let historyLock = Promise.resolve();

export function withHistoryLock(fn) {
  historyLock = historyLock.then(fn, fn);
  return historyLock;
}

export function setEditingDocId(id) { editingDocId = id; }
export function getEditingDocId() { return editingDocId; }
export function clearEditingDocId() { editingDocId = null; }

function sanitizePayloadForHistory(payload) {
  if (!payload || !payload.company || payload.company.headerImage === undefined) return payload;
  const company = { ...payload.company };
  delete company.headerImage;
  return { ...payload, company };
}

export async function migrateHistoryHeader() {
  const history = loadHistory();
  const hasLegacy = history.some(d => d.payload && d.payload.company && d.payload.company.headerImage);
  if (!hasLegacy) return { migrated: false, reason: 'no-legacy' };

  let headerConfirmed = false;
  try { headerConfirmed = !!(await loadHeaderImage()); } catch (_) { headerConfirmed = false; }

  if (!headerConfirmed) {
    const company = loadCompany();
    if (company.headerImage) {
      const ok = await migrateHeaderFromCompany(company);
      if (ok) {
        delete company.headerImage;
        saveCompany(company);
        try { headerConfirmed = !!(await loadHeaderImage()); } catch (_) { headerConfirmed = false; }
      }
    }
  }

  if (!headerConfirmed) return { migrated: false, reason: 'opfs-header-unconfirmed' };

  const cleaned = history.map(d => {
    if (!d.payload || !d.payload.company || d.payload.company.headerImage === undefined) return d;
    const company = { ...d.payload.company };
    delete company.headerImage;
    return { ...d, payload: { ...d.payload, company } };
  });
  saveHistory(cleaned);
  return { migrated: true, count: cleaned.length };
}

export async function saveToHistory(payload, filename, { createOnly = false } = {}){
  if (!isNumeroUnique(payload.type, payload.numero, createOnly ? null : editingDocId)) {
    await showAlertDialog(i18next.t('form.numeroDuplicate'));
    return;
  }
  return withHistoryLock(async () => {
    const history = loadHistory();
    if (!createOnly && editingDocId) {
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
          payload: sanitizePayloadForHistory(payload),
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
      payload: sanitizePayloadForHistory(payload),
    });
    saveHistory(history);
  });
}

function clearEditingBanner() {
  const el = document.getElementById('editingBanner');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
}