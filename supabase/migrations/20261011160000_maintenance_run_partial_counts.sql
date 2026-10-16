-- QA only. Apply after 20261011150000_maintenance_run_audit; production needs separate approval.
begin;
alter table public.maintenance_run_audits
  add column lifecycle_failed integer not null default 0 check (lifecycle_failed >= 0),
  add column deletion_retry_scheduled integer not null default 0 check (deletion_retry_scheduled >= 0);
commit;
