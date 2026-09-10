# Supabase — Sprint 0

Ce dossier contient toute la configuration et les scripts liés à Supabase.

## Structure

```
supabase/
├── config/
│   └── supabase-config.js     ← Configuration client Supabase
│
├── migrations/                 ← Migrations SQL (ordre d'exécution)
│   ├── 000_functions.sql       ← Fonctions utilitaires (updated_at)
│   ├── 001_profiles.sql        ← Table profiles + trigger création
│   ├── 002_plans.sql           ← Table plans
│   ├── 003_subscriptions.sql   ← Table subscriptions
│   ├── 004_payments.sql        ← Table payments
│   └── 005_admin_logs.sql      ← Table admin_logs
│
├── seed/                       ← Données initiales
│   ├── 001_plans.sql           ← Plan "Accès à vie — 300 DH"
│   └── 002_admin_user.sql      ← Instructions création admin
│
├── policies/
│   └── rls_policies.sql        ← Politiques Row Level Security
│
├── functions/
│   (fonctions définies dans migrations/000_functions.sql)
│
├── types/
│   └── database.js             ← Types JSDoc de référence
│
└── scripts/
    └── create-admin.js         ← Script Node.js création admin
```

## Ordre d'exécution

1. `migrations/000_functions.sql`  — Fonction `update_updated_at()`
2. `migrations/001_profiles.sql`   — Table profiles + trigger
3. `migrations/002_plans.sql`      — Table plans
4. `migrations/003_subscriptions.sql` — Table subscriptions
5. `migrations/004_payments.sql`   — Table payments
6. `migrations/005_admin_logs.sql` — Table admin_logs
7. `policies/rls_policies.sql`     — Politiques RLS + grants
8. `seed/001_plans.sql`            — Plan par défaut
9. `seed/002_admin_user.sql`       — Création compte admin (via dashboard)

## Sécurité

- `SUPABASE_URL` et `SUPABASE_ANON_KEY` : publiques, utilisées côté client
- `SUPABASE_SERVICE_ROLE_KEY` : **SECRET** — `.env.local` uniquement, jamais dans le navigateur
- `SUPABASE_ACCESS_TOKEN` : **SECRET** — CLI uniquement
- RLS activé sur toutes les tables
- `.env.local` et `.env` ignorés par Git
