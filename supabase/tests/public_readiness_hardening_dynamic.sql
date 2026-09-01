-- LOCAL / ISOLATED SUPABASE ONLY. Run through run-isolated-database-tests.sh.
-- Verifies the real privilege catalog and the email-confirmation signup path.
begin;

do $$
declare
  v_anon_write_tables text[];
  v_anon_sequences text[];
  v_unexpected_anon_definers text[];
  v_direct_trigger_functions text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  into v_anon_write_tables
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname <> 'analytics_events'
    and (
      has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE')
      or has_table_privilege('anon', c.oid, 'TRUNCATE')
      or has_table_privilege('anon', c.oid, 'REFERENCES')
      or has_table_privilege('anon', c.oid, 'TRIGGER')
    );

  if cardinality(v_anon_write_tables) <> 0 then
    raise exception 'anonymous table writes remain: %', v_anon_write_tables;
  end if;

  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
  into v_anon_sequences
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'S'
    and (
      has_sequence_privilege('anon', c.oid, 'USAGE')
      or has_sequence_privilege('anon', c.oid, 'SELECT')
      or has_sequence_privilege('anon', c.oid, 'UPDATE')
    );

  if cardinality(v_anon_sequences) <> 0 then
    raise exception 'anonymous sequence privileges remain: %', v_anon_sequences;
  end if;

  select coalesce(
    array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text),
    array[]::text[]
  )
  into v_unexpected_anon_definers
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.oid <> all(array[
      'public.can_access_experience_card(uuid)'::regprocedure::oid,
      'public.can_access_market_post(uuid)'::regprocedure::oid,
      'public.can_access_record(uuid)'::regprocedure::oid,
      'public.can_read_public_market_media_object(text)'::regprocedure::oid,
      'public.can_read_public_record_media_object(text)'::regprocedure::oid,
      'public.get_experience_card_interaction_summaries(uuid[])'::regprocedure::oid,
      'public.get_public_profiles_safe()'::regprocedure::oid,
      'public.get_public_user_space_group_tags(uuid)'::regprocedure::oid,
      'public.is_archive_not_trashed(uuid)'::regprocedure::oid,
      'public.is_experience_card_public(uuid)'::regprocedure::oid
    ]);

  if cardinality(v_unexpected_anon_definers) <> 0 then
    raise exception 'unexpected anonymous SECURITY DEFINER functions: %',
      v_unexpected_anon_definers;
  end if;

  select coalesce(
    array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text),
    array[]::text[]
  )
  into v_direct_trigger_functions
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype = 'pg_catalog.trigger'::regtype
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  if cardinality(v_direct_trigger_functions) <> 0 then
    raise exception 'API roles can execute trigger functions directly: %',
      v_direct_trigger_functions;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_media_change'
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and p.prosecdef
  ) then
    raise exception 'media statistics trigger is not SECURITY DEFINER';
  end if;

  if not has_table_privilege('anon', 'public.analytics_events', 'INSERT') then
    raise exception 'anonymous analytics insert was removed';
  end if;

  if has_function_privilege(
    'anon',
    'public.increment_archive_view_count(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous archive counter execution remains';
  end if;

  if has_function_privilege('anon', 'public.get_my_membership()', 'EXECUTE') then
    raise exception 'anonymous membership execution remains';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.sync_record_media_stats(uuid)',
    'EXECUTE'
  ) then
    raise exception 'media statistics helper remains directly executable';
  end if;

  if not has_function_privilege(
    'anon',
    'public.can_access_record(uuid)',
    'EXECUTE'
  ) then
    raise exception 'public record RLS helper is no longer callable';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_public_profiles_safe()',
    'EXECUTE'
  ) then
    raise exception 'public profile view helper is no longer callable';
  end if;

  if has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE')
     or has_function_privilege(
       'authenticated',
       'public.set_updated_at()',
       'EXECUTE'
     ) then
    raise exception 'trigger function remains directly executable';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as con
    where con.conrelid = 'public.analytics_events'::regclass
      and con.conname = 'analytics_events_public_payload_bounds'
      and not con.convalidated
  ) then
    raise exception 'bounded analytics payload constraint is missing';
  end if;
end;
$$;

-- The intentionally preserved signed-out surface still serves public pages,
-- accepts a normal bounded analytics event, and rejects arbitrary analytics.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;
do $$
begin
  perform * from public.public_profiles limit 1;
  perform * from public.discovery_feed_view limit 1;
  perform * from public.discovery_project_feed_view limit 1;

  insert into public.analytics_events (
    event_name,
    anonymous_id,
    platform,
    metadata
  )
  values ('page_view', gen_random_uuid()::text, 'web', '{"path":"/"}'::jsonb);

  begin
    insert into public.analytics_events (
      event_name,
      anonymous_id,
      platform,
      metadata
    )
    values (
      'page_view',
      gen_random_uuid()::text,
      'web',
      jsonb_build_object('payload', repeat('x', 5000))
    );
    raise exception 'oversized anonymous analytics payload succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.analytics_events (
      event_name,
      anonymous_id,
      platform,
      metadata
    )
    values ('register', gen_random_uuid()::text, 'web', '{}'::jsonb);
    raise exception 'anonymous caller forged a register analytics event';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claim.role', '', true);

create temporary table public_readiness_signup_context (
  missing_consent_user uuid not null,
  confirmed_user uuid not null,
  other_user uuid not null
);

insert into public_readiness_signup_context
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

do $$
declare
  c public_readiness_signup_context%rowtype;
begin
  select * into c from public_readiness_signup_context;

  begin
    insert into auth.users (
      id,
      aud,
      role,
      email,
      created_at,
      updated_at
    )
    values (
      c.missing_consent_user,
      'authenticated',
      'authenticated',
      c.missing_consent_user::text || '@missing-consent.example.test',
      now(),
      now()
    );
    raise exception 'signup without versioned consent succeeded';
  exception
    when others then
      if sqlerrm = 'signup without versioned consent succeeded' then
        raise;
      end if;
      if position('signup_legal_consents_required' in sqlerrm) = 0 then
        raise exception 'unexpected missing-consent error: %', sqlerrm;
      end if;
  end;
end;
$$;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  confirmed_user,
  'authenticated',
  'authenticated',
  confirmed_user::text || '@confirmation.example.test',
  jsonb_build_object(
    'legal_terms_accepted', true,
    'legal_terms_version', '2026-09-01',
    'privacy_notice_accepted', true,
    'privacy_notice_version', '2026-09-01',
    'cross_border_consent', true,
    'cross_border_consent_version', '2026-09-01'
  ),
  now(),
  now()
from public_readiness_signup_context;

do $$
declare
  c public_readiness_signup_context%rowtype;
begin
  select * into c from public_readiness_signup_context;

  if not exists (
    select 1 from public.profiles as p where p.id = c.confirmed_user
  ) then
    raise exception 'unconfirmed signup did not create its private profile';
  end if;

  if exists (
    select 1 from public.users as u where u.id = c.confirmed_user
  ) then
    raise exception 'unconfirmed signup consumed a formal account rank';
  end if;

  if exists (
    select 1
    from public.user_memberships as m
    where m.user_id = c.confirmed_user
  ) then
    raise exception 'unconfirmed signup consumed a trial allowance';
  end if;

  if (
    select count(*)
    from public.account_legal_consents as alc
    where alc.user_id = c.confirmed_user
      and alc.policy_version = '2026-09-01'
  ) <> 3 then
    raise exception 'signup consent evidence was not recorded exactly once';
  end if;
end;
$$;

update auth.users
set
  email_confirmed_at = now(),
  updated_at = now()
where id = (
  select confirmed_user from public_readiness_signup_context
);

do $$
declare
  c public_readiness_signup_context%rowtype;
  v_sequence bigint;
begin
  select * into c from public_readiness_signup_context;

  select u.registration_sequence
  into v_sequence
  from public.users as u
  where u.id = c.confirmed_user
    and not u.is_internal_test
    and u.account_number is not null;

  if v_sequence is null then
    raise exception 'email confirmation did not allocate a formal account';
  end if;

  update auth.users
  set updated_at = now()
  where id = c.confirmed_user;

  if (
    select u.registration_sequence
    from public.users as u
    where u.id = c.confirmed_user
  ) <> v_sequence then
    raise exception 'ordinary auth update changed the permanent account rank';
  end if;
end;
$$;

-- Consent evidence is readable only by its owner.
select set_config(
  'request.jwt.claim.sub',
  (select confirmed_user::text from public_readiness_signup_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.account_legal_consents) <> 3 then
    raise exception 'confirmed user could not read exactly their consent rows';
  end if;
end;
$$;
reset role;

select set_config(
  'request.jwt.claim.sub',
  (select other_user::text from public_readiness_signup_context),
  true
);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.account_legal_consents) then
    raise exception 'another user could read signup consent evidence';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
