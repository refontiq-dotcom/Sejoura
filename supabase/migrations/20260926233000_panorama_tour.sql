-- Séjoura — visite 360° multi-scènes
-- Un graphe de scènes permet de passer d'une chambre à un couloir, puis à une autre chambre,
-- sans service de cartographie externe. Les données restent attachées à l'établissement.

alter table public.accommodations
  add column if not exists panorama_tour jsonb;

comment on column public.accommodations.panorama_tour is
  'Graphe de visite 360° de l''établissement : scènes, point de départ et liens entre scènes.';

update public.accommodations
set panorama_tour = jsonb_build_object(
  'version', 1,
  'startSceneId', null,
  'scenes', '[]'::jsonb,
  'links', '[]'::jsonb
)
where panorama_tour is null;
