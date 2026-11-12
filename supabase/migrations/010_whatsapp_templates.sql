-- ============================================================================
-- MIGRATION 010 : Modèles de messages WhatsApp (admin)
-- Description  : 3 modèles personnalisables stockés dans platform_settings,
--                utilisés par le bouton WhatsApp de la colonne Actions (users).
-- Idempotent : ADD COLUMN IF NOT EXISTS, valeurs par défaut = modèles initiaux.
-- Variables disponibles : {nom}, {email}, {lien_app}, {fin_demo}.
-- ============================================================================

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS wa_msg_demo TEXT
  DEFAULT 'Bonjour {nom}, votre démo gratuite de 24h est activée ! Connectez-vous sur {lien_app} pour commencer. Votre accès est valable jusqu''au {fin_demo}.';

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS wa_msg_lifetime TEXT
  DEFAULT 'Bonjour {nom}, votre accès à vie est activé ! Merci pour votre confiance. Connectez-vous sur {lien_app} pour commencer.';

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS wa_msg_suspension TEXT
  DEFAULT 'Bonjour {nom}, votre compte est temporairement suspendu suite à un problème de règlement de votre paiement. Nous vous invitons à régulariser votre paiement pour retrouver votre accès. Merci de votre compréhension.';
