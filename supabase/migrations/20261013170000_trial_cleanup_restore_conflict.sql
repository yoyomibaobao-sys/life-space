-- PR #95: quarantine restore must not overwrite a diverged original.
-- Not applied. Does not enable the admin button, Cron, or real deletion.
--
-- Supabase Storage upload exposes upsert, not an If-Match / generation
-- compare-and-swap. upsert false fails when the object name already exists;
-- it does not prove the bytes still match a captured version. This migration
-- therefore keeps a conflict hold and the quarantine copy, and does not
-- authorize an automatic overwrite.
begin;

do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'private'
    and t.relname = 'trial_cloud_cleanup_path_holds'
    and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) like '%quarantined%';
  if v_name is not null then
    execute format(
      'alter table private.trial_cloud_cleanup_path_holds drop constraint %I',
      v_name);
  end if;
end $$;

alter table private.trial_cloud_cleanup_path_holds
  add constraint trial_cloud_cleanup_path_holds_status_check
  check (status in (
    'held', 'quarantined', 'restoring', 'deleted', 'released', 'conflict'));

alter table private.trial_cloud_cleanup_path_holds
  add column if not exists content_sha256 text,
  add column if not exists content_type text,
  add column if not exists content_bytes bigint,
  add column if not exists object_metadata jsonb,
  add column if not exists conflict_reason text;

comment on table private.trial_cloud_cleanup_path_holds is
  'Trial cleanup path holds. Quarantine objects use the trial-cleanup-quarantine/ prefix, so they are outside the owner-id quota path and are not client-readable. Copies stay until an explicit later resolution; nothing in this migration deletes them.';

-- Client roles cannot read or write the quarantine prefix. service_role
-- bypasses RLS and is the only executor. A permissive public read elsewhere
-- still loses to this restrictive policy.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;
  execute 'alter table storage.objects enable row level security';
  execute 'drop policy if exists trial_cleanup_quarantine_no_client_access on storage.objects';
  execute $policy$
    create policy trial_cleanup_quarantine_no_client_access
    on storage.objects
    as restrictive
    for all
    to anon, authenticated
    using (
      bucket_id is distinct from 'media'
      or name not like 'trial-cleanup-quarantine/%'
    )
    with check (
      bucket_id is distinct from 'media'
      or name not like 'trial-cleanup-quarantine/%'
    )
  $policy$;
end $$;

create or replace function public.trial_cleanup_object_counts_toward_owner_quota(
  p_object_path text
) returns boolean
language sql
immutable
as $$
  select p_object_path is not null
    and p_object_path not like 'trial-cleanup-quarantine/%'
    and split_part(p_object_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;
revoke all on function public.trial_cleanup_object_counts_toward_owner_quota(text)
  from public, anon, authenticated, service_role;
grant execute on function public.trial_cleanup_object_counts_toward_owner_quota(text)
  to service_role;

create or replace function public.record_trial_cloud_cleanup_quarantine_manifest(
  p_fence_id uuid,
  p_object_path text,
  p_claim_token uuid,
  p_quarantine_path text,
  p_content_sha256 text,
  p_content_type text,
  p_content_bytes bigint,
  p_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_quarantine_path is null
     or p_quarantine_path not like 'trial-cleanup-quarantine/%'
     or position(p_object_path in p_quarantine_path) = 0
     or p_quarantine_path = p_object_path
     or p_content_sha256 is null
     or p_content_sha256 !~ '^[0-9a-f]{64}$'
     or p_content_type is null
     or p_content_type !~ '^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,127}$'
     or p_content_bytes is null
     or p_content_bytes < 0
     or pg_catalog.jsonb_typeof(v_metadata) is distinct from 'object'
     or pg_catalog.octet_length(v_metadata::text) > 4000 then
    return pg_catalog.jsonb_build_object(
      'recorded', false, 'reason', 'invalid_quarantine',
      'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'quarantined',
    quarantine_path = p_quarantine_path,
    restore_token = null,
    content_sha256 = p_content_sha256,
    content_type = p_content_type,
    content_bytes = p_content_bytes,
    object_metadata = v_metadata,
    conflict_reason = null
  from private.trial_cloud_cleanup_object_work w
  where h.fence_id = p_fence_id and h.object_path = p_object_path
    and h.status = 'held'
    and w.fence_id = h.fence_id and w.object_path = h.object_path
    and w.status = 'claimed' and w.claim_token = p_claim_token
    and w.authorization_token = h.authorization_token
    and w.claim_expires_at > pg_catalog.clock_timestamp();
  get diagnostics v_updated = row_count;
  return pg_catalog.jsonb_build_object(
    'recorded', v_updated = 1,
    'reason', case when v_updated = 1 then null else 'hold_missing' end,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.record_trial_cloud_cleanup_quarantine_manifest(
  uuid, text, uuid, text, text, text, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_trial_cloud_cleanup_quarantine_manifest(
  uuid, text, uuid, text, text, text, bigint, jsonb)
  to service_role;

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
    'restore_token', case
      when v_hold.status = 'restoring' then v_hold.restore_token
      else null
    end,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.read_trial_cloud_cleanup_quarantine(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_trial_cloud_cleanup_quarantine(uuid, text)
  to service_role;

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
  if not exists (
    select 1 from private.trial_cloud_cleanup_object_work w
    where w.fence_id = p_fence_id and w.object_path = p_object_path
      and w.claim_token = p_claim_token and w.status = 'claimed'
  ) then
    return pg_catalog.jsonb_build_object(
      'started', false, 'already_released', false, 'reason', 'claim_mismatch',
      'restore_token', null, 'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'restoring', restore_token = v_token
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
  set status = 'quarantined', restore_token = null
  where h.fence_id = p_fence_id and h.object_path = p_object_path
    and h.status = 'restoring' and h.restore_token = p_restore_token;
  get diagnostics v_updated = row_count;
  return pg_catalog.jsonb_build_object(
    'finished', v_updated = 1, 'admin_execution_enabled', false);
end;
$$;

create or replace function public.mark_trial_cloud_cleanup_restore_conflict(
  p_fence_id uuid, p_object_path text, p_claim_token uuid, p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_reason is null or p_reason !~ '^[a-z0-9_]{1,64}$' then
    return pg_catalog.jsonb_build_object(
      'marked', false, 'reason', 'invalid_conflict',
      'deletion_allowed', false, 'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'conflict', conflict_reason = p_reason, restore_token = null
  where h.fence_id = p_fence_id and h.object_path = p_object_path
    and h.status in ('held', 'quarantined', 'restoring')
    and h.quarantine_path is not null
    and exists (
      select 1 from private.trial_cloud_cleanup_object_work w
      where w.fence_id = p_fence_id and w.object_path = p_object_path
        and w.claim_token = p_claim_token and w.status = 'claimed'
    );
  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    update private.trial_cloud_cleanup_object_work w
    set status = 'failed', claim_token = null, claim_expires_at = null,
      authorization_token = null, authorization_expires_at = null,
      attempts = 8, last_error_code = p_reason
    where w.fence_id = p_fence_id and w.object_path = p_object_path
      and w.claim_token = p_claim_token and w.status = 'claimed';
  end if;
  return pg_catalog.jsonb_build_object(
    'marked', v_updated = 1,
    'reason', case when v_updated = 1 then p_reason else 'hold_missing' end,
    'deletion_allowed', false,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.mark_trial_cloud_cleanup_restore_conflict(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_trial_cloud_cleanup_restore_conflict(uuid, text, uuid, text)
  to service_role;

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
    last_error_code = p_error_code
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.status = 'claimed' and w.claim_token = p_claim_token
    and w.claim_expires_at > pg_catalog.clock_timestamp();
  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    update private.trial_cloud_cleanup_path_holds h
    set status = 'released', restore_token = null
    where h.fence_id = p_fence_id and h.object_path = p_object_path
      and h.status is distinct from 'conflict'
      and exists (
        select 1 from private.trial_cloud_cleanup_object_work w
        where w.fence_id = p_fence_id and w.object_path = p_object_path
          and w.status = 'failed' and w.attempts >= 8
      );
  end if;
  return pg_catalog.jsonb_build_object(
    'failed', v_updated = 1,
    'reason', case when v_updated = 1 then p_error_code else 'claim_mismatch' end,
    'admin_execution_enabled', false);
end;
$$;

-- Quarantine bytes stay. This function is the cleanup rule: it never deletes.
create or replace function public.purge_trial_cleanup_quarantine(p_fence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return pg_catalog.jsonb_build_object(
    'purged', false,
    'retained', true,
    'reason', 'quarantine_retained_until_explicit_resolution',
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.purge_trial_cleanup_quarantine(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_trial_cleanup_quarantine(uuid)
  to service_role;

commit;
