import { updateBrandLogo } from './brand-logo.js';
import { showView, onDocTypeChange, initForm, resetForm, loadHistoryDocIntoForm, validateDocNumero } from './navigation.js';
import { addLine, removeLine, recalcTotals } from './lines.js';
import { openClientModal, closeClientModal, openClientManagerModal, closeClientManagerModal, onClientSelect, saveClientForm, deleteClientById, refreshClientsSelect } from './client.js';
import { generatePDF } from './pdf.js';
import { setEditingDocId, clearEditingDocId, migrateHistoryHeader } from './history.js';
import { initStorage } from './storage.js';
import { requestStoragePersistence } from './storage-persistence.js';
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

  // Hamburger menu toggle (F2.3 — aria-expanded synchronisé + Escape)
  var hamburger = document.getElementById('appHamburgerToggle');
  var appNav = document.getElementById('appNav');
  if (hamburger && appNav) {
    function setMenuOpen(open) {
      appNav.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
    }
    hamburger.addEventListener('click', function() {
      setMenuOpen(!appNav.classList.contains('open'));
    });
    document.addEventListener('click', function(e) {
      if (!appNav.classList.contains('open')) return;
      if (!appNav.contains(e.target) && e.target !== hamburger) {
        setMenuOpen(false);
      }
    });
    appNav.addEventListener('click', function(e) {
      if (e.target.closest('[data-nav-action]')) {
        setMenuOpen(false);
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && appNav.classList.contains('open')) {
        setMenuOpen(false);
      }
    });
  }

  // Option F — UI statique pré-câblée avant le boot réseau (auth) : aucune
  // dépendance Supabase / session / i18next / storage (DOM + localStorage seuls),
  // fonctionnelle dès le parse du DOM, même si la validation réseau est lente.
  // Modale tutoriel vidéo — ouverture, fermeture (× / clic extérieur / Échap), focus
  const tutorialOverlay = document.getElementById('tutorialModalOverlay');
  const tutorialVideo = document.getElementById('tutorialVideo');
  const openTutorialModal = () => {
    if (!tutorialOverlay || tutorialOverlay.classList.contains('open')) return;
    const prev = document.activeElement;
    if (prev) tutorialOverlay.dataset.prevFocus = prev.id;
    tutorialOverlay.classList.add('open');
    const closeBtn = document.getElementById('tutorialCloseBtn');
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
  };
  const closeTutorialModal = () => {
    if (!tutorialOverlay || !tutorialOverlay.classList.contains('open')) return;
    if (tutorialVideo && !tutorialVideo.paused) tutorialVideo.pause();
    tutorialOverlay.classList.remove('open');
    const prevId = tutorialOverlay.dataset.prevFocus;
    if (prevId) {
      const prev = document.getElementById(prevId);
      if (prev) prev.focus();
    }
    delete tutorialOverlay.dataset.prevFocus;
  };
  document.getElementById('navTutorial').addEventListener('click', openTutorialModal);
  tutorialOverlay.addEventListener('click', (e) => {
    if (e.target === tutorialOverlay || e.target.closest('#tutorialCloseBtn')) closeTutorialModal();
  });
  tutorialOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTutorialModal();
  });

  const themeToggle = document.getElementById('themeToggle');
  const setThemeIcon = () => {
    const isLight = getCurrentTheme() === 'light';
    themeToggle.innerHTML = isLight ? ICONS.sun : ICONS.moon;
    themeToggle.setAttribute('aria-pressed', String(isLight));
  };
  setThemeIcon();
  themeToggle.addEventListener('click', () => { toggleTheme(); setThemeIcon(); });

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
      const { renderHistory } = await import('./history-view.js');
      renderHistory();
    }
  });

  document.getElementById('navNouveau').addEventListener('click', () => {
    clearEditingDocId();
    document.getElementById('editingBanner').style.display = 'none';
    resetForm();
    showView('nouveau');
  });
  let companyModalPromise = null;
  const getCompanyModal = () => (companyModalPromise ||= import('./company-modal.js'));
  document.getElementById('navInfos').addEventListener('click', () => {
    getCompanyModal().then(m => m.openCompanyModal()).catch(e => console.error('Company modal load failed:', e));
  });
  document.getElementById('navHistorique').addEventListener('click', () => showView('historique'));

  document.getElementById('docType').addEventListener('change', onDocTypeChange);
  document.getElementById('docNumero').addEventListener('input', validateDocNumero);
  document.getElementById('clientSelect').addEventListener('change', onClientSelect);
  document.getElementById('remise').addEventListener('input', recalcTotals);
  document.getElementById('avance').addEventListener('input', recalcTotals);

  const histSearch = document.getElementById('histSearch');
  let histSearchTimer = null;
  let historyViewPromise = null;
  const getHistoryView = () => (historyViewPromise ||= import('./history-view.js'));
  histSearch.addEventListener('input', () => {
    clearTimeout(histSearchTimer);
    histSearchTimer = setTimeout(async () => {
      const { renderHistory } = await getHistoryView();
      renderHistory();
    }, 150);
  });
  histSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(histSearchTimer);
      getHistoryView().then(m => m.renderHistory());
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.getElementById('view-historique').classList.contains('active')) {
      e.preventDefault();
      const s = document.getElementById('histSearch');
      if (s) s.focus();
    }
  });

  // B3 — persistance stockage : opportuniste, sous 1ère interaction utilisateur
  // (silencieuse, non bloquante ; jamais de prompt au chargement).
  let persistenceRequested = false;
  const requestPersistenceOnce = () => {
    if (persistenceRequested) return;
    persistenceRequested = true;
    document.removeEventListener('pointerdown', requestPersistenceOnce);
    document.removeEventListener('keydown', requestPersistenceOnce);
    requestStoragePersistence().catch(() => {});
  };
  document.addEventListener('pointerdown', requestPersistenceOnce);
  document.addEventListener('keydown', requestPersistenceOnce);

  document.querySelector('[data-action="add-line"]').addEventListener('click', () => addLine());
  document.querySelector('[data-action="generate-pdf"]').addEventListener('click', generatePDF);
  document.querySelector('[data-action="save-company"]').addEventListener('click', () => {
    getCompanyModal().then(m => m.saveCompanyForm()).catch(e => console.error('Company modal load failed:', e));
  });
  document.querySelector('[data-action="export-backup"]').addEventListener('click', async () => {
    const { exportBackup } = await import('./backup.js');
    exportBackup();
  });
  const backupInput = document.getElementById('backupFileInput');
  document.querySelector('[data-action="import-backup"]').addEventListener('click', () => {
    backupInput.click();
  });
  backupInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      const { importBackup } = await import('./backup.js');
      importBackup(file);
    }
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

  document.getElementById('cRegimeTva').addEventListener('change', () => {
    getCompanyModal().then(m => m.toggleTvaRate()).catch(e => console.error('Company modal load failed:', e));
  });
  document.getElementById('cTableColorHex').addEventListener('input', () => {
    getCompanyModal().then(m => m.syncColorFromHex()).catch(e => console.error('Company modal load failed:', e));
  });
  document.getElementById('cTableTextColorHex').addEventListener('input', () => {
    getCompanyModal().then(m => m.syncTableTextColorFromHex()).catch(e => console.error('Company modal load failed:', e));
  });
  document.getElementById('headerFileInput').addEventListener('change', (e) => {
    getCompanyModal().then(m => m.onHeaderFileChange(e)).catch(e => console.error('Company modal load failed:', e));
  });
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
    if (btn.dataset.action === 'close-modal') getCompanyModal().then(m => m.closeCompanyModal());
    else if (btn.dataset.action === 'close-client-modal') closeClientModal();
    else if (btn.dataset.action === 'close-client-manager') closeClientManagerModal();
  });

  let historyActionsPromise = null;
  const getHistoryActions = () => (historyActionsPromise ||= import('./history-actions.js'));
  document.getElementById('histTableWrap').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'reprint') {
      const prevBtn = { disabled: btn.disabled, ariaBusy: btn.getAttribute('aria-busy'), html: btn.innerHTML };
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(127,127,127,.35);border-top-color:currentColor;border-radius:50%;animation:appspin .7s linear infinite;" aria-hidden="true"></span>';
      try {
        const m = await getHistoryActions();
        await m.reprintHistoryDoc(id);
      } finally {
        btn.disabled = prevBtn.disabled;
        if (prevBtn.ariaBusy) btn.setAttribute('aria-busy', prevBtn.ariaBusy);
        else btn.removeAttribute('aria-busy');
        btn.innerHTML = prevBtn.html;
      }
    }
    else if (btn.dataset.action === 'delete') { const m = await getHistoryView(); m.deleteHistoryDoc(id); }
    else if (btn.dataset.action === 'duplicate') {
      const prevBtn = { disabled: btn.disabled, ariaBusy: btn.getAttribute('aria-busy'), html: btn.innerHTML };
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(127,127,127,.35);border-top-color:currentColor;border-radius:50%;animation:appspin .7s linear infinite;" aria-hidden="true"></span>';
      try {
        const m = await getHistoryActions();
        await m.duplicateHistoryDoc(id);
      } finally {
        btn.disabled = prevBtn.disabled;
        if (prevBtn.ariaBusy) btn.setAttribute('aria-busy', prevBtn.ariaBusy);
        else btn.removeAttribute('aria-busy');
        btn.innerHTML = prevBtn.html;
      }
    }
    else if (btn.dataset.action === 'convert') { const m = await getHistoryActions(); m.convertToInvoice(id); }
    else if (btn.dataset.action === 'edit') {
      const m = await getHistoryActions();
      const doc = m.getHistoryDoc(id);
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
