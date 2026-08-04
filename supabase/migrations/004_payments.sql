-- ============================================================================
-- MIGRATION 004 : Table payments
-- Description  : Historique des paiements
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES public.subscriptions(id),
  amount            INTEGER NOT NULL,               -- Prix en centimes
  currency          TEXT NOT NULL DEFAULT 'MAD',
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method    TEXT NOT NULL DEFAULT 'manual'
                    CHECK (payment_method IN ('manual', 'online', 'wire_transfer', 'cash')),
  reference         TEXT,                           -- Référence externe (virement, etc.)
  notes             TEXT,                           -- Notes internes admin
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Index
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(created_at DESC);

COMMENT ON TABLE public.payments IS 'Historique des paiements';
COMMENT ON COLUMN public.payments.amount IS 'Montant en centimes (20000 = 200 MAD)';
COMMENT ON COLUMN public.payments.payment_method IS 'manual, online, wire_transfer, cash';
