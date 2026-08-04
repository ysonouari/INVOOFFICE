/**
 * js/auth.js — Point d'entrée auth pour l'application existante
 * Bridge entre modules/auth/ et l'application de facturation
 */
import { initSupabase } from '../modules/auth/supabase-client.js';
import { requireAuth, getStatusMessage } from '../modules/auth/guard.js';
import { signOut as doSignOut } from '../modules/auth/session.js';

export async function checkAccessAndInit() {
  initSupabase();
  const auth = await requireAuth();
  if (!auth) return null;

  if (auth.profile.role === 'admin') {
    window.location.href = '/admin';
    return null;
  }

  const message = getStatusMessage(auth.profile, auth.hasAccess);
  if (message) {
    return { blocked: true, message, user: auth.user };
  }

  return { blocked: false, user: auth.user, profile: auth.profile };
}

export async function logout() {
  await doSignOut();
  window.location.href = '/';
}
