-- Migration: Support Multi-pays, Devises automatiques et Langues
-- Date: 2026-08-06

-- 1. Ajouter les colonnes de localisation et de devise à la table accommodations
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS currency_symbol TEXT DEFAULT 'FCFA',
  ADD COLUMN IF NOT EXISTS phone_code TEXT DEFAULT '+225',
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr';

COMMENT ON COLUMN accommodations.currency IS 'Code ISO de la devise (ex: XOF, XAF, NGN, GHS, KES, MAD)';
COMMENT ON COLUMN accommodations.currency_symbol IS 'Symbole d''affichage de la devise (ex: FCFA, ₦, ₵, KSh, DH)';
COMMENT ON COLUMN accommodations.phone_code IS 'Indicatif téléphonique par défaut du pays (ex: +225, +221, +234, +233, +237)';
COMMENT ON COLUMN accommodations.language IS 'Langue préférée de l''établissement (ex: fr, en)';

-- 2. Ajouter les colonnes de préférences globales à la table tenants si nécessaire
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS default_currency_symbol TEXT DEFAULT 'FCFA',
  ADD COLUMN IF NOT EXISTS default_language TEXT DEFAULT 'fr';
