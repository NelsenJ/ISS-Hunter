-- Migration: Tambah kolom horizon_seconds dan perluas constraint
-- Jalankan sekali di Supabase SQL Editor (Project > SQL Editor > New query)

-- 1. Tambah kolom horizon_seconds jika belum ada
alter table rounds add column if not exists horizon_seconds integer not null default 600;

-- 2. Hapus constraint lama yang hanya memperbolehkan beberapa nilai spesifik
alter table rounds drop constraint if exists rounds_horizon_check;

-- 3. Buat constraint baru: rentang 600–5400 detik (10–90 menit)
alter table rounds drop constraint if exists rounds_horizon_range_check;
alter table rounds add constraint rounds_horizon_range_check
  check (horizon_seconds >= 600 and horizon_seconds <= 5400);
