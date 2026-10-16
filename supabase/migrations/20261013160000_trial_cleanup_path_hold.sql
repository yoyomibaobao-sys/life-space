-- PR #95: path hold and recoverable quarantine before any object delete.
-- Not applied. Does not enable the admin button, Cron, or real deletion.
--
-- RLS cannot stop the service role. These are ordinary row triggers on every
-- media path and URL column the cleanup inventory reads, plus storage.objects
-- for the media bucket. A direct object-store write that never touches
-- Postgres can still replace bytes, so the executor copies the original into
-- a quarantine path before it removes anything. Writing those bytes back is
-- constrained by 20261013170000: a different original is not overwritten.
begin;

create table private.trial_cloud_cleanup_path_holds (
  bucket_id text not null default 'media' check (bucket_id = 'media'),
  object_path text not null,
  fence_id uuid not null references private.trial_cloud_cleanup_fences(id),
  owner_user_id uuid not null,
  authorization_token uuid not null,
  status text not null check (status in (
    'held', 'quarantined', 'restoring', 'deleted', 'released')),
  quarantine_path text,
  restore_token uuid,
  primary key (bucket_id, object_path)
);
create index trial_cloud_cleanup_path_holds_fence_idx
  on private.trial_cloud_cleanup_path_holds (fence_id);
alter table private.trial_cloud_cleanup_path_holds enable row level security;
revoke all on private.trial_cloud_cleanup_path_holds
  from public, anon, authenticated, service_role;

create or replace function private.trial_cleanup_path_lock(p_object_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_object_path is null or pg_catalog.btrim(p_object_path) = '' then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trial-cleanup-path:' || p_object_path, 0)
  );
end;
$$;
revoke all on function private.trial_cleanup_path_lock(text)
  from public, anon, authenticated, service_role;

-- Reject a new or changed reference to a path this cleanup is holding.
-- An unchanged reference on the owner's existing row is left alone.
-- storage.objects overwrites are rejected unless they carry the one-time
-- restore token issued to the cleanup executor. The path advisory lock is
-- shared with authorize so an uncommitted hold still serializes writers.
create or replace function private.trial_cleanup_reject_held_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text;
  v_new text;
  v_old text;
  v_path text;
begin
  if tg_table_schema = 'storage' and tg_table_name = 'objects' then
    if new.bucket_id is distinct from 'media' then return new; end if;
    v_path := nullif(pg_catalog.btrim(new.name), '');
    if v_path is null then return new; end if;
    perform private.trial_cleanup_path_lock(v_path);
    if exists (
      select 1 from private.trial_cloud_cleanup_path_holds h
      where h.bucket_id = 'media' and h.object_path = v_path
        and h.status <> 'released'
        and not (
          h.status = 'restoring'
          and h.restore_token is not null
          and new.metadata->>'trial_cleanup_restore_token' = h.restore_token::text
        )
    ) then
      raise exception 'trial_cleanup_path_held' using errcode = 'P0001';
    end if;
    return new;
  end if;

  foreach v_column in array tg_argv loop
    execute format('select ($1).%I::text', v_column) into v_new using new;
    v_new := nullif(pg_catalog.btrim(v_new), '');
    if v_new is null then continue; end if;
    if tg_op = 'UPDATE' then
      execute format('select ($1).%I::text', v_column) into v_old using old;
      if v_new is not distinct from nullif(pg_catalog.btrim(v_old), '') then
        continue;
      end if;
    end if;
    if v_column = 'url' or v_column like '%\_url' escape '\' then
      v_path := public.media_object_path_from_public_url(v_new);
      if v_path is null then
        perform private.trial_cleanup_path_lock(v_new);
        if exists (
          select 1 from private.trial_cloud_cleanup_path_holds h
          where h.status <> 'released' and position(h.object_path in v_new) > 0
        ) then
          raise exception 'trial_cleanup_path_held' using errcode = 'P0001';
        end if;
        continue;
      end if;
    else
      v_path := v_new;
    end if;
    if v_path is not null then
      perform private.trial_cleanup_path_lock(v_path);
      if exists (
        select 1 from private.trial_cloud_cleanup_path_holds h
        where h.object_path = v_path and h.status <> 'released'
      ) then
        raise exception 'trial_cleanup_path_held' using errcode = 'P0001';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.trial_cleanup_reject_held_path()
  from public, anon, authenticated, service_role;

do $$
declare
  v_spec record;
begin
  for v_spec in
    select *
    from (values
      ('archives', 'cover_image_path,cover_image_url,cover_thumb_path'),
      ('records', 'primary_image_path,primary_image_url,primary_thumb_path'),
      ('media', 'storage_path,url,thumb_path,thumb_url'),
      ('market_posts', 'cover_image_path,cover_image_url,cover_thumb_path,cover_thumb_url'),
      ('market_media', 'path,url,thumb_path,thumb_url')
    ) as t(table_name, columns)
  loop
    if to_regclass('public.' || v_spec.table_name) is null then continue; end if;
    execute format('drop trigger if exists trial_cleanup_hold_%I on public.%I',
      v_spec.table_name, v_spec.table_name);
    execute format(
      'create trigger trial_cleanup_hold_%I before insert or update on public.%I
       for each row execute function private.trial_cleanup_reject_held_path(%s)',
      v_spec.table_name, v_spec.table_name,
      (select string_agg(format('%L', pg_catalog.btrim(part)), ', ')
       from unnest(string_to_array(v_spec.columns, ',')) as part)
    );
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'drop trigger if exists trial_cleanup_hold_storage_objects on storage.objects';
    execute 'create trigger trial_cleanup_hold_storage_objects
      before insert or update on storage.objects
      for each row execute function private.trial_cleanup_reject_held_path()';
  end if;
end $$;

create or replace function private.trial_cleanup_release_path_holds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('closed', 'halted_paid')
     and new.status is distinct from old.status then
    update private.trial_cloud_cleanup_path_holds h
    set status = 'released', restore_token = null
    where h.fence_id = new.id and h.status <> 'released';
  end if;
  return new;
end;
$$;
revoke all on function private.trial_cleanup_release_path_holds()
  from public, anon, authenticated, service_role;
drop trigger if exists trial_cleanup_release_path_holds
  on private.trial_cloud_cleanup_fences;
create trigger trial_cleanup_release_path_holds
  after update of status on private.trial_cloud_cleanup_fences
  for each row execute function private.trial_cleanup_release_path_holds();

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
  v_held integer := 0;
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
  perform private.trial_cleanup_path_lock(p_object_path);
  v_block := private.trial_cleanup_object_delete_block(
    v_target.user_id, p_fence_id, p_object_path);
  if v_block is not null then
    update private.trial_cloud_cleanup_object_work w
    set status = 'failed', claim_token = null, claim_expires_at = null,
      authorization_token = null, authorization_expires_at = null,
      attempts = 8, last_error_code = v_block
    where w.fence_id = p_fence_id and w.object_path = p_object_path;
    update private.trial_cloud_cleanup_path_holds h
    set status = 'released', restore_token = null
    where h.fence_id = p_fence_id and h.object_path = p_object_path;
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', v_block, 'admin_execution_enabled', false);
  end if;
  v_token := gen_random_uuid();
  update private.trial_cloud_cleanup_object_work w
  set authorization_token = v_token, authorization_expires_at = w.claim_expires_at
  where w.fence_id = p_fence_id and w.object_path = p_object_path
    and w.claim_token = p_claim_token and w.status = 'claimed';
  insert into private.trial_cloud_cleanup_path_holds as h (
    bucket_id, object_path, fence_id, owner_user_id, authorization_token, status
  ) values ('media', p_object_path, p_fence_id, v_target.user_id, v_token, 'held')
  on conflict (bucket_id, object_path) do update
  set fence_id = excluded.fence_id,
    owner_user_id = excluded.owner_user_id,
    authorization_token = excluded.authorization_token,
    status = 'held', quarantine_path = null, restore_token = null
  where h.fence_id = excluded.fence_id or h.status = 'released';
  get diagnostics v_held = row_count;
  if v_held <> 1 then
    return pg_catalog.jsonb_build_object(
      'authorized', false, 'reason', 'path_held', 'admin_execution_enabled', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'authorized', true, 'authorization_token', v_token,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.authorize_trial_cloud_cleanup_object_delete(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_trial_cloud_cleanup_object_delete(uuid, text, uuid)
  to service_role;

create or replace function public.record_trial_cloud_cleanup_quarantine(
  p_fence_id uuid, p_object_path text, p_claim_token uuid, p_quarantine_path text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_quarantine_path is null
     or p_quarantine_path not like 'trial-cleanup-quarantine/%'
     or position(p_object_path in p_quarantine_path) = 0
     or p_quarantine_path = p_object_path then
    return pg_catalog.jsonb_build_object(
      'recorded', false, 'reason', 'invalid_quarantine', 'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'quarantined', quarantine_path = p_quarantine_path, restore_token = null
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
revoke all on function public.record_trial_cloud_cleanup_quarantine(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_trial_cloud_cleanup_quarantine(uuid, text, uuid, text)
  to service_role;

create or replace function public.recheck_trial_cloud_cleanup_object(
  p_fence_id uuid, p_object_path text, p_claim_token uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target private.trial_cloud_cleanup_targets%rowtype;
  v_block text;
begin
  select t.* into v_target
  from private.trial_cloud_cleanup_targets t
  join private.trial_cloud_cleanup_fences f on f.target_id = t.id
  where f.id = p_fence_id for update of t;
  if not found then
    return pg_catalog.jsonb_build_object(
      'clear', false, 'reason', 'invalid_fence', 'admin_execution_enabled', false);
  end if;
  if not exists (
    select 1 from private.trial_cloud_cleanup_path_holds h
    join private.trial_cloud_cleanup_object_work w
      on w.fence_id = h.fence_id and w.object_path = h.object_path
    where h.fence_id = p_fence_id and h.object_path = p_object_path
      and h.status = 'quarantined'
      and w.status = 'claimed' and w.claim_token = p_claim_token
      and w.authorization_token = h.authorization_token
      and w.claim_expires_at > pg_catalog.clock_timestamp()
  ) then
    return pg_catalog.jsonb_build_object(
      'clear', false, 'reason', 'hold_missing', 'admin_execution_enabled', false);
  end if;
  v_block := private.trial_cleanup_object_delete_block(
    v_target.user_id, p_fence_id, p_object_path);
  if v_block is not null then
    update private.trial_cloud_cleanup_object_work w
    set status = 'failed', claim_token = null, claim_expires_at = null,
      authorization_token = null, authorization_expires_at = null,
      attempts = 8, last_error_code = v_block
    where w.fence_id = p_fence_id and w.object_path = p_object_path;
    update private.trial_cloud_cleanup_path_holds h
    set status = 'released', restore_token = null
    where h.fence_id = p_fence_id and h.object_path = p_object_path;
    return pg_catalog.jsonb_build_object(
      'clear', false, 'reason', v_block, 'admin_execution_enabled', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'clear', true, 'reason', null, 'admin_execution_enabled', false);
end;
$$;
revoke all on function public.recheck_trial_cloud_cleanup_object(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.recheck_trial_cloud_cleanup_object(uuid, text, uuid)
  to service_role;

create or replace function public.begin_trial_cloud_cleanup_restore(
  p_fence_id uuid, p_object_path text, p_claim_token uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
  v_status text;
  v_quarantine text;
begin
  select h.status, h.quarantine_path into v_status, v_quarantine
  from private.trial_cloud_cleanup_path_holds h
  where h.fence_id = p_fence_id and h.object_path = p_object_path
  for update;
  if not found or v_status = 'released' then
    return pg_catalog.jsonb_build_object(
      'started', true, 'already_released', true, 'restore_token', null,
      'quarantine_path', v_quarantine, 'admin_execution_enabled', false);
  end if;
  if v_status not in ('quarantined', 'deleted', 'restoring') then
    return pg_catalog.jsonb_build_object(
      'started', false, 'reason', 'not_quarantined', 'admin_execution_enabled', false);
  end if;
  if not exists (
    select 1 from private.trial_cloud_cleanup_object_work w
    where w.fence_id = p_fence_id and w.object_path = p_object_path
      and w.claim_token = p_claim_token and w.status = 'claimed'
  ) then
    return pg_catalog.jsonb_build_object(
      'started', false, 'reason', 'claim_mismatch', 'admin_execution_enabled', false);
  end if;
  update private.trial_cloud_cleanup_path_holds h
  set status = 'restoring', restore_token = v_token
  where h.fence_id = p_fence_id and h.object_path = p_object_path;
  return pg_catalog.jsonb_build_object(
    'started', true, 'already_released', false, 'restore_token', v_token,
    'quarantine_path', v_quarantine, 'admin_execution_enabled', false);
end;
$$;
revoke all on function public.begin_trial_cloud_cleanup_restore(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_trial_cloud_cleanup_restore(uuid, text, uuid)
  to service_role;

create or replace function public.finish_trial_cloud_cleanup_restore(
  p_fence_id uuid, p_object_path text, p_restore_token uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  update private.trial_cloud_cleanup_path_holds h
  set status = 'quarantined', restore_token = null
  where h.fence_id = p_fence_id and h.object_path = p_object_path
    and h.status = 'restoring' and h.restore_token = p_restore_token;
  get diagnostics v_updated = row_count;
  return pg_catalog.jsonb_build_object(
    'finished', v_updated = 1, 'admin_execution_enabled', false);
end;
$$;
revoke all on function public.finish_trial_cloud_cleanup_restore(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finish_trial_cloud_cleanup_restore(uuid, text, uuid)
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
  if not exists (
    select 1 from private.trial_cloud_cleanup_path_holds h
    where h.fence_id = p_fence_id and h.object_path = p_object_path
      and h.status = 'quarantined'
      and h.authorization_token = v_work.authorization_token
  ) then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'not_quarantined', 'admin_execution_enabled', false);
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_target.user_id::text, 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', 'payment_lock_busy', 'admin_execution_enabled', false);
  end if;
  perform private.trial_cleanup_path_lock(p_object_path);
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
    update private.trial_cloud_cleanup_path_holds h
    set status = 'released', restore_token = null
    where h.fence_id = p_fence_id and h.object_path = p_object_path;
    return pg_catalog.jsonb_build_object(
      'completed', false, 'reason', v_block, 'admin_execution_enabled', false);
  end if;

  update private.trial_cloud_cleanup_path_holds h
  set status = 'deleted', restore_token = null
  where h.fence_id = p_fence_id and h.object_path = p_object_path
    and h.status = 'quarantined';
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
revoke all on function public.fail_trial_cloud_cleanup_storage_object(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_trial_cloud_cleanup_storage_object(uuid, text, uuid, text)
  to service_role;

-- Explicit PayPal reconciliation. A timeout never becomes permission to delete.
-- not_captured only applies to an expired or canceled order with no capture id,
-- and it returns the account to review instead of deleting anything.
alter table public.membership_payments
  add column if not exists capture_requested_at timestamptz,
  add column if not exists provider_capture_id text,
  add column if not exists capture_outcome text,
  add column if not exists capture_reconciled_at timestamptz;

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
    where mp.user_id = p_user_id and mp.capture_outcome = 'captured'
  ) then return false; end if;
  if exists (
    select 1 from public.membership_payments mp
    where mp.user_id = p_user_id
      and (
        mp.status in ('pending_payment', 'submitted', 'needs_update')
        or (
          mp.provider_order_id is not null
          and not (
            mp.capture_outcome = 'not_captured'
            and mp.provider_capture_id is null
            and mp.status in ('expired', 'canceled')
          )
        )
        or (
          mp.capture_requested_at is not null
          and mp.status is distinct from 'refunded'
          and mp.capture_outcome is distinct from 'not_captured'
        )
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
      where mp.user_id = p_user_id and (mp.status = 'confirmed' or mp.capture_outcome = 'captured'))
    or exists (select 1 from public.user_memberships m
      where m.user_id = p_user_id and m.plan <> 'trial')
    then return 'paid'; end if;
  if not private.trial_cleanup_payment_still_absent(p_user_id) then
    return 'payment_unresolved';
  end if;
  return 'eligible';
end;
$$;
revoke all on function private.trial_cleanup_payment_safety(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.reconcile_paypal_capture_intent(
  p_payment_id uuid, p_outcome text, p_note text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.membership_payments%rowtype;
begin
  if p_outcome not in ('captured', 'not_captured')
     or p_note is null or char_length(pg_catalog.btrim(p_note)) < 8
     or char_length(p_note) > 200 then
    return pg_catalog.jsonb_build_object(
      'reconciled', false, 'reason', 'invalid_reconciliation',
      'deletion_allowed', false, 'admin_execution_enabled', false);
  end if;
  select * into v_payment from public.membership_payments mp
  where mp.id = p_payment_id for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'reconciled', false, 'reason', 'payment_not_found',
      'deletion_allowed', false, 'admin_execution_enabled', false);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_payment.user_id::text, 0)
  );
  if p_outcome = 'captured' then
    update public.membership_payments mp
    set capture_outcome = 'captured',
      capture_reconciled_at = pg_catalog.clock_timestamp(),
      updated_at = now()
    where mp.id = v_payment.id;
    return pg_catalog.jsonb_build_object(
      'reconciled', true, 'outcome', 'captured', 'deletion_allowed', false,
      'admin_execution_enabled', false);
  end if;
  if v_payment.status not in ('expired', 'canceled')
     or v_payment.provider_capture_id is not null then
    return pg_catalog.jsonb_build_object(
      'reconciled', false, 'reason', 'not_terminal',
      'deletion_allowed', false, 'admin_execution_enabled', false);
  end if;
  update public.membership_payments mp
  set capture_outcome = 'not_captured',
    capture_requested_at = null,
    capture_reconciled_at = pg_catalog.clock_timestamp(),
    updated_at = now()
  where mp.id = v_payment.id;
  if private.trial_cleanup_payment_still_absent(v_payment.user_id) then
    update private.trial_cloud_cleanup_targets t
    set status = 'pending', last_error_code = null,
      reservation_id = null, reservation_expires_at = null,
      preflight_checked_at = null, updated_at = now()
    where t.user_id = v_payment.user_id and t.status = 'deferred_payment';
  end if;
  return pg_catalog.jsonb_build_object(
    'reconciled', true, 'outcome', 'not_captured', 'deletion_allowed', false,
    'admin_execution_enabled', false);
end;
$$;
revoke all on function public.reconcile_paypal_capture_intent(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_paypal_capture_intent(uuid, text, text)
  to service_role;

commit;
