/**
 * Stats — Dashboard admin
 * Cartes statistiques et activité récente
 */
import { getSupabase } from '../auth/supabase-client.js';

export async function loadStats() {
  const supabase = getSupabase();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: profiles } = await supabase.from('profiles').select('status,role,created_at');
  const { data: payments } = await supabase.from('payments').select('amount,status,created_at');
  const { data: subs } = await supabase.from('subscriptions').select('status');

  const all = profiles || [];
  const pays = payments || [];
  const activeSubs = (subs || []).filter(s => s.status === 'active');

  const total = all.length;
  const active = all.filter(p => p.status === 'active').length;
  const pending = all.filter(p => p.status === 'pending').length;
  const inactive = all.filter(p => p.status === 'inactive').length;
  const admins = all.filter(p => p.role === 'admin').length;
  const lifetime = activeSubs.length;

  const paid = pays.filter(p => p.status === 'completed');
  const paidTotal = paid.reduce((s, p) => s + (p.amount || 0), 0);
  const paidCount = paid.length;
  const pendingPayments = pays.filter(p => p.status === 'pending').length;

  const todaySignups = all.filter(p => p.created_at && p.created_at.startsWith(today)).length;
  const monthSignups = all.filter(p => p.created_at >= monthStart).length;

  const stats = [
    { value: total, label: 'Utilisateurs', sub: `${monthSignups} ce mois` },
    { value: active, label: 'Actifs' },
    { value: pending, label: 'En attente', cls: 'stat-yellow' },
    { value: inactive, label: 'Suspendus', cls: 'stat-red' },
    { value: admins, label: 'Admins' },
    { value: lifetime, label: 'Accès à vie', cls: 'stat-accent' },
    { value: todaySignups, label: "Aujourd'hui" },
    { value: monthSignups, label: 'Ce mois' },
    { value: paidCount, label: 'Paiements', sub: formatDH(paidTotal), cls: 'stat-green' },
    { value: pendingPayments, label: 'En attente', sub: 'paiement', cls: 'stat-yellow' },
  ];

  const grid = document.getElementById('statsGrid');
  grid.className = 'admin-stats-grid';
  grid.innerHTML = stats.map(s =>
    `<div class="admin-stat-card">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value ${s.cls || ''}">${s.value}</div>
      ${s.sub ? `<div class="stat-sub">${s.sub}</div>` : ''}
    </div>`
  ).join('');

  await loadRecentActivity();
}

async function loadRecentActivity() {
  const supabase = getSupabase();
  const { data: logs } = await supabase
    .from('admin_logs')
    .select('action,target_user_id,created_at,details')
    .order('created_at', { ascending: false })
    .limit(10);

  const activity = document.getElementById('recentActivity');
  if (!logs || logs.length === 0) {
    activity.innerHTML = '<p class="admin-empty">Aucune activité récente.</p>';
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

  activity.innerHTML = `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>Date</th><th>Action</th><th>Utilisateur</th><th>Description</th></tr></thead>
    <tbody>${logs.map(l => `<tr>
      <td>${formatDate(l.created_at)}</td>
      <td>${actions[l.action] || l.action}</td>
      <td>${l.details?.target_name || l.target_user_id?.slice(0,8) || '-'}</td>
      <td style="color:var(--muted);font-size:12px;">${l.details?.summary || '-'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function formatDH(centimes) {
  return (centimes / 100).toLocaleString('fr-FR') + ' DH';
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export { formatDH, formatDate };
