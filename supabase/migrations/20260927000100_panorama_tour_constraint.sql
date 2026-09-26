-- Séjoura — validation serveur du graphe de visite 360°
create or replace function public.is_valid_panorama_tour(p_tour jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_scene jsonb;
  v_link jsonb;
  v_hotspot jsonb;
  v_scene_ids text[] := array[]::text[];
  v_link_ids text[] := array[]::text[];
  v_link_pairs text[] := array[]::text[];
  v_start text;
  v_scene_id text;
  v_pair text;
begin
  if p_tour is null then return true; end if;
  if jsonb_typeof(p_tour) <> 'object' then return false; end if;
  if coalesce((p_tour->>'version')::int, 0) <> 1 then return false; end if;
  if jsonb_typeof(coalesce(p_tour->'scenes', '[]'::jsonb)) <> 'array' then return false; end if;
  if jsonb_typeof(coalesce(p_tour->'links', '[]'::jsonb)) <> 'array' then return false; end if;
  v_start := nullif(p_tour->>'startSceneId', '');

  for v_scene in select value from jsonb_array_elements(p_tour->'scenes') loop
    v_scene_id := nullif(v_scene->>'id', '');
    if v_scene_id is null or nullif(trim(v_scene->>'name'), '') is null or length(v_scene->>'name') > 120
       or nullif(trim(v_scene->>'src'), '') is null
       or (v_scene->>'kind') not in ('room','corridor','lobby','other') then return false; end if;
    if v_scene_id = any(v_scene_ids) then return false; end if;
    v_scene_ids := array_append(v_scene_ids, v_scene_id);
    if jsonb_typeof(coalesce(v_scene->'infoHotspots', '[]'::jsonb)) <> 'array' then return false; end if;
    for v_hotspot in select value from jsonb_array_elements(coalesce(v_scene->'infoHotspots', '[]'::jsonb)) loop
      if nullif(v_hotspot->>'id','') is null or v_hotspot->>'sceneId' <> v_scene_id
         or nullif(trim(v_hotspot->>'title'),'') is null or length(v_hotspot->>'title') > 100
         or coalesce(length(v_hotspot->>'description'),0) > 500
         or not ((v_hotspot->>'yaw')::double precision between -6.283185307179586 and 6.283185307179586)
         or not ((v_hotspot->>'pitch')::double precision between -1.570796326794897 and 1.570796326794897)
      then return false; end if;
    end loop;
  end loop;

  if cardinality(v_scene_ids) = 0 then return v_start is null; end if;
  if v_start is null or not v_start = any(v_scene_ids) then return false; end if;

  for v_scene in select value from jsonb_array_elements(p_tour->'scenes') loop
    if v_scene->>'id' = v_start and coalesce((v_scene->>'isPublished')::boolean, true) = false then return false; end if;
  end loop;

  for v_link in select value from jsonb_array_elements(p_tour->'links') loop
    if nullif(v_link->>'id','') is null or nullif(v_link->>'fromSceneId','') is null
       or nullif(v_link->>'toSceneId','') is null or v_link->>'fromSceneId' = v_link->>'toSceneId'
       or not (v_link->>'fromSceneId' = any(v_scene_ids)) or not (v_link->>'toSceneId' = any(v_scene_ids))
       or not ((v_link->>'yaw')::double precision between -6.283185307179586 and 6.283185307179586)
       or not ((v_link->>'pitch')::double precision between -1.570796326794897 and 1.570796326794897)
       or length(coalesce(v_link->>'label','')) > 120 then return false; end if;
    v_pair := v_link->>'fromSceneId' || '::' || v_link->>'toSceneId';
    if v_link->>'id' = any(v_link_ids) or v_pair = any(v_link_pairs) then return false; end if;
    v_link_ids := array_append(v_link_ids, v_link->>'id');
    v_link_pairs := array_append(v_link_pairs, v_pair);
  end loop;
  return true;
exception when others then return false;
end;
$$;

alter table public.accommodations drop constraint if exists accommodations_panorama_tour_valid;
alter table public.accommodations add constraint accommodations_panorama_tour_valid
check (panorama_tour is null or public.is_valid_panorama_tour(panorama_tour));
