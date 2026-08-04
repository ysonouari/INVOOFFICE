/**
 * User Detail — Dashboard admin
 * Fiche détaillée d'un utilisateur
 */
import { getSupabase } from '../auth/supabase-client.js';
import { formatDate, formatDH } from './stats.js';

export async function openUserDetail(user) {
  const supabase = getSupabase();
  const { data: allLogs } = await supabase
    .from('admin_logs')
    .select('action,target_user_id,details,created_at')
    .eq('target_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const [firstLog] = user.subs.filter(s => s.status === 'active');
  const [firstPayment] = user.pays.filter(p => p.status === 'completed');

  document.getElementById('userDetailTitle').textContent = user.full_name || 'Utilisateur';
  document.getElementById('userDetailContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Nom complet</label><span>${esc(user.full_name || '-')}</span></div>
      <div class="detail-item"><label>Email</label><span>${esc(user.email || '-')}</span></div>
      <div class="detail-item"><label>WhatsApp</label><span>${esc(user.whatsapp || '-')}</span></div>
      <div class="detail-item"><label>Rôle</label><span>${user.role}</span></div>
      <div class="detail-item"><label>Statut</label><span>${user.status}</span></div>
      <div class="detail-item"><label>Inscription</label><span>${formatDate(user.created_at)}</span></div>
      <div class="detail-item"><label>Abonnement</label><span>${firstLog ? 'Actif - Accès à vie' : (user.subs.length ? user.subs[0].status : 'Aucun')}</span></div>
      <div class="detail-item"><label>Paiement</label><span>${firstPayment ? formatDH(firstPayment.amount) + ' - Payé' : 'En attente'}</span></div>
    </div>
    ${allLogs && allLogs.length > 0 ? `
    <div style="margin-top:20px;">
      <h3 style="font-size:14px;">Historique d'administration</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Date</th><th>Action</th><th>Détails</th></tr></thead>
          <tbody>${allLogs.map(l => `<tr>
            <td style="font-size:12px;color:var(--muted);">${formatDate(l.created_at)}</td>
            <td>${l.action}</td>
            <td style="color:var(--muted);font-size:12px;">${l.details?.summary || '-'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}
  `;

  document.getElementById('userDetailOverlay').style.display = 'flex';
}

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="close-user-detail"]')) {
    document.getElementById('userDetailOverlay').style.display = 'none';
  }
});

document.getElementById('userDetailOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});
