/**
 * Configuration Supabase — Sprint 0
 *
 * IMPORTANT : L'anon key est une clé PUBLIQUE par conception Supabase.
 * Elle est destinée à être utilisée côté client (navigateur).
 * La sécurité est assurée par les Row Level Security (RLS), pas par l'obscurcissement de la clé.
 *
 * La SERVICE_ROLE_KEY quant à elle ne doit JAMAIS apparaître dans du code frontend.
 * Elle est réservée aux scripts d'administration (supabase/scripts/) et au serveur.
 */

const SUPABASE_CONFIG = {
  url: 'https://ufvwzpacgmfxfydacnwo.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdnd6cGFjZ21meGZ5ZGFjbndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NzIxMDEsImV4cCI6MjEwMTM0ODEwMX0.SE2VwBGbXF4UnQz15xUcrtcP62W4CgiqOd4wCsH11D8'
};

export default SUPABASE_CONFIG;
