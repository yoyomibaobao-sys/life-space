-- LOCAL / ISOLATED SUPABASE ONLY. Run through run-isolated-database-tests.sh.
-- Verifies that an administrator can discover business rows whose old Auth
-- identity is already gone, without resurrecting completed soft-deletions that
-- retain only payment audit rows.
begin;

create temporary table admin_residual_test_context (
  admin_user uuid not null,
  orphan_user uuid not null,
  deleted_payment_user uuid not null,
  orphan_archive uuid not null
);

insert into admin_residual_test_context
values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

grant select on admin_residual_test_context to authenticated;

do $$
declare
  c admin_residual_test_context%rowtype;
  v_metadata jsonb := jsonb_build_object(
    'legal_terms_accepted', true,
    'privacy_notice_accepted', true,
    'cross_border_consent', true,
    'legal_terms_version', '2026-09-01',
    'privacy_notice_version', '2026-09-01',
    'cross_border_consent_version', '2026-09-01'
  );
begin
  select * into c from admin_residual_test_context;

  insert into auth.users (
    id,
    aud,
    role,
    email,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      c.admin_user,
      'authenticated',
      'authenticated',
      c.admin_user::text || '@admin-residual.example.test',
      now(),
      v_metadata,
      now(),
      now()
    ),
    (
      c.deleted_payment_user,
      'authenticated',
      'authenticated',
      c.deleted_payment_user::text || '@deleted-payment.example.test',
      now(),
      v_metadata,
      now(),
      now()
    );

  insert into public.app_admins (user_id)
  values (c.admin_user);

  insert into public.archives (
    id,
    user_id,
    title,
    category,
    is_public
  )
  values (
    c.orphan_archive,
    c.orphan_user,
    'orphaned-test-project',
    'plant',
    true
  );

  insert into public.membership_payments (
    user_id,
    plan,
    status,
    amount,
    currency,
    payment_method
  )
  values (
    c.deleted_payment_user,
    'basic',
    'canceled',
    64,
    'CNY',
    'manual'
  );

  delete from public.user_memberships
  where user_id = c.deleted_payment_user;
  delete from public.profiles
  where id = c.deleted_payment_user;
  delete from public.users
  where id = c.deleted_payment_user;
  update auth.users
  set deleted_at = now()
  where id = c.deleted_payment_user;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select admin_user::text from admin_residual_test_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  c admin_residual_test_context%rowtype;
begin
  select * into c from admin_residual_test_context;

  if not exists (
    select 1
    from public.admin_search_memberships(c.orphan_user::text) as result
    where result.user_id = c.orphan_user
      and result.archive_count = 1
      and result.record_count = 0
  ) then
    raise exception 'orphaned archive owner was not returned to the administrator';
  end if;

  if exists (
    select 1
    from public.admin_search_memberships(c.deleted_payment_user::text) as result
    where result.user_id = c.deleted_payment_user
  ) then
    raise exception 'completed soft deletion reappeared from payment audit rows';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
