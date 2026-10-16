-- PR #95: persistent fence from a revocable reservation to irreversible
-- trial-cloud deletion. Not applied. Does not enable the admin button,
-- Cron, or the generic Storage worker. trial_admin rows remain blocked
-- in storage_deletion_items; this ledger is a separate object journal.
begin;

create table private.trial_cloud_cleanup_fences (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null unique
    references private.trial_cloud_cleanup_targets(id) on delete restrict,
  reservation_id uuid not null,
  status text not null
    check (status in ('storage', 'database', 'closed', 'halted_paid')),
  object_count integer not null check (object_count >= 0),
  committed_at timestamptz not null default now(),
  closed_at timestamptz,
  last_error_code text
);

create table private.trial_cloud_cleanup_object_work (
  fence_id uuid not null
    references private.trial_cloud_cleanup_fences(id) on delete restrict,
  bucket_id text not null check (bucket_id = 'media'),
  object_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'deleted', 'failed')),
  claim_token uuid,
  claim_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  deleted_at timestamptz,
  primary key (fence_id, bucket_id, object_path),
  constraint trial_cleanup_object_claim_state_check check (
    (status = 'claimed' and claim_token is not null and claim_expires_at is not null)
    or (status <> 'claimed' and claim_token is null and claim_expires_at is null)
  )
);

alter table private.trial_cloud_cleanup_fences enable row level security;
alter table private.trial_cloud_cleanup_object_work enable row level security;
revoke all on private.trial_cloud_cleanup_fences
  from public, anon, authenticated, service_role;
revoke all on private.trial_cloud_cleanup_object_work
  from public, anon, authenticated, service_role;

-- Null means the saved plan still matches this account and is not shared.
create or replace function private.trial_cleanup_plan_block(
  p_target_id uuid, p_reservation_id uuid, p_user_id uuid
) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_unsafe bigint;
  v_shared bigint;
  v_owner_mismatch bigint;
  v_current bigint;
  v_planned bigint;
  v_missing bigint;
  v_extra bigint;
begin
  select count(*) into v_unsafe from private.trial_cleanup_all_media_paths() p
  where p.owner_user_id = p_user_id
    and (
      p.bad_reference or p.object_path is null
      or pg_catalog.left(p.object_path, pg_catalog.length(p_user_id::text) + 1)
         <> p_user_id::text || '/'
      or p.object_path ~ '(^|/)\.\.?(?:/|$)'
      or position(chr(92) in p.object_path) > 0
      or position('%' in p.object_path) > 0
      or position('?' in p.object_path) > 0
      or position('#' in p.object_path) > 0
    );
  if v_unsafe > 0 then return 'unsafe_references'; end if;

  select count(distinct x.object_path) into v_shared
  from private.trial_cleanup_all_media_paths() x
  where x.owner_user_id = p_user_id and x.object_path is not null
    and exists (
      select 1 from private.trial_cleanup_all_media_paths() other
      where other.owner_user_id is distinct from p_user_id
        and other.object_path = x.object_path
    );
  if v_shared > 0 then return 'shared_path'; end if;

  select
    (select count(*) from public.records r
       left join public.archives a on a.id = r.archive_id
       where r.user_id = p_user_id
         and (a.id is null or a.user_id is distinct from p_user_id))
    +
    (select count(*) from public.media m
       left join public.records r on r.id = m.record_id
       where m.user_id = p_user_id
         and (r.id is null or r.user_id is distinct from p_user_id))
    +
    (select count(*) from public.market_media mm
       left join public.market_posts mp on mp.id = mm.market_post_id
       where mm.user_id = p_user_id
         and (mp.id is null or mp.user_id is distinct from p_user_id))
  into v_owner_mismatch;
  if v_owner_mismatch > 0 then return 'owner_mismatch'; end if;

  select count(distinct p.object_path) into v_current
  from private.trial_cleanup_all_media_paths() p
  where p.owner_user_id = p_user_id and p.object_path is not null;

  select count(*) into v_planned
  from private.trial_cloud_cleanup_storage_plan s
  where s.target_id = p_target_id and s.reservation_id = p_reservation_id;

  select count(*) into v_missing
  from (
    select distinct p.object_path as object_path
    from private.trial_cleanup_all_media_paths() p
    where p.owner_user_id = p_user_id and p.object_path is not null
  ) current_paths
  where not exists (
    select 1 from private.trial_cloud_cleanup_storage_plan s
    where s.target_id = p_target_id and s.reservation_id = p_reservation_id
      and s.object_path = current_paths.object_path
  );

  select count(*) into v_extra
  from private.trial_cloud_cleanup_storage_plan s
  where s.target_id = p_target_id and s.reservation_id = p_reservation_id
    and not exists (
      select 1 from private.trial_cleanup_all_media_paths() p
      where p.owner_user_id = p_user_id and p.object_path = s.object_path
    );

  if v_current <> v_planned or v_missing > 0 or v_extra > 0 then
    return 'plan_stale';
  end if;
  return null;
end;
$$;
revoke all on function private.trial_cleanup_plan_block(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Ignores cleanup_started_at. Once a fence exists, "already started" must
-- not be treated as a reason to continue, nor as permission to delete Plus.
create or replace function private.trial_cleanup_payment_still_absent(p_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from private.cloud_trial_claims c
    where c.user_id = p_user_id and c.converted_to_paid_at is not null
  ) then return false; end if;
  if exists (
    select 1 from public.membership_payments mp
    where mp.user_id = p_user_id and mp.status = 'confirmed'
  ) then return false; end if;
  if exists (
    select 1 from public.user_memberships m
    where m.user_id = p_user_id and m.plan <> 'trial'
  ) then return false; end if;
  if exists (
    select 1 from public.membership_payments mp
    where mp.user_id = p_user_id
      and (mp.status in ('pending_payment', 'submitted', 'needs_update')
           or mp.provider_order_id is not null)
  ) then return false; end if;
  return true;
end;
$$;
revoke all on function private.trial_cleanup_payment_still_absent(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.trial_cleanup_halt_for_payment(
  p_target_id uuid, p_fence_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update private.trial_cloud_cleanup_fences f
  set status = 'halted_paid', last_error_code = 'payment_conflict'
  where f.id = p_fence_id and f.status in ('storage', 'database');
  update private.trial_cloud_cleanup_targets t
  set last_error_code = 'payment_conflict', updated_at = now()
  where t.id = p_target_id
    and t.status in ('deleting', 'awaiting_storage');
end;
$$;
revoke all on function private.trial_cleanup_halt_for_payment(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Leaves the revocable reservation untouched unless every check passes.
-- The status change and the object ledger commit in the same transaction.
create or replace function public.commit_trial_cloud_cleanup_fence(
  p_target_id uuid, p_reservation_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_batch_status text;
  v_safety text;
  v_block text;
  v_fence uuid;
  v_count integer := 0;
  v_claim_updated integer := 0;
  v_status text;
begin
  select t.batch_id into v_target.batch_id
  from private.trial_cloud_cleanup_targets t where t.id = p_target_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'committed', false, 'reason', 'invalid_reservation',
      'irreversible', false, 'admin_execution_enabled', false);
  end if;

  select b.status into v_batch_status
  from private.trial_cloud_cleanup_batches b
  where b.id = v_target.batch_id for update;
  select * into v_target from private.trial_cloud_cleanup_targets t
  where t.id = p_target_id for update;
  if not found or v_target.reservation_id is distinct from p_reservation_id then
    return pg_catalog.jsonb_build_object(
      'committed', false, 'reason', 'invalid_reservation',
      'irreversible', false, 'admin_execution_enabled', false);
  end if;
  -- A committed fence whose response was lost must resume, not start another.
  if v_target.status in ('deleting', 'awaiting_storage') then
    select f.id, f.object_count, f.status into v_fence, v_count, v_status
    from private.trial_cloud_cleanup_fences f
    where f.target_id = v_target.id and f.reservation_id = p_reservation_id;
    if v_status = 'halted_paid' then
      return pg_catalog.jsonb_build_object(
        'committed', false, 'reason', 'payment_conflict',
        'irreversible', true, 'admin_execution_enabled', false);
    end if;
    if v_fence is not null then
      return pg_catalog.jsonb_build_object(
        'committed', true, 'already_recorded', true, 'fence_id', v_fence,
        'target_id', v_target.id, 'object_count', v_count,
        'target_status', v_target.status, 'irreversible', true,
        'admin_execution_enabled', false);
    end if;
  end if;
  if v_target.status <> 'reserved'
    or v_target.reservation_expires_at is null
    or v_target.reservation_expires_at <= pg_catalog.clock_timestamp()
    or v_target.preflight_checked_at is null then
    return pg_catalog.jsonb_build_object(
      'committed', false, 'reason', 'invalid_reservation',
      'irreversible', false, 'admin_execution_enabled', false);
  end if;
  if v_batch_status is null or v_batch_status not in ('confirmed', 'running') then
    return pg_catalog.jsonb_build_object(
      'committed', false, 'reason', 'inactive_batch',
      'irreversible', false, 'admin_execution_enabled', false);
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'committed', false, 'reason', 'payment_lock_busy',
      'irreversible', false, 'admin_execution_enabled', false);
  end if;

  v_safety := private.trial_cleanup_payment_safety(v_target.user_id);
  if not private.trial_cleanup_payment_still_absent(v_target.user_id) then
    v_safety := case when v_safety = 'payment_unresolved' then v_safety else 'paid' end;
  end if;
  if v_safety <> 'eligible' then
    update private.trial_cloud_cleanup_targets t set
      status = case v_safety
        when 'paid' then 'skipped_paid'
        when 'payment_unresolved' then 'deferred_payment'
        else 'canceled' end,
      reservation_id = null, reservation_expires_at = null,
      last_error_code = v_safety, updated_at = now()
    where t.id = v_target.id and t.status = 'reserved';
    return pg_catalog.jsonb_build_object(
      'committed', false, 'reason', v_safety,
      'irreversible', false, 'admin_execution_enabled', false);
  end if;

  v_block := private.trial_cleanup_plan_block(
    v_target.id, p_reservation_id, v_target.user_id);
  if v_block is not null then
    return pg_catalog.jsonb_build_object(
      'committed', false, 'reason', v_block,
      'irreversible', false, 'admin_execution_enabled', false);
  end if;

  insert into private.trial_cloud_cleanup_fences (
    target_id, reservation_id, status, object_count
  )
  select v_target.id, p_reservation_id,
    case when count(*) = 0 then 'database' else 'storage' end,
    count(*)::integer
  from private.trial_cloud_cleanup_storage_plan s
  where s.target_id = v_target.id and s.reservation_id = p_reservation_id
  returning id, object_count, status into v_fence, v_count, v_status;

  insert into private.trial_cloud_cleanup_object_work (
    fence_id, bucket_id, object_path
  )
  select v_fence, s.bucket_id, s.object_path
  from private.trial_cloud_cleanup_storage_plan s
  where s.target_id = v_target.id and s.reservation_id = p_reservation_id;

  update private.trial_cloud_cleanup_targets t
  set status = case when v_count = 0 then 'awaiting_storage' else 'deleting' end,
    last_error_code = null, updated_at = now()
  where t.id = v_target.id and t.status = 'reserved'
    and t.reservation_id = p_reservation_id;
  if not found then
    raise exception 'trial_cleanup_fence_lost_reservation' using errcode = 'P0001';
  end if;

  update private.cloud_trial_claims c
  set cleanup_started_at = coalesce(c.cleanup_started_at, pg_catalog.clock_timestamp()),
    cleanup_last_attempt_at = pg_catalog.clock_timestamp(),
    cleanup_attempt_count = c.cleanup_attempt_count + 1,
    cleanup_last_error_code = null,
    updated_at = pg_catalog.clock_timestamp()
  where c.user_id = v_target.user_id
    and c.cleanup_completed_at is null
    and c.converted_to_paid_at is null
    and c.cleanup_due_at <= now();
  get diagnostics v_claim_updated = row_count;
  if v_claim_updated <> 1 then
    raise exception 'trial_cleanup_claim_not_exclusive' using errcode = 'P0001';
  end if;

  update private.trial_cloud_cleanup_batches b
  set status = 'running', updated_at = now()
  where b.id = v_target.batch_id and b.status in ('confirmed', 'running');

  return pg_catalog.jsonb_build_object(
    'committed', true, 'fence_id', v_fence, 'target_id', v_target.id,
    'object_count', v_count, 'target_status',
    case when v_count = 0 then 'awaiting_storage' else 'deleting' end,
    'irreversible', true, 'admin_execution_enabled', false);
end;
$$;
revoke all on function public.commit_trial_cloud_cleanup_fence(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.commit_trial_cloud_cleanup_fence(uuid, uuid)
  to service_role;

create or replace function public.claim_trial_cloud_cleanup_storage_object(
  p_fence_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_fence private.trial_cloud_cleanup_fences%rowtype;
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_work private.trial_cloud_cleanup_object_work%rowtype;
  v_token uuid;
  v_expires timestamptz;
  v_shared boolean;
begin
  select * into v_fence from private.trial_cloud_cleanup_fences f
  where f.id = p_fence_id for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'invalid_fence', 'admin_execution_enabled', false);
  end if;
  select * into v_target from private.trial_cloud_cleanup_targets t
  where t.id = v_fence.target_id for update;
  if v_fence.status = 'halted_paid' then
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;
  if v_fence.status <> 'storage' or v_target.status <> 'deleting' then
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'not_deleting', 'admin_execution_enabled', false);
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'payment_lock_busy', 'admin_execution_enabled', false);
  end if;
  if not private.trial_cleanup_payment_still_absent(v_target.user_id) then
    perform private.trial_cleanup_halt_for_payment(v_target.id, v_fence.id);
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;

  select * into v_work from private.trial_cloud_cleanup_object_work w
  where w.fence_id = p_fence_id and w.attempts < 8
    and (
      w.status in ('pending', 'failed')
      or (w.status = 'claimed' and w.claim_expires_at <= pg_catalog.clock_timestamp())
    )
  order by w.object_path
  limit 1
  for update of w skip locked;
  if not found then
    if exists (
      select 1 from private.trial_cloud_cleanup_object_work w
      where w.fence_id = p_fence_id and w.status = 'failed' and w.attempts >= 8
    ) then
      return pg_catalog.jsonb_build_object(
        'claimed', false, 'reason', 'retry_exhausted', 'admin_execution_enabled', false);
    end if;
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'idle', 'admin_execution_enabled', false);
  end if;

  if pg_catalog.left(v_work.object_path, pg_catalog.length(v_target.user_id::text) + 1)
       <> v_target.user_id::text || '/'
     or v_work.object_path ~ '(^|/)\.\.?(?:/|$)'
     or position(chr(92) in v_work.object_path) > 0
     or position('%' in v_work.object_path) > 0
     or position('?' in v_work.object_path) > 0
     or position('#' in v_work.object_path) > 0 then
    update private.trial_cloud_cleanup_object_work w
    set status = 'failed', claim_token = null, claim_expires_at = null,
      attempts = 8, last_error_code = 'unsafe_path'
    where w.fence_id = v_work.fence_id and w.object_path = v_work.object_path;
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'unsafe_path', 'admin_execution_enabled', false);
  end if;

  select exists (
    select 1 from private.trial_cleanup_all_media_paths() other
    where other.owner_user_id is distinct from v_target.user_id
      and other.object_path = v_work.object_path
  ) into v_shared;
  -- A path that no longer has a database reference still belongs to this
  -- account by prefix and is not referenced by anyone else, so it may be removed.
  -- A path that gained another owner must not be handed to the deleter.
  if v_shared then
    update private.trial_cloud_cleanup_object_work w
    set status = 'failed', claim_token = null, claim_expires_at = null,
      attempts = 8, last_error_code = 'shared_path'
    where w.fence_id = v_work.fence_id and w.object_path = v_work.object_path;
    return pg_catalog.jsonb_build_object(
      'claimed', false, 'reason', 'shared_path', 'admin_execution_enabled', false);
  end if;

  v_token := gen_random_uuid();
  v_expires := pg_catalog.clock_timestamp() + interval '2 minutes';
  update private.trial_cloud_cleanup_object_work w
  set status = 'claimed', claim_token = v_token, claim_expires_at = v_expires,
    attempts = w.attempts + 1, last_error_code = null
  where w.fence_id = v_work.fence_id and w.bucket_id = v_work.bucket_id
    and w.object_path = v_work.object_path;
  return pg_catalog.jsonb_build_object(
    'claimed', true, 'fence_id', p_fence_id, 'target_id', v_target.id,
    'owner_user_id', v_target.user_id, 'bucket_id', v_work.bucket_id,
    'object_path', v_work.object_path, 'claim_token', v_token,
    'claim_expires_at', v_expires, 'admin_execution_enabled', false);
end;
$$;
revoke all on function public.claim_trial_cloud_cleanup_storage_object(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_trial_cloud_cleanup_storage_object(uuid)
  to service_role;

create or replace function public.complete_trial_cloud_cleanup_storage_object(
  p_fence_id uuid, p_object_path text, p_claim_token uuid, p_result text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_fence private.trial_cloud_cleanup_fences%rowtype;
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_work private.trial_cloud_cleanup_object_work%rowtype;
  v_remaining integer;
begin
  if p_result not in ('deleted', 'not_found') then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'invalid_result', 'admin_execution_enabled', false);
  end if;
  select * into v_fence from private.trial_cloud_cleanup_fences f
  where f.id = p_fence_id for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'invalid_fence', 'admin_execution_enabled', false);
  end if;
  select * into v_target from private.trial_cloud_cleanup_targets t
  where t.id = v_fence.target_id for update;
  select * into v_work from private.trial_cloud_cleanup_object_work w
  where w.fence_id = p_fence_id and w.object_path = p_object_path for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'invalid_object', 'admin_execution_enabled', false);
  end if;
  if v_work.status = 'deleted' then
    return pg_catalog.jsonb_build_object(
      'completed', true, 'already_recorded', true, 'admin_execution_enabled', false);
  end if;
  if v_fence.status = 'halted_paid' then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;
  if v_work.status <> 'claimed' or v_work.claim_token is distinct from p_claim_token
    or v_work.claim_expires_at is null
    or v_work.claim_expires_at <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'claim_mismatch', 'admin_execution_enabled', false);
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'payment_lock_busy', 'admin_execution_enabled', false);
  end if;
  if not private.trial_cleanup_payment_still_absent(v_target.user_id) then
    perform private.trial_cleanup_halt_for_payment(v_target.id, v_fence.id);
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;

  update private.trial_cloud_cleanup_object_work w
  set status = 'deleted', claim_token = null, claim_expires_at = null,
    last_error_code = null, deleted_at = pg_catalog.clock_timestamp()
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.claim_token = p_claim_token and w.status = 'claimed';

  select count(*) into v_remaining
  from private.trial_cloud_cleanup_object_work w
  where w.fence_id = p_fence_id and w.status <> 'deleted';
  if v_remaining = 0 then
    update private.trial_cloud_cleanup_fences f
    set status = 'database', last_error_code = null
    where f.id = p_fence_id and f.status = 'storage';
    update private.trial_cloud_cleanup_targets t
    set status = 'awaiting_storage', last_error_code = null, updated_at = now()
    where t.id = v_target.id and t.status = 'deleting';
  end if;
  return pg_catalog.jsonb_build_object(
    'completed', true, 'remaining_objects', v_remaining,
    'result', p_result, 'admin_execution_enabled', false);
end;
$$;
revoke all on function public.complete_trial_cloud_cleanup_storage_object(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_trial_cloud_cleanup_storage_object(uuid, text, uuid, text)
  to service_role;

create or replace function public.fail_trial_cloud_cleanup_storage_object(
  p_fence_id uuid, p_object_path text, p_claim_token uuid, p_error_code text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$' then
    return pg_catalog.jsonb_build_object(
      'failed', false, 'reason', 'invalid_error_code', 'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_object_work w
  set status = 'failed', claim_token = null, claim_expires_at = null,
    last_error_code = p_error_code
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.status = 'claimed' and w.claim_token = p_claim_token
    and w.claim_expires_at > pg_catalog.clock_timestamp();
  get diagnostics v_updated = row_count;
  return pg_catalog.jsonb_build_object(
    'failed', v_updated = 1,
    'reason', case when v_updated = 1 then p_error_code else 'claim_mismatch' end,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.fail_trial_cloud_cleanup_storage_object(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_trial_cloud_cleanup_storage_object(uuid, text, uuid, text)
  to service_role;

-- Removes one account's cloud projects, records, photos and market rows.
-- Account, profile, payment, membership and every other user's rows stay.
create or replace function private.trial_cleanup_delete_owned_cloud_rows(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if to_regclass('public.comments') is not null then
    delete from public.comments c
    where c.record_id in (
      select r.id from public.records r where r.user_id = p_user_id
    );
  end if;
  if to_regclass('public.record_likes') is not null then
    delete from public.record_likes rl
    where rl.record_id in (
      select r.id from public.records r where r.user_id = p_user_id
    );
  end if;
  if to_regclass('public.archive_follows') is not null then
    delete from public.archive_follows af
    where af.archive_id in (
      select a.id from public.archives a where a.user_id = p_user_id
    );
  end if;
  if to_regclass('public.market_comments') is not null then
    delete from public.market_comments mc
    where mc.market_post_id in (
      select mp.id from public.market_posts mp where mp.user_id = p_user_id
    );
  end if;
  if to_regclass('public.market_media') is not null then
    delete from public.market_media where user_id = p_user_id;
  end if;
  if to_regclass('public.market_posts') is not null then
    delete from public.market_posts where user_id = p_user_id;
  end if;
  if to_regclass('public.media') is not null then
    delete from public.media where user_id = p_user_id;
  end if;
  if to_regclass('public.records') is not null then
    delete from public.records where user_id = p_user_id;
  end if;
  if to_regclass('public.archives') is not null then
    delete from public.archives where user_id = p_user_id;
  end if;
end;
$$;
revoke all on function private.trial_cleanup_delete_owned_cloud_rows(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.close_trial_cloud_cleanup_database(
  p_target_id uuid, p_fence_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_fence private.trial_cloud_cleanup_fences%rowtype;
  v_open integer;
  v_claim_updated integer := 0;
  v_closed boolean := false;
begin
  select * into v_fence from private.trial_cloud_cleanup_fences f
  where f.id = p_fence_id and f.target_id = p_target_id for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'invalid_fence', 'admin_execution_enabled', false);
  end if;
  select * into v_target from private.trial_cloud_cleanup_targets t
  where t.id = p_target_id for update;
  if v_fence.status = 'closed' and v_target.status = 'completed' then
    return pg_catalog.jsonb_build_object(
      'closed', true, 'already_recorded', true, 'admin_execution_enabled', false);
  end if;
  if v_fence.status = 'halted_paid' then
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;
  if v_fence.status <> 'database' or v_target.status <> 'awaiting_storage' then
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'storage_incomplete', 'admin_execution_enabled', false);
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'payment_lock_busy', 'admin_execution_enabled', false);
  end if;
  if not private.trial_cleanup_payment_still_absent(v_target.user_id) then
    perform private.trial_cleanup_halt_for_payment(v_target.id, v_fence.id);
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;
  select count(*) into v_open from private.trial_cloud_cleanup_object_work w
  where w.fence_id = p_fence_id and w.status <> 'deleted';
  if v_open > 0 or v_open <> 0 then
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'storage_incomplete', 'admin_execution_enabled', false);
  end if;

  begin
    perform private.trial_cleanup_delete_owned_cloud_rows(v_target.user_id);
    if exists (select 1 from public.archives a where a.user_id = v_target.user_id)
      or exists (select 1 from public.records r where r.user_id = v_target.user_id)
      or exists (select 1 from public.media m where m.user_id = v_target.user_id)
      or exists (select 1 from public.market_posts mp where mp.user_id = v_target.user_id)
      or exists (select 1 from public.market_media mm where mm.user_id = v_target.user_id)
    then
      raise exception 'trial_cleanup_rows_remained' using errcode = 'P0001';
    end if;
    v_closed := true;
  exception when others then
    v_closed := false;
  end;
  if not v_closed then
    update private.trial_cloud_cleanup_targets t
    set last_error_code = 'database_close_failed', updated_at = now()
    where t.id = v_target.id and t.status = 'awaiting_storage';
    update private.trial_cloud_cleanup_fences f
    set last_error_code = 'database_close_failed'
    where f.id = p_fence_id and f.status = 'database';
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'database_close_failed', 'admin_execution_enabled', false);
  end if;

  update private.cloud_trial_claims c
  set cleanup_completed_at = pg_catalog.clock_timestamp(),
    cleanup_last_attempt_at = pg_catalog.clock_timestamp(),
    cleanup_attempt_count = c.cleanup_attempt_count + 1,
    cleanup_last_error_code = null,
    updated_at = pg_catalog.clock_timestamp()
  where c.user_id = v_target.user_id and c.cleanup_started_at is not null
    and c.cleanup_completed_at is null
    and c.converted_to_paid_at is null;
  get diagnostics v_claim_updated = row_count;
  if v_claim_updated <> 1 then
    raise exception 'trial_cleanup_claim_not_exclusive' using errcode = 'P0001';
  end if;
  update private.trial_cloud_cleanup_fences f
  set status = 'closed', closed_at = pg_catalog.clock_timestamp(), last_error_code = null
  where f.id = p_fence_id and f.status = 'database';
  update private.trial_cloud_cleanup_targets t
  set status = 'completed', completed_at = pg_catalog.clock_timestamp(),
    reservation_id = null, reservation_expires_at = null,
    last_error_code = null, updated_at = now()
  where t.id = v_target.id and t.status = 'awaiting_storage';
  update private.trial_cloud_cleanup_batches b
  set status = 'completed', completed_at = pg_catalog.clock_timestamp(), updated_at = now()
  where b.id = v_target.batch_id
    and not exists (
      select 1 from private.trial_cloud_cleanup_targets other
      where other.batch_id = b.id
        and other.status not in ('completed', 'skipped_paid', 'canceled')
    );
  return pg_catalog.jsonb_build_object(
    'closed', true, 'target_id', v_target.id, 'fence_id', p_fence_id,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.close_trial_cloud_cleanup_database(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.close_trial_cloud_cleanup_database(uuid, uuid)
  to service_role;

comment on function public.commit_trial_cloud_cleanup_fence(uuid, uuid) is
  'Service-only point of no return for one reserved trial account. Admin execution stays disabled; the generic deletion queue is not used.';

commit;
