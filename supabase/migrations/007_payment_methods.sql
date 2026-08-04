-- ============================================================================
-- MIGRATION 007 : Table payment_methods + extension platform_settings
-- Description  : Méthodes de paiement configurables + instructions de paiement
-- ============================================================================

-- Table des méthodes de paiement
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                          -- 'Virement bancaire', 'Wafa Cash', etc.
  beneficiary     TEXT,                                    -- Nom du bénéficiaire
  bank            TEXT,                                    -- Nom de la banque
  rib             TEXT,                                    -- RIB
  iban            TEXT,                                    -- IBAN
  account_number  TEXT,                                    -- Numéro Wafa Cash / Cash Plus
  instructions    TEXT,                                    -- Instructions spécifiques
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON public.payment_methods(is_active, sort_order);

-- Ajout de colonnes à platform_settings pour les instructions de paiement
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS validation_time TEXT DEFAULT '24 à 48 heures';

-- Seeds : méthodes de paiement par défaut
INSERT INTO public.payment_methods (name, beneficiary, bank, rib, iban, account_number, instructions, sort_order) VALUES
  ('Virement bancaire', 'INVOOFFICE', 'Attijariwafa Bank', 'XXX XXXX XXXX XXXX XXXX XXX', 'MA64 XXXX XXXX XXXX XXXX XXXX XXXX', NULL, 'Veuillez indiquer votre nom en reference du virement.', 1),
  ('Wafa Cash', 'INVOOFFICE', NULL, NULL, NULL, '+212 6XX-XXXXXX', 'Envoyez le montant avec votre nom complet en message.', 2),
  ('Cash Plus', 'INVOOFFICE', NULL, NULL, NULL, '+212 6XX-XXXXXX', 'Envoyez le montant avec votre nom complet en message.', 3)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.payment_methods IS 'Méthodes de paiement configurables par l''administrateur';
