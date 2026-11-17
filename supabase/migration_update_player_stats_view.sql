-- Migration: Update player_stats view to add best_expert_distance_km and best_orbit_distance_km
-- Jalankan file ini di Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Tambah kolom difficulty dan horizon_seconds jika belum ada di tabel rounds
alter table rounds add column if not exists horizon_seconds integer not null default 600;
alter table rounds add column if not exists difficulty text not null default 'normal';

-- Buat ulang view player_stats dengan kolom baru
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

-- Revoke akses anon/authenticated ke view baru (keamanan server-side)
revoke all on player_stats from anon, authenticated;
