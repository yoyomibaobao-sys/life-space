-- Give unpaid membership orders a bounded lifetime and retain the exact
-- destination shown to the payer. Destination snapshots are immutable audit
-- data: changing the site's current payment account must never rewrite an
-- order that has already been submitted for review.

alter table public.membership_payments
  add column if not exists expires_at timestamptz,
  add column if not exists payment_destination_key text,
  add column if not exists payment_destination_label text,
  add column if not exists payment_destination_url text,
  add column if not exists payment_destination_version text,
  add column if not exists closed_at timestamptz,
  add column if not exists close_reason text;

comment on column public.membership_payments.expires_at is
  '仅待付款订单使用；创建后24小时失效。已提交或需补充凭证的订单不自动过期。';
comment on column public.membership_payments.payment_destination_key is
  '订单创建时使用的收款目标稳定标识。';
comment on column public.membership_payments.payment_destination_label is
  '订单创建时向付款人显示的收款方名称快照。';
comment on column public.membership_payments.payment_destination_url is
  '订单创建时使用的二维码资源或PayPal付款链接快照。';
comment on column public.membership_payments.payment_destination_version is
  '收款目标版本；更换收款账号时创建新版本，不改写旧订单。';
comment on column public.membership_payments.close_reason is
  '未付款订单关闭原因，例如expired_24h、user_canceled或destination_changed。';

-- Backfill every existing user-facing order before immutability is enabled.
update public.membership_payments as mp
set
  payment_destination_key = case mp.payment_method
    when 'alipay' then 'alipay_cloud_membership_64'
    when 'paypal' then 'paypal_ncp_PZEB4Z4SDSLLE'
    else 'legacy_' || mp.payment_method
  end,
  payment_destination_label = case mp.payment_method
    when 'alipay' then '有时空间'
    when 'paypal' then 'LifeSpace'
    else coalesce(mp.payment_method, 'legacy')
  end,
  payment_destination_url = case mp.payment_method
    when 'alipay' then '/payments/alipay-cloud-membership-64.jpg'
    when 'paypal' then 'https://www.paypal.com/ncp/payment/PZEB4Z4SDSLLE'
    else null
  end,
  payment_destination_version = case mp.payment_method
    when 'alipay' then 'alipay-business-qr-64-v1'
    when 'paypal' then 'paypal-ncp-PZEB4Z4SDSLLE-v1'
    else 'legacy-v1'
  end,
  expires_at = case
    when mp.status = 'pending_payment'
      then coalesce(mp.created_at, now()) + interval '24 hours'
    else mp.expires_at
  end
where mp.order_number is not null
  and (
    mp.payment_destination_key is null
    or mp.payment_destination_label is null
    or mp.payment_destination_version is null
    or (mp.status = 'pending_payment' and mp.expires_at is null)
  );

alter table public.membership_payments
  drop constraint if exists membership_payments_status_check;

alter table public.membership_payments
  add constraint membership_payments_status_check
  check (
    status in (
      'pending_payment',
      'submitted',
      'needs_update',
      'confirmed',
      'refunded',
      'canceled',
      'expired'
    )
  );

-- Close already-stale unpaid orders during migration. Proof-submitted orders
-- are intentionally left untouched even if they were created long ago.
update public.membership_payments as mp
set
  status = 'expired',
  closed_at = now(),
  close_reason = 'expired_24h',
  updated_at = now()
where mp.order_number is not null
  and mp.status = 'pending_payment'
  and mp.expires_at <= now();

drop index if exists public.membership_payments_one_open_order_per_user_uidx;
create unique index membership_payments_one_open_order_per_user_uidx
  on public.membership_payments (user_id)
  where order_number is not null
    and status in ('pending_payment', 'submitted', 'needs_update');

create index if not exists membership_payments_pending_expiry_idx
  on public.membership_payments (expires_at)
  where status = 'pending_payment';

create or replace function public.protect_membership_payment_order_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.order_number is not null
     and (
       new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.payment_method is distinct from old.payment_method
       or new.payment_destination_key is distinct from old.payment_destination_key
       or new.payment_destination_label is distinct from old.payment_destination_label
       or new.payment_destination_url is distinct from old.payment_destination_url
       or new.payment_destination_version is distinct from old.payment_destination_version
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'payment_order_snapshot_is_immutable' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_membership_payment_order_snapshot
  on public.membership_payments;
create trigger trg_protect_membership_payment_order_snapshot
before update on public.membership_payments
for each row
execute function public.protect_membership_payment_order_snapshot();

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
    v_destination_key := 'paypal_ncp_PZEB4Z4SDSLLE';
    v_destination_label := 'LifeSpace';
    v_destination_url := 'https://www.paypal.com/ncp/payment/PZEB4Z4SDSLLE';
    v_destination_version := 'paypal-ncp-PZEB4Z4SDSLLE-v1';
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

create or replace function public.submit_membership_payment_order_json(
  p_order_id uuid,
  p_proof_path text,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_proof_path text := trim(coalesce(p_proof_path, ''));
  v_reference text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_expected_path text;
  v_order public.membership_payments%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'missing_order_id');
  end if;

  select mp.*
  into v_order
  from public.membership_payments as mp
  where mp.id = p_order_id
    and mp.user_id = v_user_id
    and mp.order_number is not null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'order_not_found');
  end if;

  if v_order.status = 'pending_payment'
     and coalesce(v_order.expires_at, v_order.created_at + interval '24 hours') <= now() then
    update public.membership_payments as mp
    set
      status = 'expired',
      closed_at = now(),
      close_reason = 'expired_24h',
      updated_at = now()
    where mp.id = p_order_id;

    return jsonb_build_object('ok', false, 'error_message', 'order_expired');
  end if;

  if v_order.status not in ('pending_payment', 'needs_update') then
    return jsonb_build_object('ok', false, 'error_message', 'order_not_editable');
  end if;

  if length(v_reference) > 160 then
    return jsonb_build_object('ok', false, 'error_message', 'payment_reference_too_long');
  end if;

  v_expected_path := v_user_id::text || '/' || p_order_id::text || '/proof';
  if v_proof_path <> v_expected_path then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_proof_path');
  end if;

  if not exists (
    select 1
    from storage.objects as so
    where so.bucket_id = 'payment-proofs'
      and so.name = v_proof_path
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'proof_not_found');
  end if;

  update public.membership_payments as mp
  set
    status = 'submitted',
    proof_path = v_proof_path,
    payment_reference = v_reference,
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    review_note = null,
    expires_at = null,
    updated_at = now()
  where mp.id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
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

create or replace function public.cancel_membership_payment_order_json(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.membership_payments%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
  end if;

  select mp.*
  into v_order
  from public.membership_payments as mp
  where mp.id = p_order_id
    and mp.user_id = v_user_id
    and mp.order_number is not null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'order_not_found');
  end if;

  if v_order.status in ('canceled', 'expired') then
    return jsonb_build_object('ok', true, 'already_closed', true, 'status', v_order.status);
  end if;

  if v_order.status <> 'pending_payment' then
    return jsonb_build_object('ok', false, 'error_message', 'paid_or_submitted_order_cannot_be_canceled');
  end if;

  update public.membership_payments as mp
  set
    status = 'canceled',
    closed_at = now(),
    close_reason = 'user_canceled',
    updated_at = now()
  where mp.id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'already_closed', false,
    'id', v_order.id,
    'status', v_order.status
  );
end;
$$;

create or replace function public.get_my_open_membership_payment_order_json()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.membership_payments%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
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
  order by mp.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
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

create or replace function public.admin_list_membership_payment_queue_v2()
returns table (
  id uuid,
  user_id uuid,
  email text,
  username text,
  order_number text,
  status text,
  amount numeric,
  currency text,
  payment_method text,
  payment_reference text,
  proof_path text,
  submitted_at timestamptz,
  created_at timestamptz,
  review_note text,
  payment_destination_key text,
  payment_destination_label text,
  payment_destination_url text,
  payment_destination_version text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    mp.id,
    mp.user_id,
    au.email::text,
    pr.username,
    mp.order_number,
    mp.status,
    mp.amount,
    mp.currency,
    mp.payment_method,
    mp.payment_reference,
    mp.proof_path,
    mp.submitted_at,
    mp.created_at,
    mp.review_note,
    mp.payment_destination_key,
    mp.payment_destination_label,
    mp.payment_destination_url,
    mp.payment_destination_version
  from public.membership_payments as mp
  join auth.users as au on au.id = mp.user_id
  left join public.profiles as pr on pr.id = mp.user_id
  where mp.status = 'submitted'
  order by mp.submitted_at asc nulls last, mp.created_at asc
  limit 100;
end;
$$;

revoke all on function public.protect_membership_payment_order_snapshot()
  from public, anon, authenticated;
revoke all on function public.create_membership_payment_order_json(text, text)
  from public, anon;
revoke all on function public.submit_membership_payment_order_json(uuid, text, text)
  from public, anon;
revoke all on function public.cancel_membership_payment_order_json(uuid)
  from public, anon;
revoke all on function public.get_my_open_membership_payment_order_json()
  from public, anon;
revoke all on function public.admin_list_membership_payment_queue_v2()
  from public, anon;

grant execute on function public.create_membership_payment_order_json(text, text)
  to authenticated, service_role;
grant execute on function public.submit_membership_payment_order_json(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.cancel_membership_payment_order_json(uuid)
  to authenticated, service_role;
grant execute on function public.get_my_open_membership_payment_order_json()
  to authenticated, service_role;
grant execute on function public.admin_list_membership_payment_queue_v2()
  to authenticated, service_role;

comment on function public.cancel_membership_payment_order_json(uuid) is
  '付款前由订单本人关闭待付款订单；已提交或需补充凭证的订单不能自行关闭。';
comment on function public.admin_list_membership_payment_queue_v2() is
  '管理员付款审核队列，包含订单创建时不可变的收款目标快照。';
