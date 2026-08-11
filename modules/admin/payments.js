/**
 * Payments — Dashboard admin
 * Gestion des paiements : vue, modification, validation, remboursement
 */
import { getSupabase } from '../auth/supabase-client.js';
import { formatDate, formatDH } from './stats.js';
import { updatePayment, validatePayment, refundPayment } from './user-actions.js';
import { confirmAction } from './users-table.js';
import { showToast } from '../shared/ui.js';

let allPayments = [];

export async function loadPayments() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('payments')
    .select('id,user_id,amount,payment_method,reference,notes,status,created_at,paid_at')
    .order('created_at', { ascending: false });
  allPayments = data || [];

  const userIds = [...new Set(allPayments.map(p => p.user_id))];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id,full_name,email')
      .in('id', userIds);
    const map = {};
    (profiles || []).forEach(p => { map[p.id] = p; });
    allPayments.forEach(p => { p._profile = map[p.user_id]; });
  }

  renderPayments();
}

function renderPayments() {
  const container = document.getElementById('paymentsTable');
  if (allPayments.length === 0) {
    container.innerHTML = '<p class="admin-empty">Aucun paiement enregistré.</p>';
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Date</th><th>Utilisateur</th><th>Montant</th><th>Méthode</th><th>Référence</th><th>Statut</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${allPayments.map(p => `
            <tr>
              <td style="font-size:12px;color:var(--muted);">${formatDate(p.created_at)}</td>
              <td>${esc(p._profile?.full_name || p._profile?.email || p.user_id?.slice(0,8))}</td>
              <td><strong>${formatDH(p.amount)}</strong></td>
              <td>${p.payment_method}</td>
              <td style="font-size:12px;color:var(--muted);">${p.reference || '-'}</td>
              <td>${paymentBadge(p.status)}</td>
              <td>${renderActions(p)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;

  bindActions(container);
}

function renderActions(p) {
  const btns = [];
  btns.push(`<button class="btn btn-ghost" data-action="view-payment" data-id="${p.id}" style="font-size:11px;">Voir</button>`);
  btns.push(`<button class="btn btn-ghost" data-action="edit-payment" data-id="${p.id}" style="font-size:11px;">Modifier</button>`);
  if (p.status === 'pending') {
    btns.push(`<button class="btn btn-ghost" data-action="validate-payment" data-id="${p.id}" data-user="${p.user_id}" data-name="${esc(p._profile?.full_name || '')}" style="font-size:11px;color:var(--success);">Valider</button>`);
  }
  if (p.status === 'completed') {
    btns.push(`<button class="btn btn-ghost" data-action="refund-payment" data-id="${p.id}" data-user="${p.user_id}" data-name="${esc(p._profile?.full_name || '')}" data-amount="${p.amount}" style="font-size:11px;color:var(--danger);">Rembourser</button>`);
  }
  return `<div class="admin-actions">${btns.join('')}</div>`;
}

function bindActions(container) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const paymentId = btn.dataset.id;

      if (action === 'view-payment') {
        const p = allPayments.find(x => x.id === paymentId);
        if (p) openPaymentDetail('view', p);
      }

      if (action === 'edit-payment') {
        const p = allPayments.find(x => x.id === paymentId);
        if (p) openPaymentDetail('edit', p);
      }

      if (action === 'validate-payment') {
        confirmAction('Valider le paiement', 'Confirmer la validation de ce paiement ?', async () => {
          try {
            await validatePayment(paymentId, btn.dataset.user, btn.dataset.name);
            showToast('Paiement validé', 'success');
            await loadPayments();
          } catch (err) {
            showToast('Erreur: ' + err.message, 'error');
          }
        });
      }

      if (action === 'refund-payment') {
        confirmAction('Rembourser le paiement', 'Marquer ce paiement comme remboursé ? L\'accès utilisateur restera actif sauf si vous le révoquez manuellement.', async () => {
          try {
            await refundPayment(paymentId, btn.dataset.user, btn.dataset.name, parseInt(btn.dataset.amount));
            showToast('Paiement remboursé', 'error');
            await loadPayments();
          } catch (err) {
            showToast('Erreur: ' + err.message, 'error');
          }
        });
      }
    });
  });
}

function getPaymentById(id) {
  return allPayments.find(p => p.id === id);
}

function openPaymentDetail(mode, payment) {
  const overlay = document.getElementById('paymentDetailOverlay');
  const title = document.getElementById('paymentDetailTitle');
  const content = document.getElementById('paymentDetailContent');
  const actions = document.getElementById('paymentDetailActions');

  title.textContent = mode === 'view' ? 'Détail du paiement' : 'Modifier le paiement';
  actions.style.display = mode === 'edit' ? 'flex' : 'none';

  if (mode === 'view') {
    content.innerHTML = renderPaymentView(payment);
  } else {
    content.innerHTML = renderPaymentEdit(payment);
    actions.innerHTML = `
      <button class="btn" id="paymentEditCancel">Annuler</button>
      <button class="btn btn-accent" id="paymentEditSave">Enregistrer</button>
    `;
    document.getElementById('paymentEditCancel').addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    document.getElementById('paymentEditSave').addEventListener('click', () => savePaymentEdit(payment));
  }

  overlay.style.display = 'flex';
}

function renderPaymentView(p) {
  return `
    <div class="detail-grid">
      ${row('ID', p.id?.slice(0,12) + '…')}
      ${row('Utilisateur', esc(p._profile?.full_name || p._profile?.email || p.user_id?.slice(0,8)))}
      ${row('Montant', formatDH(p.amount))}
      ${row('Devise', p.currency || 'MAD')}
      ${row('Méthode', p.payment_method)}
      ${row('Référence', p.reference || '-')}
      ${row('Notes', p.notes || '-')}
      ${row('Statut', paymentBadge(p.status))}
      ${row('Payé le', p.paid_at ? formatDate(p.paid_at) : '-')}
      ${row('Créé le', formatDate(p.created_at))}
      ${row('Modifié le', formatDate(p.updated_at || p.created_at))}
    </div>`;
}

function renderPaymentEdit(p) {
  const methods = ['manual', 'online', 'wire_transfer', 'cash'];
  const methodLabels = { manual: 'Manuel', online: 'En ligne', wire_transfer: 'Virement bancaire', cash: 'Espèces' };
  const statuses = ['pending', 'completed', 'failed', 'refunded'];
  const statusLabels = { pending: 'En attente', completed: 'Complété', failed: 'Échoué', refunded: 'Remboursé' };

  return `
    <input type="hidden" id="editPaymentId" value="${p.id}">
    <input type="hidden" id="editPaymentUserId" value="${p.user_id}">
    <div class="detail-grid">
      ${readOnlyRow('ID', p.id?.slice(0,12) + '…')}
      ${readOnlyRow('Utilisateur', esc(p._profile?.full_name || p._profile?.email || p.user_id?.slice(0,8)))}
      ${readOnlyRow('Montant', formatDH(p.amount))}
      ${readOnlyRow('Devise', p.currency || 'MAD')}
      <div class="detail-item">
        <label>Méthode</label>
        <select id="editMethod" style="width:100%;">${methods.map(m => `<option value="${m}" ${p.payment_method === m ? 'selected' : ''}>${methodLabels[m]}</option>`).join('')}</select>
      </div>
      <div class="detail-item">
        <label>Référence</label>
        <input type="text" id="editReference" value="${escAttr(p.reference || '')}" style="width:100%;">
      </div>
      <div class="detail-item" style="grid-column:1/-1;">
        <label>Notes</label>
        <textarea id="editNotes" rows="2" style="width:100%;">${escAttr(p.notes || '')}</textarea>
      </div>
      <div class="detail-item">
        <label>Statut</label>
        <select id="editStatus" style="width:100%;">${statuses.map(s => {
          const disabled = (p.status === 'refunded' && s === 'completed');
          return `<option value="${s}" ${p.status === s ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${statusLabels[s]}${disabled ? ' (interdit)' : ''}</option>`;
        }).join('')}</select>
      </div>
      ${readOnlyRow('Payé le', p.paid_at ? formatDate(p.paid_at) : '-')}
      ${readOnlyRow('Créé le', formatDate(p.created_at))}
    </div>`;
}

async function savePaymentEdit(original) {
  const paymentId = document.getElementById('editPaymentId').value;
  const userId = document.getElementById('editPaymentUserId').value;
  const method = document.getElementById('editMethod').value;
  const reference = document.getElementById('editReference').value.trim();
  const notes = document.getElementById('editNotes').value.trim();
  const status = document.getElementById('editStatus').value;

  const changes = {};
  if (method !== original.payment_method) changes.payment_method = method;
  if (reference !== (original.reference || '')) changes.reference = reference || null;
  if (notes !== (original.notes || '')) changes.notes = notes || null;
  if (status !== original.status) changes.status = status;

  if (Object.keys(changes).length === 0) {
    showToast('Aucune modification détectée', 'info');
    return;
  }

  const prevValues = {};
  Object.keys(changes).forEach(k => { prevValues[k] = original[k]; });

  try {
    await updatePayment(paymentId, userId, changes, prevValues);
    showToast('Paiement modifié', 'success');
    document.getElementById('paymentDetailOverlay').style.display = 'none';
    await loadPayments();
  } catch (err) {
    showToast('Erreur: ' + err.message, 'error');
  }
}

function row(label, value) {
  return `<div class="detail-item"><label>${label}</label><span>${value}</span></div>`;
}

function readOnlyRow(label, value) {
  return `<div class="detail-item"><label>${label}</label><span style="color:var(--muted-2);">${value}</span></div>`;
}

function paymentBadge(s) {
  const map = {
    completed: 'admin-badge-paid',
    pending: 'admin-badge-pending',
    failed: 'admin-badge-failed',
    refunded: 'admin-badge-inactive',
    manual: 'admin-badge-admin'
  };
  const cls = map[s] || 'admin-badge-waiting';
  return `<span class="admin-badge ${cls}">${s || 'inconnu'}</span>`;
}

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.addEventListener('click', (e) => {
  if (e.target.dataset.action === 'close-payment-detail') {
    document.getElementById('paymentDetailOverlay').style.display = 'none';
  }
});

document.getElementById('paymentDetailOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.style.display = 'none';
  }
});
