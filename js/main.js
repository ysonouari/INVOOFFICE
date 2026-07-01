import { updateBrandLogo, openCompanyModal, closeCompanyModal, toggleTvaRate, syncColorFromHex, syncTableTextColorFromHex, onHeaderFileChange, saveCompanyForm } from './company-modal.js';
import { showView, onDocTypeChange, initForm, resetForm, loadHistoryDocIntoForm } from './navigation.js';
import { addLine, removeLine, recalcTotals } from './lines.js';
import { openClientModal, closeClientModal, openClientManagerModal, closeClientManagerModal, onClientSelect, saveClientForm, deleteClientById, refreshClientsSelect } from './client.js';
import { generatePDF } from './pdf.js';
import { renderHistory, reprintHistoryDoc, deleteHistoryDoc, getHistoryDoc, setEditingDocId, clearEditingDocId } from './history.js';
import { initStorage } from './storage.js';
import { exportBackup, importBackup } from './backup.js';
import { initI18n, setLang, getCurrentLang } from './i18n.js';
import { toggleTheme, getCurrentTheme } from './theme.js';
import { ICONS } from './icons.js';
document.addEventListener('DOMContentLoaded', async () => {
  await initStorage();
  await initI18n();
  document.documentElement.lang = i18next.language;
  document.documentElement.dir = i18next.language === 'ar' ? 'rtl' : 'ltr';
  updateBrandLogo();
  initForm();
  document.getElementById('footerYear').textContent = new Date().getFullYear();

  document.getElementById('langSwitcher').addEventListener('click', async () => {
    const next = getCurrentLang() === 'fr' ? 'ar' : 'fr';
    await setLang(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    if (document.getElementById('view-nouveau').classList.contains('active')) {
      recalcTotals();
      refreshClientsSelect();
      onClientSelect();
    }
    if (document.getElementById('view-historique').classList.contains('active')) {
      renderHistory();
    }
  });

  const themeToggle = document.getElementById('themeToggle');
  const setThemeIcon = () => {
    const isLight = getCurrentTheme() === 'light';
    themeToggle.innerHTML = isLight ? ICONS.sun : ICONS.moon;
    themeToggle.setAttribute('aria-pressed', String(isLight));
  };
  setThemeIcon();
  themeToggle.addEventListener('click', () => { toggleTheme(); setThemeIcon(); });

  document.getElementById('navNouveau').addEventListener('click', () => {
    clearEditingDocId();
    document.getElementById('editingBanner').style.display = 'none';
    resetForm();
    showView('nouveau');
  });
  document.getElementById('navInfos').addEventListener('click', openCompanyModal);
  document.getElementById('navHistorique').addEventListener('click', () => showView('historique'));

  document.getElementById('docType').addEventListener('change', onDocTypeChange);
  document.getElementById('clientSelect').addEventListener('change', onClientSelect);
  document.getElementById('remise').addEventListener('input', recalcTotals);
  document.getElementById('avance').addEventListener('input', recalcTotals);

  document.getElementById('histSearch').addEventListener('input', renderHistory);

  document.querySelector('[data-action="add-line"]').addEventListener('click', () => addLine());
  document.querySelector('[data-action="generate-pdf"]').addEventListener('click', generatePDF);
  document.querySelectorAll('[data-action="close-modal"]').forEach(el => el.addEventListener('click', closeCompanyModal));
  document.querySelector('[data-action="save-company"]').addEventListener('click', saveCompanyForm);
  document.querySelector('[data-action="export-backup"]').addEventListener('click', exportBackup);
  document.querySelector('[data-action="import-backup"]').addEventListener('click', () => {
    document.getElementById('backupFileInput').click();
  });
  document.getElementById('backupFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importBackup(file);
    e.target.value = '';
  });

  document.querySelector('[data-action="add-client"]').addEventListener('click', () => openClientModal(null));
  document.querySelectorAll('[data-action="close-client-modal"]').forEach(el => el.addEventListener('click', closeClientModal));
  document.querySelector('[data-action="save-client"]').addEventListener('click', saveClientForm);

  document.querySelector('[data-action="manage-clients"]').addEventListener('click', openClientManagerModal);
  document.querySelector('[data-action="add-client-from-manager"]').addEventListener('click', () => { closeClientManagerModal(); openClientModal(null); });
  document.querySelectorAll('[data-action="close-client-manager"]').forEach(el => el.addEventListener('click', closeClientManagerModal));
  document.getElementById('clientListWrap').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-client') { closeClientManagerModal(); openClientModal(id); }
    if (btn.dataset.action === 'delete-client') deleteClientById(id);
  });

  document.getElementById('cRegimeTva').addEventListener('change', toggleTvaRate);
  document.getElementById('cTableColorHex').addEventListener('input', syncColorFromHex);
  document.getElementById('cTableTextColorHex').addEventListener('input', syncTableTextColorFromHex);
  document.getElementById('headerFileInput').addEventListener('change', onHeaderFileChange);
  document.getElementById('cTableColor').addEventListener('input', (e) => {
    document.getElementById('cTableColorHex').value = e.target.value;
  });
  document.getElementById('cTableTextColor').addEventListener('input', (e) => {
    document.getElementById('cTableTextColorHex').value = e.target.value;
  });

  document.getElementById('linesBody').addEventListener('input', (e) => {
    if (e.target.matches('.line-prix, .line-qte')) recalcTotals();
  });
  document.getElementById('linesBody').addEventListener('click', (e) => {
    const iconBtn = e.target.closest('.icon-btn');
    if (iconBtn) {
      const tr = iconBtn.closest('tr');
      if (tr) removeLine(tr.id);
    }
  });

  document.getElementById('histTableWrap').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'reprint') reprintHistoryDoc(id);
    if (btn.dataset.action === 'delete') deleteHistoryDoc(id);
    if (btn.dataset.action === 'edit') {
      const doc = getHistoryDoc(id);
      if (doc) {
        setEditingDocId(doc.id);
        loadHistoryDocIntoForm(doc.payload);
        showView('nouveau');
      }
    }
  });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW registration failed:', e));
}
