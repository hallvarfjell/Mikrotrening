begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.race_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  config jsonb not null,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.races (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'stopped')),
  start_time timestamptz not null,
  end_time timestamptz,
  config jsonb not null,
  current_round integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default extensions.gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  bib integer not null,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'finished')),
  created_at timestamptz not null default now(),
  unique (race_id, bib)
);

create table if not exists public.lap_records (
  id uuid primary key default extensions.gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  registered_at timestamptz not null default now(),
  elapsed_ms bigint,
  status text not null
    check (status in ('finished', 'dnf')),
  created_at timestamptz not null default now(),
  unique (race_id, participant_id, round_number)
);

create index if not exists idx_races_status_created_at
  on public.races(status, created_at desc);

create index if not exists idx_participants_race_bib
  on public.participants(race_id, bib);

create index if not exists idx_lap_records_race_round
  on public.lap_records(race_id, round_number);

create index if not exists idx_lap_records_participant_round
  on public.lap_records(participant_id, round_number);

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
on public.race_templates
to anon, authenticated, service_role;

grant select, insert, update, delete
on public.races
to anon, authenticated, service_role;

grant select, insert, update, delete
on public.participants
to anon, authenticated, service_role;

grant select, insert, update, delete
on public.lap_records
to anon, authenticated, service_role;

alter table public.race_templates enable row level security;
alter table public.races enable row level security;
alter table public.participants enable row level security;
alter table public.lap_records enable row level security;

drop policy if exists p_race_templates_all on public.race_templates;
drop policy if exists p_races_all on public.races;
drop policy if exists p_participants_all on public.participants;
drop policy if exists p_lap_records_all on public.lap_records;

create policy p_race_templates_all
on public.race_templates
for all
to anon, authenticated
using (true)
with check (true);

create policy p_races_all
on public.races
for all
to anon, authenticated
using (true)
with check (true);

create policy p_participants_all
on public.participants
for all
to anon, authenticated
using (true)
with check (true);

create policy p_lap_records_all
on public.lap_records
for all
to anon, authenticated
using (true)
with check (true);

insert into public.race_templates (name, config, is_builtin)
values
(
  'Backyard',
  jsonb_build_object(
    'distance_km', 6.706,
    'round_minutes', 60,
    'reduction_enabled', false,
    'reduction_per_round', 0
  ),
  true
),
(
  'Frontyard',
  jsonb_build_object(
    'distance_km', 3.0,
    'round_minutes', 30,
    'reduction_enabled', true,
    'reduction_per_round', 1
  ),
  true
)
on conflict (name) do update
set
  config = excluded.config,
  is_builtin = excluded.is_builtin;

commit;