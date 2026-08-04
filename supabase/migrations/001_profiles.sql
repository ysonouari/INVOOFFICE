-- ============================================================================
-- MIGRATION 001 : Table profiles + Trigger + Index
-- Description  : Identité et statut des utilisateurs. Liée à auth.users.
-- Auteur       : Sprint 0
-- Date         : 2026-08-03
-- ============================================================================

-- Table principale
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT,
  whatsapp    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user'
              CHECK (role IN ('user', 'admin')),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'active', 'inactive', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes admin (filtre par statut + tri par date)
CREATE INDEX IF NOT EXISTS idx_profiles_status_created
  ON public.profiles(status, created_at DESC);

-- Index pour chercher par rôle
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

-- Trigger updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger : création automatique du profil après inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, whatsapp)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'whatsapp', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON TABLE public.profiles IS 'Profils utilisateurs liés à auth.users';
COMMENT ON COLUMN public.profiles.role IS 'Rôle : user ou admin';
COMMENT ON COLUMN public.profiles.status IS 'Statut : pending, active, inactive, rejected';
