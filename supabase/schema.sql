/* ISS Hunter: skema database (Supabase / Postgres).
   Jalankan seluruh berkas ini sekali di Supabase > SQL Editor. */

/* Profil pemain, id sama dengan id akun Supabase Auth */
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 3 and 20),
  created_at timestamptz not null default now()
);

/* Nama tampilan unik tanpa membedakan huruf besar/kecil (mencegah peniruan, memudahkan penandaan baris sendiri) */
create unique index if not exists profiles_display_name_unique
  on profiles (lower(display_name));

/* Satu baris per ronde. Status expired untuk ronde yang lewat 5 menit */
create table if not exists rounds (
  id bigint generated always as identity primary key,
  player_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'done', 'expired')),
  target_ts bigint not null,
  horizon_seconds integer not null default 600,
  difficulty text not null default 'normal',
  guess_lat double precision,
  guess_lng double precision,
  answer_lat double precision,
  answer_lng double precision,
  distance_km double precision,
  score integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

/* Migrasi idempoten untuk kolom baru jika tabel sudah ada */
alter table rounds add column if not exists horizon_seconds integer not null default 600;
alter table rounds add column if not exists difficulty text not null default 'normal';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rounds_horizon_check') then
    alter table rounds add constraint rounds_horizon_check check (horizon_seconds in (120, 600, 1800, 5400));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rounds_difficulty_check') then
    alter table rounds add constraint rounds_difficulty_check check (difficulty in ('easy', 'normal', 'hard', 'expert'));
  end if;
end $$;

/* Maksimal satu ronde terbuka per pemain */
create unique index if not exists rounds_one_open_per_player
  on rounds (player_id) where status = 'open';
create index if not exists rounds_player_status_idx
  on rounds (player_id, status);
create index if not exists rounds_created_at_idx
  on rounds (created_at);

/* View memakai hak akses pemanggil agar tunduk pada RLS */
create or replace view player_stats with (security_invoker = true) as
select player_id,
       coalesce(sum(score), 0) as total_score,
       count(*) as rounds_done,
       min(distance_km) as best_distance_km,
       min(case when difficulty = 'expert' then distance_km end) as best_expert_distance_km,
       min(case when horizon_seconds = 5400 then distance_km end) as best_orbit_distance_km,
       coalesce(round(avg(score)), 0)::integer as avg_score
from rounds
where status = 'done'
group by player_id;

/* Papan peringkat: Total Skor */
create or replace view leaderboard with (security_invoker = true) as
select p.display_name, s.total_score, s.rounds_done, s.best_distance_km, s.avg_score
from player_stats s
join profiles p on p.id = s.player_id
order by s.total_score desc
limit 20;

/* Papan peringkat: Rata-rata Skor (minimal 5 ronde untuk mencegah grinding semu) */
create or replace view leaderboard_average with (security_invoker = true) as
select p.display_name, s.avg_score, s.rounds_done, s.best_distance_km, s.total_score
from player_stats s
join profiles p on p.id = s.player_id
where s.rounds_done >= 5
order by s.avg_score desc, s.rounds_done desc
limit 20;

/* Papan peringkat: Hari Ini */
create or replace view leaderboard_today with (security_invoker = true) as
select p.display_name,
       coalesce(sum(r.score), 0) as total_score,
       count(r.id) as rounds_done,
       min(r.distance_km) as best_distance_km
from rounds r
join profiles p on p.id = r.player_id
where r.status = 'done'
  and r.created_at >= date_trunc('day', now())
group by p.id, p.display_name
order by total_score desc
limit 20;

/* RLS aktif tanpa policy: semua akses lewat server (secret key melewati RLS) */
alter table profiles enable row level security;
alter table rounds enable row level security;
revoke all on profiles, rounds, player_stats, leaderboard from anon, authenticated;
revoke all on leaderboard_average, leaderboard_today from anon, authenticated;
