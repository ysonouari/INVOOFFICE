-- ============================================================================
-- SEED 001 : Plan par défaut
-- Description  : Insère le plan "Accès à vie — 200 DH"
-- ============================================================================

INSERT INTO public.plans (name, description, price, is_lifetime, sort_order)
VALUES (
  'Accès à vie',
  'Accès illimité à toutes les fonctionnalités de facturation : devis, factures, bons de livraison, avoirs, clients, historique, export PDF.',
  20000,
  TRUE,
  1
)
ON CONFLICT DO NOTHING;

-- Vérification
SELECT id, name, price, currency, is_lifetime, is_active
FROM public.plans
WHERE name = 'Accès à vie';
