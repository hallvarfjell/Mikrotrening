-- INTZ Cloud migration: workout_templates + workouts + storage policies
create extension if not exists pgcrypto;
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  "desc" text not null default '',
  warmup_sec int not null default 0,
  cooldown_sec int not null default 0,
  series jsonb not null,
  sort_index int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.workout_templates enable row level security;
create policy if not exists "templates selectable by owner" on public.workout_templates for select using (auth.uid() = user_id);
create policy if not exists "templates insertable by owner" on public.workout_templates for insert with check (auth.uid() = user_id);
create policy if not exists "templates updatable by owner" on public.workout_templates for update using (auth.uid() = user_id);
create policy if not exists "templates deletable by owner" on public.workout_templates for delete using (auth.uid() = user_id);
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec int not null,
  reps int not null default 0,
  lt1 int,
  lt2 int,
  mass_kg numeric,
  distance_m numeric,
  elev_gain_m numeric,
  tss numeric,
  ghost_summary jsonb,
  tcx_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_id)
);
alter table public.workouts enable row level security;
create policy if not exists "workouts selectable by owner" on public.workouts for select using (auth.uid() = user_id);
create policy if not exists "workouts insertable by owner" on public.workouts for insert with check (auth.uid() = user_id);
create policy if not exists "workouts updatable by owner" on public.workouts for update using (auth.uid() = user_id);
create policy if not exists "workouts deletable by owner" on public.workouts for delete using (auth.uid() = user_id);
insert into storage.buckets (id, name, public) values ('sessions', 'sessions', false) on conflict (id) do nothing;
create policy if not exists "read own tcx" on storage.objects for select to authenticated using (bucket_id = 'sessions' and name like auth.uid()::text || '/%');
create policy if not exists "upload own tcx" on storage.objects for insert to authenticated with check (bucket_id = 'sessions' and name like auth.uid()::text || '/%');
create policy if not exists "delete own tcx" on storage.objects for delete to authenticated using (bucket_id = 'sessions' and name like auth.uid()::text || '/%');
