-- ============================================================================
-- ROLLBACK de la migration 009_demo_access.sql
-- Projet : INVOOFFICE (ufvwzpacgmfxfydacnwo)
-- But    : annuler intégralement l'accès démo 24h et revenir à l'état antérieur
--          (colonne is_demo absente, pas de plan Démo, ancienne policy RLS).
-- Aucun secret. À exécuter dans le SQL Editor Supabase, en une seule fois.
-- ATTENTION : ce script supprime les abonnements de démo (is_demo = TRUE).
--             Les profils éventuellement passés en `inactive` par une démo
--             expirée ne sont PAS restaurés automatiquement (voir bloc optionnel).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Supprimer les abonnements de démonstration (FK vers le plan Démo)
-- ----------------------------------------------------------------------------
DELETE FROM public.subscriptions WHERE is_demo = TRUE;

-- ----------------------------------------------------------------------------
-- 2. Supprimer les fonctions SECURITY DEFINER (elles référencent is_demo)
--    → à faire AVANT de supprimer la colonne (pas de DROP COLUMN ... CASCADE).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.start_user_demo(uuid);
DROP FUNCTION IF EXISTS public.end_user_demo(uuid);
DROP FUNCTION IF EXISTS public.reauthorize_user_demo(uuid);
DROP FUNCTION IF EXISTS public.expire_expired_demos();

-- ----------------------------------------------------------------------------
-- 3. Restaurer la policy RLS d'origine (avant migration 009)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- La policy admin "Admins can manage all subscriptions" (is_admin()) n'a pas
-- été modifiée par la migration et reste en place : aucune action requise.

-- ----------------------------------------------------------------------------
-- 4. Supprimer le plan Démo 24h (après les abonnements)
-- ----------------------------------------------------------------------------
DELETE FROM public.plans WHERE name = 'Démo 24h';

-- ----------------------------------------------------------------------------
-- 5. Supprimer la colonne is_demo
-- ----------------------------------------------------------------------------
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS is_demo;

-- ----------------------------------------------------------------------------
-- 6. pg_cron — uniquement si le job avait été créé (il ne l'était pas lors de
--    l'application : extension pg_cron absente du projet).
-- ----------------------------------------------------------------------------
-- SELECT cron.unschedule('expire-demos');

-- ----------------------------------------------------------------------------
-- 7. OPTIONNEL — réactiver les profils qui n'ont plus aucun abonnement actif
--    après suppression des démos. À n'exécuter que si un compte de test avait
--    été laissé en `inactive` par une démo. Non exécuté par défaut.
-- ----------------------------------------------------------------------------
-- UPDATE public.profiles p
-- SET status = 'active'
-- WHERE p.status = 'inactive'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.subscriptions s
--     WHERE s.user_id = p.id AND s.status = 'active'
--   );
