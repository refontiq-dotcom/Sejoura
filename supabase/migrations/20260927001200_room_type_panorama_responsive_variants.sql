-- Responsive 360° panorama variants.
alter table public.room_types
  add column if not exists panorama_360_preview_url text,
  add column if not exists panorama_360_mobile_url text,
  add column if not exists panorama_360_hd_url text;

update public.room_types
set panorama_360_hd_url = coalesce(panorama_360_hd_url, panorama_360_url),
    panorama_360_mobile_url = coalesce(panorama_360_mobile_url, panorama_360_url),
    panorama_360_preview_url = coalesce(panorama_360_preview_url, panorama_360_url)
where panorama_360_url is not null;
