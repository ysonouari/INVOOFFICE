/**
 * Création du compte administrateur INVOOFFICE
 * 
 * Utilisation : node supabase/scripts/create-full-admin.js
 * 
 * Lit les credentials depuis .env.local
 * ⚠️ Utilise la SERVICE_ROLE_KEY — exécution locale uniquement
 */
const fs = require('fs');
const path = require('path');

// Lire .env.local
const envPath = path.join(__dirname, '..', '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ .env.local incomplet. Vérifier SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const ADMIN_EMAIL = 'admin@invooffice.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (() => { console.error('❌ ADMIN_PASSWORD non défini dans .env.local'); process.exit(1); })();
const ADMIN_NAME = 'Administrateur';

async function createFullAdmin() {
  const { createClient } = await import('@supabase/supabase-js');

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Étape 1 : Utilisateur Auth (créer ou récupérer)
  let userId;
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const found = users?.find(u => u.email === ADMIN_EMAIL);

  if (found) {
    userId = found.id;
    console.log('ℹ️  Utilisateur existant, mise à jour...');
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_NAME, whatsapp: '' }
    });
    if (error) { console.error('❌ Erreur Auth :', error.message); process.exit(1); }
    userId = data.user.id;
    console.log('✅ Utilisateur créé');
  }

  // Étape 2 : Profil
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({
      id: userId, full_name: ADMIN_NAME, email: ADMIN_EMAIL,
      whatsapp: '', role: 'admin', status: 'active'
    }, { onConflict: 'id' });
  if (profileErr) { console.error('❌ Erreur profil :', profileErr.message); process.exit(1); }

  // Étape 3 : Abonnement Lifetime
  const { data: plans } = await supabase.from('plans').select('id').eq('is_active', true).eq('is_lifetime', true).limit(1);
  if (plans?.length > 0) {
    await supabase.from('subscriptions').upsert({
      user_id: userId, plan_id: plans[0].id, status: 'active', activated_at: new Date().toISOString()
    }, { onConflict: 'user_id,plan_id' });
  }

  // Étape 4 : Paiement
  const { data: existingPayments } = await supabase.from('payments').select('id').eq('user_id', userId).eq('reference', 'ADMIN-SEED').limit(1);
  if (!existingPayments?.length) {
    await supabase.from('payments').insert({
      user_id: userId, amount: 0, currency: 'MAD', status: 'completed',
      payment_method: 'manual', paid_at: new Date().toISOString(),
      reference: 'ADMIN-SEED', notes: 'Compte administrateur initial'
    });
  }

  console.log('');
  console.log('==========================================');
  console.log('✅ COMPTE ADMINISTRATEUR CRÉÉ');
  console.log('==========================================');
  console.log('');
  console.log('Email        : ' + ADMIN_EMAIL);
  console.log('Mot de passe : ' + ADMIN_PASSWORD);
  console.log('');
  console.log('Connexion : http://localhost:3000/admin');
  console.log('');
  console.log('==========================================');
}

createFullAdmin().catch(err => { console.error('Erreur :', err); process.exit(1); });
