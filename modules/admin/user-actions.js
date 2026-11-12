/**
 * Admin Actions — Dashboard admin
 * Toutes les actions admin avec logging automatique
 */
import { getSupabase } from '../auth/supabase-client.js';
import { showToast } from '../shared/ui.js';
import { showNewPasswordDialog } from './password-dialog.js';

function log(action, targetId, details = {}) {
  const supabase = getSupabase();
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) { console.warn('Log skipped: no authenticated user'); return; }
    supabase.from('admin_logs').insert({
      admin_id: user.id,
      action,
      target_user_id: targetId,
      details
    }).then(({ error }) => { if (error) console.warn('Log error:', error); });
  });
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
  await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('user_id', userId).eq('status', 'active').eq('is_demo', false);
  log('revoke_access', userId, { target_name: name, summary: `Accès retiré à ${name}` });
  showToast(`Accès retiré à ${name}`, 'error');
}

export async function startDemo(userId, name) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('start_user_demo', { p_target_user_id: userId });
  if (error) { showToast(error.message || 'Erreur lors du lancement de la démo', 'error'); return; }
  log('start_demo', userId, { target_name: name, summary: `Démo 24h lancée pour ${name}` });
  showToast(`Démo 24h lancée pour ${name}`, 'success');
}

export async function endDemo(userId, name) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('end_user_demo', { p_target_user_id: userId });
  if (error) { showToast(error.message || 'Erreur lors de l\'arrêt de la démo', 'error'); return; }
  log('end_demo', userId, { target_name: name, summary: `Démo terminée pour ${name}` });
  showToast(`Démo terminée pour ${name}`, 'error');
}

export async function reauthorizeDemo(userId, name) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('reauthorize_user_demo', { p_target_user_id: userId });
  if (error) { showToast(error.message || 'Erreur lors de la réautorisation de la démo', 'error'); return; }
  log('reauthorize_demo', userId, { target_name: name, summary: `Démo 24h réautorisée pour ${name}` });
  showToast(`Démo 24h réautorisée pour ${name}`, 'success');
}

export async function resetUserPassword(userId, name, email) {
  const supabase = getSupabase();
  let data = null;
  let error = null;
  try {
    const res = await supabase.functions.invoke('admin-reset-password', { body: { userId } });
    data = res.data;
    error = res.error;
  } catch (e) {
    error = e;
  }

  if (error || !data || !data.password) {
    let msg = 'Erreur lors de la génération du mot de passe. Vérifiez la connexion et réessayez.';
    if (error && typeof error === 'object') {
      const ctx = error.context;
      if (ctx && typeof ctx === 'object') {
        if (typeof ctx.error === 'string' && ctx.error) msg = ctx.error;
        else if (typeof ctx.message === 'string' && ctx.message) msg = ctx.message;
      }
    }
    showToast(msg, 'error');
    return;
  }

  showNewPasswordDialog(data.password, email || name);
}

export async function markAsPaid(userId, name) {
  const supabase = getSupabase();
  const { data: settings } = await supabase.from('platform_settings').select('lifetime_price').eq('id', 1).maybeSingle();
  const amount = settings ? settings.lifetime_price : 30000;
  await supabase.from('payments').insert({
    user_id: userId, amount, currency: 'MAD',
    status: 'completed', payment_method: 'manual', paid_at: new Date().toISOString(),
    reference: 'ADMIN-' + Date.now()
  });
  log('mark_paid', userId, { target_name: name, summary: `Paiement validé pour ${name} (${amount / 100} MAD)` });
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

export async function updatePayment(paymentId, userId, changes, prevValues) {
  const supabase = getSupabase();
  const payload = { updated_at: new Date().toISOString(), ...changes };
  const { error } = await supabase.from('payments').update(payload).eq('id', paymentId);
  if (error) throw error;
  log('update_payment', userId, {
    payment_id: paymentId,
    summary: `Paiement modifié`,
    changes: payload,
    previous: prevValues
  });
}

export async function validatePayment(paymentId, userId, name) {
  const supabase = getSupabase();
  const payload = { status: 'completed', paid_at: new Date().toISOString() };
  const { error } = await supabase.from('payments').update(payload).eq('id', paymentId);
  if (error) throw error;
  log('validate_payment', userId, {
    payment_id: paymentId,
    target_name: name,
    summary: `Paiement validé (${name})`
  });
}

export async function refundPayment(paymentId, userId, name, amount) {
  const supabase = getSupabase();
  const { error } = await supabase.from('payments').update({ status: 'refunded' }).eq('id', paymentId);
  if (error) throw error;
  log('refund_payment', userId, {
    payment_id: paymentId,
    target_name: name,
    summary: `Paiement remboursé (${name}, ${amount / 100} MAD)`
  });
}
