/**
 * Exécute les migrations SQL via l'API Supabase Management
 * Utilise SUPABASE_ACCESS_TOKEN depuis .env.local
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'ufvwzpacgmfxfydacnwo';

if (!ACCESS_TOKEN) { console.error('❌ SUPABASE_ACCESS_TOKEN manquant dans .env.local'); process.exit(1); }

async function runSQL(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0,200)}`);
  }
  return res.json();
}

async function main() {
  const migrations = [
    '000_functions.sql',
    '001_profiles.sql',
    '002_plans.sql',
    '003_subscriptions.sql',
    '004_payments.sql',
    '005_admin_logs.sql',
    '006_platform_settings.sql',
    '007_payment_methods.sql',
    'rls_policies.sql',
    '001_plans.sql',
  ];

  const dirMap = {
    'rls_policies.sql': 'policies',
    '001_plans.sql': 'seed',
  };

  for (const file of migrations) {
    console.log(`📄 ${file}...`);
    const dir = dirMap[file] || 'migrations';
    const sql = fs.readFileSync(path.join(__dirname, '..', dir, file), 'utf-8');
    try {
      await runSQL(sql);
      console.log(`   ✅`);
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`   ⚠️ Déjà exécuté, ignoré.`);
      } else {
        console.error(`   ❌ ${err.message}`);
      }
    }
  }

  console.log('\n✅ Migrations terminées.');
}

main().catch(err => { console.error(err); process.exit(1); });
