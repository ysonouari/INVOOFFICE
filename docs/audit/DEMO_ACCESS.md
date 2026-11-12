# Accès « Démo 24h » — Rapport

Date : 2026-11-11 — Fonctionnalité admin : accès d'essai de 24 h sans accès à vie.

## Objectif

Permettre à un administrateur d'accorder à un utilisateur un accès d'essai de 24 h,
sans lui attribuer l'accès à vie (300 DH), avec blocage automatique et fiable à
l'expiration, anti-abus, filtres, journal et compteurs dashboard.

## Modèle de données (validé)

La démo réutilise la table `subscriptions`, qui est déjà la source d'accès de
`/app` (guard `hasAccess = !!subs`). Aucune colonne `demo_*` sur `profiles`.

| Élément | Changement |
|---|---|
| `subscriptions.is_demo` | nouvelle colonne `BOOLEAN NOT NULL DEFAULT FALSE` |
| `plans` | nouveau plan **« Démo 24h »** (`is_lifetime=FALSE`, `is_active=FALSE`, `price=0`) |
| démo active | ligne `subscriptions` `{plan_id=demo, status='active', is_demo=TRUE, expires_at=now()+24h}` |
| `profiles.status` | passe à `active` pendant la démo, `inactive` à la fin |

## Sécurité (protection serveur, pas seulement client)

1. **RLS autoritaire** — la politique `"Users can view own subscriptions"` est
   remplacée par :
   `USING (user_id = auth.uid() AND status='active' AND (expires_at IS NULL OR expires_at > now()))`.
   Une démo expirée devient **invisible pour l'utilisateur** (PostgREST filtre la
   ligne côté Postgres) → `hasAccess=false` → blocage, contournable par rien côté
   client. Accès à vie (`expires_at NULL`) et admins (`is_admin()`) inchangés.
2. **Fonctions `SECURITY DEFINER`** (`search_path = public`, `is_admin()` en
   première ligne) : `start_user_demo`, `end_user_demo`, `reauthorize_user_demo`.
   Elles calculent `expires_at = now() + interval '24 hours'` **côté serveur**
   (jamais l'horloge navigateur).
3. **Bascule de statut à expiration** : `expire_expired_demos()` (démo expirée →
   `subscriptions.status='expired'` + `profiles.status='inactive'`), à planifier
   via `pg_cron` (bloc optionnel commenté dans la migration). Sans cron, le
   blocage reste garanti par (1) ; seul `profiles.status` ne bascule pas
   automatiquement (affiché « Démo expirée » côté admin via `expires_at`).

### Limite assumée

App 100 % client-side, aucun appel serveur pendant l'usage (PDF généré localement) :
le contrôle d'expiration s'applique **au boot / à la reconnexion** (guard +
`signin`). Un onglet laissé ouvert au-delà des 24 h reste fonctionnel jusqu'au
rechargement (déjà le cas pour un compte désactivé — cf. note B4). Aucun polling
ajouté (validé).

## Anti-abus

`UNIQUE(user_id, plan_id)` ⇒ au plus une ligne démo par utilisateur.

- Bouton **« Démo 24h »** visible seulement si : ni accès à vie actif, ni ligne
  démo antérieure.
- Démo en cours → **« Terminer démo »** (retour à `inactive`).
- Démo terminée/expirée → **« Rédémo »** (réautorisation explicite, confirmée).
- `revokeAccess` ciblé `is_demo=false` (ne supprime plus une démo en cours).

## Journal (`admin_logs`)

- `start_demo` / `end_demo` / `reauthorize_demo` (acteur admin).
- L'expiration automatique n'est **pas** journalisée (aucun acteur admin ;
  `admin_logs.admin_id` est NOT NULL). Elle est observable via le badge
  « Démo expirée » et le `status='expired'`.

## i18n

Admin FR uniquement (pas d'i18next) — validé. Aucun changement RTL admin.

## Fichiers modifiés

- `supabase/migrations/009_demo_access.sql` (nouveau)
- `modules/admin/user-actions.js`
- `modules/admin/users-table.js`
- `modules/admin/stats.js`
- `modules/admin/logs.js`
- `admin/index.html`
- `css/admin.css`
- `sw.js` (bump `facturation-v8` → `facturation-v9`, car `css/admin.css` est précaché)
- `tests/seo/blog-design-system.spec.ts`, `tests/business/history-lazy.spec.ts`,
  `tests/business/company-modal-lazy.spec.ts` (références de cache v8 → v9)
- `js/i18n.js` (commentaire v8 → v9)
- `supabase/types/database.js` (doc `is_demo`)
- `AGENTS.md`

## SQL à exécuter (ordre)

1. `supabase/migrations/009_demo_access.sql` (complet, idempotent).
2. Optionnel (si `pg_cron` activé) : le bloc commenté en fin de migration.

### Rollback

```sql
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.start_user_demo(uuid);
DROP FUNCTION IF EXISTS public.end_user_demo(uuid);
DROP FUNCTION IF EXISTS public.reauthorize_user_demo(uuid);
DROP FUNCTION IF EXISTS public.expire_expired_demos();

DELETE FROM public.plans WHERE name = 'Démo 24h';
-- (les abonnements démo existants devront être traités : UPDATE subscriptions SET is_demo=false, status='cancelled' si nécessaire)
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS is_demo;
```

## Test manuel

1. Créer un compte test (signup) → statut `pending`/`inactive`.
2. Admin → Utilisateurs : bouton **« Démo 24h »** (icône horloge) visible → cliquer
   → dialog de confirmation → OK.
3. Vérifier : badge **« Démo 24h · date »**, filtre **« Démo (n) »**, carte
   **« Démos en cours »**.
4. Se connecter avec le compte test → accès `/app` OK.
5. Forcer l'expiration en SQL :
   `UPDATE subscriptions SET expires_at = now() - interval '1 minute' WHERE is_demo = true AND status = 'active';`
6. Recharger/redéconnecter le compte test → blocage (redirect `/` ou message).
7. Admin : badge **« Démo expirée »** même si `profiles.status` encore `active`.
8. Bouton **« Rédémo »** → confirme la réautorisation (ou « Terminer démo » si la
   démo n'était pas encore expirée).
