-- Migration: Ajout du champ theme_color pour la personnalisation du Sidebar
-- Date: 2026-08-08

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#0C1C33';

ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#0C1C33';

COMMENT ON COLUMN tenants.theme_color IS 'Couleur HEX personnalisée pour le thème/sidebar du tenant. Par défaut: #0C1C33 (Bleu profond Séjoura)';
COMMENT ON COLUMN accommodations.theme_color IS 'Couleur HEX personnalisée pour la résidence/établissement. Par défaut: #0C1C33 (Bleu profond Séjoura)';
