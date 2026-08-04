-- ============================================================================
-- MIGRATION 006 : Table platform_settings
-- Description  : Paramètres globaux de la plateforme (modifiables via admin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  platform_name    TEXT NOT NULL DEFAULT 'INVOOFFICE',
  lifetime_price   INTEGER NOT NULL DEFAULT 20000,      -- centimes (20000 = 200 MAD)
  currency         TEXT NOT NULL DEFAULT 'MAD',
  whatsapp_support TEXT DEFAULT '',
  email_support    TEXT DEFAULT 'contact@invooffice.com',
  primary_color    TEXT DEFAULT '#6d6cf0',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Valeur par défaut
INSERT INTO public.platform_settings (id, platform_name, lifetime_price)
VALUES (1, 'INVOOFFICE', 20000)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS 'Paramètres globaux de la plateforme (une seule ligne, id=1)';
