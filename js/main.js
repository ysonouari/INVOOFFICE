import { updateBrandLogo, openCompanyModal, closeCompanyModal, toggleTvaRate, syncColorFromHex, syncTableTextColorFromHex, onHeaderFileChange, saveCompanyForm } from './company-modal.js';
import { showView, onDocTypeChange, initForm, resetForm, loadHistoryDocIntoForm, validateDocNumero } from './navigation.js';
import { addLine, removeLine, recalcTotals } from './lines.js';
import { openClientModal, closeClientModal, openClientManagerModal, closeClientManagerModal, onClientSelect, saveClientForm, deleteClientById, refreshClientsSelect } from './client.js';
import { generatePDF } from './pdf.js';
import { renderHistory, reprintHistoryDoc, deleteHistoryDoc, getHistoryDoc, setEditingDocId, clearEditingDocId, migrateHistoryHeader, duplicateHistoryDoc, convertToInvoice } from './history.js';
import { initStorage } from './storage.js';
import { exportBackup, importBackup } from './backup.js';
import { initI18n, setLang, getCurrentLang } from './i18n.js';
import { toggleTheme, getCurrentTheme } from './theme.js';
import { ICONS } from './icons.js';
import { checkAccessAndInit, logout } from './auth.js';

const INIT_TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('INIT_TIMEOUT')), ms);
    }),
  ]);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {

  // Hamburger menu toggle
  var hamburger = document.getElementById('appHamburgerToggle');
  var appNav = document.getElementById('appNav');
  if (hamburger && appNav) {
    function closeMobileMenu() {
      appNav.classList.remove('open');
    }
    hamburger.addEventListener('click', function() {
      appNav.classList.toggle('open');
    });
    document.addEventListener('click', function(e) {
      if (!appNav.classList.contains('open')) return;
      if (!appNav.contains(e.target) && e.target !== hamburger) {
        closeMobileMenu();
      }
    });
    appNav.addEventListener('click', function(e) {
      if (e.target.closest('[data-nav-action]')) {
        closeMobileMenu();
      }
    });
  }

  // Auth guard + storage + i18n (independants, lances en parallele)
  const [auth] = await withTimeout(
    Promise.all([
      checkAccessAndInit(),
      initStorage(),
      initI18n(),
    ]),
    INIT_TIMEOUT_MS
  );
  if (!auth || auth.blocked) {
    if (auth && auth.blocked) {
      document.getElementById('appLoading').classList.add('hidden');
      document.getElementById('authBlockedMessage').textContent = auth.message;
      document.getElementById('authBlockedOverlay').style.display = 'flex';
      document.getElementById('authBlockedLogout').addEventListener('click', logout);
    }
    return;
  }

  // Nettoyage du header dupliqué dans l'historique (garde-fou OPFS, non bloquant)
  migrateHistoryHeader().catch(() => {});

  // Show user info
  const userEl = document.getElementById('authUser');
  if (userEl) {
    userEl.style.display = 'flex';
    document.getElementById('authUserName').textContent = auth.profile.full_name || auth.user.email;
  }
  document.getElementById('authLogout').addEventListener('click', logout);

  document.documentElement.lang = i18next.language;
  document.documentElement.dir = i18next.language === 'ar' ? 'rtl' : 'ltr';
  updateBrandLogo();
  initForm();
  document.getElementById('view-nouveau').classList.add('active');
  document.getElementById('appLoading').classList.add('hidden');
  document.getElementById('footerYear').textContent = new Date().getFullYear();

  document.getElementById('langSwitcher').addEventListener('click', async () => {
    const next = getCurrentLang() === 'ar' ? 'fr' : 'ar';
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
  document.getElementById('docNumero').addEventListener('input', validateDocNumero);
  document.getElementById('clientSelect').addEventListener('change', onClientSelect);
  document.getElementById('remise').addEventListener('input', recalcTotals);
  document.getElementById('avance').addEventListener('input', recalcTotals);

  document.getElementById('histSearch').addEventListener('input', renderHistory);

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.getElementById('view-historique').classList.contains('active')) {
      e.preventDefault();
      const s = document.getElementById('histSearch');
      if (s) s.focus();
    }
  });

  document.querySelector('[data-action="add-line"]').addEventListener('click', () => addLine());
  document.querySelector('[data-action="generate-pdf"]').addEventListener('click', generatePDF);
  document.querySelector('[data-action="save-company"]').addEventListener('click', saveCompanyForm);
  document.querySelector('[data-action="export-backup"]').addEventListener('click', exportBackup);
  const backupInput = document.getElementById('backupFileInput');
  document.querySelector('[data-action="import-backup"]').addEventListener('click', () => {
    backupInput.click();
  });
  backupInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importBackup(file);
    e.target.value = '';
  });

  document.querySelector('[data-action="add-client"]').addEventListener('click', () => openClientModal(null));
  document.querySelector('[data-action="save-client"]').addEventListener('click', saveClientForm);

  document.querySelector('[data-action="manage-clients"]').addEventListener('click', openClientManagerModal);
  document.querySelector('[data-action="add-client-from-manager"]').addEventListener('click', () => { closeClientManagerModal(); openClientModal(null); });
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

  const linesBody = document.getElementById('linesBody');
  linesBody.addEventListener('input', (e) => {
    if (e.target.matches('.line-prix, .line-qte')) recalcTotals();
  });
  linesBody.addEventListener('click', (e) => {
    const iconBtn = e.target.closest('.icon-btn');
    if (iconBtn) {
      const tr = iconBtn.closest('tr');
      if (tr) removeLine(tr.id);
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'close-modal') closeCompanyModal();
    else if (btn.dataset.action === 'close-client-modal') closeClientModal();
    else if (btn.dataset.action === 'close-client-manager') closeClientManagerModal();
  });

  document.getElementById('histTableWrap').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'reprint') reprintHistoryDoc(id);
    if (btn.dataset.action === 'delete') deleteHistoryDoc(id);
    if (btn.dataset.action === 'duplicate') duplicateHistoryDoc(id);
    if (btn.dataset.action === 'convert') convertToInvoice(id);
    if (btn.dataset.action === 'edit') {
      const doc = getHistoryDoc(id);
      if (doc) {
        setEditingDocId(doc.id);
        loadHistoryDocIntoForm(doc.payload);
        showView('nouveau');
      }
    }
  });

  } catch (e) {
    console.error('App init failed:', e);
    var appLoading = document.getElementById('appLoading');
    if (appLoading) appLoading.classList.add('hidden');
    var overlay = document.getElementById('appErrorOverlay');
    if (overlay) overlay.style.display = 'flex';
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW registration failed:', e));
}
