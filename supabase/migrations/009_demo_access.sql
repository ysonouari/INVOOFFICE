-- ============================================================================
-- MIGRATION 009 : Accès démo 24h
-- Description  : Permet à un admin d'accorder un accès d'essai de 24h (démo)
--                sans accès à vie. Rétrocompatible avec les comptes « À vie »
--                existants (is_demo = FALSE par défaut, expires_at NULL inchangé).
-- Ordre        : À exécuter APRÈS 001-008 et APRÈS policies/rls_policies.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Marqueur de démo sur subscriptions (rétrocompatible : défaut FALSE)
-- ----------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.subscriptions.is_demo IS 'TRUE = abonnement de démo (essai 24h), FALSE = plan payant (accès à vie)';

-- ----------------------------------------------------------------------------
-- 2. Plan « Démo 24h » (inactif : invisible sur la landing publique,
--    réservé au workflow admin). Idempotent (plans n'a pas d'UNIQUE sur name).
-- ----------------------------------------------------------------------------
INSERT INTO public.plans (name, description, price, currency, is_lifetime, is_active, sort_order)
SELECT 'Démo 24h',
       'Accès d''essai de 24 heures — activé manuellement par un administrateur.',
       0,
       'MAD',
       FALSE,
       FALSE,
       0
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Démo 24h');

-- ----------------------------------------------------------------------------
-- 3. Fonctions SECURITY DEFINER (heure SERVEUR, garde is_admin() en 1re ligne)
-- ----------------------------------------------------------------------------

-- Lancer une démo 24h (une seule fois par utilisateur)
CREATE OR REPLACE FUNCTION public.start_user_demo(p_target_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo_plan uuid;
  v_expires   timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : administrateur requis.';
  END IF;

  SELECT id INTO v_demo_plan FROM public.plans WHERE name = 'Démo 24h' LIMIT 1;
  IF v_demo_plan IS NULL THEN
    RAISE EXCEPTION 'Plan démo introuvable.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions
             WHERE user_id = p_target_user_id AND status = 'active' AND is_demo = FALSE) THEN
    RAISE EXCEPTION 'L''utilisateur dispose déjà d''un accès à vie.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions
             WHERE user_id = p_target_user_id AND is_demo = TRUE) THEN
    RAISE EXCEPTION 'Démo déjà utilisée pour cet utilisateur.';
  END IF;

  v_expires := now() + interval '24 hours';

  INSERT INTO public.subscriptions (user_id, plan_id, status, is_demo, activated_at, expires_at)
  VALUES (p_target_user_id, v_demo_plan, 'active', TRUE, now(), v_expires);

  UPDATE public.profiles SET status = 'active' WHERE id = p_target_user_id;

  RETURN v_expires;
END;
$$;

-- Terminer une démo en cours (retour à inactive, sauf accès à vie parallèle)
CREATE OR REPLACE FUNCTION public.end_user_demo(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : administrateur requis.';
  END IF;

  UPDATE public.subscriptions
  SET status = 'cancelled'
  WHERE user_id = p_target_user_id AND is_demo = TRUE AND status = 'active';

  IF NOT EXISTS (SELECT 1 FROM public.subscriptions
                 WHERE user_id = p_target_user_id AND status = 'active' AND is_demo = FALSE) THEN
    UPDATE public.profiles SET status = 'inactive' WHERE id = p_target_user_id;
  END IF;
END;
$$;

-- Réautoriser explicitement une démo (anti-abus : action admin manuelle)
CREATE OR REPLACE FUNCTION public.reauthorize_user_demo(p_target_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo_plan uuid;
  v_expires   timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : administrateur requis.';
  END IF;

  SELECT id INTO v_demo_plan FROM public.plans WHERE name = 'Démo 24h' LIMIT 1;
  IF v_demo_plan IS NULL THEN
    RAISE EXCEPTION 'Plan démo introuvable.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions
             WHERE user_id = p_target_user_id AND status = 'active' AND is_demo = FALSE) THEN
    RAISE EXCEPTION 'L''utilisateur dispose déjà d''un accès à vie.';
  END IF;

  v_expires := now() + interval '24 hours';

  INSERT INTO public.subscriptions (user_id, plan_id, status, is_demo, activated_at, expires_at)
  VALUES (p_target_user_id, v_demo_plan, 'active', TRUE, now(), v_expires)
  ON CONFLICT (user_id, plan_id)
  DO UPDATE SET status = 'active', is_demo = TRUE, activated_at = now(), expires_at = EXCLUDED.expires_at;

  UPDATE public.profiles SET status = 'active' WHERE id = p_target_user_id;

  RETURN v_expires;
END;
$$;

-- Maintenance : bascule les démos expirées (appelée par pg_cron si activé).
-- Sans is_admin() : fonction pure, idempotente, sans élévation de privilège
-- (n'agit que sur les démos déjà expirées). Ne désactive jamais un titulaire
-- d'un accès à vie actif parallèle.
CREATE OR REPLACE FUNCTION public.expire_expired_demos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE is_demo = TRUE AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.profiles p
  SET status = 'inactive'
  WHERE p.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = p.id AND s.is_demo = TRUE AND s.status = 'expired'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s2
      WHERE s2.user_id = p.id AND s2.status = 'active' AND s2.is_demo = FALSE
    );

  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS — autoritaire : un utilisateur ne voit son abonnement actif que s'il
--    n'est PAS expiré (expires_at NULL = à vie). Bloque donc toute démo expirée.
--    Les admins (is_admin()) et les comptes « À vie » sont inchangés.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid() AND status = 'active' AND (expires_at IS NULL OR expires_at > now()));

-- ----------------------------------------------------------------------------
-- 5. Grants EXECUTE (le contrôle d'accès reste porté par is_admin() en 1re ligne)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.start_user_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_user_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reauthorize_user_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_expired_demos() TO authenticated;

-- ============================================================================
-- BLOC OPTIONNEL — pg_cron (à exécuter SÉPARÉMENT, UNIQUEMENT si l'extension
-- pg_cron est activée dans le projet Supabase).
--
-- Le blocage d'accès à expiration est déjà garanti par la politique RLS du
-- point 4 (indépendant de pg_cron). Ce job ne sert qu'à faire basculer
-- automatiquement subscriptions.status → 'expired' et profiles.status →
-- 'inactive' toutes les 5 minutes, pour une visibilité propre côté admin.
--
--   1. CREATE EXTENSION IF NOT EXISTS pg_cron;
--   2. Puis exécuter la ligne cron.schedule ci-dessous :
--
-- SELECT cron.schedule(
--   'expire-demos',
--   '*/5 * * * *',
--   $$ SELECT public.expire_expired_demos(); $$
-- );
--
-- NOTE : pg_cron exécute le job sous son rôle d'installation ; ce rôle doit
-- disposer du droit EXECUTE sur public.expire_expired_demos().
-- ============================================================================
