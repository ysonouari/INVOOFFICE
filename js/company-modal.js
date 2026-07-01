import { loadCompany, saveCompany } from './storage.js';
import { recalcTotals, refreshNotesFromRegime } from './lines.js';
import { ICONS } from './icons.js';
import { getStorageEstimate } from './storage-quota.js';
import { migrateHeaderFromCompany, saveHeaderImage, loadHeaderImage, deleteHeaderImage } from './opfs-storage.js';
import { showAlertDialog } from './dialog.js';
import { enforceDigitsOnly } from './utils.js';

let pendingHeaderImage = null;
let companyModalPrevFocus = null;

function trapFocusInModal(modal, e) {
  if (e.key !== 'Tab') return;
  const focusable = Array.from(modal.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

function onCompanyModalKey(e) {
  if (e.key === 'Escape') { closeCompanyModal(); return; }
  trapFocusInModal(document.getElementById('companyModalOverlay'), e);
}

enforceDigitsOnly('cICE', 15);
enforceDigitsOnly('cIF', 8);
enforceDigitsOnly('cRC', 10);
enforceDigitsOnly('cTP', 8);
enforceDigitsOnly('cCNSS', 8);

export async function openCompanyModal(){
  const c = loadCompany();
  document.getElementById('cDevise').value = c.devise || 'DH';
  document.getElementById('cNom').value = c.nom || '';
  document.getElementById('cRegimeTva').value = c.regimeTva || 'normal';
  document.getElementById('cContact').value = c.contact || '';
  document.getElementById('cTvaTaux').value = c.tvaTaux || 20;
  document.getElementById('cAdresse').value = c.adresse || '';
  document.getElementById('cICE').value = c.ice || '';
  document.getElementById('cIF').value = c.if_ || '';
  document.getElementById('cRC').value = c.rc || '';
  document.getElementById('cTP').value = c.tp || '';
  document.getElementById('cCNSS').value = c.cnss || '';
  document.getElementById('cTableColor').value = c.tableColor || '#eef1f6';
  document.getElementById('cTableColorHex').value = c.tableColor || '#eef1f6';
  document.getElementById('cTableTextColor').value = c.tableTextColor || '#333333';
  document.getElementById('cTableTextColorHex').value = c.tableTextColor || '#333333';
  document.getElementById('cMargeHaut').value = c.margeHaut ?? 3;
  document.getElementById('cFontSizeOffset').value = c.fontSizeOffset ?? 0;
  document.getElementById('cHeaderActive').checked = !!c.headerActive;
  toggleTvaRate();
  renderHeaderPreview(null);
  (async () => {
    let blob;
    try { blob = await loadHeaderImage(); } catch (_) { blob = null; }
    if (blob) {
      renderHeaderPreview(URL.createObjectURL(blob));
    } else if (c.headerImage) {
      await migrateHeaderFromCompany(c);
      delete c.headerImage;
      saveCompany(c);
      let migratedBlob;
      try { migratedBlob = await loadHeaderImage(); } catch (_) { migratedBlob = null; }
      if (migratedBlob) {
        renderHeaderPreview(URL.createObjectURL(migratedBlob));
      }
    }
  })();
  companyModalPrevFocus = document.activeElement;
  document.addEventListener('keydown', onCompanyModalKey);
  document.getElementById('companyModalOverlay').classList.add('open');
  const closeBtn = document.querySelector('#companyModalOverlay .modal-close');
  if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
  const info = document.getElementById('storageInfo');
  if (info) {
    try {
      const est = await getStorageEstimate();
      if (est) {
        let html = `<strong>${i18next.t('company.storage_structured')}</strong><br>`;
        if (est.lsOnly) {
          html += `localStorage — <strong>${est.usageMB} Mo</strong> / ${est.quotaMB} Mo (${est.percent}%)`;
          if (est.lsWarning) html += ` <span style="color:var(--danger);">${i18next.t('company.storage_warning_80')}</span>`;
        } else {
          html += `IndexedDB + localStorage — <strong>${est.usageMB} Mo</strong> / ${est.quotaMB} Mo (${est.percent}%)`;
          if (est.lsWarning) html += `<br><span style="color:var(--danger);font-size:11px;">${i18next.t('company.storage_warning_ls')}</span>`;
        }
        html += `<br><span style="font-size:11px;color:var(--muted-2);">${i18next.t('company.storage_opfs')}</span>`;
        info.innerHTML = html;
      } else {
        info.textContent = i18next.t('company.storage_unavailable');
      }
    } catch {
      info.textContent = i18next.t('company.storage_unavailable');
    }
  }
}

export function closeCompanyModal(){
  document.removeEventListener('keydown', onCompanyModalKey);
  document.getElementById('companyModalOverlay').classList.remove('open');
  if (companyModalPrevFocus && typeof companyModalPrevFocus.focus === 'function') {
    try { companyModalPrevFocus.focus(); } catch (_) {}
  }
  companyModalPrevFocus = null;
}

export function toggleTvaRate(){
  document.getElementById('cTvaRateWrap').style.display =
    document.getElementById('cRegimeTva').value === 'normal' ? 'block' : 'none';
}

export function syncColorFromHex(){
  const hex = document.getElementById('cTableColorHex').value;
  if(/^#[0-9a-fA-F]{6}$/.test(hex)) document.getElementById('cTableColor').value = hex;
}

export function syncTableTextColorFromHex(){
  const hex = document.getElementById('cTableTextColorHex').value;
  if(/^#[0-9a-fA-F]{6}$/.test(hex)) document.getElementById('cTableTextColor').value = hex;
}

export function onHeaderFileChange(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    pendingHeaderImage = ev.target.result;
    renderHeaderPreview(pendingHeaderImage);
  };
  reader.readAsDataURL(file);
}

export function renderHeaderPreview(src){
  const slot = document.getElementById('uploadPreviewSlot');
  if(src){
    slot.innerHTML = `<img src="${src}" alt="${i18next.t('company.header_alt')}"><div>${i18next.t('company.header_replace')}</div>`;
  } else {
    slot.innerHTML = `${ICONS.upload} ${i18next.t('company.header_click')}`;
  }
}

export async function saveCompanyForm(){
  const c = loadCompany();
  c.devise = document.getElementById('cDevise').value;
  c.nom = document.getElementById('cNom').value;
  c.regimeTva = document.getElementById('cRegimeTva').value;
  c.contact = document.getElementById('cContact').value;
  c.tvaTaux = parseFloat(document.getElementById('cTvaTaux').value) || 0;
  c.adresse = document.getElementById('cAdresse').value;
  c.ice = document.getElementById('cICE').value;
  c.if_ = document.getElementById('cIF').value;
  c.rc = document.getElementById('cRC').value;
  c.tp = document.getElementById('cTP').value;
  c.cnss = document.getElementById('cCNSS').value;

  if (c.ice && c.ice.length !== 15) {
    await showAlertDialog(i18next.t('company.alert_ice_length'));
  }
  c.tableColor = document.getElementById('cTableColorHex').value;
  c.tableTextColor = document.getElementById('cTableTextColorHex').value;
  c.margeHaut = parseFloat(document.getElementById('cMargeHaut').value) || 0;
  c.fontSizeOffset = parseInt(document.getElementById('cFontSizeOffset').value) || 0;
  c.headerActive = document.getElementById('cHeaderActive').checked;
  saveCompany(c);
  if (pendingHeaderImage) {
    (async () => {
      try {
        const resp = await fetch(pendingHeaderImage);
        const blob = await resp.blob();
        await saveHeaderImage(blob);
      } catch (_) {}
    })();
  } else if (!c.headerActive) {
    deleteHeaderImage().catch(() => {});
  }
  pendingHeaderImage = null;
  updateBrandLogo();
  refreshNotesFromRegime();
  recalcTotals();
  closeCompanyModal();
}

export function updateBrandLogo(){
  const c = loadCompany();
  document.getElementById('brandLogo').textContent = (c.nom || 'SF').substring(0,2).toUpperCase();
}
