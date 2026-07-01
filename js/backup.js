import { loadCompany, saveCompany, loadHistory, saveHistory, loadClients, saveClients } from './storage.js';
import { loadHeaderImage, saveHeaderImage } from './opfs-storage.js';
import { showAlertDialog, showConfirmDialog } from './dialog.js';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const bytes = atob(m[2]);
  const ab = new ArrayBuffer(bytes.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
  return new Blob([ab], { type: m[1] });
}

export async function exportBackup() {
  const company = structuredClone(loadCompany());
  const history = structuredClone(loadHistory());
  const clients = structuredClone(loadClients());

  let headerImage = null;
  try {
    const blob = await loadHeaderImage();
    if (blob) headerImage = await blobToBase64(blob);
  } catch (_) { /* proceed without image */ }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    company,
    history,
    clients,
    opfs: { headerImage },
  };

  const json = JSON.stringify(payload, null, 2);
  const today = new Date().toISOString().slice(0, 10);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-facturation-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importBackup(file) {
  let payload;
  try {
    const text = await file.text();
    payload = JSON.parse(text);
  } catch (e) {
    await showAlertDialog(i18next.t('backup.invalid_json'));
    return;
  }

  if (!payload || payload.version !== 1
      || typeof payload.company !== 'object' || !payload.company || Array.isArray(payload.company)
      || !Array.isArray(payload.history)
      || !Array.isArray(payload.clients)) {
    await showAlertDialog(i18next.t('backup.invalid_structure'));
    return;
  }

  const confirmed = await showConfirmDialog(i18next.t('backup.import_confirm'));
  if (!confirmed) return;

  saveCompany(payload.company);
  saveHistory(payload.history);
  saveClients(payload.clients);

  const storedCompany = localStorage.getItem('fb_company');
  const storedHistory = localStorage.getItem('fb_history');
  const storedClients = localStorage.getItem('fb_clients');
  if (!storedCompany || !storedHistory || !storedClients) {
    await showAlertDialog(i18next.t('backup.import_failed'));
    return;
  }

  if (payload.opfs && typeof payload.opfs === 'object' && payload.opfs.headerImage) {
    try {
      const blob = dataUrlToBlob(payload.opfs.headerImage);
      if (blob) await saveHeaderImage(blob);
    } catch (_) {
      console.warn('Backup: header image restore failed');
    }
  }

  await showAlertDialog(i18next.t('backup.success'));
  if (window.location.reload) {
    setTimeout(() => window.location.reload(), 100);
  }
}
