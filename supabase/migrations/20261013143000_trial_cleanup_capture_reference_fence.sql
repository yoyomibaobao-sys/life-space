-- PR #95: close the remaining executor gaps. Not applied.
-- Does not enable the admin button, Cron, the generic Storage worker,
-- or the blocked manual-cleanup migration.
--
-- PayPal charges at external capture, before database confirmation. The
-- capture intent is recorded under the membership-payment lock first; a
-- cleanup that has already entered deleting refuses that intent so the
-- caller must not capture. A capture intent that is recorded first keeps
-- the account out of deletion until confirmation can grant Plus.
--
-- A shared-path check at claim time is not permission to delete. The
-- object must be authorized again immediately before the external delete,
-- and the result is rejected if a new reference or replacement appeared.
begin;

alter table public.membership_payments
  add column if not exists capture_requested_at timestamptz;

-- A requested capture whose confirmation has not landed is unresolved even
-- when the local status is canceled or expired and no provider order id
-- was stored. Refunded orders do not keep this hold.
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
      and (
        mp.status in ('pending_payment', 'submitted', 'needs_update')
        or mp.provider_order_id is not null
        or (mp.capture_requested_at is not null and mp.status is distinct from 'refunded')
      )
  ) then return false; end if;
  return true;
end;
$$;
revoke all on function private.trial_cleanup_payment_still_absent(uuid)
  from public, anon, authenticated, service_role;

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
  if exists (select 1 from public.membership_payments mp
    where mp.user_id = p_user_id
      and (
        mp.status in ('pending_payment', 'submitted', 'needs_update')
        or mp.provider_order_id is not null
        or (mp.capture_requested_at is not null and mp.status is distinct from 'refunded')
      ))
    then return 'payment_unresolved'; end if;
  return 'eligible';
end;
$$;
revoke all on function private.trial_cleanup_payment_safety(uuid)
  from public, anon, authenticated, service_role;

-- Called only before an external PayPal capture. A deleting account returns
-- a refusal and does not record an intent; the caller must not capture.
-- An intent recorded here defers every revocable target in the same lock.
create or replace function public.begin_paypal_membership_capture(p_payment_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.membership_payments%rowtype;
begin
  if p_payment_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'error_message', 'missing_paypal_capture',
      'admin_execution_enabled', false);
  end if;
  select * into v_payment from public.membership_payments mp
  where mp.id = p_payment_id for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'error_message', 'payment_not_found',
      'admin_execution_enabled', false);
  end if;
  if v_payment.status = 'confirmed' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'already_confirmed', true, 'payment_id', v_payment.id,
      'admin_execution_enabled', false);
  end if;
  if v_payment.status = 'refunded'
     or v_payment.status not in ('pending_payment', 'canceled', 'expired') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'error_message', 'payment_not_capturable',
      'admin_execution_enabled', false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_payment.user_id::text, 0)
  );
  if exists (
    select 1 from private.trial_cloud_cleanup_targets t
    where t.user_id = v_payment.user_id
      and t.status in ('deleting', 'awaiting_storage')
  ) or exists (
    select 1 from private.trial_cloud_cleanup_object_work w
    join private.trial_cloud_cleanup_fences f on f.id = w.fence_id
    join private.trial_cloud_cleanup_targets t on t.id = f.target_id
    where t.user_id = v_payment.user_id
      and w.status in ('claimed', 'deleted')
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'error_message', 'trial_cleanup_in_progress',
      'admin_execution_enabled', false);
  end if;

  update public.membership_payments mp
  set capture_requested_at = coalesce(mp.capture_requested_at, pg_catalog.clock_timestamp()),
    updated_at = now()
  where mp.id = v_payment.id;
  update private.trial_cloud_cleanup_targets t
  set status = 'deferred_payment', last_error_code = 'payment_unresolved',
    reservation_id = null, reservation_expires_at = null,
    preflight_checked_at = null, updated_at = now()
  where t.user_id = v_payment.user_id
    and t.status in ('pending', 'reserved', 'deferred_payment');
  return pg_catalog.jsonb_build_object(
    'ok', true, 'already_confirmed', false, 'payment_id', v_payment.id,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.begin_paypal_membership_capture(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_paypal_membership_capture(uuid)
  to service_role;

-- Money already taken (capture intent or a confirmed payment in this
-- transaction) stops further deletion and lets the Plus grant commit.
-- A direct grant with no such payment still cannot overtake deletion.
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
  if exists (
    select 1 from private.trial_cloud_cleanup_targets t
    where t.user_id = new.user_id
      and t.status in ('deleting', 'awaiting_storage')
  ) then
    if exists (
      select 1 from public.membership_payments mp
      where mp.user_id = new.user_id
        and mp.status is distinct from 'refunded'
        and (mp.capture_requested_at is not null or mp.status = 'confirmed')
    ) then
      update private.trial_cloud_cleanup_fences f
      set status = 'halted_paid', last_error_code = 'payment_conflict'
      where f.status in ('storage', 'database')
        and f.target_id in (
          select t.id from private.trial_cloud_cleanup_targets t
          where t.user_id = new.user_id
            and t.status in ('deleting', 'awaiting_storage')
        );
      update private.trial_cloud_cleanup_targets t
      set status = 'skipped_paid', last_error_code = 'paid',
        reservation_id = null, reservation_expires_at = null,
        preflight_checked_at = null, updated_at = now()
      where t.user_id = new.user_id
        and t.status in ('deleting', 'awaiting_storage');
      return new;
    end if;
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

alter table private.trial_cloud_cleanup_object_work
  add column if not exists authorization_token uuid,
  add column if not exists authorization_expires_at timestamptz;

-- Null means this claimed object is still exclusively this account's and
-- the saved ledger still covers every current path.
create or replace function private.trial_cleanup_object_delete_block(
  p_user_id uuid, p_fence_id uuid, p_object_path text
) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from private.trial_cleanup_all_media_paths() other
    where other.owner_user_id is distinct from p_user_id
      and other.object_path = p_object_path
  ) then
    return 'shared_path';
  end if;
  if exists (
    select 1 from private.trial_cleanup_all_media_paths() p
    where p.owner_user_id = p_user_id
      and p.object_path is not null
      and not exists (
        select 1 from private.trial_cloud_cleanup_object_work w
        where w.fence_id = p_fence_id and w.object_path = p.object_path
      )
  ) then
    return 'plan_replaced';
  end if;
  return null;
end;
$$;
revoke all on function private.trial_cleanup_object_delete_block(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.authorize_trial_cloud_cleanup_object_delete(
  p_fence_id uuid, p_object_path text, p_claim_token uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_fence private.trial_cloud_cleanup_fences%rowtype;
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_work private.trial_cloud_cleanup_object_work%rowtype;
  v_block text;
  v_token uuid;
begin
  select * into v_fence from private.trial_cloud_cleanup_fences f
  where f.id = p_fence_id for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', 'invalid_fence', 'admin_execution_enabled', false);
  end if;
  select * into v_target from private.trial_cloud_cleanup_targets t
  where t.id = v_fence.target_id for update;
  select * into v_work from private.trial_cloud_cleanup_object_work w
  where w.fence_id = p_fence_id and w.object_path = p_object_path for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', 'invalid_object', 'admin_execution_enabled', false);
  end if;
  if v_fence.status = 'halted_paid' then
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;
  if v_work.status <> 'claimed' or v_work.claim_token is distinct from p_claim_token
    or v_work.claim_expires_at is null
    or v_work.claim_expires_at <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', 'claim_mismatch', 'admin_execution_enabled', false);
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', 'payment_lock_busy', 'admin_execution_enabled', false);
  end if;
  if not private.trial_cleanup_payment_still_absent(v_target.user_id) then
    perform private.trial_cleanup_halt_for_payment(v_target.id, v_fence.id);
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', 'payment_conflict', 'admin_execution_enabled', false);
  end if;
  v_block := private.trial_cleanup_object_delete_block(
    v_target.user_id, p_fence_id, p_object_path);
  if v_block is not null then
    update private.trial_cloud_cleanup_object_work w
    set status = 'failed', claim_token = null, claim_expires_at = null,
      authorization_token = null, authorization_expires_at = null,
      attempts = 8, last_error_code = v_block
    where w.fence_id = p_fence_id and w.object_path = p_object_path;
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', v_block, 'admin_execution_enabled', false);
  end if;
  v_token := gen_random_uuid();
  update private.trial_cloud_cleanup_object_work w
  set authorization_token = v_token,
    authorization_expires_at = w.claim_expires_at
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.claim_token = p_claim_token and w.status = 'claimed';
  return pg_catalog.jsonb_build_object(
    'authorized', true, 'authorization_token', v_token,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.authorize_trial_cloud_cleanup_object_delete(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_trial_cloud_cleanup_object_delete(uuid, text, uuid)
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
  v_block text;
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
    or v_work.claim_expires_at <= pg_catalog.clock_timestamp()
    or v_work.authorization_token is null
    or v_work.authorization_expires_at is null
    or v_work.authorization_expires_at <= pg_catalog.clock_timestamp() then
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
  v_block := private.trial_cleanup_object_delete_block(
    v_target.user_id, p_fence_id, p_object_path);
  if v_block is not null then
    update private.trial_cloud_cleanup_object_work w
    set status = 'failed', claim_token = null, claim_expires_at = null,
      authorization_token = null, authorization_expires_at = null,
      attempts = 8, last_error_code = v_block
    where w.fence_id = p_fence_id and w.object_path = p_object_path
      and w.status = 'claimed' and w.claim_token = p_claim_token;
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', v_block, 'admin_execution_enabled', false);
  end if;

  update private.trial_cloud_cleanup_object_work w
  set status = 'deleted', claim_token = null, claim_expires_at = null,
    authorization_token = null, authorization_expires_at = null,
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

-- Another account's own card, source link, cover, or location must stop
-- the close. Comments and follows that only hang off this account's rows
-- are removed with those rows; the other account's own rows are not.
create or replace function private.trial_cleanup_cross_account_block(p_user_id uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('public.experience_cards') is not null then
    if exists (
      select 1 from public.experience_cards c
      join public.archives a on a.id = c.archive_id
      where a.user_id = p_user_id and c.user_id is distinct from p_user_id
    ) then return 'cross_account_experience_card'; end if;
    if to_regclass('public.media') is not null then
      if exists (
        select 1 from public.experience_cards c
        join public.media m on m.id = c.cover_media_id
        where m.user_id = p_user_id and c.user_id is distinct from p_user_id
      ) then return 'cross_account_cover'; end if;
    end if;
  end if;
  if to_regclass('public.experience_card_records') is not null
     and to_regclass('public.experience_cards') is not null then
    if exists (
      select 1 from public.experience_card_records ecr
      join public.records r on r.id = ecr.record_id
      join public.experience_cards c on c.id = ecr.card_id
      where r.user_id = p_user_id and c.user_id is distinct from p_user_id
    ) then return 'cross_account_card_record'; end if;
  end if;
  if to_regclass('public.record_locations') is not null then
    if exists (
      select 1 from public.record_locations rl
      join public.records r on r.id = rl.record_id
      where r.user_id = p_user_id and rl.user_id is distinct from p_user_id
    ) then return 'cross_account_location'; end if;
  end if;
  return null;
end;
$$;
revoke all on function private.trial_cleanup_cross_account_block(uuid)
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
  v_block text;
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
  if v_open <> 0 then
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'storage_incomplete', 'admin_execution_enabled', false);
  end if;
  if exists (
    select 1 from private.trial_cleanup_all_media_paths() p
    where p.owner_user_id = v_target.user_id and p.object_path is not null
      and not exists (
        select 1 from private.trial_cloud_cleanup_object_work w
        where w.fence_id = p_fence_id and w.object_path = p.object_path
          and w.status = 'deleted'
      )
  ) or exists (
    select 1 from private.trial_cloud_cleanup_object_work w
    join private.trial_cleanup_all_media_paths() other
      on other.object_path = w.object_path
     and other.owner_user_id is distinct from v_target.user_id
    where w.fence_id = p_fence_id
  ) then
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', 'storage_incomplete', 'admin_execution_enabled', false);
  end if;
  v_block := private.trial_cleanup_cross_account_block(v_target.user_id);
  if v_block is not null then
    update private.trial_cloud_cleanup_targets t
    set last_error_code = v_block, updated_at = now()
    where t.id = v_target.id and t.status = 'awaiting_storage';
    update private.trial_cloud_cleanup_fences f
    set last_error_code = v_block
    where f.id = p_fence_id and f.status = 'database';
    return pg_catalog.jsonb_build_object(
      'closed', false, 'reason', v_block, 'admin_execution_enabled', false);
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

comment on function public.begin_paypal_membership_capture(uuid) is
  'Records a PayPal capture intent before any external charge. Refuses when trial cleanup has already started deleting. Admin execution stays disabled.';

commit;
