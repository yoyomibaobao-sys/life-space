-- QA only, production deployment needs separate approval.
begin;
create table public.maintenance_run_audits (
 id uuid primary key,
 source text not null check (source in ('vercel','cloudflare','unknown')),
 status text not null check (status in ('running','succeeded','failed')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 lifecycle_processed integer not null default 0 check (lifecycle_processed >= 0),
 deletion_claimed integer not null default 0 check (deletion_claimed >= 0),
 deletion_completed integer not null default 0 check (deletion_completed >= 0),
 deletion_failed integer not null default 0 check (deletion_failed >= 0),
 error_code text,
 constraint maintenance_run_finish_check check ((status='running' and finished_at is null) or (status in ('succeeded','failed') and finished_at is not null))
);
create index maintenance_run_audits_started_idx on public.maintenance_run_audits(started_at desc);
alter table public.maintenance_run_audits enable row level security;
revoke all on public.maintenance_run_audits from public, anon, authenticated;
grant select, insert, update on public.maintenance_run_audits to service_role;
comment on table public.maintenance_run_audits is 'Internal maintenance execution evidence, no user or secrets';
commit;
