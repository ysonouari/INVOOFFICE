/**
 * Admin Actions — Dashboard admin
 * Toutes les actions admin avec logging automatique
 */
import { getSupabase } from '../auth/supabase-client.js';
import { showToast } from '../shared/ui.js';

function log(action, targetId, details = {}) {
  const supabase = getSupabase();
  supabase.from('admin_logs').insert({
    action,
    target_user_id: targetId,
    details
  }).then(({ error }) => { if (error) console.warn('Log error:', error); });
}

export async function activateUser(userId, name) {
  const supabase = getSupabase();
  await supabase.from('profiles').update({ status: 'active' }).eq('id', userId);
  log('activate', userId, { target_name: name, summary: `${name} activé` });
  showToast(`${name} activé avec succès`, 'success');
}

export async function deactivateUser(userId, name) {
  const supabase = getSupabase();
  await supabase.from('profiles').update({ status: 'inactive' }).eq('id', userId);
  log('deactivate', userId, { target_name: name, summary: `${name} désactivé` });
  showToast(`${name} suspendu`, 'error');
}

export async function grantAccess(userId, name) {
  const supabase = getSupabase();
  const { data: plans } = await supabase.from('plans').select('id').eq('is_active', true).limit(1);
  if (!plans || plans.length === 0) return;
  const planId = plans[0].id;
  await supabase.from('subscriptions').upsert({
    user_id: userId, plan_id: planId, status: 'active', activated_at: new Date().toISOString()
  }, { onConflict: 'user_id,plan_id' });
  log('grant_access', userId, { target_name: name, summary: `Accès à vie attribué à ${name}`, plan_id: planId });
  showToast(`Accès à vie attribué à ${name}`, 'success');
}

export async function revokeAccess(userId, name) {
  const supabase = getSupabase();
  await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('user_id', userId).eq('status', 'active');
  log('revoke_access', userId, { target_name: name, summary: `Accès retiré à ${name}` });
  showToast(`Accès retiré à ${name}`, 'error');
}

export async function markAsPaid(userId, name) {
  const supabase = getSupabase();
  const { data: plans } = await supabase.from('plans').select('id,price').eq('is_active', true).limit(1);
  if (!plans || plans.length === 0) return;
  await supabase.from('payments').insert({
    user_id: userId, amount: plans[0].price, currency: 'MAD',
    status: 'completed', payment_method: 'manual', paid_at: new Date().toISOString(),
    reference: 'ADMIN-' + Date.now()
  });
  log('mark_paid', userId, { target_name: name, summary: `Paiement validé pour ${name} (${plans[0].price / 100} MAD)` });
  showToast(`Paiement de ${name} validé`, 'success');
}

export async function changeRole(userId, role, name) {
  const supabase = getSupabase();
  await supabase.from('profiles').update({ role }).eq('id', userId);
  log('change_role', userId, { target_name: name, summary: `Rôle changé en "${role}" pour ${name}` });
  showToast(`Rôle de ${name} changé en ${role}`, 'success');
}

export async function deleteUser(userId, name) {
  const supabase = getSupabase();
  log('delete_user', userId, { target_name: name, summary: `Utilisateur supprimé: ${name}` });
  await supabase.from('profiles').delete().eq('id', userId);
}
