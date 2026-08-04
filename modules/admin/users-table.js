/**
 * Users Table — Dashboard admin
 * Tableau utilisateurs avec recherche, filtres, tri, pagination
 */
import { getSupabase } from '../auth/supabase-client.js';
import { formatDate } from './stats.js';
import { openUserDetail } from './user-detail.js';
import { activateUser, deactivateUser, grantAccess, revokeAccess, markAsPaid, changeRole, deleteUser } from './user-actions.js';

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
    .select('user_id,plan_id,status,activated_at');
  const { data: payments } = await supabase.from('payments').select('user_id,amount,status');

  allUsers = (profiles || []).map(p => ({
    ...p,
    subs: (subscriptions || []).filter(s => s.user_id === p.id),
    pays: (payments || []).filter(pa => pa.user_id === p.id)
  }));

  renderFilters();
  renderTable();
}

function renderFilters() {
  const counts = {
    all: allUsers.length,
    active: allUsers.filter(u => u.status === 'active').length,
    pending: allUsers.filter(u => u.status === 'pending').length,
    inactive: allUsers.filter(u => u.status === 'inactive').length,
    admin: allUsers.filter(u => u.role === 'admin').length,
    lifetime: allUsers.filter(u => u.subs.some(s => s.status === 'active')).length
  };

  const filters = [
    { key: 'all', label: 'Tous' },
    { key: 'active', label: 'Actifs' },
    { key: 'pending', label: 'En attente' },
    { key: 'inactive', label: 'Suspendus' },
    { key: 'admin', label: 'Admins' },
    { key: 'lifetime', label: 'Accès vie' }
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
    case 'lifetime': users = users.filter(u => u.subs.some(s => s.status === 'active')); break;
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
          <th>Nom</th><th>Email</th><th>WhatsApp</th><th>Inscription</th>
          <th>Statut</th><th>Plan</th><th>Paiement</th><th>Rôle</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${page.map(u => `
            <tr>
              <td><strong>${esc(u.full_name || '-')}</strong></td>
              <td style="color:var(--muted);">${esc(u.email || '-')}</td>
              <td>${esc(u.whatsapp || '-')}</td>
              <td style="font-size:12px;color:var(--muted);">${formatDate(u.created_at)}</td>
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
        case 'activate': await doAction(() => activateUser(userId, user.full_name)); break;
        case 'deactivate': await doAction(() => deactivateUser(userId, user.full_name)); break;
        case 'grant': await doAction(() => grantAccess(userId, user.full_name)); break;
        case 'revoke': await doAction(() => revokeAccess(userId, user.full_name)); break;
        case 'markpaid': await doAction(() => markAsPaid(userId, user.full_name)); break;
        case 'makeadmin': await doAction(() => changeRole(userId, 'admin', user.full_name)); break;
        case 'makeuser': await doAction(() => changeRole(userId, 'user', user.full_name)); break;
        case 'delete': confirmAction('Supprimer', `Supprimer définitivement ${user.full_name} ? Cette action est irréversible.`, async () => {
          await deleteUser(userId, user.full_name);
          await refreshUsers();
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
  await refreshUsers();
}

async function refreshUsers() {
  const supabase = getSupabase();
  const { data: profiles } = await supabase.from('profiles').select('id,full_name,email,whatsapp,role,status,created_at').order('created_at', { ascending: false });
  const { data: subscriptions } = await supabase.from('subscriptions').select('user_id,plan_id,status,activated_at');
  const { data: payments } = await supabase.from('payments').select('user_id,amount,status');
  allUsers = (profiles || []).map(p => ({
    ...p, subs: (subscriptions || []).filter(s => s.user_id === p.id),
    pays: (payments || []).filter(pa => pa.user_id === p.id)
  }));
  renderFilters();
  renderTable();
}

function renderActions(u) {
  const btns = [];
  btns.push(`<button class="btn btn-ghost" data-action="detail" data-user-id="${u.id}" style="font-size:11px;">👁</button>`);
  if (u.status !== 'active') btns.push(`<button class="btn btn-ghost" data-action="activate" data-user-id="${u.id}" style="font-size:11px;color:var(--success);">Activer</button>`);
  if (u.status === 'active') btns.push(`<button class="btn btn-ghost" data-action="deactivate" data-user-id="${u.id}" style="font-size:11px;color:var(--danger);">Suspendre</button>`);
  if (!u.subs.some(s => s.status === 'active')) btns.push(`<button class="btn btn-ghost" data-action="grant" data-user-id="${u.id}" style="font-size:11px;color:var(--accent-2);">Vie</button>`);
  if (u.subs.some(s => s.status === 'active')) btns.push(`<button class="btn btn-ghost" data-action="revoke" data-user-id="${u.id}" style="font-size:11px;color:var(--danger);">Retirer</button>`);
  if (!u.pays.some(p => p.status === 'completed')) btns.push(`<button class="btn btn-ghost" data-action="markpaid" data-user-id="${u.id}" style="font-size:11px;color:var(--success);">💰</button>`);
  if (u.role === 'user') btns.push(`<button class="btn btn-ghost" data-action="makeadmin" data-user-id="${u.id}" style="font-size:11px;color:var(--accent);">Admin</button>`);
  if (u.role === 'admin') btns.push(`<button class="btn btn-ghost" data-action="makeuser" data-user-id="${u.id}" style="font-size:11px;">User</button>`);
  btns.push(`<button class="btn btn-ghost" data-action="delete" data-user-id="${u.id}" style="font-size:11px;color:var(--danger);">🗑</button>`);
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
  const active = subs.filter(s => s.status === 'active');
  return active.length > 0 ? '<span class="admin-badge admin-badge-lifetime">À vie</span>' : '<span style="color:var(--muted);font-size:12px;">Aucun</span>';
}

function paymentBadge(pays) {
  const done = pays.filter(p => p.status === 'completed');
  return done.length > 0 ? `<span class="admin-badge admin-badge-paid">${formatAmount(done[0].amount)}</span>` : '<span style="color:var(--muted);font-size:12px;">En attente</span>';
}

function roleBadge(r) {
  return r === 'admin' ? '<span class="admin-badge admin-badge-admin">Admin</span>' : '<span style="font-size:12px;">User</span>';
}

function formatAmount(centimes) {
  return (centimes / 100) + ' DH';
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function confirmAction(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOverlay').style.display = 'flex';
  const ok = document.getElementById('confirmOk');
  const cancel = document.getElementById('confirmCancel');
  const close = () => { document.getElementById('confirmOverlay').style.display = 'none'; };
  cancel.onclick = close;
  ok.onclick = async () => { close(); await onConfirm(); };
  document.getElementById('confirmOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
}
