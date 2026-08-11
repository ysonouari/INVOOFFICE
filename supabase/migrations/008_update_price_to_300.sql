-- ============================================================================
-- MIGRATION 008 : Mise à jour du prix à 300 DH
-- Description  : Prix officiel INVOOFFICE passe de 200 DH à 300 DH
--                Ne modifie PAS les paiements historiques.
-- ============================================================================

-- Mettre à jour le prix dans platform_settings (configuration centrale)
UPDATE public.platform_settings
SET lifetime_price = 30000
WHERE id = 1 AND lifetime_price = 20000;

-- Mettre à jour le prix du plan "Accès à vie"
UPDATE public.plans
SET price = 30000
WHERE name = 'Accès à vie' AND is_lifetime = TRUE AND price = 20000;

-- Commentaires mis à jour (ne change pas les données)
COMMENT ON COLUMN public.platform_settings.lifetime_price IS 'Prix en centimes (30000 = 300 MAD)';
COMMENT ON COLUMN public.plans.price IS 'Prix en centimes (30000 = 300 MAD)';
COMMENT ON COLUMN public.payments.amount IS 'Montant en centimes (les paiements historiques conservent leur valeur)';
