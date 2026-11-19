-- Migration: Tambah view leaderboard_monthly, leaderboard_weekly, leaderboard_daily
-- Jalankan di Supabase SQL Editor (Project > SQL Editor > New query)

-- Papan peringkat: Bulanan
create or replace view leaderboard_monthly with (security_invoker = true) as
select p.display_name,
       coalesce(sum(r.score), 0) as total_score,
       count(r.id) as rounds_done,
       min(r.distance_km) as best_distance_km
from rounds r
join profiles p on p.id = r.player_id
where r.status = 'done'
  and r.created_at >= date_trunc('month', now())
group by p.id, p.display_name
order by total_score desc
limit 20;

-- Papan peringkat: Mingguan
create or replace view leaderboard_weekly with (security_invoker = true) as
select p.display_name,
       coalesce(sum(r.score), 0) as total_score,
       count(r.id) as rounds_done,
       min(r.distance_km) as best_distance_km
from rounds r
join profiles p on p.id = r.player_id
where r.status = 'done'
  and r.created_at >= date_trunc('week', now())
group by p.id, p.display_name
order by total_score desc
limit 20;

-- Papan peringkat: Harian
create or replace view leaderboard_daily with (security_invoker = true) as
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

-- Refresh cache schema API PostgREST Supabase
notify pgrst, 'reload schema';
