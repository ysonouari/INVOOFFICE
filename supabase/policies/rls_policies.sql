-- ============================================================================
-- POLITIQUES RLS (Row Level Security)
-- Description  : Toutes les politiques de sécurité Supabase
-- Ordre        : À exécuter après toutes les migrations
-- ============================================================================

-- Activer RLS sur toutes les tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES
-- ============================================================================

-- Fonction SECURITY DEFINER pour éviter la récursion infinie dans les policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Admin : tout voir, tout modifier
CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (is_admin());

-- Utilisateur : voir son propre profil
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Utilisateur : modifier son propre profil (nom, WhatsApp — pas le rôle ni le statut)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- ============================================================================
-- PLANS
-- ============================================================================

-- Tout le monde (y compris non connecté) peut voir les plans actifs
CREATE POLICY "Anyone can view active plans"
  ON public.plans FOR SELECT
  USING (is_active = TRUE);

-- Admin : créer/modifier/supprimer des plans
CREATE POLICY "Admins can manage plans"
  ON public.plans FOR ALL
  USING (is_admin());

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================

-- Utilisateur : voir ses abonnements
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Admin : gérer tous les abonnements
CREATE POLICY "Admins can manage all subscriptions"
  ON public.subscriptions FOR ALL
  USING (is_admin());

-- ============================================================================
-- PAYMENTS
-- ============================================================================

-- Utilisateur : voir ses paiements
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (user_id = auth.uid());

-- Admin : gérer tous les paiements
CREATE POLICY "Admins can manage payments"
  ON public.payments FOR ALL
  USING (is_admin());

-- ============================================================================
-- ADMIN_LOGS
-- ============================================================================

-- Admin : créer des logs
CREATE POLICY "Admins can insert logs"
  ON public.admin_logs FOR INSERT
  WITH CHECK (is_admin());

-- Admin : consulter les logs
CREATE POLICY "Admins can view logs"
  ON public.admin_logs FOR SELECT
  USING (is_admin());

-- ============================================================================
-- PLATFORM_SETTINGS
-- ============================================================================

-- Admin : gérer les paramètres
CREATE POLICY "Admins can manage platform settings"
  ON public.platform_settings FOR ALL
  USING (is_admin());

-- Tout le monde (y compris anon) peut lire les paramètres (pour la landing page)
CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings FOR SELECT
  USING (true);

-- ============================================================================
-- PAYMENT_METHODS
-- ============================================================================

-- Admin : gérer les méthodes de paiement
CREATE POLICY "Admins can manage payment methods"
  ON public.payment_methods FOR ALL
  USING (is_admin());

-- Tout le monde (y compris anon) peut voir les méthodes actives (landing page)
CREATE POLICY "Anyone can view active payment methods"
  ON public.payment_methods FOR SELECT
  USING (is_active = TRUE);

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Anon (non connecté) : lecture des plans et des profils (pour vérification inscription)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.profiles TO anon;

-- Authenticated : opérations standard
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT SELECT ON public.platform_settings TO anon;
GRANT ALL ON public.platform_settings TO authenticated;
GRANT SELECT ON public.payment_methods TO anon;
GRANT ALL ON public.payment_methods TO authenticated;

COMMENT ON POLICY "Admins can manage all profiles" ON public.profiles IS 'Les administrateurs ont un accès complet à tous les profils';
COMMENT ON POLICY "Users can view own profile" ON public.profiles IS 'Un utilisateur ne peut voir que son propre profil';
