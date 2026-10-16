-- PR #95: restore claim binding, and no version-blind object delete.
-- Not applied. Does not enable the admin button, Cron, or real deletion.
--
-- Supabase Storage remove() deletes by object name. It has no If-Match or
-- generation precondition, so a byte compare followed by remove can delete a
-- newer object. Physical deletion stays closed. Quarantine copies are extra
-- platform object-store bytes even though they are outside the owner quota.
begin;

alter table private.trial_cloud_cleanup_path_holds
  add column if not exists restore_claim_token uuid,
  add column if not exists restore_lease_expires_at timestamptz;

create or replace function public.read_trial_cloud_cleanup_quarantine(
  p_fence_id uuid, p_object_path text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold private.trial_cloud_cleanup_path_holds%rowtype;
begin
  select h.* into v_hold
  from private.trial_cloud_cleanup_path_holds h
  where h.fence_id = p_fence_id and h.object_path = p_object_path;
  if not found or v_hold.status = 'released' then
    return pg_catalog.jsonb_build_object(
      'readable', false,
      'status', coalesce(v_hold.status, 'released'),
      'already_released', true,
      'quarantine_path', v_hold.quarantine_path,
      'restore_token', null,
      'admin_execution_enabled', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'readable', true,
    'status', v_hold.status,
    'already_released', false,
    'quarantine_path', v_hold.quarantine_path,
    'content_sha256', v_hold.content_sha256,
    'content_type', v_hold.content_type,
    'content_bytes', v_hold.content_bytes,
    'object_metadata', coalesce(v_hold.object_metadata, '{}'::jsonb),
    'conflict_reason', v_hold.conflict_reason,
    'restore_token', null,
    'admin_execution_enabled', false);
end;
$$;

create or replace function public.begin_trial_cloud_cleanup_restore(
  p_fence_id uuid, p_object_path text, p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
  v_hold private.trial_cloud_cleanup_path_holds%rowtype;
  v_expires timestamptz;
begin
  select h.* into v_hold
  from private.trial_cloud_cleanup_path_holds h
  where h.fence_id = p_fence_id and h.object_path = p_object_path
  for update;
  if not found or v_hold.status = 'released' then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', true, 'restore_token', null,
      'quarantine_path', v_hold.quarantine_path, 'admin_execution_enabled', false);
  end if;
  if v_hold.status = 'conflict' then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'restore_conflict',
      'restore_token', null, 'quarantine_path', v_hold.quarantine_path,
      'admin_execution_enabled', false);
  end if;
  if v_hold.status = 'restoring' then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'restore_in_progress',
      'restore_token', null, 'quarantine_path', v_hold.quarantine_path,
      'admin_execution_enabled', false);
  end if;
  if v_hold.status <> 'quarantined'
     or v_hold.quarantine_path is null
     or v_hold.content_sha256 is null
     or v_hold.content_type is null
     or v_hold.content_bytes is null then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'integrity_missing',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  select w.claim_expires_at into v_expires
  from private.trial_cloud_cleanup_object_work w
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.claim_token = p_claim_token and w.status = 'claimed'
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'claim_mismatch',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  if v_expires is null or v_expires <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'claim_expired',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'restoring', restore_token = v_token,
    restore_claim_token = p_claim_token,
    restore_lease_expires_at = pg_catalog.clock_timestamp() + interval '2 minutes'
  where h.fence_id = p_fence_id and h.object_path = p_object_path;
  return pg_catalog.jsonb_build_object(
    'started', true, 'already_released', false, 'restore_token', v_token,
    'quarantine_path', v_hold.quarantine_path,
    'content_sha256', v_hold.content_sha256,
    'content_type', v_hold.content_type,
    'content_bytes', v_hold.content_bytes,
    'object_metadata', coalesce(v_hold.object_metadata, '{}'::jsonb),
    'admin_execution_enabled', false);
end;
$$;

-- Single-flight restore for a still-valid claim. A second worker, an old
-- claim token, or an expired lease receives no restore token.
create or replace function public.adopt_trial_cloud_cleanup_restore(
  p_fence_id uuid, p_object_path text, p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
  v_hold private.trial_cloud_cleanup_path_holds%rowtype;
  v_expires timestamptz;
begin
  select h.* into v_hold
  from private.trial_cloud_cleanup_path_holds h
  where h.fence_id = p_fence_id and h.object_path = p_object_path
  for update;
  if not found or v_hold.status = 'released' then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', true, 'restore_token', null,
      'quarantine_path', v_hold.quarantine_path, 'admin_execution_enabled', false);
  end if;
  if v_hold.status = 'conflict' then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'restore_conflict',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  if v_hold.status not in ('quarantined', 'restoring')
     or v_hold.quarantine_path is null
     or v_hold.content_sha256 is null
     or v_hold.content_type is null
     or v_hold.content_bytes is null then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'integrity_missing',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  select w.claim_expires_at into v_expires
  from private.trial_cloud_cleanup_object_work w
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.claim_token = p_claim_token and w.status = 'claimed'
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'claim_mismatch',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  if v_expires is null or v_expires <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'claim_expired',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  if v_hold.status = 'restoring'
     and v_hold.restore_lease_expires_at is not null
     and v_hold.restore_lease_expires_at > pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'restore_in_progress',
      'restore_token', null, 'quarantine_path', v_hold.quarantine_path,
      'admin_execution_enabled', false);
  end if;
  v_token := case
    when v_hold.status = 'restoring'
      and v_hold.restore_claim_token is not distinct from p_claim_token
      and v_hold.restore_token is not null
    then v_hold.restore_token
    else gen_random_uuid()
  end;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'restoring',
    restore_token = v_token,
    restore_claim_token = p_claim_token,
    restore_lease_expires_at = pg_catalog.clock_timestamp() + interval '2 minutes'
  where h.fence_id = p_fence_id and h.object_path = p_object_path;
  return pg_catalog.jsonb_build_object(
    'started', true, 'already_released', false, 'restore_token', v_token,
    'quarantine_path', v_hold.quarantine_path,
    'content_sha256', v_hold.content_sha256,
    'content_type', v_hold.content_type,
    'content_bytes', v_hold.content_bytes,
    'object_metadata', coalesce(v_hold.object_metadata, '{}'::jsonb),
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.adopt_trial_cloud_cleanup_restore(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.adopt_trial_cloud_cleanup_restore(uuid, text, uuid)
  to service_role;

create or replace function public.finish_trial_cloud_cleanup_restore(
  p_fence_id uuid, p_object_path text, p_restore_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if exists (
    select 1 from private.trial_cloud_cleanup_path_holds h
    where h.fence_id = p_fence_id and h.object_path = p_object_path
      and h.status = 'quarantined' and h.restore_token is null
      and h.quarantine_path is not null and h.content_sha256 is not null
  ) then
    return pg_catalog.jsonb_build_object(
      'finished', true, 'already_finished', true, 'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'quarantined', restore_token = null,
    restore_claim_token = null, restore_lease_expires_at = null
  where h.fence_id = p_fence_id and h.object_path = p_object_path
    and h.status = 'restoring' and h.restore_token = p_restore_token;
  get diagnostics v_updated = row_count;
  return pg_catalog.jsonb_build_object(
    'finished', v_updated = 1, 'admin_execution_enabled', false);
end;
$$;

create or replace function public.fail_trial_cloud_cleanup_storage_object(
  p_fence_id uuid, p_object_path text, p_claim_token uuid, p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
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
    authorization_token = null, authorization_expires_at = null,
    last_error_code = p_error_code,
    attempts = case
      when p_error_code = 'version_guard_unavailable' then 8
      else w.attempts
    end
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.status = 'claimed' and w.claim_token = p_claim_token
    and w.claim_expires_at > pg_catalog.clock_timestamp();
  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    update private.trial_cloud_cleanup_path_holds h
    set status = 'released', restore_token = null,
      restore_claim_token = null, restore_lease_expires_at = null
    where h.fence_id = p_fence_id and h.object_path = p_object_path
      and h.status is distinct from 'conflict'
      and exists (
        select 1 from private.trial_cloud_cleanup_object_work w
        where w.fence_id = p_fence_id and w.object_path = p_object_path
          and w.status = 'failed'
          and (w.attempts >= 8 or w.last_error_code = 'version_guard_unavailable')
      );
  end if;
  return pg_catalog.jsonb_build_object(
    'failed', v_updated = 1,
    'reason', case when v_updated = 1 then p_error_code else 'claim_mismatch' end,
    'admin_execution_enabled', false);
end;
$$;

-- Retained quarantine objects occupy platform storage. This sum is not the
-- owner's quota and does not authorize deleting them.
create or replace function public.trial_cleanup_quarantine_platform_bytes(
  p_fence_id uuid
) returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(h.content_bytes), 0)::bigint
  from private.trial_cloud_cleanup_path_holds h
  where h.fence_id = p_fence_id
    and h.quarantine_path like 'trial-cleanup-quarantine/%'
    and h.content_bytes is not null;
$$;
revoke all on function public.trial_cleanup_quarantine_platform_bytes(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.trial_cleanup_quarantine_platform_bytes(uuid)
  to service_role;

commit;
