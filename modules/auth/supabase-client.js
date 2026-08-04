/**
 * Client Supabase — initialisation
 * IMPORTANT : Utilise UNIQUEMENT la clé anon (publique).
 * La SERVICE_ROLE_KEY ne doit JAMAIS être utilisée côté client.
 */
import SUPABASE_CONFIG from '../../supabase/config/supabase-config.js';

let supabaseClient = null;

export function initSupabase() {
  if (supabaseClient) return supabaseClient;
  supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  return supabaseClient;
}

export function getSupabase() {
  if (!supabaseClient) throw new Error('Supabase non initialisé. Appeler initSupabase() d\'abord.');
  return supabaseClient;
}
