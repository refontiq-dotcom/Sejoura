-- Migration: Ajout de la personnalisation, du multilinguisme et des préférences utilisateur
-- Date: 2026-07-31

-- Types de données pour la gestion de l'interface
DO $$ BEGIN
  CREATE TYPE user_language AS ENUM ('fr', 'en');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE theme_mode AS ENUM ('light', 'dark');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mise à jour du schéma tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS language user_language NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS theme_mode theme_mode NOT NULL DEFAULT 'dark';

-- Création de la table de préférences utilisateur
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language user_language NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
