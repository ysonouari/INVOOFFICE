/**
 * Users Table — Dashboard admin
 * Tableau utilisateurs avec recherche, filtres, tri, pagination
 */
import { getSupabase } from '../auth/supabase-client.js';
import { formatDate, formatDH } from './stats.js';
import { openUserDetail } from './user-detail.js';
import { activateUser, deactivateUser, grantAccess, revokeAccess, markAsPaid, changeRole, deleteUser, startDemo, endDemo, reauthorizeDemo, resetUserPassword } from './user-actions.js';
import { esc } from './shared.js';
import { confirmAction } from '../shared/ui.js';
import { ICONS } from '../../js/icons.js';
import { openWhatsAppMenu, hasWhatsapp } from './whatsapp.js';

let allUsers = [];
let currentFilter = 'all';
let currentPage = 1;
const PER_PAGE = 20;

export async function loadUsersTable() {
  const supabase = getSupabase();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name,email,whatsapp,role,status,created_at')
    .order('created_at', { ascending: false });
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('user_id,plan_id,status,activated_at,is_demo,expires_at');
  const { data: payments } = await supabase.from('payments').select('user_id,amount,status');

  allUsers = (profiles || []).map(p => ({
    ...p,
    subs: (subscriptions || []).filter(s => s.user_id === p.id),
    pays: (payments || []).filter(pa => pa.user_id === p.id)
  }));

  renderFilters();
  renderTable();
}

function hasLifetime(u) {
  return u.subs.some(s => s.is_demo !== true && s.status === 'active');
}

function demoSub(u) {
  return u.subs.find(s => s.is_demo === true);
}

function isDemoRunning(u) {
  const demo = demoSub(u);
  return !!demo && demo.status === 'active' && !!demo.expires_at && new Date(demo.expires_at) > new Date();
}

function renderFilters() {
  const counts = {
    all: allUsers.length,
    active: allUsers.filter(u => u.status === 'active').length,
    pending: allUsers.filter(u => u.status === 'pending').length,
    inactive: allUsers.filter(u => u.status === 'inactive').length,
    admin: allUsers.filter(u => u.role === 'admin').length,
    lifetime: allUsers.filter(hasLifetime).length,
    demo: allUsers.filter(isDemoRunning).length
  };

  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'active', label: 'Actifs' },
    { key: 'pending', label: 'En attente' },
    { key: 'inactive', label: 'Suspendus' },
    { key: 'admin', label: 'Admins' },
    { key: 'lifetime', label: 'Accès vie' },
    { key: 'demo', label: 'Démo' }
  ];

  const container = document.getElementById('userFilters');
  container.innerHTML = filters.map(f =>
    `<button class="admin-filter-pill${currentFilter === f.key ? ' active' : ''}" data-filter="${f.key}">
      ${f.label} (${counts[f.key]})
    </button>`
  ).join('');

  container.querySelectorAll('.admin-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      currentPage = 1;
      renderFilters();
      renderTable();
    });
  });
}

function getFilteredUsers() {
  let users = allUsers;
  const search = document.getElementById('userSearch')?.value?.toLowerCase() || '';

  if (search) {
    users = users.filter(u =>
      (u.full_name || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search) ||
      (u.whatsapp || '').toLowerCase().includes(search)
    );
  }

  switch (currentFilter) {
    case 'active': users = users.filter(u => u.status === 'active'); break;
    case 'pending': users = users.filter(u => u.status === 'pending'); break;
    case 'inactive': users = users.filter(u => u.status === 'inactive'); break;
    case 'admin': users = users.filter(u => u.role === 'admin'); break;
    case 'lifetime': users = users.filter(hasLifetime); break;
    case 'demo': users = users.filter(isDemoRunning); break;
  }

  return users;
}

function renderTable() {
  const filtered = getFilteredUsers();
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const page = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const container = document.getElementById('usersTable');
  if (page.length === 0) {
    container.innerHTML = '<p class="admin-empty">Aucun utilisateur trouvé.</p>';
    return;
  }

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Email</th><th>WhatsApp</th>
          <th>Statut</th><th>Plan</th><th>Paiement</th><th>Rôle</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${page.map(u => `
            <tr>
              <td style="color:var(--muted);">${esc(u.email || '-')}</td>
              <td>${esc(u.whatsapp || '-')}</td>
              <td>${statusBadge(u.status)}</td>
              <td>${subBadge(u.subs)}</td>
              <td>${paymentBadge(u.pays)}</td>
              <td>${roleBadge(u.role)}</td>
              <td>${renderActions(u)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${renderPagination(totalPages)}
  `;

  // Bind actions
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      const action = btn.dataset.action;
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;

      switch (action) {
        case 'detail': openUserDetail(user); break;
        case 'whatsapp': openWhatsAppMenu(btn, user); break;
        case 'resetpwd': confirmAction('Nouveau mot de passe', `Générer un nouveau mot de passe pour ${user.email || user.full_name} ? L'ancien ne fonctionnera plus.`, async () => {
          await resetUserPassword(userId, user.full_name, user.email);
        }, 'Génération…'); break;
        case 'activate': await doAction(() => activateUser(userId, user.full_name)); break;
        case 'deactivate': await doAction(() => deactivateUser(userId, user.full_name)); break;
        case 'grant': await doAction(() => grantAccess(userId, user.full_name)); break;
        case 'revoke': await doAction(() => revokeAccess(userId, user.full_name)); break;
        case 'markpaid': await doAction(() => markAsPaid(userId, user.full_name)); break;
        case 'makeadmin': await doAction(() => changeRole(userId, 'admin', user.full_name)); break;
        case 'makeuser': await doAction(() => changeRole(userId, 'user', user.full_name)); break;
        case 'startdemo': confirmAction('Démo 24h', `Lancer un accès d'essai de 24 heures pour ${user.full_name} ?`, async () => {
          await startDemo(userId, user.full_name);
          await loadUsersTable();
        }); break;
        case 'enddemo': confirmAction('Terminer la démo', `Terminer la démo en cours de ${user.full_name} ? L'accès repassera en inactif.`, async () => {
          await endDemo(userId, user.full_name);
          await loadUsersTable();
        }); break;
        case 'redemo': confirmAction('Réautoriser la démo', `Réautoriser un nouvel accès d'essai de 24 heures pour ${user.full_name} ?`, async () => {
          await reauthorizeDemo(userId, user.full_name);
          await loadUsersTable();
        }); break;
        case 'delete': confirmAction('Supprimer', `Supprimer définitivement ${user.full_name} ? Cette action est irréversible.`, async () => {
          await deleteUser(userId, user.full_name);
          await loadUsersTable();
        }); break;
      }
    });
  });

  document.querySelectorAll('.admin-pagination button').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p > 0 && p <= totalPages) { currentPage = p; renderTable(); }
    });
  });
}

async function doAction(fn) {
  await fn();
  await loadUsersTable();
}

function renderActions(u) {
  const btns = [];
  const lifetime = hasLifetime(u);
  const demo = demoSub(u);
  const demoRunning = isDemoRunning(u);
  const btn = (action, icon, color, label) =>
    `<button class="btn btn-ghost" data-action="${action}" data-user-id="${u.id}" style="color:${color};" aria-label="${label}" title="${label}">${icon}</button>`;

  btns.push(btn('detail', ICONS.eye, 'var(--muted)', 'Voir la fiche utilisateur'));
  {
    const waOk = hasWhatsapp(u);
    btns.push(`<button class="btn btn-ghost" data-action="whatsapp" data-user-id="${u.id}" aria-haspopup="menu" ${waOk ? '' : 'disabled'} style="color:var(--success);" aria-label="${waOk ? 'Envoyer un message WhatsApp' : 'Aucun numéro WhatsApp'}" title="${waOk ? 'Envoyer un message WhatsApp' : 'Aucun numéro WhatsApp'}">${ICONS.whatsapp}</button>`);
  }
  if (u.role !== 'admin') btns.push(btn('resetpwd', ICONS.key, 'var(--muted)', 'Générer un nouveau mot de passe'));
  if (u.status !== 'active') btns.push(btn('activate', ICONS.check, 'var(--success)', 'Activer l\'utilisateur'));
  if (u.status === 'active') btns.push(btn('deactivate', ICONS.ban, 'var(--danger)', 'Suspendre l\'utilisateur'));
  if (!lifetime && !demo) btns.push(btn('startdemo', ICONS.history, 'var(--warning)', 'Démo 24h'));
  if (!lifetime && demoRunning) btns.push(btn('enddemo', ICONS.square, 'var(--danger)', 'Terminer la démo'));
  if (!lifetime && demo && !demoRunning) btns.push(btn('redemo', ICONS['rotate-cw'], 'var(--warning)', 'Réautoriser la démo'));
  if (!lifetime) btns.push(btn('grant', ICONS.infinity, 'var(--accent-2)', 'Accorder l\'accès à vie'));
  if (lifetime) btns.push(btn('revoke', ICONS['user-minus'], 'var(--danger)', 'Retirer l\'accès'));
  if (!u.pays.some(p => p.status === 'completed')) btns.push(btn('markpaid', ICONS.banknote, 'var(--success)', 'Marquer payé'));
  if (u.role === 'user') btns.push(btn('makeadmin', ICONS.shield, 'var(--accent)', 'Promouvoir administrateur'));
  if (u.role === 'admin') btns.push(btn('makeuser', ICONS.user, 'var(--muted-2)', 'Retirer les droits administrateur'));
  btns.push(btn('delete', ICONS['trash-2'], 'var(--danger)', 'Supprimer l\'utilisateur'));
  return `<div class="admin-actions">${btns.join('')}</div>`;
}

function renderPagination(totalPages) {
  if (totalPages <= 1) return '';
  let html = '<div class="admin-pagination">';
  html += `<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>«</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  html += `<button data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>»</button>`;
  html += '</div>';
  return html;
}

function statusBadge(s) {
  const map = { active: 'admin-badge-active', pending: 'admin-badge-pending', inactive: 'admin-badge-inactive', rejected: 'admin-badge-inactive' };
  return `<span class="admin-badge ${map[s] || ''}">${s}</span>`;
}

function subBadge(subs) {
  const active = subs.filter(s => s.is_demo !== true && s.status === 'active');
  if (active.length > 0) return '<span class="admin-badge admin-badge-lifetime admin-badge-nowrap">À vie</span>';
  const demo = subs.find(s => s.is_demo === true);
  if (demo) {
    if (demo.status === 'active' && demo.expires_at && new Date(demo.expires_at) > new Date()) {
      return `<span class="admin-badge admin-badge-demo admin-badge-nowrap">Démo 24h · ${formatDate(demo.expires_at)}</span>`;
    }
    if (demo.status === 'active') {
      return '<span class="admin-badge admin-badge-demo-expired admin-badge-nowrap">Démo expirée</span>';
    }
    return '<span class="admin-badge admin-badge-demo-expired admin-badge-nowrap">Démo terminée</span>';
  }
  return '<span style="color:var(--muted);font-size:12px;">Aucun</span>';
}

function paymentBadge(pays) {
  const done = pays.filter(p => p.status === 'completed');
  return done.length > 0 ? `<span class="admin-badge admin-badge-paid">${formatDH(done[0].amount)}</span>` : '<span class="admin-badge admin-badge-waiting">En attente</span>';
}

function roleBadge(r) {
  return r === 'admin' ? '<span class="admin-badge admin-badge-admin">Admin</span>' : '<span class="admin-badge" style="background:color-mix(in srgb, var(--panel) 95%, var(--muted-2) 5%);color:var(--muted-2);border:1px solid color-mix(in srgb, var(--panel) 85%, var(--muted-2) 15%);">User</span>';
}
