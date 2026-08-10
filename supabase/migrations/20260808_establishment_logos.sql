-- Migration: Support des logos d'établissements et fallback dynamique
-- Date: 2026-08-08

ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN accommodations.logo_url IS 'URL du logo personnalisé de la résidence/établissement. Si NULL, logo Séjoura par défaut utilisé.';

-- Création du bucket storage s'il n'existe pas
INSERT INTO storage.buckets (id, name, public)
VALUES ('establishment-logos', 'establishment-logos', true)
ON CONFLICT (id) DO NOTHING;
