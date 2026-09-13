-- LOCAL / ISOLATED SUPABASE ONLY. Run through run-isolated-database-tests.sh.
-- No production data is touched; every fixture and assertion is rolled back.
begin;

create temporary table paypal_auto_membership_test_context (
  user_id uuid not null,
  first_payment_id uuid not null,
  second_payment_id uuid not null,
  first_order_id text not null,
  second_order_id text not null,
  first_capture_id text not null,
  second_capture_id text not null
);

grant select on paypal_auto_membership_test_context to service_role;

insert into paypal_auto_membership_test_context
values (
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  'PAYPAL-ORDER-ISOLATED-1',
  'PAYPAL-ORDER-ISOLATED-2',
  'PAYPAL-CAPTURE-ISOLATED-1',
  'PAYPAL-CAPTURE-ISOLATED-2'
);

insert into public.users (id, username, cloud_enabled)
select user_id, 'paypal-auto-membership-fixture', false
from paypal_auto_membership_test_context;

insert into public.profiles (id, username)
select user_id, 'paypal-auto-membership-fixture'
from paypal_auto_membership_test_context;

-- Seed the public rows first so the real signup trigger follows its idempotent
-- path and no foreign key or trigger needs to be disabled for this test.
insert into auth.users (id, aud, role, email, created_at, updated_at)
select
  user_id,
  'authenticated',
  'authenticated',
  user_id::text || '@paypal-membership-fixture.example.test',
  now(),
  now()
from paypal_auto_membership_test_context;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.bind_paypal_membership_order_json(uuid,uuid,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.bind_paypal_membership_order_json(uuid,uuid,text)',
    'execute'
  ) then
    raise exception 'PayPal order binding is exposed to a browser role';
  end if;

  if has_function_privilege(
    'anon',
    'public.confirm_paypal_membership_payment_json(uuid,text,text,timestamptz)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.confirm_paypal_membership_payment_json(uuid,text,text,timestamptz)',
    'execute'
  ) then
    raise exception 'PayPal membership confirmation is exposed to a browser role';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.bind_paypal_membership_order_json(uuid,uuid,text)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.confirm_paypal_membership_payment_json(uuid,text,text,timestamptz)',
    'execute'
  ) then
    raise exception 'service_role cannot execute the PayPal payment bridge';
  end if;
end;
$$;

insert into public.membership_payments (
  id,
  user_id,
  plan,
  status,
  amount,
  currency,
  payment_method,
  order_number,
  paid_at,
  expires_at,
  payment_destination_key,
  payment_destination_label,
  payment_destination_version
)
select
  first_payment_id,
  user_id,
  'basic',
  'pending_payment',
  8.00,
  'USD',
  'paypal',
  'YS-PAYPAL-ISOLATED-1',
  null,
  now() + interval '24 hours',
  'paypal_checkout_orders_api',
  'LifeSpace',
  'paypal-orders-v2-v1'
from paypal_auto_membership_test_context;

set local role service_role;

do $$
declare
  c paypal_auto_membership_test_context%rowtype;
  v_result jsonb;
begin
  select * into c from paypal_auto_membership_test_context;

  v_result := public.bind_paypal_membership_order_json(
    c.first_payment_id,
    c.user_id,
    c.first_order_id
  );
  if not coalesce((v_result->>'ok')::boolean, false)
     or coalesce((v_result->>'already_bound')::boolean, true) then
    raise exception 'first PayPal order binding failed: %', v_result;
  end if;

  v_result := public.bind_paypal_membership_order_json(
    c.first_payment_id,
    c.user_id,
    c.first_order_id
  );
  if not coalesce((v_result->>'ok')::boolean, false)
     or not coalesce((v_result->>'already_bound')::boolean, false) then
    raise exception 'repeated PayPal order binding was not idempotent: %', v_result;
  end if;

  v_result := public.bind_paypal_membership_order_json(
    c.first_payment_id,
    c.user_id,
    'PAYPAL-ORDER-ISOLATED-DIFFERENT'
  );
  if coalesce((v_result->>'ok')::boolean, false)
     or v_result->>'error_message' <> 'paypal_order_already_bound' then
    raise exception 'a LifeSpace order accepted a second PayPal order: %', v_result;
  end if;

  v_result := public.confirm_paypal_membership_payment_json(
    c.first_payment_id,
    c.first_order_id,
    c.first_capture_id,
    '2026-09-13 10:00:00+00'::timestamptz
  );
  if not coalesce((v_result->>'ok')::boolean, false)
     or coalesce((v_result->>'already_confirmed')::boolean, true) then
    raise exception 'first PayPal confirmation failed: %', v_result;
  end if;

  v_result := public.confirm_paypal_membership_payment_json(
    c.first_payment_id,
    c.first_order_id,
    c.first_capture_id,
    '2026-09-13 10:00:00+00'::timestamptz
  );
  if not coalesce((v_result->>'ok')::boolean, false)
     or not coalesce((v_result->>'already_confirmed')::boolean, false) then
    raise exception 'repeated PayPal confirmation was not idempotent: %', v_result;
  end if;

  v_result := public.confirm_paypal_membership_payment_json(
    c.first_payment_id,
    c.first_order_id,
    'PAYPAL-CAPTURE-ISOLATED-DIFFERENT',
    '2026-09-13 10:00:00+00'::timestamptz
  );
  if coalesce((v_result->>'ok')::boolean, false)
     or v_result->>'error_message' <> 'paypal_capture_mismatch' then
    raise exception 'confirmed payment accepted another capture: %', v_result;
  end if;
end;
$$;

reset role;

do $$
declare
  c paypal_auto_membership_test_context%rowtype;
begin
  select * into c from paypal_auto_membership_test_context;

  if not exists (
    select 1
    from public.membership_payments as payment
    where payment.id = c.first_payment_id
      and payment.status = 'confirmed'
      and payment.provider_order_id = c.first_order_id
      and payment.provider_capture_id = c.first_capture_id
      and payment.payment_reference = c.first_capture_id
      and payment.provider_paid_at = '2026-09-13 10:00:00+00'::timestamptz
  ) then
    raise exception 'confirmed PayPal identifiers were not recorded exactly';
  end if;

  if not exists (
    select 1
    from public.user_memberships as membership
    where membership.user_id = c.user_id
      and membership.plan = 'basic'
      and membership.status = 'active'
      and membership.storage_limit_bytes = 1000000000
      and membership.base_market_post_limit = 30
  ) then
    raise exception 'PayPal confirmation did not grant the fixed Plus entitlements';
  end if;

  if (select storage_limit from public.profiles where id = c.user_id) <> 1000000000 then
    raise exception 'PayPal confirmation did not update the profile storage limit';
  end if;
end;
$$;

insert into public.membership_payments (
  id,
  user_id,
  plan,
  status,
  amount,
  currency,
  payment_method,
  order_number,
  paid_at,
  expires_at,
  payment_destination_key,
  payment_destination_label,
  payment_destination_version
)
select
  second_payment_id,
  user_id,
  'basic',
  'pending_payment',
  8.00,
  'USD',
  'paypal',
  'YS-PAYPAL-ISOLATED-2',
  null,
  now() + interval '24 hours',
  'paypal_checkout_orders_api',
  'LifeSpace',
  'paypal-orders-v2-v1'
from paypal_auto_membership_test_context;

set local role service_role;

do $$
declare
  c paypal_auto_membership_test_context%rowtype;
  v_result jsonb;
begin
  select * into c from paypal_auto_membership_test_context;

  v_result := public.bind_paypal_membership_order_json(
    c.second_payment_id,
    c.user_id,
    c.second_order_id
  );
  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'second PayPal order binding failed: %', v_result;
  end if;

  v_result := public.confirm_paypal_membership_payment_json(
    c.second_payment_id,
    c.second_order_id,
    c.first_capture_id,
    '2026-09-13 11:00:00+00'::timestamptz
  );
  if coalesce((v_result->>'ok')::boolean, false)
     or v_result->>'error_message' <> 'paypal_capture_already_used' then
    raise exception 'a PayPal capture was reused across LifeSpace orders: %', v_result;
  end if;

  v_result := public.confirm_paypal_membership_payment_json(
    c.second_payment_id,
    c.second_order_id,
    c.second_capture_id,
    '2026-09-13 11:00:00+00'::timestamptz
  );
  if not coalesce((v_result->>'ok')::boolean, false) then
    raise exception 'second unique PayPal confirmation failed: %', v_result;
  end if;
end;
$$;

reset role;

do $$
declare
  c paypal_auto_membership_test_context%rowtype;
  v_first_end timestamptz;
  v_second_start timestamptz;
  v_second_end timestamptz;
begin
  select * into c from paypal_auto_membership_test_context;
  select service_ends_at
  into v_first_end
  from public.membership_payments
  where id = c.first_payment_id;

  select service_started_at, service_ends_at
  into v_second_start, v_second_end
  from public.membership_payments
  where id = c.second_payment_id;

  if v_first_end is null
     or v_second_start is distinct from v_first_end
     or v_second_end is distinct from v_first_end + interval '12 months' then
    raise exception 'second PayPal payment did not extend exactly from the existing future term';
  end if;
end;
$$;

rollback;
