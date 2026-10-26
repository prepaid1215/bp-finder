-- Run in the Supabase SQL Editor.
-- All reads/writes occur only through the Vercel server API using the service role key.
create extension if not exists pgcrypto;

create table if not exists public.bp_center_feedback (
  id uuid primary key default gen_random_uuid(),
  center_id text not null,
  center_name text,
  requester_name varchar(50), -- private, do not return from the public GET API
  channel text not null check (channel in ('fax','kakao','both','other','unknown')),
  hours text not null check (hours in ('ontime','late','irregular','closed','unknown')),
  stage text check (stage in ('prepared','submitted','confirmed','visited')),
  channel_detail varchar(80),
  hours_detail varchar(200),
  visit_date date,
  note text not null check (char_length(note) between 5 and 400),
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_bp_center_feedback_public
  on public.bp_center_feedback(center_id, status, created_at desc);
create index if not exists idx_bp_center_feedback_rate
  on public.bp_center_feedback(ip_hash, created_at desc);

alter table public.bp_center_feedback enable row level security;
-- No anonymous read or write policies: service-role serverless API is the only access path.
-- Submissions are approved automatically by the Vercel API. Hide inappropriate posts by setting status='rejected'.
-- Avoid exposing or logging the service role key.
-- Decide retention of ip_hash; example below deletes hashes older than 30 days
-- without removing the public experience itself:
-- update public.bp_center_feedback
-- set ip_hash = 'expired:' || id::text
-- where created_at < now() - interval '30 days'
--   and ip_hash not like 'expired:%';
