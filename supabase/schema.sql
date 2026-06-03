


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."admin_confirm_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text", "p_paid_at" timestamp with time zone DEFAULT "now"(), "p_service_months" integer DEFAULT 12, "p_storage_limit_bytes" bigint DEFAULT NULL::bigint, "p_base_market_post_limit" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."admin_confirm_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_months" integer, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text", "p_paid_at" timestamp with time zone DEFAULT "now"(), "p_service_started_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_service_ends_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payment public.membership_payments%rowtype;
  v_plan text;
  v_currency text;
  v_payment_method text;
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
    from auth.users au
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

  if v_plan not in ('basic', 'large', 'seller', 'admin') then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_plan',
      'error_detail', v_plan
    );
  end if;

  if v_currency not in ('CNY', 'USD') then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_currency',
      'error_detail', v_currency
    );
  end if;

  if v_payment_method not in ('wechat', 'alipay', 'paypal', 'manual', 'other') then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_payment_method',
      'error_detail', v_payment_method
    );
  end if;

  if coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_amount',
      'error_detail', coalesce(p_amount, 0)::text
    );
  end if;

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
    p_amount,
    v_currency,
    v_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_paid_at, now()),
    p_service_started_at,
    p_service_ends_at,
    auth.uid(),
    now()
  )
  returning *
  into v_payment;

  return jsonb_build_object(
    'ok', true,
    'error_message', null,
    'error_detail', null,
    'id', v_payment.id,
    'user_id', v_payment.user_id,
    'plan', v_payment.plan,
    'amount', v_payment.amount,
    'currency', v_payment.currency,
    'payment_method', v_payment.payment_method,
    'paid_at', v_payment.paid_at,
    'service_ends_at', v_payment.service_ends_at
  );

exception when others then
  return jsonb_build_object(
    'ok', false,
    'error_message', sqlerrm,
    'error_detail', sqlstate
  );
end;
$$;


ALTER FUNCTION "public"."admin_create_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_started_at" timestamp with time zone, "p_service_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_memberships"("p_keyword" "text" DEFAULT ''::"text") RETURNS TABLE("user_id" "uuid", "email" "text", "username" "text", "plan" "text", "status" "text", "trial_ends_at" timestamp with time zone, "paid_until" timestamp with time zone, "storage_used" bigint, "storage_limit_bytes" bigint, "base_market_post_limit" integer, "active_market_post_count" integer, "market_post_limit" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    u.id as user_id,
    u.email::text as email,
    p.username,
    m.plan,
    case
      when m.plan = 'admin' then 'active'
      when m.paid_until is not null and m.paid_until > now() then 'active'
      when m.plan = 'trial' and m.trial_ends_at > now() then 'trialing'
      when m.status in ('past_due', 'canceled') then m.status
      else 'expired'
    end as status,
    m.trial_ends_at,
    m.paid_until,
    coalesce(p.storage_used, 0)::bigint as storage_used,
    m.storage_limit_bytes,
    m.base_market_post_limit,
    public.get_user_active_market_post_count(u.id) as active_market_post_count,
    public.get_user_market_post_limit(u.id) as market_post_limit,
    m.created_at,
    m.updated_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_memberships m on m.user_id = u.id
  where public.is_app_admin(auth.uid())
    and (
      coalesce(nullif(trim(p_keyword), ''), '') = ''
      or u.email ilike '%' || trim(p_keyword) || '%'
      or p.username ilike '%' || trim(p_keyword) || '%'
      or u.id::text = trim(p_keyword)
    )
  order by u.created_at desc
  limit 50;
$$;


ALTER FUNCTION "public"."admin_search_memberships"("p_keyword" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_search_memberships"("p_keyword" "text") IS '管理员查询用户会员、容量、集市额度。仅 app_admins 可返回数据。';



CREATE OR REPLACE FUNCTION "public"."admin_update_membership_payment_status_json"("p_payment_id" "uuid", "p_status" "text", "p_note_append" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_payment public.membership_payments%rowtype;
begin
  if not public.is_app_admin(auth.uid()) then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'permission_denied',
      'error_detail', 'auth.uid=' || coalesce(auth.uid()::text, 'null')
    );
  end if;

  if p_payment_id is null then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'missing_payment_id',
      'error_detail', null
    );
  end if;

  v_status := lower(trim(coalesce(p_status, '')));

  if v_status not in ('confirmed', 'refunded', 'canceled') then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_status',
      'error_detail', v_status
    );
  end if;

  if not exists (
    select 1
    from public.membership_payments mp
    where mp.id = p_payment_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'payment_not_found',
      'error_detail', p_payment_id::text
    );
  end if;

  update public.membership_payments as mp
  set
    status = v_status,
    note = case
      when nullif(trim(coalesce(p_note_append, '')), '') is null then mp.note
      when mp.note is null or trim(mp.note) = '' then trim(p_note_append)
      else mp.note || E'\n' || trim(p_note_append)
    end,
    updated_at = now()
  where mp.id = p_payment_id
  returning *
  into v_payment;

  return jsonb_build_object(
    'ok', true,
    'error_message', null,
    'error_detail', null,
    'id', v_payment.id,
    'user_id', v_payment.user_id,
    'plan', v_payment.plan,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'currency', v_payment.currency,
    'payment_method', v_payment.payment_method,
    'payment_reference', v_payment.payment_reference,
    'note', v_payment.note,
    'paid_at', v_payment.paid_at,
    'service_started_at', v_payment.service_started_at,
    'service_ends_at', v_payment.service_ends_at
  );

exception when others then
  return jsonb_build_object(
    'ok', false,
    'error_message', sqlerrm,
    'error_detail', sqlstate
  );
end;
$$;


ALTER FUNCTION "public"."admin_update_membership_payment_status_json"("p_payment_id" "uuid", "p_status" "text", "p_note_append" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_user_membership"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) RETURNS TABLE("user_id" "uuid", "plan" "text", "status" "text", "trial_ends_at" timestamp with time zone, "paid_until" timestamp with time zone, "storage_limit_bytes" bigint, "base_market_post_limit" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan text;
  v_status text;
  v_storage_limit_bytes bigint;
  v_base_market_post_limit integer;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'permission_denied';
  end if;

  if p_user_id is null then
    raise exception 'missing_user_id';
  end if;

  v_plan := trim(coalesce(p_plan, ''));

  if v_plan not in ('trial', 'basic', 'large', 'seller', 'admin') then
    raise exception 'invalid_plan: %', v_plan;
  end if;

  v_storage_limit_bytes := greatest(coalesce(p_storage_limit_bytes, 0), 0);
  v_base_market_post_limit := greatest(coalesce(p_base_market_post_limit, 0), 0);

  if v_storage_limit_bytes <= 0 then
    raise exception 'invalid_storage_limit';
  end if;

  v_status := case
    when v_plan = 'trial' then 'trialing'
    else 'active'
  end;

  -- user_memberships 外键指向 public.users，不是 auth.users。
  -- 所以这里先确保 public.users 有目标用户。
  insert into public.users (
    id,
    username,
    created_at,
    role,
    status
  )
  select
    au.id,
    coalesce(p.username, split_part(au.email, '@', 1), 'user'),
    now(),
    'user',
    'active'
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id = p_user_id
  on conflict (id) do nothing;

  -- 如果 auth.users 里也没有这个用户，直接报错。
  if not exists (
    select 1
    from auth.users au
    where au.id = p_user_id
  ) then
    raise exception 'target_user_not_found';
  end if;

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
    v_status,
    case when v_plan = 'trial' then null else p_paid_until end,
    v_storage_limit_bytes,
    v_base_market_post_limit,
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

  update public.profiles as p
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = now()
  where p.id = p_user_id;

  return query
  select
    m.user_id,
    m.plan,
    m.status,
    m.trial_ends_at,
    m.paid_until,
    m.storage_limit_bytes,
    m.base_market_post_limit
  from public.user_memberships as m
  where m.user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."admin_update_user_membership"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_update_user_membership"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) IS '管理员手动修改用户会员方案、到期时间、容量和集市基础额度。';



CREATE OR REPLACE FUNCTION "public"."admin_update_user_membership_json"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan text;
  v_status text;
  v_storage_limit_bytes bigint;
  v_base_market_post_limit integer;
  v_row public.user_memberships%rowtype;
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

  if v_plan not in ('trial', 'basic', 'large', 'seller', 'admin') then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_plan',
      'error_detail', v_plan
    );
  end if;

  v_storage_limit_bytes := greatest(coalesce(p_storage_limit_bytes, 0), 0);
  v_base_market_post_limit := greatest(coalesce(p_base_market_post_limit, 0), 0);

  if v_storage_limit_bytes <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_storage_limit',
      'error_detail', v_storage_limit_bytes::text
    );
  end if;

  if v_plan <> 'trial' and p_paid_until is null then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'missing_paid_until',
      'error_detail', null
    );
  end if;

  v_status := case
    when v_plan = 'trial' then 'trialing'
    else 'active'
  end;

  -- 确保 public.users 中有这个用户，避免外键问题
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

  -- 更新会员
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
    v_status,
    case when v_plan = 'trial' then null else p_paid_until end,
    v_storage_limit_bytes,
    v_base_market_post_limit,
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

  -- 同步 profiles.storage_limit
  update public.profiles as pr
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = now()
  where pr.id = p_user_id;

  select *
  into v_row
  from public.user_memberships as um
  where um.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'error_message', null,
    'error_detail', null,
    'user_id', v_row.user_id,
    'plan', v_row.plan,
    'status', v_row.status,
    'trial_ends_at', v_row.trial_ends_at,
    'paid_until', v_row.paid_until,
    'storage_limit_bytes', v_row.storage_limit_bytes,
    'base_market_post_limit', v_row.base_market_post_limit
  );

exception when others then
  return jsonb_build_object(
    'ok', false,
    'error_message', sqlerrm,
    'error_detail', sqlstate
  );
end;
$$;


ALTER FUNCTION "public"."admin_update_user_membership_json"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_user_membership_safe"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) RETURNS TABLE("ok" boolean, "error_message" "text", "error_detail" "text", "user_id" "uuid", "plan" "text", "status" "text", "trial_ends_at" timestamp with time zone, "paid_until" timestamp with time zone, "storage_limit_bytes" bigint, "base_market_post_limit" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan text;
  v_status text;
  v_storage_limit_bytes bigint;
  v_base_market_post_limit integer;
begin
  if not public.is_app_admin(auth.uid()) then
    return query select
      false,
      'permission_denied'::text,
      ('auth.uid=' || coalesce(auth.uid()::text, 'null'))::text,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::integer;
    return;
  end if;

  if p_user_id is null then
    return query select
      false,
      'missing_user_id'::text,
      null::text,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::integer;
    return;
  end if;

  v_plan := trim(coalesce(p_plan, ''));

  if v_plan not in ('trial', 'basic', 'large', 'seller', 'admin') then
    return query select
      false,
      'invalid_plan'::text,
      v_plan::text,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::integer;
    return;
  end if;

  v_storage_limit_bytes := greatest(coalesce(p_storage_limit_bytes, 0), 0);
  v_base_market_post_limit := greatest(coalesce(p_base_market_post_limit, 0), 0);

  if v_storage_limit_bytes <= 0 then
    return query select
      false,
      'invalid_storage_limit'::text,
      v_storage_limit_bytes::text,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::integer;
    return;
  end if;

  if v_plan <> 'trial' and p_paid_until is null then
    return query select
      false,
      'missing_paid_until'::text,
      null::text,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::integer;
    return;
  end if;

  v_status := case
    when v_plan = 'trial' then 'trialing'
    else 'active'
  end;

  if not exists (
    select 1
    from auth.users au
    where au.id = p_user_id
  ) then
    return query select
      false,
      'target_user_not_found_in_auth_users'::text,
      p_user_id::text,
      null::uuid,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::bigint,
      null::integer;
    return;
  end if;

  insert into public.users (
    id,
    username,
    created_at,
    role,
    status
  )
  select
    au.id,
    coalesce(p.username, split_part(au.email, '@', 1), 'user'),
    now(),
    'user',
    'active'
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id = p_user_id
  on conflict (id) do nothing;

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
    v_status,
    case when v_plan = 'trial' then null else p_paid_until end,
    v_storage_limit_bytes,
    v_base_market_post_limit,
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

  update public.profiles as p
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = now()
  where p.id = p_user_id;

  return query
  select
    true,
    null::text,
    null::text,
    m.user_id,
    m.plan,
    m.status,
    m.trial_ends_at,
    m.paid_until,
    m.storage_limit_bytes,
    m.base_market_post_limit
  from public.user_memberships as m
  where m.user_id = p_user_id;

exception when others then
  return query select
    false,
    sqlerrm::text,
    sqlstate::text,
    null::uuid,
    null::text,
    null::text,
    null::timestamptz,
    null::timestamptz,
    null::bigint,
    null::integer;
end;
$$;


ALTER FUNCTION "public"."admin_update_user_membership_safe"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_market_post"("p_market_post_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.market_posts mp
    where mp.id = p_market_post_id
      and (
        mp.status = 'active'
        or mp.user_id = auth.uid()
      )
  );
$$;


ALTER FUNCTION "public"."can_access_market_post"("p_market_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_record"("p_record_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = p_record_id
      and (
        auth.uid() = r.user_id
        or (r.visibility = 'public' and a.is_public = true)
      )
  );
$$;


ALTER FUNCTION "public"."can_access_record"("p_record_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_comment_market_post"("p_market_post_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.market_posts mp
    where mp.id = p_market_post_id
      and mp.status = 'active'
  );
$$;


ALTER FUNCTION "public"."can_comment_market_post"("p_market_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_user_create_market_post"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_user_membership_active(p_user_id)
     AND public.get_user_active_market_post_count(p_user_id) < public.get_user_market_post_limit(p_user_id);
$$;


ALTER FUNCTION "public"."can_user_create_market_post"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_user_create_market_post"("p_user_id" "uuid") IS '是否还能新增集市发布。当前仅供前端/后续 RLS 使用，本 migration 不直接拦截现有发布。';



CREATE OR REPLACE FUNCTION "public"."clear_archive_help_status"("p_archive_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  next_status text;
BEGIN
  UPDATE public.archives
  SET
    help_status = 'none',
    help_opened_at = NULL,
    help_resolved_at = NULL,
    help_updated_at = now()
  WHERE id = p_archive_id
    AND user_id = auth.uid()
  RETURNING help_status INTO next_status;

  RETURN COALESCE(next_status, 'none');
END;
$$;


ALTER FUNCTION "public"."clear_archive_help_status"("p_archive_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_archive_id" "uuid", "p_record_id" "uuid", "p_comment_id" "uuid", "p_related_url" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_id is null then
    return;
  end if;

  -- 不给自己发通知
  if p_actor_user_id is not null and p_user_id = p_actor_user_id then
    return;
  end if;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    archive_id,
    record_id,
    comment_id,
    related_url,
    metadata
  )
  values (
    p_user_id,
    p_actor_user_id,
    p_type,
    p_title,
    p_body,
    p_archive_id,
    p_record_id,
    p_comment_id,
    p_related_url,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_archive_id" "uuid", "p_record_id" "uuid", "p_comment_id" "uuid", "p_related_url" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_record_privacy_by_archive"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_archive record;
BEGIN
  SELECT id, user_id, is_public
  INTO target_archive
  FROM public.archives
  WHERE id = NEW.archive_id;

  IF target_archive.id IS NULL THEN
    RAISE EXCEPTION 'Archive does not exist';
  END IF;

  IF NEW.user_id IS DISTINCT FROM target_archive.user_id THEN
    RAISE EXCEPTION 'Record user_id must match archive owner';
  END IF;

  IF NEW.visibility IS NULL OR NEW.visibility NOT IN ('public', 'private') THEN
    NEW.visibility := 'private';
  END IF;

  IF target_archive.is_public IS NOT TRUE THEN
    NEW.visibility := 'private';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_record_privacy_by_archive"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_user_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_memberships (
    user_id,
    plan,
    status,
    trial_started_at,
    trial_ends_at,
    storage_limit_bytes,
    base_market_post_limit
  ) values (
    new.id,
    'trial',
    'trialing',
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now()) + interval '6 months',
    300000000,
    3
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_user_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_membership"() RETURNS TABLE("user_id" "uuid", "plan" "text", "status" "text", "trial_started_at" timestamp with time zone, "trial_ends_at" timestamp with time zone, "paid_until" timestamp with time zone, "storage_limit_bytes" bigint, "base_market_post_limit" integer, "active_market_post_count" integer, "market_post_limit" integer, "can_create_content" boolean, "can_create_market_post" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    m.user_id,
    m.plan,
    case
      when m.plan = 'admin' then 'active'
      when m.paid_until is not null and m.paid_until > now() then 'active'
      when m.plan = 'trial' and m.trial_ends_at > now() then 'trialing'
      when m.status in ('past_due', 'canceled') then m.status
      else 'expired'
    end as status,
    m.trial_started_at,
    m.trial_ends_at,
    m.paid_until,
    m.storage_limit_bytes,
    m.base_market_post_limit,
    public.get_user_active_market_post_count(m.user_id) as active_market_post_count,
    public.get_user_market_post_limit(m.user_id) as market_post_limit,
    public.is_user_membership_active(m.user_id) as can_create_content,
    public.can_user_create_market_post(m.user_id) as can_create_market_post
  from public.user_memberships m
  where m.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_membership"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_my_membership"() IS '前端可调用：获取当前登录用户试用/年费/容量/集市额度状态。status 为按时间实时计算后的状态。';



CREATE OR REPLACE FUNCTION "public"."get_public_user_space_group_tags"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "user_id" "uuid", "name" "text", "created_at" timestamp without time zone, "sub_tag_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT
    gt.id,
    gt.user_id,
    gt.name,
    gt.created_at,
    a.sub_tag_id
  FROM public.group_tags gt
  JOIN public.archives a
    ON a.group_tag_id = gt.id
   AND a.user_id = gt.user_id
  WHERE gt.user_id = p_user_id
    AND a.is_public = true
    AND a.sub_tag_id IS NOT NULL
  ORDER BY gt.created_at ASC;
$$;


ALTER FUNCTION "public"."get_public_user_space_group_tags"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_active_market_post_count"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT count(*)::integer
  FROM public.market_posts mp
  WHERE mp.user_id = p_user_id
    AND mp.status = 'active';
$$;


ALTER FUNCTION "public"."get_user_active_market_post_count"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_market_post_limit"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN NOT public.is_user_membership_active(p_user_id) THEN 0
    ELSE COALESCE((SELECT m.base_market_post_limit FROM public.user_memberships m WHERE m.user_id = p_user_id), 0)
      + COALESCE((
          SELECT sum(a.extra_post_limit)::integer
          FROM public.market_post_quota_addons a
          WHERE a.user_id = p_user_id
            AND a.starts_at <= now()
            AND a.ends_at > now()
        ), 0)
  END;
$$;


ALTER FUNCTION "public"."get_user_market_post_limit"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_storage_limit_bytes"("p_user_id" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT m.storage_limit_bytes FROM public.user_memberships m WHERE m.user_id = p_user_id),
    0
  );
$$;


ALTER FUNCTION "public"."get_user_storage_limit_bytes"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_comment_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  target_record_id uuid;
begin
  target_record_id := coalesce(new.record_id, old.record_id);

  if target_record_id is not null then
    perform public.sync_record_comment_count(target_record_id);
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."handle_comment_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_comment_flower_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_profile_flower_count(old.receiver_user_id);
    return old;
  end if;

  perform public.sync_profile_flower_count(new.receiver_user_id);

  if tg_op = 'UPDATE' and old.receiver_user_id is distinct from new.receiver_user_id then
    perform public.sync_profile_flower_count(old.receiver_user_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_comment_flower_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_media_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_record_id uuid;
BEGIN
  v_record_id := coalesce(NEW.record_id, OLD.record_id);

  IF v_record_id IS NOT NULL THEN
    PERFORM public.sync_record_media_stats(v_record_id);
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."handle_media_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username
  )
  VALUES (
    NEW.id,
    NEW.email,
    split_part(COALESCE(NEW.email, ''), '@', 1)
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    username = COALESCE(public.profiles.username, EXCLUDED.username);

  INSERT INTO public.users (
    id,
    username,
    created_at,
    last_login_at,
    cloud_enabled,
    role,
    status
  )
  VALUES (
    NEW.id,
    split_part(COALESCE(NEW.email, ''), '@', 1),
    now(),
    now(),
    false,
    'user',
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_record_archive_stats_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_archive_stats(old.archive_id);
    return old;
  end if;

  perform public.sync_archive_stats(new.archive_id);

  if tg_op = 'UPDATE' and old.archive_id is distinct from new.archive_id then
    perform public.sync_archive_stats(old.archive_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_record_archive_stats_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_record_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.archives AS a
  SET
    record_count = (
      SELECT count(*)::integer
      FROM public.records AS r
      WHERE r.archive_id = a.id
    ),
    last_record_time = (
      SELECT max(r.record_time)
      FROM public.records AS r
      WHERE r.archive_id = a.id
    ),
    cover_image_url = (
      SELECT r.primary_image_url
      FROM public.records AS r
      WHERE r.archive_id = a.id
        AND r.primary_image_url IS NOT NULL
      ORDER BY r.record_time DESC, r.created_at DESC
      LIMIT 1
    )
  WHERE a.id = NEW.archive_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_record_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_archive_view_count"("p_archive_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  next_count integer;
BEGIN
  UPDATE public.archives
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_archive_id
    AND is_public = true
  RETURNING view_count INTO next_count;

  RETURN COALESCE(next_count, 0);
END;
$$;


ALTER FUNCTION "public"."increment_archive_view_count"("p_archive_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.app_admins a
    where a.user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_app_admin"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_app_admin"("p_user_id" "uuid") IS '判断用户是否为有时·耕作后台管理员。';



CREATE OR REPLACE FUNCTION "public"."is_market_post_owner"("p_market_post_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.market_posts mp
    where mp.id = p_market_post_id
      and mp.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_market_post_owner"("p_market_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_record_owner"("p_record_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.records r
    where r.id = p_record_id
      and r.user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_record_owner"("p_record_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_membership_active"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_memberships m
    where m.user_id = p_user_id
      and (
        m.plan = 'admin'
        or (
          m.paid_until is not null
          and m.paid_until > now()
        )
        or (
          m.plan = 'trial'
          and m.trial_ends_at > now()
        )
      )
  );
$$;


ALTER FUNCTION "public"."is_user_membership_active"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_membership_active"("p_user_id" "uuid") IS '是否处于试用期内或有效付费期内。按时间实时判断，过期后仍可查看/导出/删除，但不允许新增。';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."archives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "category" "text",
    "species_id" "uuid",
    "location_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text",
    "slug" "text",
    "group_tag_id" "uuid",
    "is_public" boolean DEFAULT false,
    "sub_tag_id" "uuid",
    "note" "text",
    "system_name" "text",
    "source" "text",
    "species_name_snapshot" "text",
    "cover_image_url" "text",
    "record_count" integer DEFAULT 0 NOT NULL,
    "last_record_time" timestamp with time zone,
    "view_count" integer DEFAULT 0 NOT NULL,
    "ended_at" timestamp with time zone,
    "help_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "help_opened_at" timestamp with time zone,
    "help_resolved_at" timestamp with time zone,
    "help_updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "archives_category_check" CHECK (("category" = ANY (ARRAY['plant'::"text", 'system'::"text", 'insect_fish'::"text", 'other'::"text"]))),
    CONSTRAINT "archives_help_status_check" CHECK (("help_status" = ANY (ARRAY['none'::"text", 'open'::"text", 'resolved'::"text"]))),
    CONSTRAINT "archives_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."archives" OWNER TO "postgres";


COMMENT ON COLUMN "public"."archives"."status" IS '项目生命周期状态：active=进行中，ended=已结束。求助状态不放在这里，继续使用记录/标签里的求助逻辑。';



COMMENT ON COLUMN "public"."archives"."ended_at" IS '项目标记为已结束的时间。用于空间页底部“已结束”区域排序。';



CREATE OR REPLACE FUNCTION "public"."mark_archive_ended"("p_archive_id" "uuid") RETURNS "public"."archives"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  updated_archive public.archives;
BEGIN
  UPDATE public.archives
  SET
    status = 'ended',
    ended_at = COALESCE(ended_at, now())
  WHERE id = p_archive_id
    AND user_id = auth.uid()
  RETURNING * INTO updated_archive;

  RETURN updated_archive;
END;
$$;


ALTER FUNCTION "public"."mark_archive_ended"("p_archive_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_archive_help_open"("p_archive_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  next_status text;
BEGIN
  UPDATE public.archives
  SET
    help_status = 'open',
    help_opened_at = COALESCE(help_opened_at, now()),
    help_resolved_at = NULL,
    help_updated_at = now()
  WHERE id = p_archive_id
    AND user_id = auth.uid()
  RETURNING help_status INTO next_status;

  RETURN COALESCE(next_status, 'none');
END;
$$;


ALTER FUNCTION "public"."mark_archive_help_open"("p_archive_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_archive_help_resolved"("p_archive_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  next_status text;
BEGIN
  UPDATE public.archives
  SET
    help_status = 'resolved',
    help_resolved_at = now(),
    help_updated_at = now()
  WHERE id = p_archive_id
    AND user_id = auth.uid()
  RETURNING help_status INTO next_status;

  RETURN COALESCE(next_status, 'none');
END;
$$;


ALTER FUNCTION "public"."mark_archive_help_resolved"("p_archive_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_archive_follow_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_user_id uuid;
  actor_name text;
  archive_title text;
begin
  select user_id, title
  into target_user_id, archive_title
  from public.archives
  where id = new.archive_id;

  select coalesce(username, '有人')
  into actor_name
  from public.profiles
  where id = new.user_id;

  perform public.create_notification(
    target_user_id,
    new.user_id,
    'archive_follow',
    actor_name || ' 关注了你的项目',
    archive_title,
    new.archive_id,
    null,
    null,
    '/archive/' || new.archive_id::text,
    jsonb_build_object('archive_title', archive_title)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_archive_follow_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_comment_flower_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor_name text;
  target_archive_id uuid;
  archive_title text;
begin
  select coalesce(username, '有人')
  into actor_name
  from public.profiles
  where id = new.sender_user_id;

  select r.archive_id, a.title
  into target_archive_id, archive_title
  from public.records r
  left join public.archives a on a.id = r.archive_id
  where r.id = new.record_id;

  perform public.create_notification(
    new.receiver_user_id,
    new.sender_user_id,
    'flower',
    actor_name || ' 给你的评论送了一朵花',
    archive_title,
    target_archive_id,
    new.record_id,
    new.comment_id,
    '/archive/' || target_archive_id::text,
    jsonb_build_object('archive_title', archive_title)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_comment_flower_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_comment_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_user_id uuid;
  target_archive_id uuid;
  actor_name text;
  archive_title text;
begin
  select
    r.user_id,
    r.archive_id,
    a.title
  into
    target_user_id,
    target_archive_id,
    archive_title
  from public.records r
  left join public.archives a on a.id = r.archive_id
  where r.id = new.record_id;

  select coalesce(username, '有人')
  into actor_name
  from public.profiles
  where id = new.user_id;

  perform public.create_notification(
    target_user_id,
    new.user_id,
    'comment',
    actor_name || ' 评论了你的记录',
    left(coalesce(new.content, ''), 80),
    target_archive_id,
    new.record_id,
    new.id,
    '/archive/' || target_archive_id::text,
    jsonb_build_object('archive_title', archive_title)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_comment_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_follow_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor_name text;
begin
  select coalesce(username, '有人')
  into actor_name
  from public.profiles
  where id = new.follower_id;

  perform public.create_notification(
    new.following_id,
    new.follower_id,
    'user_follow',
    actor_name || ' 关注了你',
    null,
    null,
    null,
    null,
    '/user/' || new.follower_id::text,
    '{}'::jsonb
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_follow_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_followed_archive_record_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  archive_title text;
  owner_name text;
begin
  if new.visibility <> 'public' then
    return new;
  end if;

  select a.title, coalesce(p.username, '有人')
  into archive_title, owner_name
  from public.archives a
  left join public.profiles p on p.id = a.user_id
  where a.id = new.archive_id;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    archive_id,
    record_id,
    related_url,
    metadata
  )
  select
    af.user_id,
    new.user_id,
    'followed_archive_record',
    '你关注的项目有新记录',
    coalesce(archive_title, '未命名项目') || coalesce('：' || left(new.note, 60), ''),
    new.archive_id,
    new.id,
    '/archive/' || new.archive_id::text,
    jsonb_build_object('archive_title', archive_title, 'owner_name', owner_name)
  from public.archive_follows af
  where af.archive_id = new.archive_id
    and af.user_id <> new.user_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_followed_archive_record_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."private_archive_forces_private_records"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.is_public IS NOT TRUE THEN
    UPDATE public.records
    SET visibility = 'private'
    WHERE archive_id = NEW.id
      AND visibility <> 'private';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."private_archive_forces_private_records"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_storage_bytes"("p_bytes" bigint) RETURNS TABLE("storage_used" bigint, "storage_limit_bytes" bigint, "remaining_bytes" bigint, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_used bigint;
  v_limit bigint;
  v_bytes bigint;
begin
  v_user_id := auth.uid();
  v_bytes := greatest(coalesce(p_bytes, 0), 0);

  if v_user_id is null then
    return query select
      0::bigint,
      0::bigint,
      0::bigint,
      'not_authenticated'::text;
    return;
  end if;

  v_limit := coalesce(public.get_user_storage_limit_bytes(v_user_id), 0);

  insert into public.profiles (
    id,
    storage_used,
    storage_limit
  )
  values (
    v_user_id,
    0,
    v_limit
  )
  on conflict (id) do nothing;

  update public.profiles as p
  set
    storage_used = greatest(coalesce(p.storage_used, 0) - v_bytes, 0),
    storage_limit = v_limit,
    updated_at = now()
  where p.id = v_user_id
  returning coalesce(p.storage_used, 0)
  into v_used;

  return query select
    coalesce(v_used, 0),
    coalesce(v_limit, 0),
    greatest(coalesce(v_limit, 0) - coalesce(v_used, 0), 0),
    'released'::text;
end;
$$;


ALTER FUNCTION "public"."release_storage_bytes"("p_bytes" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."release_storage_bytes"("p_bytes" bigint) IS '删除媒体后调用：原子减少 profiles.storage_used，最低不会小于 0。';



CREATE OR REPLACE FUNCTION "public"."reserve_storage_bytes"("p_bytes" bigint) RETURNS TABLE("ok" boolean, "storage_used" bigint, "storage_limit_bytes" bigint, "remaining_bytes" bigint, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_used bigint;
  v_limit bigint;
  v_bytes bigint;
begin
  v_user_id := auth.uid();
  v_bytes := greatest(coalesce(p_bytes, 0), 0);

  if v_user_id is null then
    return query select
      false,
      0::bigint,
      0::bigint,
      0::bigint,
      'not_authenticated'::text;
    return;
  end if;

  v_limit := coalesce(public.get_user_storage_limit_bytes(v_user_id), 0);

  insert into public.profiles (
    id,
    storage_used,
    storage_limit
  )
  values (
    v_user_id,
    0,
    v_limit
  )
  on conflict (id) do nothing;

  select coalesce(p.storage_used, 0)
  into v_used
  from public.profiles p
  where p.id = v_user_id
  for update;

  if v_bytes <= 0 then
    return query select
      true,
      coalesce(v_used, 0),
      coalesce(v_limit, 0),
      greatest(coalesce(v_limit, 0) - coalesce(v_used, 0), 0),
      'no_bytes_reserved'::text;
    return;
  end if;

  if not public.is_user_membership_active(v_user_id) then
    return query select
      false,
      coalesce(v_used, 0),
      coalesce(v_limit, 0),
      greatest(coalesce(v_limit, 0) - coalesce(v_used, 0), 0),
      'membership_inactive'::text;
    return;
  end if;

  if coalesce(v_used, 0) + v_bytes > coalesce(v_limit, 0) then
    return query select
      false,
      coalesce(v_used, 0),
      coalesce(v_limit, 0),
      greatest(coalesce(v_limit, 0) - coalesce(v_used, 0), 0),
      'storage_limit_exceeded'::text;
    return;
  end if;

  update public.profiles as p
  set
    storage_used = coalesce(p.storage_used, 0) + v_bytes,
    storage_limit = v_limit,
    updated_at = now()
  where p.id = v_user_id
  returning coalesce(p.storage_used, 0)
  into v_used;

  return query select
    true,
    coalesce(v_used, 0),
    coalesce(v_limit, 0),
    greatest(coalesce(v_limit, 0) - coalesce(v_used, 0), 0),
    'reserved'::text;
end;
$$;


ALTER FUNCTION "public"."reserve_storage_bytes"("p_bytes" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reserve_storage_bytes"("p_bytes" bigint) IS '上传媒体前调用：检查会员状态和容量上限，通过后原子增加 profiles.storage_used。';



CREATE OR REPLACE FUNCTION "public"."restore_archive_active"("p_archive_id" "uuid") RETURNS "public"."archives"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  updated_archive public.archives;
BEGIN
  UPDATE public.archives
  SET
    status = 'active',
    ended_at = NULL
  WHERE id = p_archive_id
    AND user_id = auth.uid()
  RETURNING * INTO updated_archive;

  RETURN updated_archive;
END;
$$;


ALTER FUNCTION "public"."restore_archive_active"("p_archive_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_market_posts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();

  if new.status = 'ended' and old.status is distinct from 'ended' then
    new.ended_at = now();
  end if;

  if new.status = 'active' and old.status = 'ended' then
    new.ended_at = null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_market_posts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_memberships_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_user_memberships_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_archive_stats"("p_archive_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_archive_id is null then
    return;
  end if;

  update public.archives as a
  set
    record_count = (
      select count(*)::integer
      from public.records as r
      where r.archive_id = p_archive_id
    ),
    last_record_time = (
      select max(r.record_time)
      from public.records as r
      where r.archive_id = p_archive_id
    ),
    cover_image_url = (
      select r.primary_image_url
      from public.records as r
      where r.archive_id = p_archive_id
        and r.primary_image_url is not null
      order by r.record_time desc nulls last, r.created_at desc nulls last
      limit 1
    )
  where a.id = p_archive_id;
end;
$$;


ALTER FUNCTION "public"."sync_archive_stats"("p_archive_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_flower_count"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles p
  set flower_count = (
    select count(*)::integer
    from public.comment_flowers cf
    where cf.receiver_user_id = p_user_id
      and cf.revoked_at is null
  )
  where p.id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."sync_profile_flower_count"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_record_comment_count"("p_record_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  comment_cnt int;
begin
  select count(*)
  into comment_cnt
  from public.comments
  where record_id = p_record_id;

  update public.records
  set comment_count = comment_cnt
  where id = p_record_id;
end;
$$;


ALTER FUNCTION "public"."sync_record_comment_count"("p_record_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_record_media_stats"("p_record_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_primary_image_url text;
  v_media_count integer;
  v_archive_id uuid;
begin
  select m.url
  into v_primary_image_url
  from public.media as m
  where m.record_id = p_record_id
  order by m.sort_order asc nulls last, m.created_at asc nulls last
  limit 1;

  select count(*)::integer
  into v_media_count
  from public.media as m
  where m.record_id = p_record_id;

  update public.records as r
  set
    primary_image_url = v_primary_image_url,
    media_count = v_media_count
  where r.id = p_record_id;

  select r.archive_id
  into v_archive_id
  from public.records as r
  where r.id = p_record_id
  limit 1;

  perform public.sync_archive_stats(v_archive_id);
end;
$$;


ALTER FUNCTION "public"."sync_record_media_stats"("p_record_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_record_status_tag_to_record_tags"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM public.record_tags
  WHERE record_id = NEW.id
    AND tag_type = 'status'
    AND source = 'user';

  IF NEW.status_tag = 'help' THEN
    INSERT INTO public.record_tags (
      record_id,
      tag,
      tag_type,
      source,
      is_active
    )
    VALUES (
      NEW.id,
      '求助',
      'status',
      'user',
      true
    )
    ON CONFLICT (record_id, tag, tag_type)
    DO UPDATE SET
      source = EXCLUDED.source,
      is_active = true;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_record_status_tag_to_record_tags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_record_tags_from_record"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Do not parse NEW.note anymore.
  -- Behavior tags are now user-controlled only.
  NEW.parsed_actions := ARRAY[]::text[];
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_record_tags_from_record"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_market_media"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_post record;
  v_media record;
  v_record record;
begin
  -- 集市发布必须存在，且 user_id 必须是发布者
  select
    mp.id,
    mp.user_id,
    mp.source_record_id
  into v_post
  from public.market_posts mp
  where mp.id = new.market_post_id;

  if not found then
    raise exception 'market_post_not_found';
  end if;

  if new.user_id is null or new.user_id <> v_post.user_id then
    raise exception 'market_media_user_mismatch';
  end if;

  -- 普通登录用户不能伪造 user_id
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'market_media_auth_user_mismatch';
  end if;

  -- 情况 A：图片来自原记录 media
  if new.source_media_id is not null then
    select
      m.id,
      m.user_id,
      m.record_id,
      m.url
    into v_media
    from public.media m
    where m.id = new.source_media_id;

    if not found then
      raise exception 'source_media_not_found';
    end if;

    if v_media.user_id <> new.user_id then
      raise exception 'source_media_owner_mismatch';
    end if;

    -- 如果没传 source_record_id，自动补
    if new.source_record_id is null then
      new.source_record_id := v_media.record_id;
    end if;

    -- source_record_id 必须和 media.record_id 一致
    if new.source_record_id <> v_media.record_id then
      raise exception 'source_media_record_mismatch';
    end if;

    -- 如果集市本身有关联来源记录，那么引用图片必须来自同一条记录
    if v_post.source_record_id is not null
       and new.source_record_id <> v_post.source_record_id then
      raise exception 'market_media_source_record_mismatch';
    end if;

    -- 引用原记录图片时，不允许写 path，避免以后误删原图
    if new.path is not null then
      raise exception 'source_media_path_must_be_null';
    end if;
  end if;

  -- 情况 B：有 source_record_id，但没有 source_media_id
  -- 也要确认记录归属正确
  if new.source_record_id is not null and new.source_media_id is null then
    select
      r.id,
      r.user_id
    into v_record
    from public.records r
    where r.id = new.source_record_id;

    if not found then
      raise exception 'source_record_not_found';
    end if;

    if v_record.user_id <> new.user_id then
      raise exception 'source_record_owner_mismatch';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_market_media"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_market_post_source_record"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_record record;
begin
  -- 没有关联来源记录时，不处理
  if new.source_record_id is null then
    return new;
  end if;

  -- 找到来源记录
  select
    r.id,
    r.user_id,
    r.archive_id
  into v_record
  from public.records r
  where r.id = new.source_record_id;

  if not found then
    raise exception 'source_record_not_found';
  end if;

  -- 集市发布人必须是记录所有者
  if new.user_id is null or new.user_id <> v_record.user_id then
    raise exception 'source_record_owner_mismatch';
  end if;

  -- 普通登录用户不能伪造 user_id
  -- service_role / 后台任务 auth.uid() 可能为空，所以只在 auth.uid() 存在时校验
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'market_post_user_mismatch';
  end if;

  -- 如果 archive_id 没填，自动带入来源记录所属项目
  if new.archive_id is null then
    new.archive_id := v_record.archive_id;
  end if;

  -- 如果 archive_id 已填，必须和来源记录所属项目一致
  if new.archive_id <> v_record.archive_id then
    raise exception 'source_record_archive_mismatch';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_market_post_source_record"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "archive_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."archive_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_flowers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid" NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "sender_user_id" "uuid" NOT NULL,
    "receiver_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoke_until" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "reason" "text",
    CONSTRAINT "comment_flowers_sender_receiver_check" CHECK (("sender_user_id" <> "receiver_user_id"))
);


ALTER TABLE "public"."comment_flowers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comment_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid",
    "user_id" "uuid",
    "content" "text",
    "accepted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "username" "text",
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "location" "text",
    "level" integer DEFAULT 1,
    "flower_count" integer DEFAULT 0,
    "view_count" integer DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "avatar_url" "text",
    "storage_used" bigint DEFAULT 0,
    "storage_limit" bigint DEFAULT 300000000,
    "country_code" "text",
    "country_name" "text",
    "region_name" "text",
    "city_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."country_code" IS '所在国家/地区代码，例：CN、JP、US、OTHER';



COMMENT ON COLUMN "public"."profiles"."country_name" IS '所在国家/地区显示名';



COMMENT ON COLUMN "public"."profiles"."region_name" IS '省/州/地域';



COMMENT ON COLUMN "public"."profiles"."city_name" IS '城市';



CREATE TABLE IF NOT EXISTS "public"."records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "archive_id" "uuid",
    "user_id" "uuid",
    "note" "text",
    "photo_time" timestamp with time zone,
    "upload_time" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "visibility" "text" DEFAULT 'private'::"text",
    "record_time" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'ok'::"text",
    "status_tag" "text",
    "parsed_actions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "primary_image_url" "text",
    "comment_count" integer DEFAULT 0 NOT NULL,
    "media_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "records_status_tag_check" CHECK ((("status_tag" IS NULL) OR ("status_tag" = ANY (ARRAY['help'::"text", 'resolved'::"text"])))),
    CONSTRAINT "records_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."records" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."discovery_feed_view" AS
 SELECT "r"."id" AS "record_id",
    "r"."archive_id",
    "r"."user_id",
    "r"."note",
    "r"."record_time",
    "r"."status_tag",
    "r"."primary_image_url",
    "r"."comment_count",
    "r"."media_count",
    "a"."title" AS "archive_title",
    "a"."category" AS "archive_category",
    "a"."species_id",
    "a"."species_name_snapshot",
    "p"."username",
    "p"."avatar_url",
    "a"."system_name",
    "a"."record_count" AS "archive_record_count",
    "a"."view_count" AS "archive_view_count",
    "a"."status" AS "archive_status",
    "a"."ended_at" AS "archive_ended_at",
    "a"."help_status" AS "archive_help_status",
    "a"."help_opened_at" AS "archive_help_opened_at",
    "a"."help_resolved_at" AS "archive_help_resolved_at"
   FROM (("public"."records" "r"
     JOIN "public"."archives" "a" ON (("a"."id" = "r"."archive_id")))
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "r"."user_id")))
  WHERE (("r"."visibility" = 'public'::"text") AND ("a"."is_public" = true))
  ORDER BY "r"."record_time" DESC;


ALTER VIEW "public"."discovery_feed_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."discovery_view" AS
 SELECT "id",
    "archive_id",
    "note",
    "record_time",
    "user_id",
    "archive_title",
    "username",
    "image_url",
    "rn_archive",
    "rn_user"
   FROM ( SELECT "r"."id",
            "r"."archive_id",
            "r"."note",
            "r"."record_time",
            "r"."user_id",
            "a"."title" AS "archive_title",
            "p"."username",
            "r"."primary_image_url" AS "image_url",
            "row_number"() OVER (PARTITION BY "r"."archive_id" ORDER BY "r"."record_time" DESC) AS "rn_archive",
            "row_number"() OVER (PARTITION BY "r"."user_id" ORDER BY "r"."record_time" DESC) AS "rn_user"
           FROM (("public"."records" "r"
             JOIN "public"."archives" "a" ON (("r"."archive_id" = "a"."id")))
             LEFT JOIN "public"."profiles" "p" ON (("r"."user_id" = "p"."id")))
          WHERE (("r"."visibility" = 'public'::"text") AND ("a"."is_public" = true))) "t"
  WHERE (("rn_archive" = 1) AND ("rn_user" <= 4));


ALTER VIEW "public"."discovery_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid",
    "following_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "follows_no_self_follow" CHECK ((("follower_id" IS NULL) OR ("following_id" IS NULL) OR ("follower_id" <> "following_id")))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "sub_tag_id" "uuid"
);


ALTER TABLE "public"."group_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "latitude" numeric,
    "longitude" numeric,
    "place_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "market_post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "market_comments_content_length" CHECK (("char_length"("content") <= 1000)),
    CONSTRAINT "market_comments_content_not_empty" CHECK (("length"(TRIM(BOTH FROM "content")) > 0))
);


ALTER TABLE "public"."market_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."market_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "market_post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "path" "text",
    "source_media_id" "uuid",
    "source_record_id" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "thumb_url" "text",
    "thumb_path" "text",
    CONSTRAINT "market_media_url_not_empty" CHECK (("length"(TRIM(BOTH FROM "url")) > 0))
);


ALTER TABLE "public"."market_media" OWNER TO "postgres";


COMMENT ON TABLE "public"."market_media" IS '集市多图表。支持引用记录原图，也支持集市新上传图片。';



COMMENT ON COLUMN "public"."market_media"."url" IS '图片公开访问地址。';



COMMENT ON COLUMN "public"."market_media"."path" IS '新上传图片在 storage 中的 path。引用记录原图时为空，避免误删原图。';



COMMENT ON COLUMN "public"."market_media"."source_media_id" IS '如果图片来自原记录 media，则保存原 media.id。';



COMMENT ON COLUMN "public"."market_media"."source_record_id" IS '如果图片来自原记录，则保存原 records.id。';



COMMENT ON COLUMN "public"."market_media"."sort_order" IS '图片排序。数值越小越靠前。';



COMMENT ON COLUMN "public"."market_media"."thumb_url" IS '集市图片缩略图 URL。列表、编辑页、详情页小图优先使用。';



COMMENT ON COLUMN "public"."market_media"."thumb_path" IS '集市图片缩略图在 Supabase Storage 中的 path。';



CREATE TABLE IF NOT EXISTS "public"."market_post_quota_addons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "extra_post_limit" integer DEFAULT 10 NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone DEFAULT ("now"() + '1 mon'::interval) NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "market_post_quota_addons_limit_check" CHECK (("extra_post_limit" > 0)),
    CONSTRAINT "market_post_quota_addons_range_check" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."market_post_quota_addons" OWNER TO "postgres";


COMMENT ON TABLE "public"."market_post_quota_addons" IS '集市发布数量加量包。适合基础年费用户临时按月增加发布数量。';



COMMENT ON COLUMN "public"."market_post_quota_addons"."extra_post_limit" IS '加量包增加的同时在线集市发布数量。';



CREATE TABLE IF NOT EXISTS "public"."market_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "archive_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "post_type" "text" NOT NULL,
    "item_category" "text" NOT NULL,
    "location_text" "text",
    "cover_image_url" "text",
    "cover_image_path" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "view_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "source_record_id" "uuid",
    "cover_thumb_url" "text",
    "cover_thumb_path" "text",
    "external_url" "text",
    "external_label" "text",
    CONSTRAINT "market_posts_item_category_check" CHECK (("item_category" = ANY (ARRAY['seed'::"text", 'seedling'::"text", 'cutting'::"text", 'potted'::"text", 'fruit'::"text", 'aquatic_plant'::"text", 'fish_shrimp'::"text", 'insect'::"text", 'tool_facility'::"text", 'other'::"text"]))),
    CONSTRAINT "market_posts_post_type_check" CHECK (("post_type" = ANY (ARRAY['offer'::"text", 'exchange'::"text", 'gift'::"text", 'wanted'::"text"]))),
    CONSTRAINT "market_posts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."market_posts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."market_posts"."source_record_id" IS '来源记录 ID。用于表示这条集市发布来自某一条种植/养护记录。';



COMMENT ON COLUMN "public"."market_posts"."cover_thumb_url" IS '集市封面缩略图 URL。列表页优先使用，详情页仍可使用主图。';



COMMENT ON COLUMN "public"."market_posts"."cover_thumb_path" IS '集市封面缩略图在 Supabase Storage 中的 path。';



COMMENT ON COLUMN "public"."market_posts"."external_url" IS '集市发布的外部链接，例如详细说明页、预约表单、个人主页或原发布页。';



COMMENT ON COLUMN "public"."market_posts"."external_label" IS '外部链接显示名称，例如“查看详细说明”“预约表单”“原发布页”。';



CREATE TABLE IF NOT EXISTS "public"."media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid",
    "user_id" "uuid",
    "type" "text",
    "url" "text",
    "size_mb" numeric,
    "duration_sec" numeric,
    "storage_class" "text" DEFAULT 'hot'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sort_order" integer DEFAULT 0,
    "size_bytes" bigint,
    "storage_path" "text",
    "thumb_url" "text",
    "thumb_path" "text",
    "mime_type" "text",
    "width" integer,
    "height" integer,
    "original_filename" "text",
    CONSTRAINT "media_storage_class_check" CHECK (("storage_class" = ANY (ARRAY['hot'::"text", 'cold'::"text"])))
);


ALTER TABLE "public"."media" OWNER TO "postgres";


COMMENT ON COLUMN "public"."media"."size_bytes" IS '媒体文件大小，单位 bytes。用于精确统计和释放用户云端容量。';



COMMENT ON COLUMN "public"."media"."storage_path" IS 'Supabase Storage 中的文件路径，例如 user_id/archive_id/filename.jpg。用于删除、导出、迁移、冷热存储。';



COMMENT ON COLUMN "public"."media"."thumb_url" IS '缩略图公开访问地址，后续用于发现页、列表页加速显示。';



COMMENT ON COLUMN "public"."media"."thumb_path" IS '缩略图在 Supabase Storage 中的路径。';



COMMENT ON COLUMN "public"."media"."mime_type" IS '媒体 MIME 类型，例如 image/jpeg、image/webp。';



COMMENT ON COLUMN "public"."media"."width" IS '图片宽度，单位 px。';



COMMENT ON COLUMN "public"."media"."height" IS '图片高度，单位 px。';



COMMENT ON COLUMN "public"."media"."original_filename" IS '用户上传时的原始文件名，仅用于用户识别和导出参考。';



CREATE TABLE IF NOT EXISTS "public"."membership_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan" "text" NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_reference" "text",
    "note" "text",
    "paid_at" timestamp with time zone DEFAULT "now"(),
    "service_started_at" timestamp with time zone,
    "service_ends_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "membership_payments_currency_check" CHECK (("currency" = ANY (ARRAY['CNY'::"text", 'USD'::"text"]))),
    CONSTRAINT "membership_payments_method_check" CHECK (("payment_method" = ANY (ARRAY['wechat'::"text", 'alipay'::"text", 'paypal'::"text", 'manual'::"text", 'other'::"text"]))),
    CONSTRAINT "membership_payments_plan_check" CHECK (("plan" = ANY (ARRAY['basic'::"text", 'large'::"text", 'seller'::"text", 'admin'::"text"]))),
    CONSTRAINT "membership_payments_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'refunded'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."membership_payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."membership_payments" IS '会员付款记录。用于人工确认微信、支付宝、PayPal 等付款，并追踪对应开通记录。';



COMMENT ON COLUMN "public"."membership_payments"."payment_reference" IS '付款流水号、PayPal 交易号，或人工备注编号。';



COMMENT ON COLUMN "public"."membership_payments"."note" IS '管理员备注，例如付款截图、注册邮箱、特殊开通说明等。';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "archive_id" "uuid",
    "record_id" "uuid",
    "comment_id" "uuid",
    "related_url" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['comment'::"text", 'user_follow'::"text", 'archive_follow'::"text", 'flower'::"text", 'followed_archive_record'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_care_guides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plant_id" "uuid" NOT NULL,
    "language_code" "text" DEFAULT 'zh'::"text" NOT NULL,
    "summary" "text",
    "climate_timing_note" "text",
    "planting_guide" "text",
    "care_guide" "text",
    "harvest_guide" "text",
    "common_problem_guide" "text",
    "rotation_intercrop_guide" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plant_care_guides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_growth_cycle" (
    "species_id" "uuid" NOT NULL,
    "germination_days" integer,
    "seedling_days" integer,
    "vegetative_days" integer,
    "flowering_days" integer,
    "harvest_days" integer
);


ALTER TABLE "public"."plant_growth_cycle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_light_cycle" (
    "species_id" "uuid" NOT NULL,
    "min_daylight_hours" numeric,
    "optimal_daylight_hours" numeric,
    "photoperiod_type" "text"
);


ALTER TABLE "public"."plant_light_cycle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_parameter_score_guides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parameter_key" "text" NOT NULL,
    "score_min" smallint NOT NULL,
    "score_max" smallint NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plant_parameter_score_guides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_parameters" (
    "species_id" "uuid" NOT NULL,
    "sun_score" smallint,
    "air_humidity_score" smallint,
    "air_flow_score" smallint,
    "soil_moisture_score" smallint,
    "soil_aeration_score" smallint,
    "soil_fertility_score" smallint,
    "ph_sensitivity_score" smallint,
    "drought_score" smallint,
    "growth_speed_score" smallint,
    "disease_risk_score" smallint,
    "management_difficulty_score" smallint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "edible_part" "text"[],
    "lifecycle" "text",
    "growth_form" "text",
    "season_type" "text"[],
    "nitrogen_fixing" boolean,
    "need_trellis" boolean,
    "ph_min" numeric,
    "ph_max" numeric,
    "best_germ_temp_min" numeric,
    "best_germ_temp_max" numeric,
    "optimal_growth_temp_min" numeric,
    "optimal_growth_temp_max" numeric,
    "vigorous_growth_temp" numeric,
    "growth_slow_temp" numeric,
    "frost_damage_temp" numeric,
    "lethal_low_temp" numeric,
    "stop_low_temp" numeric,
    "stop_high_temp" numeric,
    "heat_scorch_temp" numeric,
    "lethal_high_temp" numeric,
    "special_temperature_points" "jsonb" DEFAULT '[]'::"jsonb",
    "temperature_note" "text",
    "photoperiod_type" "text",
    "photoperiod_trigger_stage" "text"[],
    "critical_day_length_hours" numeric,
    "photoperiod_sensitivity_score" smallint,
    "photoperiod_note" "text",
    "shade_tolerance" "text",
    "drought_tolerance" "text",
    "container_friendly_score" smallint,
    "indoor_friendly_score" smallint,
    "balcony_friendly_score" smallint,
    "record_focus" "text"[],
    "good_companions" "text"[],
    "avoid_rotation_with" "text"[],
    "care_note" "text"
);


ALTER TABLE "public"."plant_parameters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_species" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scientific_name" "text",
    "common_name" "text",
    "family" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "slug" "text",
    "category" "text",
    "sub_category" "text",
    "growth_type" "text",
    "entry_type" "text" DEFAULT 'species'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."plant_species" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_species_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "species_id" "uuid" NOT NULL,
    "language_code" "text" DEFAULT 'zh'::"text" NOT NULL,
    "alias_name" "text" NOT NULL,
    "normalized_name" "text" NOT NULL,
    "alias_type" "text" DEFAULT 'alias'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plant_species_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_species_i18n" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plant_id" "uuid" NOT NULL,
    "language_code" "text" NOT NULL,
    "common_name" "text",
    "family" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "plant_species_i18n_language_code_check" CHECK (("language_code" = ANY (ARRAY['zh'::"text", 'en'::"text", 'ja'::"text"])))
);


ALTER TABLE "public"."plant_species_i18n" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_species_pending" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "submitted_name" "text" NOT NULL,
    "language_code" "text" DEFAULT 'zh'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "note" "text"
);


ALTER TABLE "public"."plant_species_pending" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_temperature_ranges" (
    "species_id" "uuid" NOT NULL,
    "best_germ_temp" numeric,
    "optimal_growth_temp" numeric,
    "lethal_low_temp" numeric,
    "stop_low_temp" numeric,
    "stop_high_temp" numeric,
    "lethal_high_temp" numeric
);


ALTER TABLE "public"."plant_temperature_ranges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."record_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."record_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."record_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid",
    "tag" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tag_type" "text" NOT NULL,
    "source" "text" DEFAULT 'system'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "record_tags_source_check" CHECK (("source" = ANY (ARRAY['system'::"text", 'user'::"text"]))),
    CONSTRAINT "record_tags_tag_type_check" CHECK (("tag_type" = ANY (ARRAY['behavior'::"text", 'status'::"text"])))
);


ALTER TABLE "public"."record_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "category" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."sub_tags" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."timeline_view" AS
 SELECT "records"."id" AS "record_id",
    "archives"."title",
    "records"."note",
    "records"."photo_time",
    "media"."url"
   FROM (("public"."records"
     LEFT JOIN "public"."archives" ON (("records"."archive_id" = "archives"."id")))
     LEFT JOIN "public"."media" ON (("media"."record_id" = "records"."id")))
  ORDER BY "records"."photo_time" DESC;


ALTER VIEW "public"."timeline_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_flower_stats" AS
 SELECT "receiver_user_id" AS "user_id",
    "count"(*) FILTER (WHERE ("revoked_at" IS NULL)) AS "flower_count",
    "count"(*) FILTER (WHERE ("revoked_at" IS NULL)) AS "helpful_comment_count",
    "max"("created_at") FILTER (WHERE ("revoked_at" IS NULL)) AS "last_received_at"
   FROM "public"."comment_flowers"
  GROUP BY "receiver_user_id";


ALTER VIEW "public"."user_flower_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_memberships" (
    "user_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'trial'::"text" NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "trial_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_ends_at" timestamp with time zone DEFAULT ("now"() + '6 mons'::interval) NOT NULL,
    "paid_until" timestamp with time zone,
    "storage_limit_bytes" bigint DEFAULT 300000000 NOT NULL,
    "base_market_post_limit" integer DEFAULT 3 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_memberships_market_limit_check" CHECK (("base_market_post_limit" >= 0)),
    CONSTRAINT "user_memberships_plan_check" CHECK (("plan" = ANY (ARRAY['trial'::"text", 'basic'::"text", 'large'::"text", 'seller'::"text", 'admin'::"text"]))),
    CONSTRAINT "user_memberships_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'expired'::"text", 'canceled'::"text"]))),
    CONSTRAINT "user_memberships_storage_limit_check" CHECK (("storage_limit_bytes" >= 0)),
    CONSTRAINT "user_memberships_trial_range_check" CHECK (("trial_ends_at" >= "trial_started_at"))
);


ALTER TABLE "public"."user_memberships" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_memberships" IS '有时·耕作用户试用期、年费状态、云端容量和基础集市发布额度。';



COMMENT ON COLUMN "public"."user_memberships"."plan" IS 'trial=免费试用；basic=基础年费；large=大空间；seller=商家；admin=管理/特殊账号。';



COMMENT ON COLUMN "public"."user_memberships"."status" IS 'trialing=试用中；active=已开通；past_due=待续费；expired=已过期；canceled=已取消。';



COMMENT ON COLUMN "public"."user_memberships"."storage_limit_bytes" IS '云端容量上限，单位 bytes。试用默认 500MB，基础年费建议 1GB。';



COMMENT ON COLUMN "public"."user_memberships"."base_market_post_limit" IS '基础集市同时在线发布数量。试用建议 3，基础年费建议 10。';



CREATE TABLE IF NOT EXISTS "public"."user_plant_interests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "species_id" "uuid" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_plant_interests" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_plant_interests" IS '用户感兴趣的植物列表：从植物百科进入个人空间的轻量关系。';



COMMENT ON COLUMN "public"."user_plant_interests"."note" IS '用户自己的兴趣备注，可为空。';



CREATE TABLE IF NOT EXISTS "public"."user_plant_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "species_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'want'::"text" NOT NULL,
    "planned_start_date" "date",
    "location_type" "text",
    "note" "text",
    "created_archive_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_plant_plans_location_type_check" CHECK ((("location_type" IS NULL) OR ("location_type" = ANY (ARRAY['indoor'::"text", 'balcony'::"text", 'garden'::"text", 'terrace'::"text", 'greenhouse'::"text", 'field'::"text", 'other'::"text"])))),
    CONSTRAINT "user_plant_plans_status_check" CHECK (("status" = ANY (ARRAY['want'::"text", 'preparing'::"text", 'started'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."user_plant_plans" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_plant_plans" IS '用户种植计划：准备种植阶段，正式开始后可关联 archives。';



COMMENT ON COLUMN "public"."user_plant_plans"."status" IS '计划状态 code：want=想种，preparing=准备中，started=已开始，abandoned=已放弃。';



COMMENT ON COLUMN "public"."user_plant_plans"."location_type" IS '计划种植位置 code：indoor/balcony/garden/terrace/greenhouse/field/other。';



COMMENT ON COLUMN "public"."user_plant_plans"."created_archive_id" IS '该计划转成正式种植档案后，关联 archives.id。';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_login_at" timestamp with time zone,
    "cloud_enabled" boolean DEFAULT false,
    "role" "text" DEFAULT 'user'::"text",
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_admins"
    ADD CONSTRAINT "app_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."archive_follows"
    ADD CONSTRAINT "archive_follows_archive_id_user_id_key" UNIQUE ("archive_id", "user_id");



ALTER TABLE ONLY "public"."archive_follows"
    ADD CONSTRAINT "archive_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archives"
    ADD CONSTRAINT "archives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_flowers"
    ADD CONSTRAINT "comment_flowers_comment_id_sender_user_id_key" UNIQUE ("comment_id", "sender_user_id");



ALTER TABLE ONLY "public"."comment_flowers"
    ADD CONSTRAINT "comment_flowers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_comment_id_user_id_key" UNIQUE ("comment_id", "user_id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_tags"
    ADD CONSTRAINT "group_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_comments"
    ADD CONSTRAINT "market_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_media"
    ADD CONSTRAINT "market_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_post_quota_addons"
    ADD CONSTRAINT "market_post_quota_addons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."market_posts"
    ADD CONSTRAINT "market_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_payments"
    ADD CONSTRAINT "membership_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_care_guides"
    ADD CONSTRAINT "plant_care_guides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_care_guides"
    ADD CONSTRAINT "plant_care_guides_plant_id_language_code_key" UNIQUE ("plant_id", "language_code");



ALTER TABLE ONLY "public"."plant_growth_cycle"
    ADD CONSTRAINT "plant_growth_cycle_pkey" PRIMARY KEY ("species_id");



ALTER TABLE ONLY "public"."plant_light_cycle"
    ADD CONSTRAINT "plant_light_cycle_pkey" PRIMARY KEY ("species_id");



ALTER TABLE ONLY "public"."plant_parameter_score_guides"
    ADD CONSTRAINT "plant_parameter_score_guides_parameter_key_score_min_score__key" UNIQUE ("parameter_key", "score_min", "score_max");



ALTER TABLE ONLY "public"."plant_parameter_score_guides"
    ADD CONSTRAINT "plant_parameter_score_guides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_parameters"
    ADD CONSTRAINT "plant_parameters_pkey" PRIMARY KEY ("species_id");



ALTER TABLE ONLY "public"."plant_species_aliases"
    ADD CONSTRAINT "plant_species_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_species_i18n"
    ADD CONSTRAINT "plant_species_i18n_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_species_i18n"
    ADD CONSTRAINT "plant_species_i18n_plant_id_language_code_key" UNIQUE ("plant_id", "language_code");



ALTER TABLE ONLY "public"."plant_species_pending"
    ADD CONSTRAINT "plant_species_pending_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_species"
    ADD CONSTRAINT "plant_species_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_temperature_ranges"
    ADD CONSTRAINT "plant_temperature_ranges_pkey" PRIMARY KEY ("species_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."record_likes"
    ADD CONSTRAINT "record_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."record_likes"
    ADD CONSTRAINT "record_likes_record_id_user_id_key" UNIQUE ("record_id", "user_id");



ALTER TABLE ONLY "public"."record_tags"
    ADD CONSTRAINT "record_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."records"
    ADD CONSTRAINT "records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_tags"
    ADD CONSTRAINT "sub_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_plant_interests"
    ADD CONSTRAINT "user_plant_interests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plant_interests"
    ADD CONSTRAINT "user_plant_interests_user_id_species_id_key" UNIQUE ("user_id", "species_id");



ALTER TABLE ONLY "public"."user_plant_plans"
    ADD CONSTRAINT "user_plant_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plant_plans"
    ADD CONSTRAINT "user_plant_plans_user_id_species_id_key" UNIQUE ("user_id", "species_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "follows_follower_id_idx" ON "public"."follows" USING "btree" ("follower_id");



CREATE INDEX "follows_following_id_idx" ON "public"."follows" USING "btree" ("following_id");



CREATE INDEX "idx_archives_id" ON "public"."archives" USING "btree" ("id");



CREATE INDEX "idx_comment_flowers_receiver" ON "public"."comment_flowers" USING "btree" ("receiver_user_id", "created_at" DESC);



CREATE INDEX "idx_comment_flowers_record_comment" ON "public"."comment_flowers" USING "btree" ("record_id", "comment_id");



CREATE INDEX "idx_comment_flowers_sender" ON "public"."comment_flowers" USING "btree" ("sender_user_id", "created_at" DESC);



CREATE INDEX "idx_comment_likes_comment_id" ON "public"."comment_likes" USING "btree" ("comment_id");



CREATE INDEX "idx_comment_likes_user_id" ON "public"."comment_likes" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_id" ON "public"."profiles" USING "btree" ("id");



CREATE INDEX "idx_record_likes_record_id" ON "public"."record_likes" USING "btree" ("record_id");



CREATE INDEX "idx_record_likes_user_id" ON "public"."record_likes" USING "btree" ("user_id");



CREATE INDEX "idx_records_feed_time" ON "public"."records" USING "btree" ("record_time" DESC);



CREATE INDEX "idx_records_visibility" ON "public"."records" USING "btree" ("visibility");



CREATE INDEX "market_comments_post_created_idx" ON "public"."market_comments" USING "btree" ("market_post_id", "created_at");



CREATE INDEX "market_comments_user_created_idx" ON "public"."market_comments" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "market_media_market_post_id_idx" ON "public"."market_media" USING "btree" ("market_post_id");



CREATE INDEX "market_media_post_sort_idx" ON "public"."market_media" USING "btree" ("market_post_id", "sort_order", "created_at");



CREATE INDEX "market_media_source_media_id_idx" ON "public"."market_media" USING "btree" ("source_media_id");



CREATE INDEX "market_media_source_record_id_idx" ON "public"."market_media" USING "btree" ("source_record_id");



CREATE INDEX "market_media_thumb_path_idx" ON "public"."market_media" USING "btree" ("thumb_path");



CREATE UNIQUE INDEX "market_media_unique_source_media_per_post" ON "public"."market_media" USING "btree" ("market_post_id", "source_media_id") WHERE ("source_media_id" IS NOT NULL);



CREATE INDEX "market_media_user_id_idx" ON "public"."market_media" USING "btree" ("user_id");



CREATE INDEX "market_post_quota_addons_user_active_idx" ON "public"."market_post_quota_addons" USING "btree" ("user_id", "starts_at", "ends_at");



CREATE INDEX "market_posts_archive_idx" ON "public"."market_posts" USING "btree" ("archive_id");



CREATE INDEX "market_posts_category_idx" ON "public"."market_posts" USING "btree" ("item_category");



CREATE INDEX "market_posts_cover_thumb_path_idx" ON "public"."market_posts" USING "btree" ("cover_thumb_path");



CREATE INDEX "market_posts_source_record_id_idx" ON "public"."market_posts" USING "btree" ("source_record_id");



CREATE INDEX "market_posts_status_created_idx" ON "public"."market_posts" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "market_posts_type_idx" ON "public"."market_posts" USING "btree" ("post_type");



CREATE INDEX "market_posts_user_idx" ON "public"."market_posts" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "market_posts_user_source_record_idx" ON "public"."market_posts" USING "btree" ("user_id", "source_record_id");



CREATE INDEX "media_record_id_idx" ON "public"."media" USING "btree" ("record_id");



CREATE INDEX "media_storage_class_idx" ON "public"."media" USING "btree" ("storage_class");



CREATE INDEX "media_user_id_idx" ON "public"."media" USING "btree" ("user_id");



CREATE INDEX "membership_payments_created_by_idx" ON "public"."membership_payments" USING "btree" ("created_by");



CREATE UNIQUE INDEX "membership_payments_live_unique_ref_user_idx" ON "public"."membership_payments" USING "btree" ("user_id", "lower"("regexp_replace"(TRIM(BOTH FROM "payment_reference"), '\s+'::"text", ''::"text", 'g'::"text"))) WHERE (("payment_reference" IS NOT NULL) AND ("status" = ANY (ARRAY['confirmed'::"text", 'refunded'::"text"])));



CREATE INDEX "membership_payments_paid_at_idx" ON "public"."membership_payments" USING "btree" ("paid_at" DESC);



CREATE INDEX "membership_payments_user_id_idx" ON "public"."membership_payments" USING "btree" ("user_id");



CREATE INDEX "notifications_archive_idx" ON "public"."notifications" USING "btree" ("archive_id");



CREATE INDEX "notifications_record_idx" ON "public"."notifications" USING "btree" ("record_id");



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "plant_species_active_sort_idx" ON "public"."plant_species" USING "btree" ("is_active", "sort_order");



CREATE UNIQUE INDEX "plant_species_aliases_language_normalized_uidx" ON "public"."plant_species_aliases" USING "btree" ("language_code", "normalized_name");



CREATE INDEX "plant_species_aliases_species_id_idx" ON "public"."plant_species_aliases" USING "btree" ("species_id");



CREATE INDEX "plant_species_category_idx" ON "public"."plant_species" USING "btree" ("category", "sub_category");



CREATE UNIQUE INDEX "plant_species_slug_uidx" ON "public"."plant_species" USING "btree" ("slug");



CREATE INDEX "profiles_city_name_idx" ON "public"."profiles" USING "btree" ("city_name");



CREATE INDEX "profiles_country_code_idx" ON "public"."profiles" USING "btree" ("country_code");



CREATE INDEX "profiles_region_name_idx" ON "public"."profiles" USING "btree" ("region_name");



CREATE UNIQUE INDEX "record_tags_one_status_per_record" ON "public"."record_tags" USING "btree" ("record_id", "tag_type") WHERE (("tag_type" = 'status'::"text") AND ("is_active" = true));



CREATE UNIQUE INDEX "record_tags_unique_v2" ON "public"."record_tags" USING "btree" ("record_id", "tag", "tag_type");



CREATE INDEX "user_memberships_paid_until_idx" ON "public"."user_memberships" USING "btree" ("paid_until");



CREATE INDEX "user_memberships_status_idx" ON "public"."user_memberships" USING "btree" ("status");



CREATE INDEX "user_plant_interests_species_idx" ON "public"."user_plant_interests" USING "btree" ("species_id");



CREATE INDEX "user_plant_interests_user_created_idx" ON "public"."user_plant_interests" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_plant_plans_created_archive_idx" ON "public"."user_plant_plans" USING "btree" ("created_archive_id");



CREATE INDEX "user_plant_plans_species_idx" ON "public"."user_plant_plans" USING "btree" ("species_id");



CREATE INDEX "user_plant_plans_user_status_updated_idx" ON "public"."user_plant_plans" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE OR REPLACE TRIGGER "trg_comment_delete" AFTER DELETE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_comment_change"();



CREATE OR REPLACE TRIGGER "trg_comment_flowers_sync_profile" AFTER INSERT OR DELETE OR UPDATE ON "public"."comment_flowers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_comment_flower_change"();



CREATE OR REPLACE TRIGGER "trg_comment_insert" AFTER INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_comment_change"();



CREATE OR REPLACE TRIGGER "trg_comment_update" AFTER UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_comment_change"();



CREATE OR REPLACE TRIGGER "trg_enforce_record_privacy_by_archive" BEFORE INSERT OR UPDATE OF "archive_id", "user_id", "visibility" ON "public"."records" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_record_privacy_by_archive"();



CREATE OR REPLACE TRIGGER "trg_ensure_user_membership" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_user_membership"();



CREATE OR REPLACE TRIGGER "trg_market_comments_updated_at" BEFORE UPDATE ON "public"."market_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_market_posts_updated_at" BEFORE UPDATE ON "public"."market_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_market_posts_updated_at"();



CREATE OR REPLACE TRIGGER "trg_media_delete" AFTER DELETE ON "public"."media" FOR EACH ROW EXECUTE FUNCTION "public"."handle_media_change"();



CREATE OR REPLACE TRIGGER "trg_media_insert" AFTER INSERT ON "public"."media" FOR EACH ROW EXECUTE FUNCTION "public"."handle_media_change"();



CREATE OR REPLACE TRIGGER "trg_media_update" AFTER UPDATE ON "public"."media" FOR EACH ROW EXECUTE FUNCTION "public"."handle_media_change"();



CREATE OR REPLACE TRIGGER "trg_notify_archive_follow_insert" AFTER INSERT ON "public"."archive_follows" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_archive_follow_insert"();



CREATE OR REPLACE TRIGGER "trg_notify_comment_flower_insert" AFTER INSERT ON "public"."comment_flowers" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_comment_flower_insert"();



CREATE OR REPLACE TRIGGER "trg_notify_comment_insert" AFTER INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_comment_insert"();



CREATE OR REPLACE TRIGGER "trg_notify_follow_insert" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_follow_insert"();



CREATE OR REPLACE TRIGGER "trg_notify_followed_archive_record_insert" AFTER INSERT ON "public"."records" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_followed_archive_record_insert"();



CREATE OR REPLACE TRIGGER "trg_private_archive_forces_private_records" AFTER UPDATE OF "is_public" ON "public"."archives" FOR EACH ROW WHEN (("old"."is_public" IS DISTINCT FROM "new"."is_public")) EXECUTE FUNCTION "public"."private_archive_forces_private_records"();



CREATE OR REPLACE TRIGGER "trg_record_archive_stats_change" AFTER INSERT OR DELETE OR UPDATE OF "archive_id", "record_time", "primary_image_url" ON "public"."records" FOR EACH ROW EXECUTE FUNCTION "public"."handle_record_archive_stats_change"();



CREATE OR REPLACE TRIGGER "trg_sync_record_status_tag_to_record_tags" AFTER INSERT OR UPDATE OF "status_tag" ON "public"."records" FOR EACH ROW EXECUTE FUNCTION "public"."sync_record_status_tag_to_record_tags"();



CREATE OR REPLACE TRIGGER "trg_sync_record_tags_from_record" BEFORE INSERT OR UPDATE OF "note" ON "public"."records" FOR EACH ROW EXECUTE FUNCTION "public"."sync_record_tags_from_record"();



CREATE OR REPLACE TRIGGER "trg_user_memberships_updated_at" BEFORE UPDATE ON "public"."user_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_user_memberships_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_plant_plans_set_updated_at" BEFORE UPDATE ON "public"."user_plant_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_market_media" BEFORE INSERT OR UPDATE OF "market_post_id", "user_id", "source_media_id", "source_record_id", "path" ON "public"."market_media" FOR EACH ROW EXECUTE FUNCTION "public"."validate_market_media"();



CREATE OR REPLACE TRIGGER "trg_validate_market_post_source_record" BEFORE INSERT OR UPDATE OF "source_record_id", "archive_id", "user_id" ON "public"."market_posts" FOR EACH ROW EXECUTE FUNCTION "public"."validate_market_post_source_record"();



ALTER TABLE ONLY "public"."app_admins"
    ADD CONSTRAINT "app_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archive_follows"
    ADD CONSTRAINT "archive_follows_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."archives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archive_follows"
    ADD CONSTRAINT "archive_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_flowers"
    ADD CONSTRAINT "comment_flowers_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_flowers"
    ADD CONSTRAINT "comment_flowers_receiver_user_id_fkey" FOREIGN KEY ("receiver_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_flowers"
    ADD CONSTRAINT "comment_flowers_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_flowers"
    ADD CONSTRAINT "comment_flowers_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."market_comments"
    ADD CONSTRAINT "market_comments_market_post_id_fkey" FOREIGN KEY ("market_post_id") REFERENCES "public"."market_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_comments"
    ADD CONSTRAINT "market_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_media"
    ADD CONSTRAINT "market_media_market_post_id_fkey" FOREIGN KEY ("market_post_id") REFERENCES "public"."market_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_media"
    ADD CONSTRAINT "market_media_source_media_id_fkey" FOREIGN KEY ("source_media_id") REFERENCES "public"."media"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_media"
    ADD CONSTRAINT "market_media_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "public"."records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_media"
    ADD CONSTRAINT "market_media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_post_quota_addons"
    ADD CONSTRAINT "market_post_quota_addons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."market_posts"
    ADD CONSTRAINT "market_posts_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."archives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_posts"
    ADD CONSTRAINT "market_posts_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "public"."records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."market_posts"
    ADD CONSTRAINT "market_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_payments"
    ADD CONSTRAINT "membership_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."membership_payments"
    ADD CONSTRAINT "membership_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."archives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plant_care_guides"
    ADD CONSTRAINT "plant_care_guides_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "public"."plant_species"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plant_growth_cycle"
    ADD CONSTRAINT "plant_growth_cycle_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."plant_species"("id");



ALTER TABLE ONLY "public"."plant_light_cycle"
    ADD CONSTRAINT "plant_light_cycle_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."plant_species"("id");



ALTER TABLE ONLY "public"."plant_parameters"
    ADD CONSTRAINT "plant_parameters_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."plant_species"("id");



ALTER TABLE ONLY "public"."plant_species_aliases"
    ADD CONSTRAINT "plant_species_aliases_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."plant_species"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plant_species_i18n"
    ADD CONSTRAINT "plant_species_i18n_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "public"."plant_species"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plant_species_pending"
    ADD CONSTRAINT "plant_species_pending_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plant_temperature_ranges"
    ADD CONSTRAINT "plant_temperature_ranges_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."plant_species"("id");



ALTER TABLE ONLY "public"."record_likes"
    ADD CONSTRAINT "record_likes_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."record_likes"
    ADD CONSTRAINT "record_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."record_tags"
    ADD CONSTRAINT "record_tags_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."records"
    ADD CONSTRAINT "records_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."archives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plant_interests"
    ADD CONSTRAINT "user_plant_interests_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."plant_species"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plant_interests"
    ADD CONSTRAINT "user_plant_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plant_plans"
    ADD CONSTRAINT "user_plant_plans_created_archive_id_fkey" FOREIGN KEY ("created_archive_id") REFERENCES "public"."archives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plant_plans"
    ADD CONSTRAINT "user_plant_plans_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "public"."plant_species"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_plant_plans"
    ADD CONSTRAINT "user_plant_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "allow delete own follow" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));



CREATE POLICY "allow insert own follow" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));



CREATE POLICY "allow read" ON "public"."follows" FOR SELECT USING (true);



ALTER TABLE "public"."app_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "archive follows allow delete own" ON "public"."archive_follows" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "archive follows allow insert own" ON "public"."archive_follows" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "archive follows allow read" ON "public"."archive_follows" FOR SELECT USING (true);



ALTER TABLE "public"."archive_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."archives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "archives_delete_own" ON "public"."archives" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "archives_insert_own" ON "public"."archives" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_user_membership_active"("auth"."uid"())));



CREATE POLICY "archives_select_own_or_public" ON "public"."archives" FOR SELECT USING ((("is_public" = true) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "archives_update_own" ON "public"."archives" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."comment_flowers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_flowers_insert_help_owner" ON "public"."comment_flowers" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_user_id") AND ("sender_user_id" <> "receiver_user_id") AND (EXISTS ( SELECT 1
   FROM ("public"."records" "r"
     JOIN "public"."comments" "c" ON ((("c"."id" = "comment_flowers"."comment_id") AND ("c"."record_id" = "r"."id"))))
  WHERE (("r"."id" = "c"."record_id") AND ("r"."user_id" = "auth"."uid"()) AND ("c"."user_id" = "comment_flowers"."receiver_user_id") AND ("r"."status_tag" = ANY (ARRAY['help'::"text", 'resolved'::"text"])))))));



CREATE POLICY "comment_flowers_select_visible_record" ON "public"."comment_flowers" FOR SELECT USING ("public"."can_access_record"("record_id"));



CREATE POLICY "comment_flowers_update_sender_only" ON "public"."comment_flowers" FOR UPDATE USING (("auth"."uid"() = "sender_user_id")) WITH CHECK (("auth"."uid"() = "sender_user_id"));



ALTER TABLE "public"."comment_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_likes_delete_own" ON "public"."comment_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "comment_likes_insert_own" ON "public"."comment_likes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."comments" "c"
  WHERE (("c"."id" = "comment_likes"."comment_id") AND "public"."can_access_record"("c"."record_id"))))));



CREATE POLICY "comment_likes_select_visible_record" ON "public"."comment_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."comments" "c"
  WHERE (("c"."id" = "comment_likes"."comment_id") AND "public"."can_access_record"("c"."record_id")))));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete_own" ON "public"."comments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "comments_insert_own_active_visible_record" ON "public"."comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_user_membership_active"("auth"."uid"()) AND "public"."can_access_record"("record_id")));



CREATE POLICY "comments_select_visible_record" ON "public"."comments" FOR SELECT USING ("public"."can_access_record"("record_id"));



CREATE POLICY "comments_update_own" ON "public"."comments" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_tags_delete_own" ON "public"."group_tags" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "group_tags_insert_own" ON "public"."group_tags" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "group_tags_select_own" ON "public"."group_tags" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "group_tags_select_public_used" ON "public"."group_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."user_id" = "group_tags"."user_id") AND ("a"."group_tag_id" = "group_tags"."id") AND ("a"."is_public" = true)))));



CREATE POLICY "group_tags_update_own" ON "public"."group_tags" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_delete_own" ON "public"."locations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "locations_insert_own" ON "public"."locations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "locations_select_own" ON "public"."locations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "locations_update_own" ON "public"."locations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."market_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_comments_delete_own_or_post_owner" ON "public"."market_comments" FOR DELETE USING ((("auth"."uid"() = "user_id") OR "public"."is_market_post_owner"("market_post_id")));



CREATE POLICY "market_comments_insert_own_active_post" ON "public"."market_comments" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_user_membership_active"("auth"."uid"()) AND "public"."can_comment_market_post"("market_post_id")));



CREATE POLICY "market_comments_select_visible_post" ON "public"."market_comments" FOR SELECT USING ("public"."can_access_market_post"("market_post_id"));



CREATE POLICY "market_comments_update_own" ON "public"."market_comments" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."market_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_media_delete_own_post" ON "public"."market_media" FOR DELETE USING ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."market_posts" "mp"
  WHERE (("mp"."id" = "market_media"."market_post_id") AND ("mp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "market_media_insert_own_post" ON "public"."market_media" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."market_posts" "mp"
  WHERE (("mp"."id" = "market_media"."market_post_id") AND ("mp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "market_media_select_visible_post" ON "public"."market_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."market_posts" "mp"
  WHERE (("mp"."id" = "market_media"."market_post_id") AND (("mp"."status" = 'active'::"text") OR ("mp"."user_id" = "auth"."uid"()))))));



CREATE POLICY "market_media_update_own_post" ON "public"."market_media" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."market_posts" "mp"
  WHERE (("mp"."id" = "market_media"."market_post_id") AND ("mp"."user_id" = "auth"."uid"())))))) WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."market_posts" "mp"
  WHERE (("mp"."id" = "market_media"."market_post_id") AND ("mp"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."market_post_quota_addons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_post_quota_addons_select_own" ON "public"."market_post_quota_addons" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."market_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "market_posts_delete_own" ON "public"."market_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "market_posts_insert_own" ON "public"."market_posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."can_user_create_market_post"("auth"."uid"())));



CREATE POLICY "market_posts_select_public_or_own" ON "public"."market_posts" FOR SELECT USING ((("status" = 'active'::"text") OR ("auth"."uid"() = "user_id")));



CREATE POLICY "market_posts_update_own" ON "public"."market_posts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_delete_own" ON "public"."media" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "media_insert_own_active_record" ON "public"."media" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_user_membership_active"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."records" "r"
  WHERE (("r"."id" = "media"."record_id") AND ("r"."user_id" = "auth"."uid"()))))));



CREATE POLICY "media_select_own_or_public_record" ON "public"."media" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."records" "r"
     JOIN "public"."archives" "a" ON (("a"."id" = "r"."archive_id")))
  WHERE (("r"."id" = "media"."record_id") AND ("r"."visibility" = 'public'::"text") AND ("a"."is_public" = true))))));



CREATE POLICY "media_update_own" ON "public"."media" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."membership_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "membership_payments_admin_delete" ON "public"."membership_payments" FOR DELETE USING ("public"."is_app_admin"("auth"."uid"()));



CREATE POLICY "membership_payments_admin_insert" ON "public"."membership_payments" FOR INSERT WITH CHECK ("public"."is_app_admin"("auth"."uid"()));



CREATE POLICY "membership_payments_admin_select" ON "public"."membership_payments" FOR SELECT USING ("public"."is_app_admin"("auth"."uid"()));



CREATE POLICY "membership_payments_admin_update" ON "public"."membership_payments" FOR UPDATE USING ("public"."is_app_admin"("auth"."uid"())) WITH CHECK ("public"."is_app_admin"("auth"."uid"()));



CREATE POLICY "membership_payments_select_own_confirmed" ON "public"."membership_payments" FOR SELECT USING ((("auth"."uid"() = "user_id") AND ("status" = 'confirmed'::"text")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."plant_care_guides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plant_care_guides_select_all" ON "public"."plant_care_guides" FOR SELECT USING (true);



ALTER TABLE "public"."plant_parameter_score_guides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plant_parameter_score_guides_select_all" ON "public"."plant_parameter_score_guides" FOR SELECT USING (true);



ALTER TABLE "public"."plant_species_aliases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plant_species_aliases_public_read" ON "public"."plant_species_aliases" FOR SELECT USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_public_read" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."record_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "record_likes_delete_own" ON "public"."record_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "record_likes_insert_own" ON "public"."record_likes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."can_access_record"("record_id")));



CREATE POLICY "record_likes_select_visible_record" ON "public"."record_likes" FOR SELECT USING ("public"."can_access_record"("record_id"));



ALTER TABLE "public"."record_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "record_tags_delete_own_record" ON "public"."record_tags" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."records" "r"
  WHERE (("r"."id" = "record_tags"."record_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "record_tags_insert_own_record" ON "public"."record_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."records" "r"
  WHERE (("r"."id" = "record_tags"."record_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "record_tags_select_own_or_public_record" ON "public"."record_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."records" "r"
     JOIN "public"."archives" "a" ON (("a"."id" = "r"."archive_id")))
  WHERE (("r"."id" = "record_tags"."record_id") AND (("r"."user_id" = "auth"."uid"()) OR (("r"."visibility" = 'public'::"text") AND ("a"."is_public" = true)))))));



CREATE POLICY "record_tags_update_own_record" ON "public"."record_tags" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."records" "r"
  WHERE (("r"."id" = "record_tags"."record_id") AND ("r"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."records" "r"
  WHERE (("r"."id" = "record_tags"."record_id") AND ("r"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "records_delete_own" ON "public"."records" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "records_insert_own_active_archive" ON "public"."records" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_user_membership_active"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."id" = "records"."archive_id") AND ("a"."user_id" = "auth"."uid"()))))));



CREATE POLICY "records_select_own_or_public" ON "public"."records" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (("visibility" = 'public'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."id" = "records"."archive_id") AND ("a"."is_public" = true)))))));



CREATE POLICY "records_update_own_archive" ON "public"."records" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."id" = "records"."archive_id") AND ("a"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."sub_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sub_tags_delete_own" ON "public"."sub_tags" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "sub_tags_insert_own" ON "public"."sub_tags" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "sub_tags_select_own" ON "public"."sub_tags" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "sub_tags_select_public_used" ON "public"."sub_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."archives" "a"
  WHERE (("a"."user_id" = "sub_tags"."user_id") AND ("a"."sub_tag_id" = "sub_tags"."id") AND ("a"."is_public" = true)))));



CREATE POLICY "sub_tags_update_own" ON "public"."sub_tags" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_memberships_select_own" ON "public"."user_memberships" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_plant_interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plant_interests_delete_own" ON "public"."user_plant_interests" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plant_interests_insert_own" ON "public"."user_plant_interests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plant_interests_select_own" ON "public"."user_plant_interests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plant_interests_update_own" ON "public"."user_plant_interests" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_plant_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plant_plans_delete_own" ON "public"."user_plant_plans" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plant_plans_insert_own" ON "public"."user_plant_plans" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plant_plans_select_own" ON "public"."user_plant_plans" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plant_plans_update_own" ON "public"."user_plant_plans" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_confirm_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_months" integer, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_confirm_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_months" integer, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_confirm_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_months" integer, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_started_at" timestamp with time zone, "p_service_ends_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_started_at" timestamp with time zone, "p_service_ends_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_membership_payment_json"("p_user_id" "uuid", "p_plan" "text", "p_amount" numeric, "p_currency" "text", "p_payment_method" "text", "p_payment_reference" "text", "p_note" "text", "p_paid_at" timestamp with time zone, "p_service_started_at" timestamp with time zone, "p_service_ends_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_search_memberships"("p_keyword" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_memberships"("p_keyword" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_search_memberships"("p_keyword" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_membership_payment_status_json"("p_payment_id" "uuid", "p_status" "text", "p_note_append" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_membership_payment_status_json"("p_payment_id" "uuid", "p_status" "text", "p_note_append" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_membership_payment_status_json"("p_payment_id" "uuid", "p_status" "text", "p_note_append" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_user_membership"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_user_membership"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_user_membership"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_user_membership_json"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_user_membership_json"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_user_membership_json"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_user_membership_safe"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_user_membership_safe"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_user_membership_safe"("p_user_id" "uuid", "p_plan" "text", "p_paid_until" timestamp with time zone, "p_storage_limit_bytes" bigint, "p_base_market_post_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_market_post"("p_market_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_market_post"("p_market_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_market_post"("p_market_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_record"("p_record_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_record"("p_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_record"("p_record_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_comment_market_post"("p_market_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_comment_market_post"("p_market_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_comment_market_post"("p_market_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_user_create_market_post"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_create_market_post"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_create_market_post"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_archive_help_status"("p_archive_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_archive_help_status"("p_archive_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clear_archive_help_status"("p_archive_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_archive_help_status"("p_archive_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_archive_id" "uuid", "p_record_id" "uuid", "p_comment_id" "uuid", "p_related_url" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_archive_id" "uuid", "p_record_id" "uuid", "p_comment_id" "uuid", "p_related_url" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_actor_user_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_archive_id" "uuid", "p_record_id" "uuid", "p_comment_id" "uuid", "p_related_url" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_record_privacy_by_archive"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_record_privacy_by_archive"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_record_privacy_by_archive"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_user_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_user_space_group_tags"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_user_space_group_tags"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_user_space_group_tags"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_user_space_group_tags"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_active_market_post_count"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_active_market_post_count"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_active_market_post_count"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_market_post_limit"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_market_post_limit"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_market_post_limit"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_storage_limit_bytes"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_storage_limit_bytes"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_storage_limit_bytes"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_comment_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_comment_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_comment_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_comment_flower_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_comment_flower_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_comment_flower_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_media_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_media_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_media_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_record_archive_stats_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_record_archive_stats_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_record_archive_stats_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_record_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_record_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_record_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_archive_view_count"("p_archive_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_archive_view_count"("p_archive_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_archive_view_count"("p_archive_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_archive_view_count"("p_archive_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_app_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_app_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_market_post_owner"("p_market_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_market_post_owner"("p_market_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_market_post_owner"("p_market_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_record_owner"("p_record_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_record_owner"("p_record_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_record_owner"("p_record_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_membership_active"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_membership_active"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_membership_active"("p_user_id" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."archives" TO "anon";
GRANT ALL ON TABLE "public"."archives" TO "authenticated";
GRANT ALL ON TABLE "public"."archives" TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_archive_ended"("p_archive_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_archive_ended"("p_archive_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_archive_ended"("p_archive_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_archive_ended"("p_archive_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_archive_help_open"("p_archive_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_archive_help_open"("p_archive_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_archive_help_open"("p_archive_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_archive_help_open"("p_archive_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_archive_help_resolved"("p_archive_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_archive_help_resolved"("p_archive_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_archive_help_resolved"("p_archive_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_archive_help_resolved"("p_archive_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_archive_follow_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_archive_follow_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_archive_follow_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_comment_flower_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_comment_flower_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_comment_flower_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_comment_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_comment_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_comment_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_follow_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_follow_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_follow_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_followed_archive_record_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_followed_archive_record_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_followed_archive_record_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."private_archive_forces_private_records"() TO "anon";
GRANT ALL ON FUNCTION "public"."private_archive_forces_private_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."private_archive_forces_private_records"() TO "service_role";



GRANT ALL ON FUNCTION "public"."release_storage_bytes"("p_bytes" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."release_storage_bytes"("p_bytes" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_storage_bytes"("p_bytes" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."reserve_storage_bytes"("p_bytes" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_storage_bytes"("p_bytes" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_storage_bytes"("p_bytes" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_archive_active"("p_archive_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_archive_active"("p_archive_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_archive_active"("p_archive_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_archive_active"("p_archive_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_market_posts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_market_posts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_market_posts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_memberships_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_memberships_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_memberships_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_archive_stats"("p_archive_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_archive_stats"("p_archive_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_archive_stats"("p_archive_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_flower_count"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_flower_count"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_flower_count"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_record_comment_count"("p_record_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_record_comment_count"("p_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_record_comment_count"("p_record_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_record_media_stats"("p_record_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_record_media_stats"("p_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_record_media_stats"("p_record_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_record_status_tag_to_record_tags"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_record_status_tag_to_record_tags"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_record_status_tag_to_record_tags"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_record_tags_from_record"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_record_tags_from_record"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_record_tags_from_record"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_market_media"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_market_media"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_market_media"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_market_post_source_record"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_market_post_source_record"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_market_post_source_record"() TO "service_role";



GRANT ALL ON TABLE "public"."app_admins" TO "anon";
GRANT ALL ON TABLE "public"."app_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."app_admins" TO "service_role";



GRANT ALL ON TABLE "public"."archive_follows" TO "anon";
GRANT ALL ON TABLE "public"."archive_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_follows" TO "service_role";



GRANT ALL ON TABLE "public"."comment_flowers" TO "anon";
GRANT ALL ON TABLE "public"."comment_flowers" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_flowers" TO "service_role";



GRANT ALL ON TABLE "public"."comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_likes" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."records" TO "anon";
GRANT ALL ON TABLE "public"."records" TO "authenticated";
GRANT ALL ON TABLE "public"."records" TO "service_role";



GRANT ALL ON TABLE "public"."discovery_feed_view" TO "anon";
GRANT ALL ON TABLE "public"."discovery_feed_view" TO "authenticated";
GRANT ALL ON TABLE "public"."discovery_feed_view" TO "service_role";



GRANT ALL ON TABLE "public"."discovery_view" TO "anon";
GRANT ALL ON TABLE "public"."discovery_view" TO "authenticated";
GRANT ALL ON TABLE "public"."discovery_view" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."group_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."group_tags" TO "service_role";
GRANT SELECT ON TABLE "public"."group_tags" TO "anon";



GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."market_comments" TO "anon";
GRANT ALL ON TABLE "public"."market_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."market_comments" TO "service_role";



GRANT ALL ON TABLE "public"."market_media" TO "anon";
GRANT ALL ON TABLE "public"."market_media" TO "authenticated";
GRANT ALL ON TABLE "public"."market_media" TO "service_role";



GRANT ALL ON TABLE "public"."market_post_quota_addons" TO "anon";
GRANT ALL ON TABLE "public"."market_post_quota_addons" TO "authenticated";
GRANT ALL ON TABLE "public"."market_post_quota_addons" TO "service_role";



GRANT ALL ON TABLE "public"."market_posts" TO "anon";
GRANT ALL ON TABLE "public"."market_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."market_posts" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."media" TO "anon";
GRANT ALL ON TABLE "public"."media" TO "authenticated";
GRANT ALL ON TABLE "public"."media" TO "service_role";



GRANT ALL ON TABLE "public"."membership_payments" TO "anon";
GRANT ALL ON TABLE "public"."membership_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_payments" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."plant_care_guides" TO "anon";
GRANT ALL ON TABLE "public"."plant_care_guides" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_care_guides" TO "service_role";



GRANT ALL ON TABLE "public"."plant_growth_cycle" TO "anon";
GRANT ALL ON TABLE "public"."plant_growth_cycle" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_growth_cycle" TO "service_role";



GRANT ALL ON TABLE "public"."plant_light_cycle" TO "anon";
GRANT ALL ON TABLE "public"."plant_light_cycle" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_light_cycle" TO "service_role";



GRANT ALL ON TABLE "public"."plant_parameter_score_guides" TO "anon";
GRANT ALL ON TABLE "public"."plant_parameter_score_guides" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_parameter_score_guides" TO "service_role";



GRANT ALL ON TABLE "public"."plant_parameters" TO "anon";
GRANT ALL ON TABLE "public"."plant_parameters" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_parameters" TO "service_role";



GRANT ALL ON TABLE "public"."plant_species" TO "anon";
GRANT ALL ON TABLE "public"."plant_species" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_species" TO "service_role";



GRANT ALL ON TABLE "public"."plant_species_aliases" TO "anon";
GRANT ALL ON TABLE "public"."plant_species_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_species_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."plant_species_i18n" TO "anon";
GRANT ALL ON TABLE "public"."plant_species_i18n" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_species_i18n" TO "service_role";



GRANT ALL ON TABLE "public"."plant_species_pending" TO "anon";
GRANT ALL ON TABLE "public"."plant_species_pending" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_species_pending" TO "service_role";



GRANT ALL ON TABLE "public"."plant_temperature_ranges" TO "anon";
GRANT ALL ON TABLE "public"."plant_temperature_ranges" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_temperature_ranges" TO "service_role";



GRANT ALL ON TABLE "public"."record_likes" TO "anon";
GRANT ALL ON TABLE "public"."record_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."record_likes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."record_tags" TO "anon";
GRANT ALL ON TABLE "public"."record_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."record_tags" TO "service_role";



GRANT ALL ON TABLE "public"."sub_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_tags" TO "service_role";
GRANT SELECT ON TABLE "public"."sub_tags" TO "anon";



GRANT ALL ON TABLE "public"."timeline_view" TO "anon";
GRANT ALL ON TABLE "public"."timeline_view" TO "authenticated";
GRANT ALL ON TABLE "public"."timeline_view" TO "service_role";



GRANT ALL ON TABLE "public"."user_flower_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_flower_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_flower_stats" TO "service_role";



GRANT ALL ON TABLE "public"."user_memberships" TO "anon";
GRANT ALL ON TABLE "public"."user_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."user_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."user_plant_interests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plant_interests" TO "service_role";



GRANT ALL ON TABLE "public"."user_plant_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plant_plans" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







