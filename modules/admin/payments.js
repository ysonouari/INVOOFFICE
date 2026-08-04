/**
 * Payments — Dashboard admin
 * Section paiements avec validation/refus
 */
import { getSupabase } from '../auth/supabase-client.js';
import { formatDate, formatDH } from './stats.js';
import { markAsPaid } from './user-actions.js';
import { confirmAction } from './users-table.js';

let allPayments = [];

export async function loadPayments() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('payments')
    .select('id,user_id,amount,payment_method,reference,status,created_at,paid_at')
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
              <td>${p.status === 'pending' ? `<button class="btn btn-ghost" style="font-size:11px;color:var(--success);" data-action="validate-payment" data-id="${p.id}" data-user="${p.user_id}" data-name="${esc(p._profile?.full_name || '')}">Valider</button>` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;

  container.querySelectorAll('[data-action="validate-payment"]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('Valider le paiement', 'Confirmer ce paiement ?', async () => {
        await markAsPaid(btn.dataset.user, btn.dataset.name);
        await loadPayments();
      });
    });
  });
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
