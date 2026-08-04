-- ============================================================================
-- MIGRATION 005 : Table admin_logs
-- Description  : Journal des actions administrateur
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES auth.users(id),
  target_user_id  UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON public.admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON public.admin_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_date ON public.admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON public.admin_logs(action);

COMMENT ON TABLE public.admin_logs IS 'Journal des actions administrateur';
COMMENT ON COLUMN public.admin_logs.action IS 'Type d''action : activate, deactivate, grant_access, revoke_access, mark_paid, edit_profile';
COMMENT ON COLUMN public.admin_logs.details IS 'Détails contextuels au format JSON (ex: {"previous_status": "pending"})';
