-- ----------------------------------------------------------------------------
-- accommodation_type : type d'établissement dédié (fin du détournement de description)
-- ----------------------------------------------------------------------------
-- Historiquement, le type choisi à l'inscription ("bnb" / "hotel") était stocké
-- dans accommodations.description, puis interprété par la sync Trouvetou
-- (src/lib/trouvetou/sync.ts) pour produire le category_slug de l'annonce :
--   description = 'bnb' → catégorie "residence", tout le reste → "hotel".
-- Cette colonne dédiée remplace ce détournement. Seules les catégories
-- d'hébergement de Trouvetou sont supportées (le portail référence :
-- 'hotel', 'residence', 'clinic', 'school', 'other').

-- 1. Colonne (idempotent : peut déjà exister en production sans migration)
ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS accommodation_type TEXT;

-- 2. Backfill des lignes existantes — reproduit exactement l'ancienne règle :
--    description = 'bnb' → 'residence', tout le reste (y compris NULL et les
--    descriptions libres) → 'hotel'.
UPDATE accommodations
SET accommodation_type = CASE WHEN description = 'bnb' THEN 'residence' ELSE 'hotel' END
WHERE accommodation_type IS NULL OR TRIM(accommodation_type) = '';

-- Normalisation de l'ancienne valeur de formulaire 'bnb'
UPDATE accommodations
SET accommodation_type = 'residence'
WHERE accommodation_type = 'bnb';

-- 3. Le champ description redevient un vrai champ de description :
--    on vide les valeurs de type qui y étaient stockées.
UPDATE accommodations
SET description = NULL
WHERE description IN ('bnb', 'hotel');

-- 4. Contraintes
ALTER TABLE accommodations ALTER COLUMN accommodation_type SET DEFAULT 'hotel';
ALTER TABLE accommodations ALTER COLUMN accommodation_type SET NOT NULL;

ALTER TABLE accommodations DROP CONSTRAINT IF EXISTS chk_accommodation_type;
ALTER TABLE accommodations ADD CONSTRAINT chk_accommodation_type
  CHECK (accommodation_type IN ('residence', 'hotel'));

COMMENT ON COLUMN accommodations.accommodation_type IS
  'Type d''établissement — détermine la catégorie de l''annonce sur Trouvetou (''residence'' → Résidences meublées, ''hotel'' → Hôtels).';
