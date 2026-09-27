-- Limitation média des types de chambre pour Trouvetou.
-- 4 photos classiques maximum + une seule visite 360° structurée.
-- Les données existantes sont nettoyées avant activation de la contrainte.

UPDATE public.room_types
SET featured_images = (
  SELECT COALESCE(array_agg(url ORDER BY first_pos), ARRAY[]::text[])
  FROM (
    SELECT url, min(ord) AS first_pos
    FROM unnest(COALESCE(featured_images, ARRAY[]::text[]))
      WITH ORDINALITY AS t(url, ord)
    WHERE url IS NOT NULL AND btrim(url) <> ''
    GROUP BY url
    ORDER BY first_pos
    LIMIT 4
  ) dedup
)
WHERE featured_images IS NOT NULL;

ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS panorama_tour jsonb;

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_featured_images_max_4;

ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_featured_images_max_4
  CHECK (COALESCE(cardinality(featured_images), 0) <= 4);

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_panorama_tour_shape;

ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_panorama_tour_shape
  CHECK (
    panorama_tour IS NULL
    OR (
      jsonb_typeof(panorama_tour) = 'object'
      AND jsonb_typeof(panorama_tour->'scenes') = 'array'
      AND jsonb_array_length(panorama_tour->'scenes') >= 1
      AND jsonb_array_length(panorama_tour->'scenes') <= 12
      AND jsonb_typeof(panorama_tour->'startSceneId') = 'string'
    )
  );

COMMENT ON COLUMN public.room_types.featured_images IS
  'Maximum 4 photos classiques pour la diffusion Trouvetou.';

COMMENT ON COLUMN public.room_types.panorama_tour IS
  'Une seule visite 360° par type de chambre, composée de 1 à 12 scènes.';
