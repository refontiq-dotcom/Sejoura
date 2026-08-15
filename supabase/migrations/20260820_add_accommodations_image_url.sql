-- Ajoute la colonne image_url sur accommodations (image principale de la carte établissement).
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN accommodations.image_url IS 'URL de l''image principale de l''établissement (affichée sur la carte de la liste)';
