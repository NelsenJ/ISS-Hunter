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
  guess_lat double precision,
  guess_lng double precision,
  answer_lat double precision,
  answer_lng double precision,
  distance_km double precision,
  score integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

/* Maksimal satu ronde terbuka per pemain */
create unique index if not exists rounds_one_open_per_player
  on rounds (player_id) where status = 'open';
create index if not exists rounds_player_status_idx
  on rounds (player_id, status);

/* View memakai hak akses pemanggil agar tunduk pada RLS */
create or replace view player_stats with (security_invoker = true) as
select player_id,
       coalesce(sum(score), 0) as total_score,
       count(*) as rounds_done,
       min(distance_km) as best_distance_km
from rounds
where status = 'done'
group by player_id;

create or replace view leaderboard with (security_invoker = true) as
select p.display_name, s.total_score, s.rounds_done, s.best_distance_km
from player_stats s
join profiles p on p.id = s.player_id
order by s.total_score desc
limit 20;

/* RLS aktif tanpa policy: semua akses lewat server (secret key melewati RLS) */
alter table profiles enable row level security;
alter table rounds enable row level security;
revoke all on profiles, rounds, player_stats, leaderboard from anon, authenticated;
