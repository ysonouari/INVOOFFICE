/**
 * Connexion — Supabase Auth
 */
import { getSupabase } from './supabase-client.js';

export async function signIn(email, password) {
  if (!email || !password) {
    return { success: false, error: 'Email et mot de passe requis.' };
  }

  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { success: false, error: 'Email ou mot de passe incorrect.' };
    }
    if (error.message.includes('Email not confirmed')) {
      return { success: false, error: 'Veuillez confirmer votre email avant de vous connecter.' };
    }
    return { success: false, error: error.message };
  }

  // Vérifier le profil
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', data.user.id)
    .single();

  if (profileErr) {
    await supabase.auth.signOut();
    return { success: false, error: 'Profil introuvable. Contactez le support.' };
  }

  // Vérifier l'abonnement actif
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('status, plan_id')
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .maybeSingle();

  const hasActiveAccess = !!subs;

  return {
    success: true,
    user: data.user,
    profile,
    hasActiveAccess
  };
}

export function getAccessMessage(profile, hasActiveAccess) {
  if (profile.status === 'pending') {
    return 'Votre inscription est en attente de validation. Notre équipe vous contactera rapidement.';
  }
  if (profile.status === 'inactive') {
    return 'Votre compte est désactivé. Merci de contacter le support.';
  }
  if (profile.status === 'rejected') {
    return 'Votre demande n\'a pas été validée.';
  }
  if (!hasActiveAccess) {
    return 'Votre paiement n\'a pas encore été validé.';
  }
  return null; // Accès autorisé
}
