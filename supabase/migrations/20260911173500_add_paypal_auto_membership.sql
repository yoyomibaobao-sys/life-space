-- Add server-verified PayPal Orders API linkage for one-time Plus payments.
--
-- PayPal remains a fixed US$8 / one-year payment. This does not create a
-- subscription or authorize automatic renewal. Alipay keeps the existing
-- proof-upload + administrator-confirmation workflow.

alter table public.membership_payments
  add column if not exists provider_order_id text,
  add column if not exists provider_capture_id text,
  add column if not exists provider_order_created_at timestamptz,
  add column if not exists provider_paid_at timestamptz;

create unique index if not exists membership_payments_provider_order_uidx
  on public.membership_payments (provider_order_id)
  where provider_order_id is not null;

create unique index if not exists membership_payments_provider_capture_uidx
  on public.membership_payments (provider_capture_id)
  where provider_capture_id is not null;

comment on column public.membership_payments.provider_order_id is
  'External payment-provider order id. PayPal uses the Orders v2 order id.';
comment on column public.membership_payments.provider_capture_id is
  'External provider capture/settlement id. Unique so a captured payment can never extend membership twice.';
comment on column public.membership_payments.provider_order_created_at is
  'Time the external provider order was bound to this LifeSpace order.';
comment on column public.membership_payments.provider_paid_at is
  'Provider-confirmed payment completion time.';

-- New PayPal orders no longer snapshot the old hosted payment-link URL. The
-- stable destination key/version identify the server-side Orders API flow.
create or replace function public.create_membership_payment_order_json(
  p_currency text,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_payment_method text := lower(trim(coalesce(p_payment_method, '')));
  v_amount numeric(10, 2);
  v_destination_key text;
  v_destination_label text;
  v_destination_url text;
  v_destination_version text;
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_order public.membership_payments%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
  end if;

  if not (
    (v_currency = 'CNY' and v_payment_method = 'alipay')
    or (v_currency = 'USD' and v_payment_method = 'paypal')
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_payment_option');
  end if;

  if v_payment_method = 'alipay' then
    v_amount := 64.00;
    v_destination_key := 'alipay_cloud_membership_64';
    v_destination_label := '有时空间';
    v_destination_url := '/payments/alipay-cloud-membership-64.jpg';
    v_destination_version := 'alipay-business-qr-64-v1';
  else
    v_amount := 8.00;
    v_destination_key := 'paypal_checkout_orders_api';
    v_destination_label := 'LifeSpace';
    v_destination_url := null;
    v_destination_version := 'paypal-orders-v2-v1';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-order:' || v_user_id::text, 0)
  );

  update public.membership_payments as mp
  set
    status = 'expired',
    closed_at = now(),
    close_reason = 'expired_24h',
    updated_at = now()
  where mp.user_id = v_user_id
    and mp.order_number is not null
    and mp.status = 'pending_payment'
    and coalesce(mp.expires_at, mp.created_at + interval '24 hours') <= now();

  select mp.*
  into v_order
  from public.membership_payments as mp
  where mp.user_id = v_user_id
    and mp.order_number is not null
    and mp.status in ('pending_payment', 'submitted', 'needs_update')
  order by
    case mp.status
      when 'submitted' then 1
      when 'needs_update' then 2
      else 3
    end,
    mp.created_at desc
  limit 1
  for update;

  -- Never disturb a payment that already entered the legacy manual review
  -- queue. The administrator can finish that historical order normally.
  if found and v_order.status in ('submitted', 'needs_update') then
    return jsonb_build_object(
      'ok', true,
      'reused', true,
      'id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'amount', v_order.amount,
      'currency', v_order.currency,
      'payment_method', v_order.payment_method,
      'payment_reference', v_order.payment_reference,
      'proof_path', v_order.proof_path,
      'submitted_at', v_order.submitted_at,
      'review_note', v_order.review_note,
      'created_at', v_order.created_at,
      'expires_at', v_order.expires_at,
      'payment_destination_key', v_order.payment_destination_key,
      'payment_destination_label', v_order.payment_destination_label,
      'payment_destination_url', v_order.payment_destination_url,
      'payment_destination_version', v_order.payment_destination_version
    );
  end if;

  if found
     and v_order.currency = v_currency
     and v_order.payment_method = v_payment_method
     and v_order.payment_destination_key = v_destination_key
     and v_order.payment_destination_version = v_destination_version then
    return jsonb_build_object(
      'ok', true,
      'reused', true,
      'id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'amount', v_order.amount,
      'currency', v_order.currency,
      'payment_method', v_order.payment_method,
      'payment_reference', v_order.payment_reference,
      'proof_path', v_order.proof_path,
      'submitted_at', v_order.submitted_at,
      'review_note', v_order.review_note,
      'created_at', v_order.created_at,
      'expires_at', v_order.expires_at,
      'payment_destination_key', v_order.payment_destination_key,
      'payment_destination_label', v_order.payment_destination_label,
      'payment_destination_url', v_order.payment_destination_url,
      'payment_destination_version', v_order.payment_destination_version
    );
  elsif found then
    update public.membership_payments as mp
    set
      status = 'canceled',
      closed_at = now(),
      close_reason = 'destination_changed',
      updated_at = now()
    where mp.id = v_order.id;
  end if;

  v_order_number :=
    'YS-' ||
    to_char(now() at time zone 'UTC', 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(v_order_id::text, '-', ''), 1, 12));

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
    payment_destination_url,
    payment_destination_version,
    updated_at
  )
  values (
    v_order_id,
    v_user_id,
    'basic',
    'pending_payment',
    v_amount,
    v_currency,
    v_payment_method,
    v_order_number,
    null,
    now() + interval '24 hours',
    v_destination_key,
    v_destination_label,
    v_destination_url,
    v_destination_version,
    now()
  )
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'reused', false,
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'amount', v_order.amount,
    'currency', v_order.currency,
    'payment_method', v_order.payment_method,
    'payment_reference', v_order.payment_reference,
    'proof_path', v_order.proof_path,
    'submitted_at', v_order.submitted_at,
    'review_note', v_order.review_note,
    'created_at', v_order.created_at,
    'expires_at', v_order.expires_at,
    'payment_destination_key', v_order.payment_destination_key,
    'payment_destination_label', v_order.payment_destination_label,
    'payment_destination_url', v_order.payment_destination_url,
    'payment_destination_version', v_order.payment_destination_version
  );
end;
$$;

create or replace function public.bind_paypal_membership_order_json(
  p_payment_id uuid,
  p_user_id uuid,
  p_paypal_order_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_order_id text := nullif(trim(coalesce(p_paypal_order_id, '')), '');
  v_payment public.membership_payments%rowtype;
begin
  if p_payment_id is null or p_user_id is null or v_provider_order_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'missing_paypal_binding');
  end if;

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = p_payment_id
    and mp.user_id = p_user_id
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

  if v_payment.status <> 'pending_payment' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_pending');
  end if;

  if coalesce(v_payment.expires_at, v_payment.created_at + interval '24 hours') <= now() then
    update public.membership_payments as mp
    set
      status = 'expired',
      closed_at = now(),
      close_reason = 'expired_24h',
      updated_at = now()
    where mp.id = v_payment.id;

    return jsonb_build_object('ok', false, 'error_message', 'order_expired');
  end if;

  if v_payment.provider_order_id is not null then
    if v_payment.provider_order_id = v_provider_order_id then
      return jsonb_build_object(
        'ok', true,
        'already_bound', true,
        'payment_id', v_payment.id,
        'provider_order_id', v_payment.provider_order_id
      );
    end if;

    return jsonb_build_object('ok', false, 'error_message', 'paypal_order_already_bound');
  end if;

  update public.membership_payments as mp
  set
    provider_order_id = v_provider_order_id,
    provider_order_created_at = now(),
    updated_at = now()
  where mp.id = v_payment.id
  returning * into v_payment;

  return jsonb_build_object(
    'ok', true,
    'already_bound', false,
    'payment_id', v_payment.id,
    'provider_order_id', v_payment.provider_order_id
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error_message', 'paypal_order_already_used');
end;
$$;

create or replace function public.confirm_paypal_membership_payment_json(
  p_payment_id uuid,
  p_paypal_order_id text,
  p_paypal_capture_id text,
  p_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function public.bind_paypal_membership_order_json(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.confirm_paypal_membership_payment_json(uuid, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.bind_paypal_membership_order_json(uuid, uuid, text)
  to service_role;
grant execute on function public.confirm_paypal_membership_payment_json(uuid, text, text, timestamptz)
  to service_role;

comment on function public.bind_paypal_membership_order_json(uuid, uuid, text) is
  'Server-only: binds one PayPal Orders v2 order to a fixed-price LifeSpace membership order.';
comment on function public.confirm_paypal_membership_payment_json(uuid, text, text, timestamptz) is
  'Server-only: after a verified PayPal COMPLETED capture, idempotently confirms payment and activates/extends Plus for 12 months.';
