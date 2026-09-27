-- Suivi d'arrivée en temps réel depuis Trouvetou, V1 sans Google.
create table if not exists public.arrival_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  public_token text not null unique,
  status text not null default 'active' check (status in ('active','stopped','completed','expired')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_latitude double precision,
  last_longitude double precision,
  last_accuracy double precision,
  last_speed_kmh double precision,
  last_updated_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arrival_tracking_latitude_range check (last_latitude is null or last_latitude between -90 and 90),
  constraint arrival_tracking_longitude_range check (last_longitude is null or last_longitude between -180 and 180),
  constraint arrival_tracking_accuracy_positive check (last_accuracy is null or last_accuracy >= 0),
  constraint arrival_tracking_speed_positive check (last_speed_kmh is null or last_speed_kmh >= 0)
);
create index if not exists idx_arrival_tracking_tenant_status on public.arrival_tracking_sessions(tenant_id, status);
create index if not exists idx_arrival_tracking_booking on public.arrival_tracking_sessions(booking_id);
alter table public.arrival_tracking_sessions enable row level security;
alter publication supabase_realtime add table public.arrival_tracking_sessions;
create or replace function public.set_arrival_tracking_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_arrival_tracking_updated_at on public.arrival_tracking_sessions;
create trigger trg_arrival_tracking_updated_at before update on public.arrival_tracking_sessions
for each row execute function public.set_arrival_tracking_updated_at();
