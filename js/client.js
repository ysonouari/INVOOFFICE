import { loadClients, saveClients } from './storage.js';
import { escapeHtml, enforceDigitsOnly } from './utils.js';
import { ICONS } from './icons.js';
import { showAlertDialog, showConfirmDialog } from './dialog.js';

enforceDigitsOnly('cClientIce', 15);

let clientEditId = null;
let clientModalPrevFocus = null;

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

function onClientModalKey(e) {
  if (e.key === 'Escape') { closeClientModal(); return; }
  trapFocusInModal(document.getElementById('clientModalOverlay'), e);
}

function onClientManagerKey(e) {
  if (e.key === 'Escape') { closeClientManagerModal(); return; }
  trapFocusInModal(document.getElementById('clientManagerOverlay'), e);
}

export function refreshClientsSelect(){
  const sel = document.getElementById('clientSelect');
  const currentVal = sel.value;
  const clients = loadClients();
  sel.innerHTML = `<option value="">${i18next.t('form.client_placeholder')}</option>`
    + clients.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nom)}</option>`).join('');
  if(currentVal && [...sel.options].some(o => o.value === currentVal)) sel.value = currentVal;
}

export function onClientSelect(){
  const preview = document.getElementById('clientPreview');
  const c = getSelectedClient();
  if(c){
    preview.style.display = 'block';
    preview.innerHTML = `<b>${escapeHtml(c.nom)}</b>`
      + (c.tel ? `<br>${escapeHtml(c.tel)}` : '')
      + (c.ice ? `<br>${i18next.t('client.ice_prefix')}${escapeHtml(c.ice)}` : '')
      + (c.adresse ? `<br>${escapeHtml(c.adresse)}` : '');
  } else {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
}

export function getSelectedClient(){
  const sel = document.getElementById('clientSelect');
  if(!sel.value) return null;
  return loadClients().find(c => c.id === sel.value) || null;
}

export function openClientModal(editingId){
  clientEditId = editingId || null;
  document.getElementById('clientModalTitle').textContent = i18next.t(editingId ? 'client.edit_title' : 'client.add_title');
  document.getElementById('cClientNom').value = '';
  document.getElementById('cClientTel').value = '';
  document.getElementById('cClientIce').value = '';
  document.getElementById('cClientAdresse').value = '';
  if(editingId){
    const c = loadClients().find(x => x.id === editingId);
    if(c){
      document.getElementById('cClientNom').value = c.nom || '';
      document.getElementById('cClientTel').value = c.tel || '';
      document.getElementById('cClientIce').value = c.ice || '';
      document.getElementById('cClientAdresse').value = c.adresse || '';
    }
  }
  clientModalPrevFocus = document.activeElement;
  document.addEventListener('keydown', onClientModalKey);
  document.getElementById('clientModalOverlay').classList.add('open');
  const closeBtn = document.querySelector('#clientModalOverlay .modal-close');
  if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
}

export function closeClientModal(){
  document.removeEventListener('keydown', onClientModalKey);
  document.getElementById('clientModalOverlay').classList.remove('open');
  if (clientModalPrevFocus && typeof clientModalPrevFocus.focus === 'function') {
    try { clientModalPrevFocus.focus(); } catch (_) {}
  }
  clientModalPrevFocus = null;
  clientEditId = null;
}

export async function saveClientForm(){
  const nom = document.getElementById('cClientNom').value.trim();
  if(!nom){ await showAlertDialog(i18next.t('client.require_name')); return; }
  let clients = loadClients();
  if(clientEditId){
    const idx = clients.findIndex(c => c.id === clientEditId);
    if(idx >= 0){
      clients[idx].nom = nom;
      clients[idx].tel = document.getElementById('cClientTel').value;
      clients[idx].ice = document.getElementById('cClientIce').value;
      clients[idx].adresse = document.getElementById('cClientAdresse').value;
    }
  } else {
    clients.push({
      id: 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2,9),
      nom,
      tel: document.getElementById('cClientTel').value,
      ice: document.getElementById('cClientIce').value,
      adresse: document.getElementById('cClientAdresse').value,
    });
  }
  saveClients(clients);
  refreshClientsSelect();
  if(clientEditId){
    document.getElementById('clientSelect').value = clientEditId;
    onClientSelect();
  } else {
    const saved = loadClients().find(c => c.nom === nom);
    if(saved){ document.getElementById('clientSelect').value = saved.id; onClientSelect(); }
  }
  closeClientModal();
}

export function openClientManagerModal(){
  renderClientList();
  clientModalPrevFocus = document.activeElement;
  document.addEventListener('keydown', onClientManagerKey);
  document.getElementById('clientManagerOverlay').classList.add('open');
  const closeBtn = document.querySelector('#clientManagerOverlay .modal-close');
  if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
}

export function closeClientManagerModal(){
  document.removeEventListener('keydown', onClientManagerKey);
  document.getElementById('clientManagerOverlay').classList.remove('open');
  if (clientModalPrevFocus && typeof clientModalPrevFocus.focus === 'function') {
    try { clientModalPrevFocus.focus(); } catch (_) {}
  }
  clientModalPrevFocus = null;
}

export function renderClientList(){
  const wrap = document.getElementById('clientListWrap');
  const clients = loadClients();
  if(clients.length === 0){
    wrap.innerHTML = `<div class="empty-state">${i18next.t('client.empty')}</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="hist">
      <thead><tr><th>${i18next.t('client.col_nom')}</th><th>${i18next.t('client.col_telephone')}</th><th>${i18next.t('client.col_ice')}</th><th></th></tr></thead>
      <tbody>
        ${clients.map(c => `
          <tr>
            <td>${escapeHtml(c.nom)}</td>
            <td>${escapeHtml(c.tel || '')}</td>
            <td>${escapeHtml(c.ice || '')}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn btn-ghost" data-action="edit-client" data-id="${escapeHtml(c.id)}" style="padding:6px 10px;">${i18next.t('client.btn_edit')}</button>
              <button class="btn btn-danger" data-action="delete-client" data-id="${escapeHtml(c.id)}" style="padding:6px 10px;" aria-label="${i18next.t('client.btn_delete')}">${ICONS.x}</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

export async function deleteClientById(id){
  if(!await showConfirmDialog(i18next.t('client.confirm_delete'))) return;
  let clients = loadClients();
  const sel = document.getElementById('clientSelect');
  if(sel.value === id) { sel.value = ''; onClientSelect(); }
  saveClients(clients.filter(c => c.id !== id));
  refreshClientsSelect();
  renderClientList();
}

export function getClientById(id){
  return loadClients().find(c => c.id === id) || null;
}
