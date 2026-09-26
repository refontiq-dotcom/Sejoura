-- Séjoura — médias avancés des types de chambre
-- Ajoute une couverture explicite et un panorama 360° indépendant de la galerie.

alter table public.room_types
  add column if not exists cover_image_url text,
  add column if not exists panorama_360_url text;

comment on column public.room_types.cover_image_url is
  'Photo de couverture explicite du type de chambre.';
comment on column public.room_types.panorama_360_url is
  'URL du panorama 360° équirectangulaire du type de chambre.';
