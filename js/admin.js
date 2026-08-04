/**
 * admin.js — Point d'entrée Dashboard Admin
 * Protégé par requireAdmin()
 */
import { initSupabase } from '../modules/auth/supabase-client.js';
import { requireAdmin, getStatusMessage } from '../modules/auth/guard.js';
import { signOut } from '../modules/auth/session.js';
import { loadStats } from '../modules/admin/stats.js';
import { loadUsersTable } from '../modules/admin/users-table.js';
import { loadPayments } from '../modules/admin/payments.js';
import { loadPaymentMethods } from '../modules/admin/payment-methods.js';
import { loadLogs } from '../modules/admin/logs.js';
import { loadSettings } from '../modules/admin/settings.js';

document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  const auth = await requireAdmin();
  if (!auth) return;

  document.getElementById('loadingOverlay').style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  document.getElementById('adminName').textContent = auth.profile.full_name || auth.user.email;
  document.getElementById('adminLogout').addEventListener('click', async () => { await signOut(); window.location.href = '/'; });

  // Vue switching
  const views = ['dashboard', 'users', 'payments', 'methods', 'logs', 'settings'];
  views.forEach(name => {
    document.getElementById('nav' + name.charAt(0).toUpperCase() + name.slice(1))
      .addEventListener('click', () => showView(name));
  });

  document.getElementById('userSearch').addEventListener('input', () => loadUsersTable());
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

  showView('dashboard');
});

function showView(name) {
  document.querySelectorAll('#adminApp .view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('#adminApp .btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById('nav' + name.charAt(0).toUpperCase() + name.slice(1));
  if (navBtn) navBtn.classList.add('active');

  switch (name) {
    case 'dashboard': loadStats(); break;
    case 'users': loadUsersTable(); break;
    case 'payments': loadPayments(); break;
    case 'methods': loadPaymentMethods(); break;
    case 'logs': loadLogs(); break;
    case 'settings': loadSettings(); break;
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; });
}
