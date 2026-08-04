/**
 * Guards — protection des routes et des vues
 */
import { getCurrentUser, signOut } from './session.js';
import { getSupabase } from './supabase-client.js';

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/';
    return null;
  }

  const supabase = getSupabase();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, status, full_name')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    await signOut();
    window.location.href = '/';
    return null;
  }

  if (profile.role === 'admin') {
    window.location.href = '/admin';
    return null;
  }

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  const hasAccess = !!subs;

  return { user, profile, hasAccess };
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/';
    return null;
  }

  const supabase = getSupabase();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    window.location.href = '/';
    return null;
  }

  return { user, profile };
}

export function getStatusMessage(profile, hasAccess) {
  if (profile.status === 'pending') {
    return 'Votre inscription est en attente de validation. Notre équipe vous contactera rapidement.';
  }
  if (profile.status === 'inactive') {
    return 'Votre compte est désactivé. Merci de contacter le support.';
  }
  if (profile.status === 'rejected') {
    return 'Votre demande n\'a pas été validée.';
  }
  if (!hasAccess) {
    return 'Votre paiement n\'a pas encore été validé.';
  }
  return null;
}
