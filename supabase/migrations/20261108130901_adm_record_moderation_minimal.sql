-- LifeSpace ADM minimal record moderation.
-- Forward-only candidate. Do not apply to QA/production without B-group review.
-- The only objects touched are the exact B-R05/R06 whitelist.

begin;

do $adm_preflight$
declare
  v_missing text;
  v_failures text[] := array[]::text[];
  v_item record;
  v_current record;
  v_oid oid;
  v_policy_hash text;
  v_policy_inventory_md5 text;
begin
  if to_regclass('public.record_moderation_states') is not null
     or to_regclass('public.record_moderation_events') is not null
     or to_regclass('public.public_guide_record_projection') is not null
     or to_regprocedure('public.is_record_effectively_public(uuid)') is not null
     or to_regprocedure('public.admin_moderate_record(uuid,text,text,text,uuid,bigint,uuid)') is not null
     or to_regprocedure('public.get_my_record_moderation_status(uuid)') is not null
     or to_regprocedure('public.admin_list_record_moderation_events(uuid,integer,integer)') is not null
     or to_regprocedure('public.can_access_market_media(uuid)') is not null
     or to_regprocedure('public.reject_record_moderation_event_mutation()') is not null then
    v_failures := array_append(v_failures, 'candidate_objects_already_exist');
  end if;

  foreach v_missing in array array[
    'public.records',
    'public.archives',
    'public.archive_cycles',
    'public.record_tags',
    'public.media',
    'public.experience_cards',
    'public.experience_card_records',
    'public.market_posts',
    'public.market_media',
    'public.storage_upload_reservations',
    'public.storage_upload_reservation_paths',
    'public.support_submissions',
    'public.support_submission_admin_events',
    'public.public_profiles',
    'private.cloud_trial_claims',
    'public.membership_payments',
    'public.user_memberships',
    'storage.objects',
    'storage.buckets',
    'public.discovery_view',
    'public.discovery_feed_view',
    'public.discovery_project_feed_view'
  ] loop
    if to_regclass(v_missing) is null then
      v_failures := array_append(v_failures, 'required_object_missing:' || v_missing);
    end if;
  end loop;

  foreach v_missing in array array[
    'public.is_app_admin(uuid)',
    'storage.foldername(text)',
    'public.media_object_path_from_public_url(text)',
    'public.create_notification(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)',
    'public.can_access_record(uuid)',
    'public.is_experience_card_public(uuid)',
    'public.can_access_market_post(uuid)',
    'public.can_read_public_record_media_object(text)',
    'public.can_read_public_market_media_object(text)',
    'public.admin_update_support_submission(uuid,text,text,text)'
  ] loop
    if to_regprocedure(v_missing) is null then
      v_failures := array_append(v_failures, 'required_function_missing:' || v_missing);
    end if;
  end loop;

  -- The private media bucket is part of the Storage RLS authorization boundary.
  if not exists (
    select 1
    from storage.buckets b
    where b.id = 'media'
      and b.public is false
  ) then
    v_failures := array_append(v_failures, 'media_bucket_missing_or_public');
  end if;

  -- RLS flags, table owners and table ACLs are frozen to the live QA
  -- preimage reviewed for R09. Any drift blocks the whole transaction.
  for v_item in
    select * from (values
      ('public','archives','postgres','{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','archive_cycles','postgres','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres,authenticated=arw/postgres}'),
      ('public','record_tags','postgres','{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwdm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','records','postgres','{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','media','postgres','{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','experience_cards','postgres','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres}'),
      ('public','experience_card_records','postgres','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres}'),
      ('public','market_posts','postgres','{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','market_media','postgres','{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','storage_upload_reservations','postgres','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','storage_upload_reservation_paths','postgres','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','support_submissions','postgres','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
      ('public','support_submission_admin_events','postgres','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
      ('storage','objects','supabase_storage_admin','{supabase_storage_admin=a*r*w*d*D*x*t*m*/supabase_storage_admin,service_role=arwdDxtm/supabase_storage_admin,authenticated=arwd/supabase_storage_admin,anon=arwd/supabase_storage_admin,postgres=a*r*w*d*D*x*t*m*/supabase_storage_admin}')
    ) as expected(schema_name, table_name, owner_name, acl)
  loop
    select c.relkind, c.relrowsecurity, c.relforcerowsecurity,
           pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
           coalesce(c.relacl::text, '<default>') as acl
    into v_current
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = v_item.schema_name
      and c.relname = v_item.table_name;

    if not found then
      v_failures := array_append(v_failures, 'rls_relation_missing:' || v_item.schema_name || '.' || v_item.table_name);
    elsif v_current.relkind <> 'r'
       or v_current.relrowsecurity is distinct from true
       or v_current.relforcerowsecurity is distinct from false
       or v_current.owner_name is distinct from v_item.owner_name
       or v_current.acl is distinct from v_item.acl then
      v_failures := array_append(v_failures, 'rls_owner_or_acl_preimage_mismatch:' || v_item.schema_name || '.' || v_item.table_name);
    end if;
  end loop;

  -- Signed live-QA baseline: the legacy Trial restrictive policies and
  -- image/owner helpers are intentionally absent. Their reappearance is
  -- permission drift and must stop this migration; lifecycle functions may remain.
  if exists (
    select 1
    from pg_catalog.pg_policies p
    where (p.schemaname, p.tablename, p.policyname) in (
      ('public','archives','trial_cloud_archives_read'),
      ('public','records','trial_cloud_records_read'),
      ('public','media','trial_cloud_media_read'),
      ('storage','objects','trial_cloud_storage_read')
    )
  ) then
    v_failures := array_append(v_failures, 'legacy_trial_restrictive_policy_unexpectedly_present');
  end if;

  if pg_catalog.to_regprocedure('public.can_read_trial_cloud_owner(uuid)') is not null
     or pg_catalog.to_regprocedure('public.can_read_trial_media_path(text)') is not null then
    v_failures := array_append(v_failures, 'legacy_trial_permission_helper_unexpectedly_present');
  end if;

  -- Freeze the complete RLS policy inventory on all 14 relations observed in
  -- live QA, not only the six policies replaced below. Any added, removed or
  -- edited policy is permission drift and must stop installation.
  select md5(coalesce(string_agg(
    concat_ws(
      chr(31), p.schemaname, p.tablename, p.policyname, p.permissive,
      array_to_string(p.roles, ','), p.cmd, coalesce(p.qual, ''),
      coalesce(p.with_check, '')
    ),
    chr(30) order by p.schemaname, p.tablename, p.policyname
  ), ''))
  into v_policy_inventory_md5
  from pg_catalog.pg_policies p
  where (p.schemaname, p.tablename) in (
    ('public','archives'),
    ('public','archive_cycles'),
    ('public','record_tags'),
    ('public','records'),
    ('public','media'),
    ('public','experience_cards'),
    ('public','experience_card_records'),
    ('public','market_posts'),
    ('public','market_media'),
    ('public','storage_upload_reservations'),
    ('public','storage_upload_reservation_paths'),
    ('public','support_submissions'),
    ('public','support_submission_admin_events'),
    ('storage','objects')
  );

  if v_policy_inventory_md5 is distinct from 'd3208c0bceae6563bab8f7a55b4bd3d2' then
    v_failures := array_append(v_failures, 'rls_policy_inventory_preimage_mismatch');
  end if;

  -- The existing support audit trigger must be enabled and bound to the
  -- expected function, not merely present by name.
  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.support_submissions'::regclass
      and t.tgname = 'support_submission_admin_audit_after_update'
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and t.tgtype = 17
      and t.tgfoid = pg_catalog.to_regprocedure('public.audit_support_submission_admin_update()')
  ) then
    v_failures := array_append(v_failures, 'support_submission_audit_trigger_disabled_or_identity_mismatch');
  end if;

  -- Exact pre-migration function definition and ACL fingerprints for every
  -- existing function replaced or relied on by this candidate.
  for v_item in
    select * from (values
      ('public.admin_update_support_submission(uuid,text,text,text)','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}','a8df31af8cb3a7b3212afa581c98f9c1'),
      ('public.audit_support_submission_admin_update()','{postgres=X/postgres}','1a740c86d19a85d74c60bf94a01b9bff'),
      ('public.can_access_market_post(uuid)','{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}','47d24d37ee7cbc64cfecbcf83809eaa8'),
      ('public.can_access_record(uuid)','{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}','35641764d1df53fe1a5df200afba4d6a'),
      ('public.can_read_public_market_media_object(text)','{postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres}','33bd1ef6b0c12db9da892a9593262542'),
      ('public.can_read_public_record_media_object(text)','{postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres}','1f19d7fb4eca647e58d6d5c75e00c621'),
      ('public.create_notification(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)','{postgres=X/postgres,service_role=X/postgres}','7235284050a347a0726ebdbf3f278ef9'),
      ('public.is_app_admin(uuid)','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}','0ce6f423a8d69d1af25d7d5259ca8044'),
      ('public.is_experience_card_public(uuid)','{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}','bc0819444345640216bbc85d40671328'),
      ('public.media_object_path_from_public_url(text)','{postgres=X/postgres,service_role=X/postgres}','1de9c335e61de3224d3fbaf2e754de56')
    ) as expected(signature, acl, definition_md5)
  loop
    v_oid := pg_catalog.to_regprocedure(v_item.signature);
    if v_oid is null then
      v_failures := array_append(v_failures, 'function_preimage_missing:' || v_item.signature);
    else
      select pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
             coalesce(p.proacl::text, '<default>') as acl,
             md5(pg_catalog.pg_get_functiondef(p.oid)) as definition_md5
      into v_current
      from pg_catalog.pg_proc p
      where p.oid = v_oid;

      if v_current.owner_name is distinct from 'postgres'
         or v_current.acl is distinct from v_item.acl
         or v_current.definition_md5 is distinct from v_item.definition_md5 then
        v_failures := array_append(v_failures, 'function_definition_or_acl_preimage_mismatch:' || v_item.signature);
      end if;
    end if;
  end loop;

  -- View definitions, owners, invoker/barrier options and grants are frozen.
  for v_item in
    select * from (values
      ('discovery_feed_view','{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=r/postgres}','9094a8d6d926b614db342709e779a7c1'),
      ('discovery_view','{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=r/postgres}','c34f9bc4ea2330f24468369df4034dff'),
      ('discovery_project_feed_view','{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres}','1b448dad85c75788b9bf9bc32010156e')
    ) as expected(view_name, acl, definition_md5)
  loop
    select c.relkind,
           pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
           coalesce(c.relacl::text, '<default>') as acl,
           c.reloptions,
           md5(pg_catalog.pg_get_viewdef(c.oid, true)) as definition_md5
    into v_current
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_item.view_name;

    if not found
       or v_current.relkind is distinct from 'v'
       or v_current.owner_name is distinct from 'postgres'
       or v_current.acl is distinct from v_item.acl
       or v_current.definition_md5 is distinct from v_item.definition_md5
       or not (coalesce(v_current.reloptions, array[]::text[]) @> array['security_invoker=true','security_barrier=true']) then
      v_failures := array_append(v_failures, 'view_definition_owner_or_acl_preimage_mismatch:public.' || v_item.view_name);
    end if;
  end loop;

  -- Fingerprint the six existing policies that this migration replaces.
  for v_item in
    select * from (values
      ('public','records','records_select_own_or_public','32dfa9dd365ebd1df558972d68681da3'),
      ('public','media','media_select_own_or_public_record','9bcaa1d9852f20edc92faf6042a8e2c4'),
      ('public','market_posts','market_posts_select_public_or_own','a06a1cf172b75b65a69f9966e6926ea2'),
      ('public','market_media','market_media_select_visible_post','99015764843e5df4f0506007abf87ae0'),
      ('storage','objects','media_public_record_select','ba682a330224cbfdcbb0925f30a83ccd'),
      ('storage','objects','media_public_market_select','ce4ca1a4a3dca86cd5eebf4450886b20')
    ) as expected(schema_name, table_name, policy_name, preimage_md5)
  loop
    select md5(concat_ws(
      chr(31), p.schemaname, p.tablename, p.policyname, p.permissive,
      array_to_string(p.roles, ','), p.cmd, coalesce(p.qual, ''),
      coalesce(p.with_check, '')
    ))
    into v_policy_hash
    from pg_catalog.pg_policies p
    where p.schemaname = v_item.schema_name
      and p.tablename = v_item.table_name
      and p.policyname = v_item.policy_name;

    if not found or v_policy_hash is distinct from v_item.preimage_md5 then
      v_failures := array_append(v_failures, 'policy_definition_preimage_mismatch:' || v_item.schema_name || '.' || v_item.table_name || '.' || v_item.policy_name);
    end if;
  end loop;

  if exists (
    select 1
    from (values
      ('public','records','id'),
      ('public','records','archive_id'),
      ('public','records','user_id'),
      ('public','records','visibility'),
      ('public','records','trashed_at'),
      ('public','records','trash_entry_id'),
      ('public','records','primary_image_path'),
      ('public','records','primary_thumb_path'),
      ('public','records','primary_image_url'),
      ('public','archives','id'),
      ('public','archives','user_id'),
      ('public','archives','is_public'),
      ('public','archives','trashed_at'),
      ('public','archives','trash_entry_id'),
      ('public','archives','cover_image_path'),
      ('public','media','id'),
      ('public','media','record_id'),
      ('public','media','user_id'),
      ('public','media','storage_path'),
      ('public','media','thumb_path'),
      ('public','media','url'),
      ('public','media','thumb_url'),
      ('public','media','trashed_at'),
      ('public','media','trash_entry_id'),
      ('public','market_posts','id'),
      ('public','market_posts','user_id'),
      ('public','market_posts','status'),
      ('public','market_posts','source_record_id'),
      ('public','market_posts','cover_image_path'),
      ('public','market_posts','cover_image_url'),
      ('public','market_posts','cover_thumb_path'),
      ('public','market_posts','cover_thumb_url'),
      ('public','market_posts','cover_upload_reservation_id'),
      ('public','market_media','id'),
      ('public','market_media','user_id'),
      ('public','market_media','market_post_id'),
      ('public','market_media','path'),
      ('public','market_media','url'),
      ('public','market_media','thumb_path'),
      ('public','market_media','thumb_url'),
      ('public','market_media','source_media_id'),
      ('public','market_media','source_record_id'),
      ('public','market_media','upload_reservation_id'),
      ('public','storage_upload_reservations','id'),
      ('public','storage_upload_reservations','owner_user_id'),
      ('public','storage_upload_reservations','target_type'),
      ('public','storage_upload_reservations','target_id'),
      ('public','storage_upload_reservations','target_parent_id'),
      ('public','storage_upload_reservations','status'),
      ('public','storage_upload_reservations','settled_at'),
      ('public','storage_upload_reservations','cancelled_at'),
      ('public','storage_upload_reservations','reserved_bytes'),
      ('public','storage_upload_reservations','actual_bytes'),
      ('public','storage_upload_reservation_paths','reservation_id'),
      ('public','storage_upload_reservation_paths','owner_user_id'),
      ('public','storage_upload_reservation_paths','object_path'),
      ('public','storage_upload_reservation_paths','path_kind'),
      ('public','storage_upload_reservation_paths','reserved_bytes'),
      ('public','storage_upload_reservation_paths','actual_bytes'),
      ('public','storage_upload_reservation_paths','active'),
      ('public','storage_upload_reservation_paths','deactivated_at'),
      ('storage','objects','owner_id'),
      ('public','support_submissions','id'),
      ('public','support_submissions','user_id'),
      ('public','support_submissions','kind'),
      ('public','support_submissions','category'),
      ('public','support_submissions','status'),
      ('public','support_submissions','target_type'),
      ('public','support_submissions','target_id'),
      ('public','support_submissions','target_key'),
      ('public','support_submissions','resolution'),
      ('public','support_submissions','resolved_by'),
      ('public','support_submissions','resolved_at'),
      ('public','support_submissions','admin_note'),
      ('public','support_submissions','updated_at')
    ) as required(schema_name, table_name, column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = required.schema_name
        and c.table_name = required.table_name
        and c.column_name = required.column_name
    )
  ) then
    v_failures := array_append(v_failures, 'required_column_missing');
  end if;

  if cardinality(v_failures) > 0 then
    raise exception using
      errcode = '55000',
      message = 'adm_r09_preflight_failed',
      detail = array_to_string(v_failures, '; ');
  end if;
end;
$adm_preflight$;

create table public.record_moderation_states (
  record_id uuid primary key
    references public.records(id) on delete cascade,
  archive_id uuid not null,
  owner_user_id uuid not null,
  is_hidden boolean not null default true,
  version bigint not null default 1 check (version > 0),
  hidden_by uuid not null,
  hidden_at timestamptz not null,
  reason_code text not null
    check (reason_code in ('violence_threat_hate', 'harassment_privacy_fraud', 'other_severe')),
  restored_by uuid,
  restored_at timestamptz,
  source_submission_id uuid,
  last_request_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint record_moderation_states_restored_check
    check (is_hidden or (restored_by is not null and restored_at is not null))
);

create table public.record_moderation_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  request_id uuid not null unique,
  record_id uuid not null,
  archive_id uuid not null,
  owner_user_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('hide', 'restore', 'report_only')),
  reason_code text
    check (reason_code is null or reason_code in ('violence_threat_hate', 'harassment_privacy_fraud', 'other_severe')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  source_submission_id uuid,
  previous_is_hidden boolean not null,
  next_is_hidden boolean not null,
  previous_version bigint not null check (previous_version >= 0),
  next_version bigint not null check (
    next_version > previous_version
    or (action = 'report_only' and next_version = previous_version)
  ),
  previous_effective_public boolean not null,
  next_effective_public boolean not null,
  occurred_at timestamptz not null default now(),
  constraint record_moderation_events_report_only_shape_check
    check (
      action <> 'report_only'
      or (
        source_submission_id is not null
        and previous_is_hidden is true
        and next_is_hidden is true
        and previous_effective_public is false
        and next_effective_public is false
        and previous_version = next_version
      )
    )
);

alter table public.record_moderation_states enable row level security;
alter table public.record_moderation_events enable row level security;

revoke all on table public.record_moderation_states
  from public, anon, authenticated, service_role;
revoke all on table public.record_moderation_events
  from public, anon, authenticated, service_role;

create or replace function public.reject_record_moderation_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'record_moderation_events_are_immutable';
  return old;
end;
$$;

revoke all on function public.reject_record_moderation_event_mutation()
  from public, anon, authenticated, service_role;

create trigger record_moderation_events_immutable_guard
before update or delete on public.record_moderation_events
for each row
execute function public.reject_record_moderation_event_mutation();

create or replace function public.is_record_effectively_public(
  p_record_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.records r
    join public.archives a
      on a.id = r.archive_id
     and a.user_id = r.user_id
    left join public.record_moderation_states s
      on s.record_id = r.id
    where r.id = p_record_id
      and r.visibility = 'public'
      and a.is_public is true
      and r.trashed_at is null
      and r.trash_entry_id is null
      and a.trashed_at is null
      and a.trash_entry_id is null
      and coalesce(s.is_hidden, false) is false
  );
$$;

revoke all on function public.is_record_effectively_public(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_record_effectively_public(uuid)
  to anon, authenticated;

create or replace function public.can_access_record(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = p_record_id
      and r.trashed_at is null
      and a.trashed_at is null
      and (
        auth.uid() = r.user_id
        or public.is_record_effectively_public(r.id)
      )
  );
$$;

-- CREATE OR REPLACE preserves the pre-existing ACL for this function.

create or replace function public.is_experience_card_public(
  p_card_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.experience_cards c
    join public.archives a
      on a.id = c.archive_id
     and a.user_id = c.user_id
    where c.id = p_card_id
      and c.status = 'published'
      and c.published_at is not null
      and c.source_record_count >= 3
      and a.is_public is true
      and a.trashed_at is null
      and a.trash_entry_id is null
      and (
        select count(*)::integer
        from public.experience_card_records cr
        where cr.card_id = c.id
      ) = c.source_record_count
      and not exists (
        select 1
        from public.experience_card_records cr
        left join public.records r
          on r.id = cr.record_id
        where cr.card_id = c.id
          and (
            r.id is null
            or r.archive_id is distinct from c.archive_id
            or r.user_id is distinct from c.user_id
            or r.visibility is distinct from 'public'
            or r.trashed_at is not null
            or r.trash_entry_id is not null
            or not public.is_record_effectively_public(r.id)
          )
      )
  );
$$;

-- CREATE OR REPLACE preserves the pre-existing ACL for this function.

create or replace function public.can_access_market_post(
  p_market_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.market_posts mp
    where mp.id = p_market_post_id
      and (
        mp.user_id = auth.uid()
        or (
          mp.status = 'active'
          and (
            mp.source_record_id is null
            or public.is_record_effectively_public(mp.source_record_id)
          )
        )
      )
  );
$$;

-- CREATE OR REPLACE preserves the pre-existing ACL for this function.

create or replace function public.can_access_market_media(
  p_market_media_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.market_media mm
    join public.market_posts mp
      on mp.id = mm.market_post_id
     and mp.user_id = mm.user_id
    where mm.id = p_market_media_id
      and (
        -- Owner may read their own market-media metadata, even if a stored
        -- reference becomes stale. The Storage bytes gate remains separate.
        mp.user_id = auth.uid()
        or (
          (
            (
              mm.source_media_id is not null
          and exists (
            select 1
            from public.media m
            left join public.records r
              on r.id = m.record_id
            left join public.archives a
              on a.id = r.archive_id
            where m.id = mm.source_media_id
              and m.user_id = mm.user_id
              and m.trashed_at is null
              and m.trash_entry_id is null
              and (
                m.record_id is null
                or (
                  r.id is not null
                  and r.user_id = m.user_id
                  and a.id is not null
                  and a.user_id = m.user_id
                )
              )
              and (
                mm.source_record_id is null
                or mm.source_record_id = m.record_id
              )
              and coalesce(
                nullif(btrim(mm.path), ''),
                public.media_object_path_from_public_url(mm.url),
                nullif(btrim(m.storage_path), ''),
                public.media_object_path_from_public_url(m.url)
              ) = coalesce(
                nullif(btrim(m.storage_path), ''),
                public.media_object_path_from_public_url(m.url)
              )
              and coalesce(
                nullif(btrim(mm.thumb_path), ''),
                public.media_object_path_from_public_url(mm.thumb_url),
                nullif(btrim(m.thumb_path), ''),
                public.media_object_path_from_public_url(m.thumb_url)
              ) is not distinct from coalesce(
                nullif(btrim(m.thumb_path), ''),
                public.media_object_path_from_public_url(m.thumb_url)
              )
              and exists (
                select 1
                from storage.objects main_object
                where main_object.bucket_id = 'media'
                  and main_object.name = coalesce(
                    nullif(btrim(m.storage_path), ''),
                    public.media_object_path_from_public_url(m.url)
                  )
                  and main_object.owner_id = m.user_id::text
              )
              and (
                coalesce(
                  nullif(btrim(m.thumb_path), ''),
                  public.media_object_path_from_public_url(m.thumb_url)
                ) is null
                or exists (
                  select 1
                  from storage.objects thumb_object
                  where thumb_object.bucket_id = 'media'
                    and thumb_object.name = coalesce(
                      nullif(btrim(m.thumb_path), ''),
                      public.media_object_path_from_public_url(m.thumb_url)
                    )
                    and thumb_object.owner_id = m.user_id::text
                )
              )
          )
        )
        or (
          mm.source_media_id is null
          and mm.source_record_id is not null
          and exists (
            select 1
            from public.records r
            join public.archives a
              on a.id = r.archive_id
             and a.user_id = r.user_id
            join public.media m
              on m.record_id = r.id
             and m.user_id = r.user_id
            where r.id = mm.source_record_id
              and r.user_id = mm.user_id
              and a.user_id = mm.user_id
              and m.trashed_at is null
              and m.trash_entry_id is null
              and coalesce(
                nullif(btrim(mm.path), ''),
                public.media_object_path_from_public_url(mm.url)
              ) is not null
              and coalesce(
                nullif(btrim(mm.path), ''),
                public.media_object_path_from_public_url(mm.url)
              ) = coalesce(
                nullif(btrim(m.storage_path), ''),
                public.media_object_path_from_public_url(m.url)
              )
              and coalesce(
                nullif(btrim(mm.thumb_path), ''),
                public.media_object_path_from_public_url(mm.thumb_url)
              ) is not distinct from coalesce(
                nullif(btrim(m.thumb_path), ''),
                public.media_object_path_from_public_url(m.thumb_url)
              )
              and exists (
                select 1
                from storage.objects main_object
                where main_object.bucket_id = 'media'
                  and main_object.name = coalesce(
                    nullif(btrim(m.storage_path), ''),
                    public.media_object_path_from_public_url(m.url)
                  )
                  and main_object.owner_id = r.user_id::text
              )
              and (
                coalesce(
                  nullif(btrim(m.thumb_path), ''),
                  public.media_object_path_from_public_url(m.thumb_url)
                ) is null
                or exists (
                  select 1
                  from storage.objects thumb_object
                  where thumb_object.bucket_id = 'media'
                    and thumb_object.name = coalesce(
                      nullif(btrim(m.thumb_path), ''),
                      public.media_object_path_from_public_url(m.thumb_url)
                    )
                    and thumb_object.owner_id = r.user_id::text
                )
              )
          )
        )
        or (
          mm.source_media_id is null
          and mm.source_record_id is null
          and mm.upload_reservation_id is not null
          and exists (
            select 1
            from public.storage_upload_reservations r
            join public.storage_upload_reservation_paths main_path
              on main_path.reservation_id = r.id
             and main_path.owner_user_id = r.owner_user_id
             and main_path.path_kind = 'main'
            where r.id = mm.upload_reservation_id
              and r.owner_user_id = mm.user_id
              and r.target_type = 'market_media'
              and r.target_id = mm.id
              and r.target_parent_id = mm.market_post_id
              and r.status = 'settled'
              and r.settled_at is not null
              and r.cancelled_at is null
              and r.actual_bytes is not null
              and r.actual_bytes > 0
              and r.actual_bytes <= r.reserved_bytes
              and r.actual_bytes = main_path.actual_bytes + coalesce((
                select sum(thumb_path.actual_bytes)
                from public.storage_upload_reservation_paths thumb_path
                where thumb_path.reservation_id = r.id
                  and thumb_path.owner_user_id = r.owner_user_id
                  and thumb_path.path_kind = 'thumb'
              ), 0)
              and main_path.object_path = coalesce(
                nullif(btrim(mm.path), ''),
                public.media_object_path_from_public_url(mm.url)
              )
              and main_path.actual_bytes > 0
              and main_path.actual_bytes <= main_path.reserved_bytes
              and main_path.active is false
              and main_path.deactivated_at is not null
              and (
                select count(*)
                from public.storage_upload_reservation_paths main_check
                where main_check.reservation_id = r.id
                  and main_check.owner_user_id = r.owner_user_id
                  and main_check.path_kind = 'main'
              ) = 1
              and (
                select count(*)
                from public.storage_upload_reservation_paths thumb_check
                where thumb_check.reservation_id = r.id
                  and thumb_check.owner_user_id = r.owner_user_id
                  and thumb_check.path_kind = 'thumb'
              ) <= 1
              and not exists (
                select 1
                from public.storage_upload_reservation_paths path_check
                where path_check.reservation_id = r.id
                  and (
                    path_check.owner_user_id is distinct from r.owner_user_id
                    or path_check.path_kind not in ('main', 'thumb')
                    or path_check.actual_bytes is null
                    or path_check.active is distinct from false
                    or path_check.deactivated_at is null
                  )
              )
              and exists (
                select 1
                from storage.objects main_object
                where main_object.bucket_id = 'media'
                  and main_object.name = main_path.object_path
                  and main_object.owner_id = r.owner_user_id::text
              )
              and (
                coalesce(
                  nullif(btrim(mm.thumb_path), ''),
                  public.media_object_path_from_public_url(mm.thumb_url)
                ) is null
                and not exists (
                  select 1
                  from public.storage_upload_reservation_paths thumb_path
                  where thumb_path.reservation_id = r.id
                    and thumb_path.owner_user_id = r.owner_user_id
                    and thumb_path.path_kind = 'thumb'
                    and thumb_path.actual_bytes > 0
                )
                or exists (
                  select 1
                  from public.storage_upload_reservation_paths thumb_path
                  where thumb_path.reservation_id = r.id
                    and thumb_path.owner_user_id = r.owner_user_id
                    and thumb_path.path_kind = 'thumb'
                    and thumb_path.object_path = coalesce(
                      nullif(btrim(mm.thumb_path), ''),
                      public.media_object_path_from_public_url(mm.thumb_url)
                    )
                    and thumb_path.actual_bytes > 0
                    and thumb_path.actual_bytes <= thumb_path.reserved_bytes
                    and thumb_path.active is false
                    and thumb_path.deactivated_at is not null
                    and exists (
                      select 1
                      from storage.objects thumb_object
                      where thumb_object.bucket_id = 'media'
                        and thumb_object.name = thumb_path.object_path
                        and thumb_object.owner_id = r.owner_user_id::text
                    )
                )
              )
          )
        )
      )
      and (
        mp.status = 'active'
          and (
            mp.source_record_id is null
            or public.is_record_effectively_public(mp.source_record_id)
          )
          and (
            mm.source_record_id is null
            or public.is_record_effectively_public(mm.source_record_id)
          )
          and (
            mm.source_media_id is null
            or exists (
              select 1
              from public.media public_source_media
              where public_source_media.id = mm.source_media_id
                and (
                  public_source_media.record_id is null
                  or public.is_record_effectively_public(public_source_media.record_id)
                )
            )
          )
      )
    )
  )
  );
$$;

revoke all on function public.can_access_market_media(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_access_market_media(uuid)
  to anon, authenticated;

-- Project covers are deliberately not an independent authorization branch:
-- sync_archive_stats derives them from record media. A matching effective public
-- record/media reference below still authorizes the same shared object.
create or replace function public.can_read_public_record_media_object(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_object_name is not null
    and (
      exists (
        select 1
        from public.media m
        join public.records r on r.id = m.record_id
        join public.archives a on a.id = r.archive_id
        where m.trashed_at is null
          and m.trash_entry_id is null
          and m.user_id = r.user_id
          and exists (
            select 1
            from storage.objects o
            where o.bucket_id = 'media'
              and o.name = p_object_name
              and o.owner_id = m.user_id::text
          )
          and a.id = r.archive_id
          and public.is_record_effectively_public(r.id)
          and (
            coalesce(
              nullif(btrim(m.storage_path), ''),
              public.media_object_path_from_public_url(m.url)
            ) = p_object_name
            or coalesce(
              nullif(btrim(m.thumb_path), ''),
              public.media_object_path_from_public_url(m.thumb_url)
            ) = p_object_name
          )
      )
    );
$$;

-- CREATE OR REPLACE preserves the pre-existing ACL for this function.

create or replace function public.can_read_public_market_media_object(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_object_name is not null
    and (
      exists (
        select 1
        from public.market_media mm
        join public.market_posts mp
          on mp.id = mm.market_post_id
         and mp.user_id = mm.user_id
        left join public.media source_media
          on source_media.id = mm.source_media_id
        where public.can_access_market_media(mm.id)
          and exists (
            select 1
            from storage.objects authorized_object
            where authorized_object.bucket_id = 'media'
              and authorized_object.name = p_object_name
              and authorized_object.owner_id = mm.user_id::text
          )
          and p_object_name in (
            coalesce(
              nullif(btrim(mm.path), ''),
              public.media_object_path_from_public_url(mm.url),
              nullif(btrim(source_media.storage_path), ''),
              public.media_object_path_from_public_url(source_media.url)
            ),
            coalesce(
              nullif(btrim(mm.thumb_path), ''),
              public.media_object_path_from_public_url(mm.thumb_url),
              nullif(btrim(source_media.thumb_path), ''),
              public.media_object_path_from_public_url(source_media.thumb_url)
            )
          )
      )
      or exists (
        select 1
        from public.market_posts mp
        join public.storage_upload_reservations r
          on r.id = mp.cover_upload_reservation_id
         and r.owner_user_id = mp.user_id
        join public.storage_upload_reservation_paths main_path
          on main_path.reservation_id = r.id
         and main_path.owner_user_id = r.owner_user_id
         and main_path.path_kind = 'main'
        where (
            mp.user_id = auth.uid()
            or (
              mp.status = 'active'
              and (
                mp.source_record_id is null
                or public.is_record_effectively_public(mp.source_record_id)
              )
            )
          )
          and r.target_type = 'market_cover'
          and r.target_id = mp.id
          and r.target_parent_id is null
          and r.status = 'settled'
          and r.settled_at is not null
          and r.cancelled_at is null
          and r.actual_bytes is not null
          and r.actual_bytes > 0
          and r.actual_bytes <= r.reserved_bytes
          and r.actual_bytes = main_path.actual_bytes + coalesce((
            select sum(thumb_path.actual_bytes)
            from public.storage_upload_reservation_paths thumb_path
            where thumb_path.reservation_id = r.id
              and thumb_path.owner_user_id = r.owner_user_id
              and thumb_path.path_kind = 'thumb'
          ), 0)
          and main_path.object_path = coalesce(
            nullif(btrim(mp.cover_image_path), ''),
            public.media_object_path_from_public_url(mp.cover_image_url)
          )
          and main_path.actual_bytes > 0
          and main_path.actual_bytes <= main_path.reserved_bytes
          and main_path.active is false
          and main_path.deactivated_at is not null
          and (
            select count(*)
            from public.storage_upload_reservation_paths main_check
            where main_check.reservation_id = r.id
              and main_check.owner_user_id = r.owner_user_id
              and main_check.path_kind = 'main'
          ) = 1
          and (
            select count(*)
            from public.storage_upload_reservation_paths thumb_check
            where thumb_check.reservation_id = r.id
              and thumb_check.owner_user_id = r.owner_user_id
              and thumb_check.path_kind = 'thumb'
          ) <= 1
          and not exists (
            select 1
            from public.storage_upload_reservation_paths path_check
            where path_check.reservation_id = r.id
              and (
                path_check.owner_user_id is distinct from r.owner_user_id
                or path_check.path_kind not in ('main', 'thumb')
                or path_check.actual_bytes is null
                or path_check.active is distinct from false
                or path_check.deactivated_at is null
              )
          )
          and exists (
            select 1
            from storage.objects main_object
            where main_object.bucket_id = 'media'
              and main_object.name = main_path.object_path
              and main_object.owner_id = r.owner_user_id::text
          )
          and (
            coalesce(
              nullif(btrim(mp.cover_thumb_path), ''),
              public.media_object_path_from_public_url(mp.cover_thumb_url)
            ) is null
            and not exists (
              select 1
              from public.storage_upload_reservation_paths thumb_path
              where thumb_path.reservation_id = r.id
                and thumb_path.owner_user_id = r.owner_user_id
                and thumb_path.path_kind = 'thumb'
                and thumb_path.actual_bytes > 0
            )
            or exists (
              select 1
              from public.storage_upload_reservation_paths thumb_path
              where thumb_path.reservation_id = r.id
                and thumb_path.owner_user_id = r.owner_user_id
                and thumb_path.path_kind = 'thumb'
                and thumb_path.object_path = coalesce(
                  nullif(btrim(mp.cover_thumb_path), ''),
                  public.media_object_path_from_public_url(mp.cover_thumb_url)
                )
                and thumb_path.actual_bytes > 0
                and thumb_path.actual_bytes <= thumb_path.reserved_bytes
                and thumb_path.active is false
                and thumb_path.deactivated_at is not null
                and exists (
                  select 1
                  from storage.objects thumb_object
                  where thumb_object.bucket_id = 'media'
                    and thumb_object.name = thumb_path.object_path
                    and thumb_object.owner_id = r.owner_user_id::text
                )
            )
          )
          and (
            main_path.object_path = p_object_name
            or coalesce(
              nullif(btrim(mp.cover_thumb_path), ''),
              public.media_object_path_from_public_url(mp.cover_thumb_url)
            ) = p_object_name
          )
      )
      or exists (
        select 1
        from public.market_posts mp
        join public.market_media mm
          on mm.market_post_id = mp.id
         and mm.user_id = mp.user_id
        left join public.media source_media
          on source_media.id = mm.source_media_id
        where (
            mp.user_id = auth.uid()
            or (
              mp.status = 'active'
              and (
                mp.source_record_id is null
                or public.is_record_effectively_public(mp.source_record_id)
              )
            )
          )
          and public.can_access_market_media(mm.id)
          and exists (
            select 1
            from storage.objects authorized_object
            where authorized_object.bucket_id = 'media'
              and authorized_object.name = p_object_name
              and authorized_object.owner_id = mm.user_id::text
          )
          and coalesce(
            nullif(btrim(mp.cover_image_path), ''),
            public.media_object_path_from_public_url(mp.cover_image_url)
          ) = coalesce(
            nullif(btrim(mm.path), ''),
            public.media_object_path_from_public_url(mm.url),
            nullif(btrim(source_media.storage_path), ''),
            public.media_object_path_from_public_url(source_media.url)
          )
          and coalesce(
            nullif(btrim(mp.cover_thumb_path), ''),
            public.media_object_path_from_public_url(mp.cover_thumb_url)
          ) is not distinct from coalesce(
            nullif(btrim(mm.thumb_path), ''),
            public.media_object_path_from_public_url(mm.thumb_url),
            nullif(btrim(source_media.thumb_path), ''),
            public.media_object_path_from_public_url(source_media.thumb_url)
          )
          and p_object_name in (
            coalesce(
              nullif(btrim(mp.cover_image_path), ''),
              public.media_object_path_from_public_url(mp.cover_image_url)
            ),
            coalesce(
              nullif(btrim(mp.cover_thumb_path), ''),
              public.media_object_path_from_public_url(mp.cover_thumb_url)
            )
          )
      )
    );
$$;

-- CREATE OR REPLACE preserves the pre-existing ACL for this function.

create or replace function public.admin_moderate_record(
  p_record_id uuid,
  p_action text,
  p_reason_code text,
  p_admin_note text,
  p_request_id uuid,
  p_expected_version bigint,
  p_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason_code text := nullif(lower(trim(coalesce(p_reason_code, ''))), '');
  v_admin_note text := nullif(trim(coalesce(p_admin_note, '')), '');
  v_record public.records%rowtype;
  v_archive public.archives%rowtype;
  v_state public.record_moderation_states%rowtype;
  v_existing public.record_moderation_events%rowtype;
  v_submission public.support_submissions%rowtype;
  v_item record;
  v_previous_hidden boolean := false;
  v_previous_version bigint := 0;
  v_next_version bigint;
  v_previous_effective_public boolean := false;
  v_next_effective_public boolean := false;
  v_event_id uuid;
  v_updated_count integer := 0;
  v_target_key text;
  v_title text;
  v_body text;
begin
  if v_admin_id is null or not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_record_id is null
     or p_request_id is null
     or p_expected_version is null
     or v_action not in ('hide', 'restore') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  if v_admin_note is not null and char_length(v_admin_note) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'admin_note_too_long');
  end if;

  if (v_action = 'hide' and (v_reason_code is null or v_reason_code not in (
        'violence_threat_hate', 'harassment_privacy_fraud', 'other_severe'
      )))
     or (v_action = 'restore' and v_reason_code is not null and v_reason_code not in (
        'violence_threat_hate', 'harassment_privacy_fraud', 'other_severe'
      )) then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason_code');
  end if;

  if v_action = 'restore' and p_submission_id is not null then
    return jsonb_build_object('ok', false, 'error', 'restore_cannot_resolve_report');
  end if;

  -- Fast replay path: the caller must still be a real administrator.
  select e.* into v_existing
  from public.record_moderation_events e
  where e.request_id = p_request_id;

  if found then
    if v_existing.record_id = p_record_id
       and v_existing.actor_id = v_admin_id
       and (
         v_existing.action = v_action
         or (
           v_action = 'hide'
           and p_submission_id is not null
           and v_existing.action = 'report_only'
         )
       )
       and v_existing.reason_code is not distinct from v_reason_code
       and v_existing.admin_note is not distinct from v_admin_note
       and v_existing.source_submission_id is not distinct from p_submission_id
       and v_existing.previous_version = p_expected_version
       and (
         v_existing.action <> 'report_only'
         or (
           v_existing.previous_is_hidden is true
           and v_existing.next_is_hidden is true
           and v_existing.previous_version = v_existing.next_version
           and v_existing.previous_effective_public is false
           and v_existing.next_effective_public is false
         )
       ) then
      return jsonb_build_object(
        'ok', true,
        'already_applied', true,
        'event_id', v_existing.id,
        'action', v_existing.action,
        'linked_existing_hide', v_existing.action = 'report_only',
        'record_id', v_existing.record_id,
        'is_hidden', v_existing.next_is_hidden,
        'version', v_existing.next_version,
        'effective_public', v_existing.next_effective_public
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'request_id_conflict');
  end if;

  -- Required lock order: record -> parent archive -> moderation state.
  select r.* into v_record
  from public.records r
  where r.id = p_record_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'record_not_found');
  end if;

  select a.* into v_archive
  from public.archives a
  where a.id = v_record.archive_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'archive_not_found');
  end if;

  if v_record.user_id is distinct from v_archive.user_id then
    return jsonb_build_object('ok', false, 'error', 'owner_archive_mismatch');
  end if;

  select s.* into v_state
  from public.record_moderation_states s
  where s.record_id = p_record_id
  for update;

  if found then
    v_previous_hidden := v_state.is_hidden;
    v_previous_version := v_state.version;
  else
    v_previous_hidden := false;
    v_previous_version := 0;
  end if;

  -- Recheck after the record lock so concurrent retries see the committed event.
  select e.* into v_existing
  from public.record_moderation_events e
  where e.request_id = p_request_id;

  if found then
    if v_existing.record_id = p_record_id
       and v_existing.actor_id = v_admin_id
       and (
         v_existing.action = v_action
         or (
           v_action = 'hide'
           and p_submission_id is not null
           and v_existing.action = 'report_only'
         )
       )
       and v_existing.reason_code is not distinct from v_reason_code
       and v_existing.admin_note is not distinct from v_admin_note
       and v_existing.source_submission_id is not distinct from p_submission_id
       and v_existing.previous_version = p_expected_version
       and (
         v_existing.action <> 'report_only'
         or (
           v_existing.previous_is_hidden is true
           and v_existing.next_is_hidden is true
           and v_existing.previous_version = v_existing.next_version
           and v_existing.previous_effective_public is false
           and v_existing.next_effective_public is false
         )
       ) then
      return jsonb_build_object(
        'ok', true,
        'already_applied', true,
        'event_id', v_existing.id,
        'action', v_existing.action,
        'linked_existing_hide', v_existing.action = 'report_only',
        'record_id', v_existing.record_id,
        'is_hidden', v_existing.next_is_hidden,
        'version', v_existing.next_version,
        'effective_public', v_existing.next_effective_public
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'request_id_conflict');
  end if;

  -- Replays are resolved only by the immutable request_id event above.
  -- No fresh report-only audit may be appended before version validation.
  if p_expected_version <> v_previous_version then
    return jsonb_build_object(
      'ok', false,
      'error', 'version_conflict',
      'expected_version', p_expected_version,
      'actual_version', v_previous_version
    );
  end if;

  -- A different request_id is never a replay of a completed report.
  if v_action = 'hide' and p_submission_id is not null then
    select s.* into v_submission
    from public.support_submissions s
    where s.id = p_submission_id;

    if found
       and v_submission.kind = 'report'
       and v_submission.target_type = 'record'
       and lower(coalesce(v_submission.target_id, '')) = p_record_id::text
       and v_submission.target_key is not null
       and v_submission.target_key = ('record:' || md5(v_submission.target_id))
       and v_submission.category = v_reason_code
       and v_submission.status = 'resolved' then
      return jsonb_build_object(
        'ok', false,
        'error', 'already_resolved',
        'no_change', true,
        'record_id', p_record_id,
        'version', v_previous_version
      );
    end if;
  end if;

  if v_action = 'hide' and v_previous_hidden and p_submission_id is not null then
    if v_state.hidden_by is null or v_state.hidden_at is null or v_state.reason_code is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_existing_moderation_state');
    end if;

    select s.* into v_submission
    from public.support_submissions s
    where s.id = p_submission_id;

    if not found
       or v_submission.kind is distinct from 'report'
       or v_submission.target_type is distinct from 'record'
       or lower(coalesce(v_submission.target_id, '')) is distinct from p_record_id::text
       or v_submission.target_key is null
       or v_submission.target_key is distinct from ('record:' || md5(v_submission.target_id))
       or v_submission.category is distinct from v_reason_code then
      return jsonb_build_object('ok', false, 'error', 'submission_target_mismatch');
    end if;

    if v_submission.status not in ('submitted', 'needs_info') then
      return jsonb_build_object('ok', false, 'error', 'submission_not_open');
    end if;

    v_target_key := v_submission.target_key;

    -- Lock the complete unresolved report group in the same stable order as
    -- the first-hide path. This branch changes report state only.
    for v_item in
      select s.id
      from public.support_submissions s
      where s.kind = 'report'
        and s.target_type = 'record'
        and s.target_key = v_target_key
        and lower(coalesce(s.target_id, '')) = p_record_id::text
        and s.status in ('submitted', 'needs_info')
      order by s.id
      for update
    loop
      null;
    end loop;

    select s.* into v_submission
    from public.support_submissions s
    where s.id = p_submission_id;

    if not found or v_submission.status not in ('submitted', 'needs_info') then
      if found and v_submission.status = 'resolved' then
        return jsonb_build_object('ok', false, 'error', 'already_resolved', 'no_change', true);
      end if;
      return jsonb_build_object('ok', false, 'error', 'submission_not_open');
    end if;

    for v_item in
      update public.support_submissions s
      set status = 'resolved',
          resolution = 'action_taken',
          resolved_by = v_admin_id,
          resolved_at = now(),
          admin_note = v_admin_note,
          updated_at = now()
      where s.kind = 'report'
        and s.target_type = 'record'
        and s.target_key = v_target_key
        and lower(coalesce(s.target_id, '')) = p_record_id::text
        and s.status in ('submitted', 'needs_info')
      returning s.id, s.user_id
    loop
      v_updated_count := v_updated_count + 1;
      perform public.create_notification(
        v_item.user_id,
        null,
        'report_update',
        '举报处理更新 / Report update',
        '已处理相关内容。感谢你的举报。 / Action has been taken on the reported content. Thank you.',
        null,
        null,
        null,
        '/report?submission=' || v_item.id::text,
        jsonb_build_object(
          'support_submission_id', v_item.id,
          'status', 'resolved',
          'resolution', 'action_taken'
        )
      );
    end loop;

    if v_updated_count = 0 then
      return jsonb_build_object('ok', false, 'error', 'submission_not_open');
    end if;

    insert into public.record_moderation_events (
      request_id, record_id, archive_id, owner_user_id, actor_id,
      action, reason_code, admin_note, source_submission_id,
      previous_is_hidden, next_is_hidden, previous_version, next_version,
      previous_effective_public, next_effective_public, occurred_at
    ) values (
      p_request_id, p_record_id, v_archive.id, v_record.user_id, v_admin_id,
      'report_only', v_reason_code, v_admin_note, p_submission_id,
      true, true, v_previous_version, v_previous_version, false, false, now()
    )
    on conflict (request_id) do nothing
    returning id into v_event_id;

    if v_event_id is null then
      raise exception using errcode = '23505',
        message = 'adm_moderation_request_id_conflict_retry_to_reconcile';
    end if;

    update public.record_moderation_states
    set source_submission_id = p_submission_id,
        last_request_id = p_request_id,
        updated_at = now()
    where record_id = p_record_id
      and is_hidden is true
      and version = v_previous_version;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'record_moderation_state_changed_during_report_link';
    end if;

    return jsonb_build_object(
      'ok', true,
      'already_applied', false,
      'linked_existing_hide', true,
      'event_id', v_event_id,
      'action', 'report_only',
      'record_id', p_record_id,
      'is_hidden', true,
      'version', v_previous_version,
      'effective_public', false,
      'updated_count', v_updated_count
    );
  end if;

  if v_action = 'hide' and v_previous_hidden then
    return jsonb_build_object('ok', false, 'error', 'already_hidden');
  end if;

  if v_action = 'restore' and not v_previous_hidden then
    return jsonb_build_object('ok', false, 'error', 'already_restored');
  end if;

  if v_action = 'hide' and (
       v_record.visibility is distinct from 'public'
       or v_archive.is_public is distinct from true
       or v_record.trashed_at is not null
       or v_record.trash_entry_id is not null
       or v_archive.trashed_at is not null
       or v_archive.trash_entry_id is not null
     ) then
    return jsonb_build_object('ok', false, 'error', 'record_not_currently_public');
  end if;

  if v_action = 'restore' and (
       v_record.trashed_at is not null
       or v_record.trash_entry_id is not null
       or v_archive.trashed_at is not null
       or v_archive.trash_entry_id is not null
     ) then
    return jsonb_build_object('ok', false, 'error', 'owner_content_in_trash');
  end if;

  v_previous_effective_public := public.is_record_effectively_public(p_record_id);

  if p_submission_id is not null then
    if v_action <> 'hide' then
      return jsonb_build_object('ok', false, 'error', 'invalid_submission_action');
    end if;

    select s.* into v_submission
    from public.support_submissions s
    where s.id = p_submission_id;

    if not found
       or v_submission.kind is distinct from 'report'
       or v_submission.target_type is distinct from 'record'
       or lower(coalesce(v_submission.target_id, '')) is distinct from p_record_id::text
       or v_submission.target_key is null
       or v_submission.target_key is distinct from ('record:' || md5(v_submission.target_id))
       or v_submission.status not in ('submitted', 'needs_info')
       or v_submission.category is distinct from v_reason_code then
      return jsonb_build_object('ok', false, 'error', 'submission_target_mismatch');
    end if;

    v_target_key := v_submission.target_key;

    -- Lock the complete unresolved report group in stable ID order.
    for v_item in
      select s.id
      from public.support_submissions s
      where s.kind = 'report'
        and s.target_type = 'record'
        and s.target_key = v_target_key
        and lower(coalesce(s.target_id, '')) = p_record_id::text
        and s.status in ('submitted', 'needs_info')
      order by s.id
      for update
    loop
      null;
    end loop;

    select s.* into v_submission
    from public.support_submissions s
    where s.id = p_submission_id;

    if not found or v_submission.status not in ('submitted', 'needs_info') then
      return jsonb_build_object('ok', false, 'error', 'submission_not_open');
    end if;
  end if;

  v_next_version := v_previous_version + 1;

  if v_action = 'hide' then
    if not v_previous_effective_public then
      return jsonb_build_object('ok', false, 'error', 'record_not_effectively_public');
    end if;

    if v_previous_version = 0 then
      insert into public.record_moderation_states (
        record_id, archive_id, owner_user_id, is_hidden, version,
        hidden_by, hidden_at, reason_code, source_submission_id,
        last_request_id, updated_at
      ) values (
        p_record_id, v_archive.id, v_record.user_id, true, v_next_version,
        v_admin_id, now(), v_reason_code, p_submission_id,
        p_request_id, now()
      );
    else
      update public.record_moderation_states
      set archive_id = v_archive.id,
          owner_user_id = v_record.user_id,
          is_hidden = true,
          version = v_next_version,
          hidden_by = v_admin_id,
          hidden_at = now(),
          reason_code = v_reason_code,
          source_submission_id = coalesce(p_submission_id, source_submission_id),
          last_request_id = p_request_id,
          updated_at = now()
      where record_id = p_record_id;
    end if;
  else
    update public.record_moderation_states
    set is_hidden = false,
        version = v_next_version,
        restored_by = v_admin_id,
        restored_at = now(),
        last_request_id = p_request_id,
        updated_at = now()
    where record_id = p_record_id;
  end if;

  v_next_effective_public := public.is_record_effectively_public(p_record_id);

  if p_submission_id is not null then
    for v_item in
      update public.support_submissions s
      set status = 'resolved',
          resolution = 'action_taken',
          resolved_by = v_admin_id,
          resolved_at = now(),
          admin_note = v_admin_note,
          updated_at = now()
      where s.kind = 'report'
        and s.target_type = 'record'
        and s.target_key = v_target_key
        and lower(coalesce(s.target_id, '')) = p_record_id::text
        and s.status in ('submitted', 'needs_info')
      returning s.id, s.user_id
    loop
      v_updated_count := v_updated_count + 1;
      perform public.create_notification(
        v_item.user_id,
        null,
        'report_update',
        '举报处理更新 / Report update',
        '已处理相关内容。感谢你的举报。 / Action has been taken on the reported content. Thank you.',
        null,
        null,
        null,
        '/report?submission=' || v_item.id::text,
        jsonb_build_object(
          'support_submission_id', v_item.id,
          'status', 'resolved',
          'resolution', 'action_taken'
        )
      );
    end loop;

    if v_updated_count = 0 then
      raise exception using errcode = '40001',
        message = 'adm_moderation_report_group_changed_during_lock';
    end if;
  end if;

  insert into public.record_moderation_events (
    request_id, record_id, archive_id, owner_user_id, actor_id,
    action, reason_code, admin_note, source_submission_id,
    previous_is_hidden, next_is_hidden, previous_version, next_version,
    previous_effective_public, next_effective_public, occurred_at
  ) values (
    p_request_id, p_record_id, v_archive.id, v_record.user_id, v_admin_id,
    v_action, v_reason_code, v_admin_note, p_submission_id,
    v_previous_hidden, v_action = 'hide', v_previous_version, v_next_version,
    v_previous_effective_public, v_next_effective_public, now()
  )
  on conflict (request_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    raise exception using errcode = '23505',
      message = 'adm_moderation_request_id_conflict_retry_to_reconcile';
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event_id,
    'record_id', p_record_id,
    'action', v_action,
    'is_hidden', v_action = 'hide',
    'version', v_next_version,
    'previous_effective_public', v_previous_effective_public,
    'effective_public', v_next_effective_public,
    'updated_count', v_updated_count
  );
end;
$$;

revoke all on function public.admin_moderate_record(uuid,text,text,text,uuid,bigint,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_moderate_record(uuid,text,text,text,uuid,bigint,uuid)
  to authenticated;

create or replace function public.get_my_record_moderation_status(
  p_record_id uuid
)
returns table (
  is_hidden boolean,
  version bigint,
  hidden_at timestamptz,
  restored_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(s.is_hidden, false) as is_hidden,
    coalesce(s.version, 0) as version,
    s.hidden_at,
    s.restored_at
  from public.records r
  join public.archives a
    on a.id = r.archive_id
   and a.user_id = r.user_id
  left join public.record_moderation_states s
    on s.record_id = r.id
  where r.id = p_record_id
    and r.user_id = auth.uid()
    and a.user_id = auth.uid();
$$;

revoke all on function public.get_my_record_moderation_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_record_moderation_status(uuid)
  to authenticated;

create or replace function public.admin_list_record_moderation_events(
  p_record_id uuid,
  p_limit integer,
  p_offset integer
)
returns table (
  event_id uuid,
  request_id uuid,
  record_id uuid,
  archive_id uuid,
  owner_user_id uuid,
  actor_id uuid,
  action text,
  reason_code text,
  admin_note text,
  source_submission_id uuid,
  previous_is_hidden boolean,
  next_is_hidden boolean,
  previous_version bigint,
  next_version bigint,
  previous_effective_public boolean,
  next_effective_public boolean,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.request_id,
    e.record_id,
    e.archive_id,
    e.owner_user_id,
    e.actor_id,
    e.action,
    e.reason_code,
    e.admin_note,
    e.source_submission_id,
    e.previous_is_hidden,
    e.next_is_hidden,
    e.previous_version,
    e.next_version,
    e.previous_effective_public,
    e.next_effective_public,
    e.occurred_at
  from public.record_moderation_events e
  where public.is_app_admin(auth.uid())
    and (p_record_id is null or e.record_id = p_record_id)
  order by e.occurred_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_list_record_moderation_events(uuid,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_record_moderation_events(uuid,integer,integer)
  to authenticated;

create or replace function public.admin_update_support_submission(
  p_submission_id uuid,
  p_status text,
  p_resolution text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status, '')));
  v_resolution text := nullif(lower(trim(coalesce(p_resolution, ''))), '');
  v_admin_note text := nullif(trim(coalesce(p_admin_note, '')), '');
  v_submission public.support_submissions%rowtype;
  v_item record;
  v_count integer := 0;
  v_title text;
  v_body text;
  v_related_url text;
begin
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if v_admin_note is not null and char_length(v_admin_note) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'admin_note_too_long');
  end if;

  select * into v_submission
  from public.support_submissions as s
  where s.id = p_submission_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_submission.kind = 'report'
     and v_status = 'resolved'
     and v_resolution = 'action_taken' then
    return jsonb_build_object('ok', false, 'error', 'moderation_rpc_required');
  end if;

  if v_status = 'needs_info' then
    if v_submission.status = 'resolved' then
      return jsonb_build_object('ok', false, 'error', 'already_resolved');
    end if;
    if v_submission.supplement is not null then
      return jsonb_build_object('ok', false, 'error', 'followup_already_used');
    end if;

    update public.support_submissions as s
    set
      status = 'needs_info',
      resolution = null,
      resolved_by = null,
      resolved_at = null,
      admin_note = v_admin_note,
      updated_at = now()
    where s.id = p_submission_id;

    if v_submission.kind = 'report' then
      v_title := '举报需要补充 / Report needs more information';
      v_body := '请打开举报记录补充一次说明；无需通过邮件回复。 / Please add one supplement in your report record; no email reply is needed.';
      v_related_url := '/report?submission=' || p_submission_id::text;
    else
      v_title := '反馈需要补充 / Feedback needs more information';
      v_body := '请打开反馈记录补充一次说明；无需通过邮件回复。 / Please add one supplement in your feedback record; no email reply is needed.';
      v_related_url := '/feedback?submission=' || p_submission_id::text;
    end if;

    perform public.create_notification(
      v_submission.user_id,
      null,
      case when v_submission.kind = 'report' then 'report_update' else 'feedback_update' end,
      v_title,
      v_body,
      null,
      null,
      null,
      v_related_url,
      jsonb_build_object('support_submission_id', p_submission_id, 'status', 'needs_info')
    );

    return jsonb_build_object('ok', true, 'updated_count', 1, 'status', 'needs_info');
  end if;

  if v_status <> 'resolved' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  if v_submission.kind = 'report' then
    if v_resolution not in ('action_taken', 'no_violation', 'duplicate', 'closed') then
      return jsonb_build_object('ok', false, 'error', 'invalid_resolution');
    end if;

    if v_resolution = 'action_taken' then
      v_body := '已处理相关内容。感谢你的举报。 / Action has been taken on the reported content. Thank you.';
    elsif v_resolution = 'no_violation' then
      v_body := '已完成核查，暂未发现需要处理的问题。 / Review completed; no action is required at this time.';
    elsif v_resolution = 'duplicate' then
      v_body := '该举报已与同一内容的其他举报合并处理。 / This report was merged with other reports about the same content.';
    else
      v_body := '举报已完成处理。 / Your report has been reviewed and closed.';
    end if;
    v_title := '举报处理更新 / Report update';

    for v_item in
      update public.support_submissions as s
      set
        status = 'resolved',
        resolution = v_resolution,
        resolved_by = v_admin_id,
        resolved_at = now(),
        admin_note = v_admin_note,
        updated_at = now()
      where s.kind = 'report'
        and s.status in ('submitted', 'needs_info')
        and (
          (v_submission.target_key is not null and s.target_key = v_submission.target_key)
          or
          (v_submission.target_key is null and s.id = v_submission.id)
        )
      returning s.id, s.user_id
    loop
      v_count := v_count + 1;
      perform public.create_notification(
        v_item.user_id,
        null,
        'report_update',
        v_title,
        v_body,
        null,
        null,
        null,
        '/report?submission=' || v_item.id::text,
        jsonb_build_object('support_submission_id', v_item.id, 'status', 'resolved', 'resolution', v_resolution)
      );
    end loop;
  else
    if v_resolution not in ('recorded', 'action_taken', 'not_planned', 'closed') then
      return jsonb_build_object('ok', false, 'error', 'invalid_resolution');
    end if;

    if v_resolution = 'recorded' then
      v_body := '反馈已记录，无需邮件回复。 / Your feedback has been recorded; no email reply is needed.';
    elsif v_resolution = 'action_taken' then
      v_body := '已根据反馈完成处理。 / Action has been taken based on your feedback.';
    elsif v_resolution = 'not_planned' then
      v_body := '已完成评估，当前暂不调整。 / Review completed; no change is planned at this time.';
    else
      v_body := '反馈已完成处理。 / Your feedback has been reviewed and closed.';
    end if;
    v_title := '反馈处理更新 / Feedback update';

    update public.support_submissions as s
    set
      status = 'resolved',
      resolution = v_resolution,
      resolved_by = v_admin_id,
      resolved_at = now(),
      admin_note = v_admin_note,
      updated_at = now()
    where s.id = v_submission.id
      and s.status in ('submitted', 'needs_info');

    if found then
      v_count := 1;
      perform public.create_notification(
        v_submission.user_id,
        null,
        'feedback_update',
        v_title,
        v_body,
        null,
        null,
        null,
        '/feedback?submission=' || v_submission.id::text,
        jsonb_build_object('support_submission_id', v_submission.id, 'status', 'resolved', 'resolution', v_resolution)
      );
    end if;
  end if;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_resolved');
  end if;

  return jsonb_build_object(
    'ok', true,
    'updated_count', v_count,
    'status', 'resolved',
    'resolution', v_resolution
  );
end;
$$;

-- CREATE OR REPLACE preserves the pre-existing authenticated/service_role ACL.

create or replace view public.discovery_feed_view
with (security_invoker = true, security_barrier = true)
as
select
  r.id as record_id,
  r.archive_id,
  r.user_id,
  r.note,
  r.record_time,
  r.status_tag,
  r.primary_image_url,
  r.comment_count,
  r.media_count,
  a.title as archive_title,
  a.category as archive_category,
  a.species_id,
  a.species_name_snapshot,
  p.username,
  p.avatar_url,
  a.system_name,
  a.record_count as archive_record_count,
  a.view_count as archive_view_count,
  a.status as archive_status,
  a.ended_at as archive_ended_at,
  a.help_status as archive_help_status,
  a.help_opened_at as archive_help_opened_at,
  a.help_resolved_at as archive_help_resolved_at
from public.records r
join public.archives a on a.id = r.archive_id
left join public.public_profiles p on p.id = r.user_id
where public.is_record_effectively_public(r.id)
order by r.record_time desc;

create or replace view public.discovery_view
with (security_invoker = true, security_barrier = true)
as
select
  id,
  archive_id,
  note,
  record_time,
  user_id,
  archive_title,
  username,
  image_url,
  rn_archive,
  rn_user
from (
  select
    r.id,
    r.archive_id,
    r.note,
    r.record_time,
    r.user_id,
    a.title as archive_title,
    p.username,
    r.primary_image_url as image_url,
    row_number() over (
      partition by r.archive_id
      order by r.record_time desc
    ) as rn_archive,
    row_number() over (
      partition by r.user_id
      order by r.record_time desc
    ) as rn_user
  from public.records r
  join public.archives a on a.id = r.archive_id
  left join public.public_profiles p on p.id = r.user_id
  where public.is_record_effectively_public(r.id)
) ranked
where rn_archive = 1
  and rn_user <= 4;

create or replace view public.discovery_project_feed_view
with (security_invoker = true, security_barrier = true)
as
with public_records as (
  select
    r.id,
    r.archive_id,
    r.note,
    r.record_time,
    r.created_at,
    r.primary_image_url,
    r.comment_count,
    r.status_tag
  from public.records r
  where public.is_record_effectively_public(r.id)
),
latest_public_records as (
  select distinct on (pr.archive_id)
    pr.id,
    pr.archive_id,
    pr.note,
    pr.record_time,
    pr.created_at,
    pr.primary_image_url
  from public_records pr
  order by pr.archive_id, pr.record_time desc nulls last,
    pr.created_at desc nulls last, pr.id desc
),
public_record_stats as (
  select
    pr.archive_id,
    count(*)::bigint as public_record_count,
    coalesce(sum(coalesce(pr.comment_count, 0)::bigint), 0)::bigint as public_comment_count,
    coalesce(bool_or(pr.status_tag = 'help'), false) as has_public_help
  from public_records pr
  group by pr.archive_id
)
select
  a.id as archive_id,
  a.user_id as owner_user_id,
  a.title as archive_title,
  a.category,
  a.system_name,
  a.archive_summary,
  a.created_at as archive_created_at,
  a.ended_at as archive_ended_at,
  lpr.id as latest_public_record_id,
  lpr.note as latest_public_record_note,
  lpr.record_time as latest_public_record_time,
  lpr.created_at as latest_public_record_created_at,
  lpr.primary_image_url as latest_public_primary_image_url,
  a.species_name_snapshot,
  prs.public_record_count,
  prs.public_comment_count,
  prs.has_public_help,
  coalesce(lpr.record_time, lpr.created_at) as public_activity_at,
  pp.username as profile_display_name,
  pp.avatar_url as profile_avatar_url,
  nullif(
    concat_ws(
      ' ',
      nullif(trim(pp.country_name), ''),
      nullif(trim(pp.region_name), ''),
      nullif(trim(pp.city_name), '')
    ),
    ''
  ) as profile_region
from public_record_stats prs
join latest_public_records lpr on lpr.archive_id = prs.archive_id
join public.archives a
  on a.id = prs.archive_id
 and a.is_public is true
 and a.trashed_at is null
left join public.public_profiles pp on pp.id = a.user_id
order by public_activity_at desc nulls last, archive_id desc;

create or replace view public.public_guide_record_projection
with (security_invoker = true, security_barrier = true)
as
select
  r.id,
  r.archive_id,
  r.note,
  r.record_time,
  r.primary_image_url,
  r.visibility,
  r.created_at
from public.records r
where public.is_record_effectively_public(r.id);

grant select on table public.public_guide_record_projection
  to anon, authenticated;

drop policy if exists records_select_own_or_public on public.records;
create policy records_select_own_or_public
on public.records for select
using (
  trashed_at is null
  and exists (
    select 1
    from public.archives a
    where a.id = records.archive_id
      and a.trashed_at is null
      and (
        auth.uid() = records.user_id
        or public.is_record_effectively_public(records.id)
      )
  )
);

drop policy if exists media_select_own_or_public_record on public.media;
create policy media_select_own_or_public_record
on public.media for select
using (
  trashed_at is null
  and exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = media.record_id
      and r.trashed_at is null
      and a.trashed_at is null
      and (
        auth.uid() = media.user_id
        or public.is_record_effectively_public(r.id)
      )
  )
);

drop policy if exists market_posts_select_public_or_own on public.market_posts;
create policy market_posts_select_public_or_own
on public.market_posts for select
using (public.can_access_market_post(id));

drop policy if exists market_media_select_visible_post on public.market_media;
create policy market_media_select_visible_post
on public.market_media for select
using (public.can_access_market_media(id));

drop policy if exists media_public_record_select on storage.objects;
create policy media_public_record_select
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'media'
  and public.can_read_public_record_media_object(name)
);

drop policy if exists media_public_market_select on storage.objects;
create policy media_public_market_select
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'media'
  and public.can_read_public_market_media_object(name)
);

notify pgrst, 'reload schema';

commit;

