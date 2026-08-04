/**
 * Script de création du compte administrateur
 *
 * Utilisation : node supabase/scripts/create-admin.js
 *
 * IMPORTANT : Ce script utilise la SERVICE_ROLE_KEY pour contourner RLS.
 * Ne jamais utiliser cette clé dans du code frontend !
 * Ce script est exécuté localement, pas dans le navigateur.
 *
 * Prérequis :
 *   npm install @supabase/supabase-js (ou utiliser le CDN)
 *   Définir ADMIN_EMAIL et ADMIN_PASSWORD dans le .env.local
 */

// En environnement Node.js, utiliser dotenv pour charger .env.local
// require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL
  || 'https://ufvwzpacgmfxfydacnwo.supabase.co';

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || '[DÉFINIR DANS .env.local]';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@invooffice.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '[DÉFINIR DANS .env.local]';

async function createAdmin() {
  if (SUPABASE_SERVICE_ROLE_KEY === '[DÉFINIR DANS .env.local]') {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY non définie. Vérifiez .env.local');
    process.exit(1);
  }

  // Import dynamique pour compatibilité Node.js
  const { createClient } = await import('@supabase/supabase-js');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('Création du compte admin...');

  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Administrateur' }
  });

  if (error) {
    console.error('❌ Erreur création admin:', error.message);
    process.exit(1);
  }

  const userId = data.user.id;
  console.log(`✅ Compte créé : ${ADMIN_EMAIL} (ID: ${userId})`);

  // Mettre à jour le profil : role = admin, status = active
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'admin', status: 'active' })
    .eq('id', userId);

  if (profileError) {
    console.error('❌ Erreur mise à jour profil:', profileError.message);
  } else {
    console.log('✅ Profil admin configuré (role=admin, status=active)');
    console.log('   Email    :', ADMIN_EMAIL);
    console.log('   Password : [défini dans .env.local]');
  }
}

createAdmin();
