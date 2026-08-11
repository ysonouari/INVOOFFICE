/**
 * Logs — Dashboard admin
 * Journal d'administration avec filtres
 */
import { getSupabase } from '../auth/supabase-client.js';
import { formatDate } from './stats.js';

export async function loadLogs() {
  const container = document.getElementById('logsTable');
  container.innerHTML = '<p class="admin-empty">Chargement du journal...</p>';

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('admin_logs')
      .select('admin_id,target_user_id,action,details,created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    renderLogs(data || []);
  } catch (err) {
    console.error('Admin logs load error:', err);
    container.innerHTML = '<p class="admin-empty" style="color:var(--danger);">Impossible de charger le journal.</p>';
  }
}

function renderLogs(logs) {
  const container = document.getElementById('logsTable');
  const searchEl = document.getElementById('logSearch');
  const actionEl = document.getElementById('logActionFilter');

  function filter() {
    let filtered = logs;
    const search = searchEl.value.toLowerCase();
    const action = actionEl.value;
    if (search) filtered = filtered.filter(l => JSON.stringify(l).toLowerCase().includes(search));
    if (action) filtered = filtered.filter(l => l.action === action);
    renderFiltered(filtered);
  }

  searchEl.oninput = filter;
  actionEl.onchange = filter;

  renderFiltered(logs);
}

function renderFiltered(logs) {
  const container = document.getElementById('logsTable');
  if (logs.length === 0) {
    container.innerHTML = '<p class="admin-empty">Aucune entrée trouvée.</p>';
    return;
  }

  const actions = {
    activate: 'Activation', deactivate: 'Désactivation',
    grant_access: 'Attribution accès', revoke_access: 'Retrait accès',
    mark_paid: 'Paiement créé', validate_payment: 'Paiement confirmé',
    update_payment: 'Paiement modifié', refund_payment: 'Paiement remboursé',
    edit_profile: 'Modification profil',
    change_role: 'Changement rôle', delete_user: 'Suppression'
  };

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Date</th><th>Admin</th><th>Action</th><th>Utilisateur</th><th>Description</th>
        </tr></thead>
        <tbody>
          ${logs.map(l => `<tr>
            <td style="font-size:12px;color:var(--muted);">${formatDate(l.created_at)}</td>
            <td style="font-size:12px;color:var(--muted);">${l.admin_id?.slice(0,8) || '-'}</td>
            <td>${actions[l.action] || l.action}</td>
            <td>${l.details?.target_name || l.target_user_id?.slice(0,8) || '-'}</td>
            <td style="color:var(--muted);font-size:12px;">${l.details?.summary || '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
