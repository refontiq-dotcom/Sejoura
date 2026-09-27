-- Séjoura — contrainte de cohérence du graphe de visite 360°
alter table public.accommodations
  drop constraint if exists accommodations_panorama_tour_valid;

alter table public.accommodations
  add constraint accommodations_panorama_tour_valid
  check (panorama_tour is null or public.is_valid_panorama_tour(panorama_tour));
