import { nextNumero } from './storage.js';
import { addLine, recalcTotals, refreshNotesFromRegime } from './lines.js';
import { refreshClientsSelect, onClientSelect, getClientById } from './client.js';
import { renderHistory } from './history.js';

export function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('navNouveau').classList.toggle('active', name==='nouveau');
  document.getElementById('navHistorique').classList.toggle('active', name==='historique');
  if(name === 'historique') {
    document.getElementById('editingBanner').style.display = 'none';
    renderHistory();
  }
}

export function onDocTypeChange(){
  const type = document.getElementById('docType').value;
  document.getElementById('clientRefWrap').style.display = (type==='avoir' || type==='bl') ? 'block' : 'none';
  const { display } = nextNumero(type);
  document.getElementById('docNumero').value = display;
  recalcTotals();
}

export function resetForm(){
  document.getElementById('docType').value = 'facture';
  document.getElementById('docDate').valueAsDate = new Date();
  document.getElementById('docStatus').value = 'final';

  document.getElementById('clientSelect').value = '';
  const preview = document.getElementById('clientPreview');
  preview.style.display = 'none';
  preview.innerHTML = '';

  const clientRef = document.getElementById('clientRef');
  if (clientRef) clientRef.value = '';

  document.getElementById('remise').value = '0';
  document.getElementById('avance').value = '0';
  document.getElementById('conditions').value = '';
  document.getElementById('modeReglement').value = '';

  document.getElementById('notes').value = '';
  delete document.getElementById('notes').dataset.auto;
  refreshNotesFromRegime();

  document.getElementById('linesBody').innerHTML = '';
  addLine();

  onDocTypeChange();
}

export function initForm(){
  document.getElementById('docType').value = 'facture';
  document.getElementById('docStatus').value = 'final';
  document.getElementById('docDate').valueAsDate = new Date();
  onDocTypeChange();
  addLine();
  refreshNotesFromRegime();
  refreshClientsSelect();
}

function parseFrenchDate(str){
  if (!str) return new Date();
  const parts = str.split('/');
  if (parts.length === 3) return new Date(parts[2], parts[1]-1, parts[0]);
  return new Date();
}

export function loadHistoryDocIntoForm(payload){
  resetForm();
  refreshClientsSelect();

  const banner = document.getElementById('editingBanner');
  banner.textContent = i18next.t('editing.banner', {numero: payload.numero});
  banner.style.display = 'block';

  document.getElementById('docType').value = payload.type;
  document.getElementById('docStatus').value = payload.status || 'final';
  document.getElementById('docNumero').value = payload.numero;
  document.getElementById('docDate').valueAsDate = parseFrenchDate(payload.date);

  document.getElementById('conditions').value = payload.conditions || '';
  document.getElementById('modeReglement').value = payload.modeReglement || '';
  document.getElementById('notes').value = payload.notes || '';
  delete document.getElementById('notes').dataset.auto;

  const t = payload.totals;
  document.getElementById('remise').value = t.remisePct || 0;
  document.getElementById('avance').value = t.avance || 0;

  onDocTypeChange();
  document.getElementById('docNumero').value = payload.numero;

  const clientRefEl = document.getElementById('clientRef');
  if (clientRefEl) clientRefEl.value = payload.client.ref || '';

  if (payload.client.id) {
    const sel = document.getElementById('clientSelect');
    sel.value = payload.client.id;
    onClientSelect();
    if (!getClientById(payload.client.id)) {
      const warning = ' ' + i18next.t('editing.client_not_found');
      banner.textContent += warning;
      banner.style.background = 'var(--danger)';
    }
  }

  document.getElementById('linesBody').innerHTML = '';
  const lines = (t.lines && t.lines.length > 0) ? t.lines : [{ desig: '', prix: 0, qte: 1 }];
  lines.forEach(l => addLine({ desig: l.desig || '', prix: l.prix || 0, qte: l.qte || 1 }));

  recalcTotals();
}
