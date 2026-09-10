-- ============================================================================
-- MIGRATION 002 : Table plans
-- Description  : Plans d'abonnement disponibles
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  price        INTEGER NOT NULL,                    -- Prix en centimes (30000 = 300 MAD)
  currency     TEXT NOT NULL DEFAULT 'MAD',
  is_lifetime  BOOLEAN NOT NULL DEFAULT TRUE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER DEFAULT 0,                   -- Ordre d'affichage
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index
CREATE INDEX IF NOT EXISTS idx_plans_active ON public.plans(is_active, sort_order);

COMMENT ON TABLE public.plans IS 'Plans d''abonnement disponibles';
COMMENT ON COLUMN public.plans.price IS 'Prix en centimes (30000 = 300 MAD)';
COMMENT ON COLUMN public.plans.is_lifetime IS 'TRUE = accès à vie, FALSE = abonnement périodique';
