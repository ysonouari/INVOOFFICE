/**
 * B4 — réactivité multi-onglet aux changements de session (supabase-js natif).
 *
 * supabase-js synchronise déjà les onglets via BroadcastChannel + éventements
 * `storage` (clé `sb-<ref>-auth-token`) : un `signOut()` dans un onglet (ou une
 * session devenue invalide) remonte un éventement `SIGNED_OUT` en temps réel dans
 * les autres onglets. Le projet ne s'y abonnait pas → un onglet pouvait rester
 * durablement dans un état authentifié obsolète.
 *
 * Ici : abonnement unique, réaction UNIQUEMENT à `SIGNED_OUT` (événementiel, sans
 * polling). Le snapshot B1 est purgé (cohérence avec le signOut existant) et les
 * pages protégées (/app, /admin) re-dirigent vers le landon. Le serveur reste
 * l'autorité : B4 n'accorde ni ne restaure jamais de session.
 */
import { getSupabase } from './supabase-client.js';
import { clearAuthSnapshot } from './offline-snapshot.js';

export function attachSessionChanges() {
  const supabase = getSupabase();
  if (!supabase.auth || typeof supabase.auth.onAuthStateChange !== 'function') return;
  supabase.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return;
    clearAuthSnapshot();
    const p = window.location.pathname;
    if (p === '/app' || p.startsWith('/admin')) window.location.href = '/';
  });
}