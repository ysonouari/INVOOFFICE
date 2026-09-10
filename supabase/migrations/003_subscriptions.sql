-- ============================================================================
-- MIGRATION 003 : Table subscriptions
-- Description  : Abonnements des utilisateurs aux plans
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id      UUID NOT NULL REFERENCES public.plans(id),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  activated_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,                         -- NULL = accès à vie
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, plan_id)
);

-- Trigger updated_at
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Index partiel : abonnements actifs uniquement
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON public.subscriptions(user_id, status)
  WHERE status = 'active';

COMMENT ON TABLE public.subscriptions IS 'Abonnements des utilisateurs aux plans';
COMMENT ON COLUMN public.subscriptions.expires_at IS 'NULL = accès à vie (pas d''expiration)';
