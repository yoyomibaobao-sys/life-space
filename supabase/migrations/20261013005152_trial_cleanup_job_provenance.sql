-- PR #95: non-destructive, durable trial-cleanup staging and queue provenance.
-- This migration deliberately does not enqueue, delete, or process any data.
-- DO NOT APPLY separately: the existing lifecycle replacement is still
-- blocked and the payment/Storage worker fencing protocol is not validated.
begin;

create table private.trial_cloud_cleanup_batches (
  id uuid primary key default gen_random_uuid(),
  -- Audit UUID is intentionally not an FK: account deletion must remain available.
  requested_by uuid not null,
  selected_bands text[] not null,
  status text not null default 'review'
    check (status in ('review', 'confirmed', 'running', 'paused', 'completed', 'failed', 'canceled')),
  snapshot_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_cleanup_batch_bands_nonempty
    check (cardinality(selected_bands) between 1 and 5),
  constraint trial_cleanup_batch_bands_valid
    check (selected_bands <@ array['lt_6m', 'm6_12', 'y1_3', 'y3_6', 'gte_6y']::text[])
);

create table private.trial_cloud_cleanup_targets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.trial_cloud_cleanup_batches(id) on delete restrict,
  -- Do not block existing permanent account deletion by retaining an audit row.
  user_id uuid not null,
  cleanup_due_at timestamptz not null,
  age_band text not null
    check (age_band in ('lt_6m', 'm6_12', 'y1_3', 'y3_6', 'gte_6y')),
  status text not null default 'review'
    check (status in ('review', 'pending', 'reserved', 'deferred_payment', 'deleting', 'awaiting_storage', 'completed', 'failed', 'skipped_paid', 'canceled')),
  claimed_at timestamptz,
  reservation_id uuid,
  reservation_expires_at timestamptz,
  preflight_checked_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, user_id)
);

create index trial_cleanup_targets_pending_idx
  on private.trial_cloud_cleanup_targets (cleanup_due_at, user_id)
  where status in ('pending', 'failed');

create index trial_cleanup_targets_preflight_idx
  on private.trial_cloud_cleanup_targets (batch_id, cleanup_due_at, user_id)
  where status = 'pending' and preflight_checked_at is null;

-- Durable evidence for the *current reservation*, not a live deletion queue.
-- A stale lease retains its old plan for audit but cannot be used by a new
-- reservation. No generic Storage worker can claim these rows.
create table private.trial_cloud_cleanup_storage_plan (
  target_id uuid not null references private.trial_cloud_cleanup_targets(id)
    on delete restrict,
  reservation_id uuid not null,
  bucket_id text not null check (bucket_id = 'media'),
  object_path text not null,
  prepared_at timestamptz not null default now(),
  primary key (target_id, reservation_id, bucket_id, object_path)
);
create index trial_cleanup_storage_plan_target_idx
  on private.trial_cloud_cleanup_storage_plan (target_id, reservation_id);
alter table private.trial_cloud_cleanup_storage_plan enable row level security;
revoke all on private.trial_cloud_cleanup_storage_plan
  from public, anon, authenticated, service_role;

-- Never schedule the same account for destructive work in two active batches.
-- Concurrent confirmations may receive unique_violation and must retry after
-- the first batch is completed or canceled; never silently double-delete.
create unique index trial_cleanup_targets_one_active_user
  on private.trial_cloud_cleanup_targets(user_id)
  where status in ('pending', 'reserved', 'deleting', 'awaiting_storage');

-- All existing queue rows remain explicitly of UNKNOWN origin. Never
-- retroactively relabel them from their owner or source_type: user-initiated
-- trash and legacy automatic trial cleanup shared those fields.
-- Use the target UUID as the queue's stable source key. Reusing source_type
-- 'account' would collide with an unrelated user-initiated account purge.
alter table public.storage_deletion_jobs
  drop constraint storage_deletion_jobs_source_type_check;
alter table public.storage_deletion_jobs
  add constraint storage_deletion_jobs_source_type_check
  -- Preserve every already-supported deletion type; append only trial_admin.
  check (source_type in (
    'record', 'archive', 'cycle', 'account', 'media',
    'market_post', 'market_media', 'market_cover', 'trial_admin'
  ));

alter table public.storage_deletion_jobs
  add column job_origin text not null default 'legacy_unspecified'
    check (job_origin in ('legacy_unspecified', 'trial_admin')),
  add column trial_cleanup_target_id uuid
    references private.trial_cloud_cleanup_targets(id) on delete restrict,
  add constraint storage_deletion_jobs_trial_origin_check
    check (
      (job_origin = 'trial_admin'
        and source_type = 'trial_admin'
        and trial_cleanup_target_id is not null
        and source_id = trial_cleanup_target_id)
      or (job_origin = 'legacy_unspecified'
        and source_type <> 'trial_admin'
        and trial_cleanup_target_id is null)
    );

create index storage_deletion_jobs_trial_cleanup_target_idx
  on public.storage_deletion_jobs (trial_cleanup_target_id)
  where trial_cleanup_target_id is not null;

-- Hard interlock: the existing generic Storage worker must not receive
-- trial_admin items until a new payment-aware executor has passed isolated
-- QA. Ordinary record/archive/account/media deletion jobs remain unchanged.
create or replace function private.block_unverified_trial_admin_storage_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_origin text;
begin
  -- Lock the parent through the item insert/update transaction. A concurrent
  -- source relabel must wait and then see the committed item. FOR SHARE allows
  -- parallel inserts while conflicting with the parent's source UPDATE.
  select j.job_origin into v_origin from public.storage_deletion_jobs j
    where j.id = new.job_id for share;
  if v_origin = 'trial_admin' then
    raise exception 'trial_admin_storage_delete_not_enabled' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.block_unverified_trial_admin_storage_delete()
  from public, anon, authenticated, service_role;
create trigger storage_deletion_items_block_unverified_trial_admin
  before insert or update of job_id on public.storage_deletion_items
  for each row execute function private.block_unverified_trial_admin_storage_delete();

-- Do not permit a previously enqueued legacy job to be relabeled as trial
-- cleanup and slip through the existing worker's global claim function.
create or replace function private.block_trial_admin_relabel_with_items()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.job_origin = 'trial_admin' and old.job_origin <> 'trial_admin'
     and exists (
       select 1 from public.storage_deletion_items i where i.job_id = new.id
     ) then
    raise exception 'trial_admin_job_relabel_not_enabled' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.block_trial_admin_relabel_with_items()
  from public, anon, authenticated, service_role;
create trigger storage_deletion_jobs_block_trial_admin_relabel
  before update of job_origin on public.storage_deletion_jobs
  for each row execute function private.block_trial_admin_relabel_with_items();

alter table private.trial_cloud_cleanup_batches enable row level security;
alter table private.trial_cloud_cleanup_targets enable row level security;
revoke all on private.trial_cloud_cleanup_batches
  from public, anon, authenticated, service_role;
revoke all on private.trial_cloud_cleanup_targets
  from public, anon, authenticated, service_role;

-- Admin-only draft creation. Captures the entire selected age bands, with
-- no account limit; the future confirmation step MUST re-evaluate eligibility
-- under the shared payment lock. This function never schedules a deletion.
create or replace function public.admin_stage_trial_cloud_cleanup(p_bands text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_bands text[];
  v_batch uuid;
  v_count bigint;
begin
  if v_admin is null or not public.is_app_admin(v_admin) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select array_agg(distinct value order by value) into v_bands
  from unnest(coalesce(p_bands, array[]::text[])) as selection(value);
  if v_bands is null or cardinality(v_bands) > 5
     or not (v_bands <@ array['lt_6m', 'm6_12', 'y1_3', 'y3_6', 'gte_6y']::text[]) then
    raise exception 'invalid_cleanup_bands' using errcode = '22023';
  end if;

  insert into private.trial_cloud_cleanup_batches (requested_by, selected_bands)
  values (v_admin, v_bands) returning id into v_batch;

  insert into private.trial_cloud_cleanup_targets (
    batch_id, user_id, cleanup_due_at, age_band
  )
  select v_batch, c.user_id, c.cleanup_due_at,
    case
      when c.cleanup_due_at > now() - interval '6 months' then 'lt_6m'
      when c.cleanup_due_at > now() - interval '1 year' then 'm6_12'
      when c.cleanup_due_at > now() - interval '3 years' then 'y1_3'
      when c.cleanup_due_at > now() - interval '6 years' then 'y3_6'
      else 'gte_6y'
    end
  from private.cloud_trial_claims c
  where c.cleanup_due_at <= now()
    and c.converted_to_paid_at is null
    and c.cleanup_completed_at is null
    and c.cleanup_started_at is null
    and not exists (
      select 1 from public.membership_payments mp
      where mp.user_id = c.user_id and mp.status = 'confirmed'
    )
    and not exists (
      select 1 from public.user_memberships um
      where um.user_id = c.user_id and um.plan <> 'trial'
    )
    and (case
      when c.cleanup_due_at > now() - interval '6 months' then 'lt_6m'
      when c.cleanup_due_at > now() - interval '1 year' then 'm6_12'
      when c.cleanup_due_at > now() - interval '3 years' then 'y1_3'
      when c.cleanup_due_at > now() - interval '6 years' then 'y3_6'
      else 'gte_6y'
    end) = any(v_bands)
  order by c.cleanup_due_at, c.user_id;

  get diagnostics v_count = row_count;
  return jsonb_build_object(
    'batch_id', v_batch,
    'status', 'review',
    'candidate_accounts', v_count,
    'execution_enabled', false
  );
end;
$$;
revoke all on function public.admin_stage_trial_cloud_cleanup(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.admin_stage_trial_cloud_cleanup(text[])
  to authenticated;

comment on function public.admin_stage_trial_cloud_cleanup(text[]) is
  'Administrator-only durable review snapshot. It never authorizes or enqueues physical deletion.';

-- Rechecked at confirmation and MUST be rechecked by the future executor.
create or replace function private.trial_cleanup_payment_safety(p_user_id uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_claim private.cloud_trial_claims%rowtype;
begin
  select * into v_claim from private.cloud_trial_claims c where c.user_id = p_user_id;
  if not found or v_claim.cleanup_due_at is null or v_claim.cleanup_due_at > now()
    then return 'not_due'; end if;
  if v_claim.cleanup_completed_at is not null or v_claim.cleanup_started_at is not null
    then return 'already_started'; end if;
  if v_claim.converted_to_paid_at is not null
    or exists (select 1 from public.membership_payments mp
      where mp.user_id = p_user_id and mp.status = 'confirmed')
    or exists (select 1 from public.user_memberships m
      where m.user_id = p_user_id and m.plan <> 'trial')
    then return 'paid'; end if;
  -- PayPal can capture a previously canceled/expired bound order.
  if exists (select 1 from public.membership_payments mp
    where mp.user_id = p_user_id
      and (mp.status in ('pending_payment', 'submitted', 'needs_update')
           or mp.provider_order_id is not null))
    then return 'payment_unresolved'; end if;
  return 'eligible';
end;
$$;
revoke all on function private.trial_cleanup_payment_safety(uuid)
  from public, anon, authenticated, service_role;

-- Inserting any new payment order defers a queued target under the same
-- per-account advisory lock used by PayPal and manual confirmation. Never
-- reject an already-captured payment here. Starting a NEW order while a
-- physical deletion is in flight is blocked before external checkout.
create or replace function private.defer_trial_cleanup_for_new_payment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || new.user_id::text, 0)
  );
  if exists (select 1 from private.trial_cloud_cleanup_targets t
    where t.user_id = new.user_id
      and t.status in ('deleting', 'awaiting_storage')) then
    raise exception 'trial_cleanup_in_progress' using errcode = 'P0001';
  end if;
  update private.trial_cloud_cleanup_targets t
  set status = case when new.status = 'confirmed' then 'skipped_paid'
                    else 'deferred_payment' end,
      last_error_code = case when new.status = 'confirmed' then 'paid'
                             else 'payment_unresolved' end,
      reservation_id = null, reservation_expires_at = null,
      preflight_checked_at = null, updated_at = now()
  where t.user_id = new.user_id and t.status in ('pending', 'reserved', 'deferred_payment');
  return new;
end;
$$;
revoke all on function private.defer_trial_cleanup_for_new_payment()
  from public, anon, authenticated, service_role;
create trigger membership_payments_defer_trial_cleanup_before_insert
  before insert on public.membership_payments
  for each row execute function private.defer_trial_cleanup_for_new_payment();

-- Existing orders are confirmed by both PayPal and manual administrator RPCs.
-- Even if a batch was queued while an order was being finalized, a successful
-- confirmation must invalidate its not-yet-running cleanup target.
create or replace function private.stop_queued_trial_cleanup_on_payment_confirmation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || new.user_id::text, 0)
  );
  update private.trial_cloud_cleanup_targets t
  set status = 'skipped_paid', last_error_code = 'paid',
      reservation_id = null, reservation_expires_at = null,
      preflight_checked_at = null, updated_at = now()
  where t.user_id = new.user_id
    and t.status in ('pending', 'reserved', 'deferred_payment');
  return new;
end;
$$;
revoke all on function private.stop_queued_trial_cleanup_on_payment_confirmation()
  from public, anon, authenticated, service_role;
create trigger membership_payments_stop_queued_cleanup_before_confirm
  before update of status on public.membership_payments
  for each row when (new.status = 'confirmed' and old.status is distinct from 'confirmed')
  execute function private.stop_queued_trial_cleanup_on_payment_confirmation();

-- A membership may also be granted through an administrator path without a new
-- order. Fence that path at the same account boundary as payment confirmation.
-- A grant cannot overtake irreversible external deletion; a grant already
-- committed before the executor's claim causes its fresh eligibility check to
-- skip the account.
create or replace function private.fence_trial_cleanup_on_membership_grant()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.plan = 'trial' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.plan is not distinct from new.plan
       and old.paid_until is not distinct from new.paid_until then
      return new;
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || new.user_id::text, 0)
  );
  if exists (select 1 from private.trial_cloud_cleanup_targets t
    where t.user_id = new.user_id
      and t.status in ('deleting', 'awaiting_storage')) then
    raise exception 'trial_cleanup_in_progress' using errcode = 'P0001';
  end if;
  update private.trial_cloud_cleanup_targets t
  set status = 'skipped_paid', last_error_code = 'membership_granted',
      reservation_id = null, reservation_expires_at = null,
      preflight_checked_at = null, updated_at = now()
  where t.user_id = new.user_id
    and t.status in ('pending', 'reserved', 'deferred_payment');
  return new;
end;
$$;
revoke all on function private.fence_trial_cleanup_on_membership_grant()
  from public, anon, authenticated, service_role;
create trigger user_memberships_fence_trial_cleanup
  before insert or update of plan, paid_until on public.user_memberships
  for each row execute function private.fence_trial_cleanup_on_membership_grant();

-- Confirmation prepares account rows only. No records, objects or queue
-- items are deleted. Real execution must remain unavailable until external
-- Storage fencing and the payment capture race have isolated QA evidence.
create or replace function public.admin_confirm_trial_cloud_cleanup(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_batch private.trial_cloud_cleanup_batches%rowtype;
  v_counts jsonb;
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select * into v_batch from private.trial_cloud_cleanup_batches
    where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found' using errcode = '22023'; end if;
  if v_batch.status <> 'review' then
    raise exception 'batch_not_reviewable' using errcode = '22023';
  end if;
  -- An order inserted after this query moves pending rows to deferred_payment
  -- through the trigger above. Executor must recheck under the account lock.
  with evaluated as (
    select t.id,
      case when exists (
        select 1 from private.trial_cloud_cleanup_targets other
        where other.user_id = t.user_id and other.batch_id <> p_batch_id
          and other.status in ('pending', 'reserved', 'deleting', 'awaiting_storage')
      ) then 'already_queued'
      else private.trial_cleanup_payment_safety(t.user_id) end as safety
    from private.trial_cloud_cleanup_targets t
    where t.batch_id = p_batch_id and t.status = 'review'
  )
  update private.trial_cloud_cleanup_targets t
  set status = case e.safety
      when 'eligible' then 'pending'
      when 'paid' then 'skipped_paid'
      when 'payment_unresolved' then 'deferred_payment'
      else 'canceled' end,
    last_error_code = case when e.safety = 'eligible' then null else e.safety end,
    updated_at = now()
  from evaluated e where t.id = e.id;

  update private.trial_cloud_cleanup_batches
  set status = 'confirmed', confirmed_at = now(), updated_at = now()
  where id = p_batch_id;

  select pg_catalog.jsonb_object_agg(status, total) into v_counts from (
    select status, count(*) as total from private.trial_cloud_cleanup_targets
    where batch_id = p_batch_id group by status
  ) t;
  return pg_catalog.jsonb_build_object('batch_id', p_batch_id,
    'status', 'confirmed', 'account_status_counts', coalesce(v_counts, '{}'::jsonb),
    'execution_enabled', false);
end;
$$;
revoke all on function public.admin_confirm_trial_cloud_cleanup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_confirm_trial_cloud_cleanup(uuid)
  to authenticated;

create or replace function public.admin_cancel_trial_cloud_cleanup(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_batch private.trial_cloud_cleanup_batches%rowtype;
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select * into v_batch from private.trial_cloud_cleanup_batches
    where id = p_batch_id for update;
  if not found or v_batch.status not in ('review', 'confirmed')
    or exists (
      select 1 from private.trial_cloud_cleanup_targets t
      where t.batch_id = p_batch_id
        and t.status in ('deleting', 'awaiting_storage')
    ) then
    raise exception 'batch_not_cancelable' using errcode = '22023';
  end if;
  update private.trial_cloud_cleanup_targets t
  set status = 'canceled', reservation_id = null,
    reservation_expires_at = null, updated_at = now()
  where t.batch_id = p_batch_id
    and t.status in ('review', 'pending', 'reserved', 'deferred_payment');
  update private.trial_cloud_cleanup_batches
  set status = 'canceled', completed_at = now(), updated_at = now()
  where id = p_batch_id;
  return pg_catalog.jsonb_build_object('batch_id', p_batch_id, 'status', 'canceled');
end;
$$;
revoke all on function public.admin_cancel_trial_cloud_cleanup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_cancel_trial_cloud_cleanup(uuid)
  to authenticated;

-- Resume accounts deferred by an unresolved order only after the order has
-- been reconciled. This cannot retry an actual Storage deletion.
create or replace function public.admin_retry_deferred_trial_cloud_cleanup(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_batch private.trial_cloud_cleanup_batches%rowtype;
  v_reviewed integer := 0;
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select * into v_batch from private.trial_cloud_cleanup_batches
    where id = p_batch_id for update;
  if not found or v_batch.status <> 'confirmed' then
    raise exception 'batch_not_retryable' using errcode = '22023';
  end if;
  with evaluated as (
    select t.id, private.trial_cleanup_payment_safety(t.user_id) as safety
    from private.trial_cloud_cleanup_targets t
    where t.batch_id = p_batch_id and t.status = 'deferred_payment'
  )
  update private.trial_cloud_cleanup_targets t
  set status = case e.safety
      when 'eligible' then 'pending'
      when 'paid' then 'skipped_paid'
      when 'payment_unresolved' then 'deferred_payment'
      else 'canceled' end,
    preflight_checked_at = null,
    last_error_code = case when e.safety = 'eligible' then null else e.safety end,
    updated_at = now()
  from evaluated e where t.id = e.id;
  get diagnostics v_reviewed = row_count;
  return pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id, 'reviewed_accounts', v_reviewed,
    'status', 'confirmed', 'execution_enabled', false);
end;
$$;
revoke all on function public.admin_retry_deferred_trial_cloud_cleanup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_retry_deferred_trial_cloud_cleanup(uuid)
  to authenticated;

-- SAFETY-ONLY incremental preflight. This cannot claim any target for
-- deletion, enqueue Storage items, or delete records. A future destructive
-- executor MUST repeat every eligibility check under the account lock.
-- We acquire target row locks with SKIP LOCKED and then try (not block on)
-- the shared payment advisory lock to avoid a lock-order inversion.
create or replace function public.preflight_trial_cloud_cleanup(
  p_batch_id uuid,
  p_limit integer default 25
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch_status text;
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_safety text;
  v_checked integer := 0;
  v_ready integer := 0;
  v_paid integer := 0;
  v_deferred integer := 0;
  v_canceled integer := 0;
  v_lock_skipped integer := 0;
  v_remaining bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  -- EXECUTE is granted only to service_role below; never to browsers.
  select b.status into v_batch_status
  from private.trial_cloud_cleanup_batches b where b.id = p_batch_id;
  if not found or v_batch_status <> 'confirmed' then
    raise exception 'batch_not_preflightable' using errcode = '22023';
  end if;

  for v_target in
    select t.* from private.trial_cloud_cleanup_targets t
    where t.batch_id = p_batch_id
      and t.status = 'pending'
      and t.preflight_checked_at is null
    order by t.cleanup_due_at, t.user_id
    limit v_limit
    for update of t skip locked
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'membership-payment:' || v_target.user_id::text, 0
      )
    ) then
      v_lock_skipped := v_lock_skipped + 1;
      continue;
    end if;

    v_safety := private.trial_cleanup_payment_safety(v_target.user_id);
    update private.trial_cloud_cleanup_targets t set
      status = case v_safety
        when 'eligible' then 'pending'
        when 'paid' then 'skipped_paid'
        when 'payment_unresolved' then 'deferred_payment'
        else 'canceled' end,
      preflight_checked_at = pg_catalog.clock_timestamp(),
      last_error_code = case when v_safety = 'eligible' then null else v_safety end,
      updated_at = now()
    where t.id = v_target.id and t.status = 'pending';
    v_checked := v_checked + 1;
    case v_safety
      when 'eligible' then v_ready := v_ready + 1;
      when 'paid' then v_paid := v_paid + 1;
      when 'payment_unresolved' then v_deferred := v_deferred + 1;
      else v_canceled := v_canceled + 1;
    end case;
  end loop;

  select count(*) into v_remaining
  from private.trial_cloud_cleanup_targets t
  where t.batch_id = p_batch_id
    and t.status = 'pending'
    and t.preflight_checked_at is null;
  return pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id,
    'checked', v_checked, 'ready', v_ready,
    'skipped_paid', v_paid, 'deferred_payment', v_deferred,
    'canceled', v_canceled, 'account_locks_busy', v_lock_skipped,
    'remaining_unchecked', v_remaining, 'execution_enabled', false
  );
end;
$$;
revoke all on function public.preflight_trial_cloud_cleanup(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.preflight_trial_cloud_cleanup(uuid, integer)
  to service_role;

-- The first phase of an executor is a REVOCABLE reservation, never a claim
-- for physical deletion. Expired reservations can be safely replaced because
-- no function in this migration can transition 'reserved' to 'deleting' or
-- return Storage paths for removal.
--
-- Acquire the target row with SKIP LOCKED, then TRY the payment lock: a
-- blocking payment lock would invert the lock ordering in PayPal confirmation.
create or replace function public.reserve_trial_cloud_cleanup_target(
  p_batch_id uuid, p_scan_limit integer default 25
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_batch_status text;
  v_safety text;
  v_reservation uuid;
  v_expires timestamptz;
  v_busy integer := 0;
  v_examined integer := 0;
  v_limit integer := least(greatest(coalesce(p_scan_limit, 25), 1), 50);
begin
  select b.status into v_batch_status from private.trial_cloud_cleanup_batches b
  where b.id = p_batch_id;
  if not found or v_batch_status <> 'confirmed' then
    raise exception 'batch_not_reservable' using errcode = '22023';
  end if;

  for v_target in
    select t.* from private.trial_cloud_cleanup_targets t
    where t.batch_id = p_batch_id
      and t.preflight_checked_at is not null
      and (t.status = 'pending'
        or (t.status = 'reserved'
          and t.reservation_expires_at < pg_catalog.clock_timestamp()))
    order by t.cleanup_due_at, t.user_id
    limit v_limit
    for update of t skip locked
  loop
    v_examined := v_examined + 1;
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
    ) then
      v_busy := v_busy + 1;
      continue;
    end if;
    v_safety := private.trial_cleanup_payment_safety(v_target.user_id);
    if v_safety <> 'eligible' then
      update private.trial_cloud_cleanup_targets t set
        status = case v_safety
          when 'paid' then 'skipped_paid'
          when 'payment_unresolved' then 'deferred_payment'
          else 'canceled' end,
        reservation_id = null, reservation_expires_at = null,
        last_error_code = v_safety, updated_at = now()
      where t.id = v_target.id;
      continue;
    end if;

    v_reservation := gen_random_uuid();
    v_expires := pg_catalog.clock_timestamp() + interval '10 minutes';
    update private.trial_cloud_cleanup_targets t set
      status = 'reserved', reservation_id = v_reservation,
      reservation_expires_at = v_expires,
      last_error_code = null, attempts = t.attempts + 1,
      updated_at = now()
    where t.id = v_target.id;

    return pg_catalog.jsonb_build_object(
      'reserved', true,
      'target_id', v_target.id,
      'reservation_id', v_reservation,
      'reservation_expires_at', v_expires,
      'execution_enabled', false
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'reserved', false, 'examined', v_examined,
    'account_locks_busy', v_busy, 'execution_enabled', false
  );
end;
$$;
revoke all on function public.reserve_trial_cloud_cleanup_target(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_trial_cloud_cleanup_target(uuid, integer)
  to service_role;

-- Releasing the exact reservation is idempotent. Stale worker tokens cannot
-- reset another worker's reservation or reverse a paid membership grant.
create or replace function public.release_trial_cloud_cleanup_reservation(
  p_target_id uuid, p_reservation_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_updated integer;
begin
  update private.trial_cloud_cleanup_targets t
  set status = 'pending', reservation_id = null,
    reservation_expires_at = null, preflight_checked_at = null,
    updated_at = now()
  where t.id = p_target_id and t.status = 'reserved'
    and t.reservation_id = p_reservation_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;
revoke all on function public.release_trial_cloud_cleanup_reservation(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.release_trial_cloud_cleanup_reservation(uuid, uuid)
  to service_role;

create or replace function public.admin_trial_cloud_cleanup_progress(p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_status text; v_counts jsonb;
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select status into v_status from private.trial_cloud_cleanup_batches
    where id = p_batch_id;
  if not found then raise exception 'batch_not_found' using errcode = '22023'; end if;
  select pg_catalog.jsonb_object_agg(status, count_rows) into v_counts from (
    select status, count(*) as count_rows from private.trial_cloud_cleanup_targets
    where batch_id = p_batch_id group by status
  ) rows;
  return pg_catalog.jsonb_build_object('batch_id', p_batch_id, 'status', v_status,
    'account_status_counts', coalesce(v_counts, '{}'::jsonb), 'execution_enabled', false);
end;
$$;
revoke all on function public.admin_trial_cloud_cleanup_progress(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_trial_cloud_cleanup_progress(uuid)
  to authenticated;

-- Read-only, per-target deletion inventory. Never returns object paths to
-- clients and never asserts actual R2/Storage bytes: media.size_bytes is
-- application metadata, not measured physical storage usage.
-- Cross-account shared path ownership still requires separate adjudication
-- before any physical deletion; therefore safe_to_delete is always false.
create or replace function public.inspect_trial_cloud_cleanup_target(p_target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_safety text;
  v_paths integer;
  v_unsafe integer;
  v_unresolved integer;
  v_owner_mismatch integer;
begin
  select * into v_target from private.trial_cloud_cleanup_targets t
  where t.id = p_target_id;
  if not found then raise exception 'target_not_found' using errcode = '22023'; end if;
  v_safety := private.trial_cleanup_payment_safety(v_target.user_id);
  if v_target.status <> 'pending'
    or v_target.preflight_checked_at is null
    or v_safety <> 'eligible' then
    return pg_catalog.jsonb_build_object(
      'target_id', p_target_id, 'eligible', false,
      'eligibility', v_safety, 'safe_to_delete', false);
  end if;

  with path_sources as (
    select a.cover_image_path as raw_path, a.cover_image_url as raw_url
    from public.archives a where a.user_id = v_target.user_id
    union all
    select a.cover_thumb_path, null::text
    from public.archives a where a.user_id = v_target.user_id
    union all
    select r.primary_image_path, r.primary_image_url
    from public.records r where r.user_id = v_target.user_id
    union all
    select r.primary_thumb_path, null::text
    from public.records r where r.user_id = v_target.user_id
    union all
    select m.storage_path, m.url
    from public.media m where m.user_id = v_target.user_id
    union all
    select m.thumb_path, m.thumb_url
    from public.media m where m.user_id = v_target.user_id
    union all
    select mp.cover_image_path, mp.cover_image_url
    from public.market_posts mp where mp.user_id = v_target.user_id
    union all
    select mp.cover_thumb_path, mp.cover_thumb_url
    from public.market_posts mp where mp.user_id = v_target.user_id
    union all
    select mm.path, mm.url
    from public.market_media mm where mm.user_id = v_target.user_id
    union all
    select mm.thumb_path, mm.thumb_url
    from public.market_media mm where mm.user_id = v_target.user_id
  ), normalized as (
    -- Audit a path column AND its URL independently. Otherwise a valid path
    -- masks a malformed or foreign-account URL on the very same row.
    select nullif(pg_catalog.btrim(raw_path), '') as path,
      null::text as raw_url
    from path_sources where nullif(pg_catalog.btrim(raw_path), '') is not null
    union all
    select public.media_object_path_from_public_url(raw_url) as path,
      raw_url
    from path_sources where nullif(pg_catalog.btrim(raw_url), '') is not null
  )
  select
    count(distinct path) filter (where path is not null)::integer,
    count(*) filter (
      where path is not null and (
        pg_catalog.left(path, pg_catalog.length(v_target.user_id::text) + 1)
          <> v_target.user_id::text || '/'
        or path ~ '(^|/)\.\.?(?:/|$)'
        or position(chr(92) in path) > 0
      )
    )::integer,
    count(*) filter (
      where path is null and nullif(pg_catalog.btrim(raw_url), '') is not null
    )::integer
  into v_paths, v_unsafe, v_unresolved
  from normalized;

  select
    (
      select count(*) from public.records r
      left join public.archives a on a.id = r.archive_id
      where r.user_id = v_target.user_id
        and (a.id is null or a.user_id is distinct from v_target.user_id)
    ) +
    (
      select count(*) from public.media m
      left join public.records r on r.id = m.record_id
      where m.user_id = v_target.user_id
        and (r.id is null or r.user_id is distinct from v_target.user_id)
    ) +
    (
      select count(*) from public.market_media mm
      left join public.market_posts mp on mp.id = mm.market_post_id
      where mm.user_id = v_target.user_id
        and (mp.id is null or mp.user_id is distinct from v_target.user_id)
    )
  into v_owner_mismatch;

  return pg_catalog.jsonb_build_object(
    'target_id', p_target_id,
    'eligible', true, 'eligibility', v_safety,
    'projects', (select count(*) from public.archives a
      where a.user_id = v_target.user_id),
    'records', (select count(*) from public.records r
      where r.user_id = v_target.user_id),
    'photos', (select count(*) from public.media m
      where m.user_id = v_target.user_id and m.type = 'image'),
    'market_posts', (select count(*) from public.market_posts mp
      where mp.user_id = v_target.user_id),
    'market_media', (select count(*) from public.market_media mm
      where mm.user_id = v_target.user_id),
    'candidate_storage_paths', v_paths,
    'unsafe_path_references', v_unsafe,
    'unresolved_url_references', v_unresolved,
    'owner_chain_mismatches', v_owner_mismatch,
    'registered_photo_bytes', (select coalesce(sum(m.size_bytes), 0)
      from public.media m
      where m.user_id = v_target.user_id and m.type = 'image'),
    'capacity_measurement', 'application_metadata_only',
    'safe_to_delete', false
  );
end;
$$;
revoke all on function public.inspect_trial_cloud_cleanup_target(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.inspect_trial_cloud_cleanup_target(uuid)
  to service_role;

-- Centralized inventory of every media-reference column. This is intentionally
-- not callable by a web user. Raw paths and URL-derived paths are independent
-- references: a valid path must not conceal an invalid or shared URL.
create or replace function private.trial_cleanup_all_media_paths()
returns table(owner_user_id uuid, object_path text, bad_reference boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
  with sources as (
    select a.user_id, a.cover_image_path as raw_path, a.cover_image_url as raw_url from public.archives a
    union all select a.user_id, a.cover_thumb_path, null::text from public.archives a
    union all select r.user_id, r.primary_image_path, r.primary_image_url from public.records r
    union all select r.user_id, r.primary_thumb_path, null::text from public.records r
    union all select m.user_id, m.storage_path, m.url from public.media m
    union all select m.user_id, m.thumb_path, m.thumb_url from public.media m
    union all select mp.user_id, mp.cover_image_path, mp.cover_image_url from public.market_posts mp
    union all select mp.user_id, mp.cover_thumb_path, mp.cover_thumb_url from public.market_posts mp
    union all select mm.user_id, mm.path, mm.url from public.market_media mm
    union all select mm.user_id, mm.thumb_path, mm.thumb_url from public.market_media mm
  )
  select s.user_id, nullif(pg_catalog.btrim(s.raw_path), ''),
    (s.raw_path is distinct from pg_catalog.btrim(s.raw_path))
  from sources s where s.raw_path is not null and s.raw_path <> ''
  union all
  select s.user_id, public.media_object_path_from_public_url(s.raw_url),
    public.media_object_path_from_public_url(s.raw_url) is null
  from sources s where s.raw_url is not null and pg_catalog.btrim(s.raw_url) <> '';
end;
$$;
revoke all on function private.trial_cleanup_all_media_paths()
  from public, anon, authenticated, service_role;

-- Prepare a durable, read-only plan; never remove objects. The storage queue
-- remains protected by the trial_admin hard block and safe_to_delete=false.
-- Real deletion additionally needs an external-object fencing protocol, fresh
-- per-object reference checks, and an isolated QA proof of payment races.
create or replace function public.prepare_trial_cloud_cleanup_storage_plan(
  p_target_id uuid, p_reservation_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_batch_status text;
  v_unsafe bigint := 0;
  v_shared bigint := 0;
  v_owner_mismatch bigint := 0;
  v_planned bigint := 0;
  v_safety text;
begin
  select * into v_target from private.trial_cloud_cleanup_targets t
  where t.id = p_target_id for update;
  if not found or v_target.status <> 'reserved'
    or v_target.reservation_id is distinct from p_reservation_id
    or v_target.reservation_expires_at <= pg_catalog.clock_timestamp()
    or v_target.reservation_expires_at is null then
    return pg_catalog.jsonb_build_object(
      'prepared', false, 'reason', 'invalid_reservation', 'safe_to_delete', false);
  end if;
  select b.status into v_batch_status from private.trial_cloud_cleanup_batches b
  where b.id = v_target.batch_id;
  if v_batch_status <> 'confirmed' or v_batch_status is null then
    return pg_catalog.jsonb_build_object(
      'prepared', false, 'reason', 'inactive_batch', 'safe_to_delete', false);
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'prepared', false, 'reason', 'payment_lock_busy', 'safe_to_delete', false);
  end if;
  v_safety := private.trial_cleanup_payment_safety(v_target.user_id);
  if v_safety <> 'eligible' or v_target.preflight_checked_at is null then
    return pg_catalog.jsonb_build_object(
      'prepared', false, 'reason', v_safety, 'safe_to_delete', false);
  end if;

  select count(*) into v_unsafe from private.trial_cleanup_all_media_paths() p
  where p.owner_user_id = v_target.user_id
    and (
      p.bad_reference or p.object_path is null
      or pg_catalog.left(p.object_path, pg_catalog.length(v_target.user_id::text) + 1)
         <> v_target.user_id::text || '/'
      or p.object_path ~ '(^|/)\.\.?(?:/|$)'
      or position(chr(92) in p.object_path) > 0
      or position('%' in p.object_path) > 0
      or position('?' in p.object_path) > 0
      or position('#' in p.object_path) > 0
    );

  select count(distinct x.object_path) into v_shared
  from private.trial_cleanup_all_media_paths() x
  where x.owner_user_id = v_target.user_id and x.object_path is not null
    and exists (
      select 1 from private.trial_cleanup_all_media_paths() other
      where other.owner_user_id is distinct from v_target.user_id
        and other.object_path = x.object_path
    );

  select
    (select count(*) from public.records r
       left join public.archives a on a.id = r.archive_id
       where r.user_id = v_target.user_id
         and (a.id is null or a.user_id is distinct from v_target.user_id))
    +
    (select count(*) from public.media m
       left join public.records r on r.id = m.record_id
       where m.user_id = v_target.user_id
         and (r.id is null or r.user_id is distinct from v_target.user_id))
    +
    (select count(*) from public.market_media mm
       left join public.market_posts mp on mp.id = mm.market_post_id
       where mm.user_id = v_target.user_id
         and (mp.id is null or mp.user_id is distinct from v_target.user_id))
    into v_owner_mismatch;

  if v_unsafe > 0 or v_shared > 0 or v_owner_mismatch > 0 then
    return pg_catalog.jsonb_build_object(
      'prepared', false, 'reason', 'unsafe_references',
      'unsafe_reference_count', v_unsafe,
      'shared_path_count', v_shared,
      'owner_mismatch_count', v_owner_mismatch,
      'safe_to_delete', false);
  end if;

  insert into private.trial_cloud_cleanup_storage_plan (
    target_id, reservation_id, bucket_id, object_path
  )
  select distinct p_target_id, p_reservation_id, 'media', p.object_path
  from private.trial_cleanup_all_media_paths() p
  where p.owner_user_id = v_target.user_id and p.object_path is not null
  on conflict do nothing;

  select count(*) into v_planned from private.trial_cloud_cleanup_storage_plan p
  where p.target_id = p_target_id and p.reservation_id = p_reservation_id;
  return pg_catalog.jsonb_build_object(
    'prepared', true, 'target_id', p_target_id,
    'reservation_id', p_reservation_id,
    'planned_object_count', v_planned,
    'safe_to_delete', false);
end;
$$;
revoke all on function public.prepare_trial_cloud_cleanup_storage_plan(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_trial_cloud_cleanup_storage_plan(uuid, uuid)
  to service_role;

commit;
