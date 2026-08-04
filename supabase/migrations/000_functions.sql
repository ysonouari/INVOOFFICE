-- ============================================================================
-- MIGRATION 000 : Fonctions utilitaires
-- Description  : Fonctions partagées (triggers, helpers)
-- Ordre        : À exécuter EN PREMIER (avant toutes les autres migrations)
-- ============================================================================

-- Fonction updated_at : met à jour automatiquement le champ updated_at
-- Utilisée par les triggers BEFORE UPDATE sur toutes les tables
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at() IS 'Met à jour automatiquement le champ updated_at lors d''un UPDATE';
