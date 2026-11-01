-- Snapshot of the three existing QA function definitions before R26.
-- No credentials, user rows or live payment evidence. For isolated tests only.
CREATE OR REPLACE FUNCTION public.admin_confirm_membership_payment_json(p_user_id uuid, p_plan text, p_amount numeric, p_currency text, p_payment_method text, p_payment_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_paid_at timestamp with time zone DEFAULT now(), p_service_months integer DEFAULT 12, p_storage_limit_bytes bigint DEFAULT NULL::bigint, p_base_market_post_limit integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_currency text;
  v_payment_method text;
  v_amount numeric;
  v_reference text;
  v_reference_norm text;
  v_service_months integer;
  v_storage_limit_bytes bigint;
  v_base_market_post_limit integer;
  v_current_paid_until timestamptz;
  v_service_started_at timestamptz;
  v_service_ends_at timestamptz;
  v_payment public.membership_payments%rowtype;
  v_membership public.user_memberships%rowtype;
  v_existing_payment_id uuid;
  v_recent_payment_id uuid;
begin
  if not public.is_app_admin(auth.uid()) then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'permission_denied',
      'error_detail', 'auth.uid=' || coalesce(auth.uid()::text, 'null')
    );
  end if;

  if p_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'missing_user_id',
      'error_detail', null
    );
  end if;

  if not exists (
    select 1
    from auth.users as au
    where au.id = p_user_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'target_user_not_found',
      'error_detail', p_user_id::text
    );
  end if;

  v_plan := trim(coalesce(p_plan, ''));
  v_currency := upper(trim(coalesce(p_currency, '')));
  v_payment_method := lower(trim(coalesce(p_payment_method, '')));
  v_amount := coalesce(p_amount, 0);
  v_reference := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_reference_norm := lower(regexp_replace(coalesce(v_reference, ''), '\s+', '', 'g'));
  v_service_months := greatest(coalesce(p_service_months, 12), 1);

  if v_plan not in ('basic', 'large', 'seller', 'admin') then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_plan', 'error_detail', v_plan);
  end if;

  if v_currency not in ('CNY', 'USD') then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_currency', 'error_detail', v_currency);
  end if;

  if v_payment_method not in ('wechat', 'alipay', 'paypal', 'manual', 'other') then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_payment_method', 'error_detail', v_payment_method);
  end if;

  if v_amount <= 0 then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_amount', 'error_detail', v_amount::text);
  end if;

  if v_reference is null then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'missing_payment_reference',
      'error_detail', '请填写付款编号，或使用页面自动生成的付款编号'
    );
  end if;

  -- 关键 1：同一用户的付款确认串行化，防止连续点击并发累加
  perform pg_advisory_xact_lock(
    hashtextextended('membership-payment:' || p_user_id::text, 0)
  );

  -- 关键 2：同一付款编号，哪怕之前 canceled，也不允许再次用于开通
  select mp.id
  into v_existing_payment_id
  from public.membership_payments as mp
  where mp.user_id = p_user_id
    and mp.payment_reference is not null
    and lower(regexp_replace(trim(mp.payment_reference), '\s+', '', 'g')) = v_reference_norm
  limit 1;

  if v_existing_payment_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'duplicate_payment_reference',
      'error_detail', '该付款编号已经记录过，不会重复开通或延长会员。',
      'payment_id', v_existing_payment_id
    );
  end if;

  -- 关键 3：5 分钟内，同用户、同方案、同金额、同币种、同付款方式，不允许重复确认
  select mp.id
  into v_recent_payment_id
  from public.membership_payments as mp
  where mp.user_id = p_user_id
    and mp.status = 'confirmed'
    and mp.plan = v_plan
    and mp.amount = v_amount
    and mp.currency = v_currency
    and mp.payment_method = v_payment_method
    and mp.created_at > now() - interval '5 minutes'
  order by mp.created_at desc
  limit 1;

  if v_recent_payment_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'possible_duplicate_recent_payment',
      'error_detail', '5 分钟内已有同用户、同方案、同金额、同付款方式的确认记录，不会重复延长会员。',
      'payment_id', v_recent_payment_id
    );
  end if;

  v_storage_limit_bytes := coalesce(
    p_storage_limit_bytes,
    case
      when v_plan = 'basic' then 1000000000
      when v_plan = 'large' then 5000000000
      when v_plan = 'seller' then 5000000000
      when v_plan = 'admin' then 20000000000
      else 1000000000
    end
  );

  v_base_market_post_limit := coalesce(
    p_base_market_post_limit,
    case
      when v_plan = 'basic' then 10
      when v_plan = 'large' then 15
      when v_plan = 'seller' then 50
      when v_plan = 'admin' then 999
      else 10
    end
  );

  select um.paid_until
  into v_current_paid_until
  from public.user_memberships as um
  where um.user_id = p_user_id;

  v_service_started_at := greatest(coalesce(v_current_paid_until, now()), now());
  v_service_ends_at := v_service_started_at + make_interval(months => v_service_months);

  insert into public.users (
    id,
    username,
    created_at,
    role,
    status
  )
  select
    au.id,
    coalesce(pr.username, split_part(au.email, '@', 1), 'user'),
    now(),
    'user',
    'active'
  from auth.users as au
  left join public.profiles as pr on pr.id = au.id
  where au.id = p_user_id
  on conflict (id) do nothing;

  -- 先写付款记录，成功后才更新会员
  insert into public.membership_payments (
    user_id,
    plan,
    status,
    amount,
    currency,
    payment_method,
    payment_reference,
    note,
    paid_at,
    service_started_at,
    service_ends_at,
    created_by,
    updated_at
  )
  values (
    p_user_id,
    v_plan,
    'confirmed',
    v_amount,
    v_currency,
    v_payment_method,
    v_reference,
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_paid_at, now()),
    v_service_started_at,
    v_service_ends_at,
    auth.uid(),
    now()
  )
  returning *
  into v_payment;

  insert into public.user_memberships (
    user_id,
    plan,
    status,
    paid_until,
    storage_limit_bytes,
    base_market_post_limit,
    updated_at
  )
  values (
    p_user_id,
    v_plan,
    'active',
    v_service_ends_at,
    v_storage_limit_bytes,
    v_base_market_post_limit,
    now()
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = 'active',
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = now();

  update public.profiles as pr
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = now()
  where pr.id = p_user_id;

  select *
  into v_membership
  from public.user_memberships as um
  where um.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'error_message', null,
    'error_detail', null,
    'payment_id', v_payment.id,
    'user_id', v_membership.user_id,
    'plan', v_membership.plan,
    'status', v_membership.status,
    'paid_until', v_membership.paid_until,
    'storage_limit_bytes', v_membership.storage_limit_bytes,
    'base_market_post_limit', v_membership.base_market_post_limit,
    'payment_amount', v_payment.amount,
    'payment_currency', v_payment.currency,
    'payment_method', v_payment.payment_method,
    'payment_reference', v_payment.payment_reference,
    'service_started_at', v_payment.service_started_at,
    'service_ends_at', v_payment.service_ends_at
  );

exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'duplicate_payment_reference',
      'error_detail', '数据库唯一索引阻止了重复付款编号，不会重复延长会员。'
    );
  when others then
    return jsonb_build_object(
      'ok', false,
      'error_message', sqlerrm,
      'error_detail', sqlstate
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_confirm_submitted_membership_payment_json(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_payment public.membership_payments%rowtype;
  v_current_paid_until timestamptz;
  v_service_started_at timestamptz;
  v_service_ends_at timestamptz;
begin
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = p_payment_id
    and mp.order_number is not null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_found');
  end if;

  if v_payment.status = 'confirmed' then
    return jsonb_build_object(
      'ok', true,
      'already_confirmed', true,
      'payment_id', v_payment.id,
      'user_id', v_payment.user_id,
      'service_ends_at', v_payment.service_ends_at
    );
  end if;

  if v_payment.status <> 'submitted' or v_payment.proof_path is null then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_submitted');
  end if;

  if not (
    (v_payment.currency = 'CNY' and v_payment.payment_method = 'alipay' and v_payment.amount = 64.00)
    or (v_payment.currency = 'USD' and v_payment.payment_method = 'paypal' and v_payment.amount = 8.00)
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_order_amount');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-payment:' || v_payment.user_id::text, 0)
  );

  select um.paid_until
  into v_current_paid_until
  from public.user_memberships as um
  where um.user_id = v_payment.user_id
  for update;

  v_service_started_at := greatest(coalesce(v_current_paid_until, now()), now());
  v_service_ends_at := v_service_started_at + interval '12 months';

  insert into public.users (
    id,
    username,
    created_at,
    role,
    status
  )
  select
    au.id,
    coalesce(pr.username, split_part(au.email, '@', 1), 'user'),
    now(),
    'user',
    'active'
  from auth.users as au
  left join public.profiles as pr on pr.id = au.id
  where au.id = v_payment.user_id
  on conflict (id) do nothing;

  update public.membership_payments as mp
  set
    status = 'confirmed',
    payment_reference = coalesce(mp.payment_reference, mp.order_number),
    paid_at = coalesce(mp.paid_at, mp.submitted_at, now()),
    service_started_at = v_service_started_at,
    service_ends_at = v_service_ends_at,
    created_by = v_admin_id,
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    review_note = null,
    updated_at = now()
  where mp.id = v_payment.id
  returning * into v_payment;

  insert into public.user_memberships (
    user_id,
    plan,
    status,
    paid_until,
    storage_limit_bytes,
    base_market_post_limit,
    updated_at
  )
  values (
    v_payment.user_id,
    'basic',
    'active',
    v_service_ends_at,
    1000000000,
    30,
    now()
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = now();

  update public.profiles as pr
  set
    storage_limit = 1000000000,
    updated_at = now()
  where pr.id = v_payment.user_id;

  return jsonb_build_object(
    'ok', true,
    'already_confirmed', false,
    'payment_id', v_payment.id,
    'user_id', v_payment.user_id,
    'order_number', v_payment.order_number,
    'service_started_at', v_payment.service_started_at,
    'service_ends_at', v_payment.service_ends_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error_message', 'duplicate_payment_reference');
  when others then
    return jsonb_build_object(
      'ok', false,
      'error_message', sqlerrm,
      'error_detail', sqlstate
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_paypal_membership_payment_json(p_payment_id uuid, p_paypal_order_id text, p_paypal_capture_id text, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_order_id text := nullif(trim(coalesce(p_paypal_order_id, '')), '');
  v_capture_id text := nullif(trim(coalesce(p_paypal_capture_id, '')), '');
  v_payment public.membership_payments%rowtype;
  v_current_paid_until timestamptz;
  v_service_started_at timestamptz;
  v_service_ends_at timestamptz;
begin
  if p_payment_id is null or v_order_id is null or v_capture_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'missing_paypal_confirmation');
  end if;

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = p_payment_id
    and mp.order_number is not null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_found');
  end if;

  if not (
    v_payment.payment_method = 'paypal'
    and v_payment.currency = 'USD'
    and v_payment.amount = 8.00
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_paypal_order');
  end if;

  if v_payment.provider_order_id is distinct from v_order_id then
    return jsonb_build_object('ok', false, 'error_message', 'paypal_order_mismatch');
  end if;

  if v_payment.status = 'confirmed' then
    if v_payment.provider_capture_id = v_capture_id then
      return jsonb_build_object(
        'ok', true,
        'already_confirmed', true,
        'payment_id', v_payment.id,
        'user_id', v_payment.user_id,
        'service_ends_at', v_payment.service_ends_at
      );
    end if;

    return jsonb_build_object('ok', false, 'error_message', 'paypal_capture_mismatch');
  end if;

  if v_payment.provider_capture_id is not null
     and v_payment.provider_capture_id <> v_capture_id then
    return jsonb_build_object('ok', false, 'error_message', 'paypal_capture_mismatch');
  end if;

  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_already_refunded');
  end if;

  -- The server reaches this function only after reading a COMPLETED capture
  -- directly from PayPal. If the browser canceled/expired the local order just
  -- before PayPal completed, the money still wins: activate the paid service
  -- rather than leaving a paid customer without membership.
  perform pg_advisory_xact_lock(
    hashtextextended('membership-payment:' || v_payment.user_id::text, 0)
  );

  select um.paid_until
  into v_current_paid_until
  from public.user_memberships as um
  where um.user_id = v_payment.user_id
  for update;

  v_service_started_at := greatest(coalesce(v_current_paid_until, now()), now());
  v_service_ends_at := v_service_started_at + interval '12 months';

  insert into public.users (
    id,
    username,
    created_at,
    role,
    status
  )
  select
    au.id,
    coalesce(pr.username, split_part(au.email, '@', 1), 'user'),
    now(),
    'user',
    'active'
  from auth.users as au
  left join public.profiles as pr on pr.id = au.id
  where au.id = v_payment.user_id
  on conflict (id) do nothing;

  update public.membership_payments as mp
  set
    status = 'confirmed',
    payment_reference = v_capture_id,
    paid_at = coalesce(p_paid_at, now()),
    provider_capture_id = v_capture_id,
    provider_paid_at = coalesce(p_paid_at, now()),
    service_started_at = v_service_started_at,
    service_ends_at = v_service_ends_at,
    expires_at = null,
    reviewed_by = null,
    reviewed_at = null,
    review_note = null,
    closed_at = null,
    close_reason = null,
    updated_at = now()
  where mp.id = v_payment.id
  returning * into v_payment;

  insert into public.user_memberships (
    user_id,
    plan,
    status,
    paid_until,
    storage_limit_bytes,
    base_market_post_limit,
    updated_at
  )
  values (
    v_payment.user_id,
    'basic',
    'active',
    v_service_ends_at,
    1000000000,
    30,
    now()
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = now();

  update public.profiles as pr
  set
    storage_limit = 1000000000,
    updated_at = now()
  where pr.id = v_payment.user_id;

  return jsonb_build_object(
    'ok', true,
    'already_confirmed', false,
    'payment_id', v_payment.id,
    'user_id', v_payment.user_id,
    'order_number', v_payment.order_number,
    'service_started_at', v_payment.service_started_at,
    'service_ends_at', v_payment.service_ends_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error_message', 'paypal_capture_already_used');
  when others then
    return jsonb_build_object(
      'ok', false,
      'error_message', sqlerrm,
      'error_detail', sqlstate
    );
end;
$function$;
