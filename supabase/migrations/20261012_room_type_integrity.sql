-- ============================================================================
-- SÉJOURA — Intégrité des types de chambre
--
--   1. Unicité du nom par établissement (casse et espaces ignorés), jusqu'ici
--      contrôlée uniquement côté navigateur.
--   2. Contraintes de valeurs (nom, description, prix, capacité, surface).
--      Posées NOT VALID : elles s'appliquent aux nouvelles écritures sans
--      faire échouer la migration si d'anciennes lignes sont hors norme.
--   3. rooms.room_type_id : ON DELETE CASCADE → NO ACTION. Supprimer un type
--      ne supprime plus en silence ses chambres (et, par cascade, leurs
--      réservations). NO ACTION (et non RESTRICT) est voulu : le contrôle se
--      fait en fin d'instruction, donc la suppression d'un établissement,
--      qui supprime types ET chambres, continue de fonctionner.
--
-- Idempotente : peut être rejouée sans effet de bord.
--
-- Diagnostic des anciennes lignes hors norme (à lancer à la main si besoin) :
--   SELECT id, name, base_price, capacity, surface_m2 FROM room_types
--   WHERE capacity < 1 OR base_price < 0 OR surface_m2 < 0;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Doublons existants : renommer les occurrences surnuméraires
--    (la plus ancienne garde son nom), sinon l'index unique échouerait.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY accommodation_id,
                        lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS rn
  FROM room_types
)
UPDATE room_types rt
SET name = left(btrim(rt.name), 88) || ' (' || ranked.rn || '-' || left(rt.id::text, 4) || ')'
FROM ranked
WHERE rt.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_types_accommodation_name
  ON room_types (accommodation_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

-- ----------------------------------------------------------------------------
-- 2. Contraintes de valeurs (NOT VALID : n'examinent pas l'existant)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_types_name_length'
                 AND conrelid = 'public.room_types'::regclass) THEN
    ALTER TABLE room_types ADD CONSTRAINT room_types_name_length
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 100) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_types_description_length'
                 AND conrelid = 'public.room_types'::regclass) THEN
    ALTER TABLE room_types ADD CONSTRAINT room_types_description_length
      CHECK (description IS NULL OR char_length(description) <= 500) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_types_base_price_non_negative'
                 AND conrelid = 'public.room_types'::regclass) THEN
    ALTER TABLE room_types ADD CONSTRAINT room_types_base_price_non_negative
      CHECK (base_price >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_types_capacity_positive'
                 AND conrelid = 'public.room_types'::regclass) THEN
    ALTER TABLE room_types ADD CONSTRAINT room_types_capacity_positive
      CHECK (capacity >= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_types_surface_non_negative'
                 AND conrelid = 'public.room_types'::regclass) THEN
    ALTER TABLE room_types ADD CONSTRAINT room_types_surface_non_negative
      CHECK (surface_m2 IS NULL OR surface_m2 >= 0) NOT VALID;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. rooms.room_type_id : ne plus supprimer les chambres en cascade
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid  = 'public.rooms'::regclass
    AND confrelid = 'public.room_types'::regclass
    AND contype   = 'f'
    AND confdeltype = 'c'          -- 'c' = CASCADE ; déjà corrigé si absent
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.rooms DROP CONSTRAINT %I', fk_name);
    ALTER TABLE public.rooms
      ADD CONSTRAINT rooms_room_type_id_fkey
      FOREIGN KEY (room_type_id) REFERENCES public.room_types(id) ON DELETE NO ACTION;
  END IF;
END $$;
