-- User-requested membership refunds with an administrator-reviewed,
-- two-stage external refund workflow.

begin;

create table if not exists public.membership_refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique
    references public.membership_payments(id) on delete restrict,
  user_id uuid not null,
  status text not null default 'submitted',
  policy_band text not null,
  original_amount numeric(10, 2) not null,
  refund_amount numeric(10, 2) not null,
  currency text not null,
  request_reason text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  refund_reference text,
  refunded_at timestamptz,
  benefits_ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_refund_requests_status_check
    check (status in (
      'submitted',
      'approved_pending_refund',
      'completed',
      'rejected',
      'canceled'
    )),
  constraint membership_refund_requests_policy_band_check
    check (policy_band in ('full_7d', 'half_180d', 'unused_renewal_full')),
  constraint membership_refund_requests_amount_check
    check (
      original_amount > 0
      and refund_amount > 0
      and refund_amount <= original_amount
    ),
  constraint membership_refund_requests_currency_check
    check (currency in ('CNY', 'USD')),
  constraint membership_refund_requests_reason_length_check
    check (request_reason is null or char_length(request_reason) <= 600),
  constraint membership_refund_requests_review_note_length_check
    check (review_note is null or char_length(review_note) <= 600),
  constraint membership_refund_requests_reference_length_check
    check (refund_reference is null or char_length(refund_reference) <= 160)
);

alter table public.membership_refund_requests enable row level security;

revoke all on table public.membership_refund_requests
  from public, anon, authenticated;
grant all on table public.membership_refund_requests to service_role;

create index if not exists membership_refund_requests_queue_idx
  on public.membership_refund_requests (status, requested_at asc)
  where status in ('submitted', 'approved_pending_refund');
create index if not exists membership_refund_requests_user_idx
  on public.membership_refund_requests (user_id, requested_at desc);

comment on table public.membership_refund_requests is
  'Membership refund requests. Users and administrators access rows only through ownership-checked RPCs.';
comment on column public.membership_refund_requests.refund_reference is
  'External Alipay or PayPal refund transaction reference entered only after the original-channel refund succeeds.';

create or replace function public.get_my_membership_refunds_json()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
  end if;

  select coalesce(jsonb_agg(rows.item order by rows.sort_time desc), '[]'::jsonb)
  into v_items
  from (
    select
      coalesce(mp.reviewed_at, mp.paid_at, mp.service_started_at, mp.created_at) as sort_time,
      jsonb_build_object(
        'payment_id', mp.id,
        'order_number', mp.order_number,
        'payment_status', mp.status,
        'amount', mp.amount,
        'currency', mp.currency,
        'payment_method', mp.payment_method,
        'payment_reference', mp.payment_reference,
        'confirmed_at', confirmed.confirmed_at,
        'service_started_at', mp.service_started_at,
        'service_ends_at', mp.service_ends_at,
        'eligibility_ends_at', confirmed.confirmed_at + interval '180 days',
        'eligible', (
          mp.status = 'confirmed'
          and rr.id is null
          and now() <= confirmed.confirmed_at + interval '180 days'
          and newer.id is null
          and open_order.id is null
        ),
        'eligibility_reason', case
          when rr.id is not null then 'request_exists'
          when mp.status <> 'confirmed' then 'payment_not_confirmed'
          when now() > confirmed.confirmed_at + interval '180 days' then 'refund_window_closed'
          when newer.id is not null then 'newer_membership_order_exists'
          when open_order.id is not null then 'open_membership_order_exists'
          else null
        end,
        'quoted_policy_band', case
          when rr.id is not null then rr.policy_band
          when mp.service_started_at is not null and mp.service_started_at > now()
            then 'unused_renewal_full'
          when now() <= confirmed.confirmed_at + interval '7 days'
            then 'full_7d'
          else 'half_180d'
        end,
        'quoted_refund_amount', case
          when rr.id is not null then rr.refund_amount
          when mp.service_started_at is not null and mp.service_started_at > now()
            then mp.amount
          when now() <= confirmed.confirmed_at + interval '7 days'
            then mp.amount
          else round(mp.amount * 0.5, 2)
        end,
        'refund_request', case when rr.id is null then null else jsonb_build_object(
          'id', rr.id,
          'status', rr.status,
          'policy_band', rr.policy_band,
          'refund_amount', rr.refund_amount,
          'currency', rr.currency,
          'request_reason', rr.request_reason,
          'requested_at', rr.requested_at,
          'reviewed_at', rr.reviewed_at,
          'review_note', rr.review_note,
          'refund_reference', rr.refund_reference,
          'refunded_at', rr.refunded_at,
          'benefits_ended_at', rr.benefits_ended_at
        ) end
      ) as item
    from public.membership_payments as mp
    cross join lateral (
      select coalesce(
        mp.reviewed_at,
        mp.paid_at,
        mp.service_started_at,
        mp.created_at
      ) as confirmed_at
    ) as confirmed
    left join public.membership_refund_requests as rr
      on rr.payment_id = mp.id
    left join lateral (
      select later.id
      from public.membership_payments as later
      where later.user_id = mp.user_id
        and later.id <> mp.id
        and later.status = 'confirmed'
        and coalesce(later.service_started_at, later.created_at)
          > coalesce(mp.service_started_at, mp.created_at)
      order by coalesce(later.service_started_at, later.created_at) desc
      limit 1
    ) as newer on true
    left join lateral (
      select pending.id
      from public.membership_payments as pending
      where pending.user_id = mp.user_id
        and pending.id <> mp.id
        and pending.status in ('pending_payment', 'submitted', 'needs_update')
      limit 1
    ) as open_order on true
    where mp.user_id = v_user_id
      and mp.amount > 0
      and mp.currency in ('CNY', 'USD')
      and mp.status in ('confirmed', 'refunded')
    order by sort_time desc
    limit 12
  ) as rows;

  return jsonb_build_object(
    'ok', true,
    'policy', jsonb_build_object(
      'full_refund_days', 7,
      'half_refund_days', 180,
      'half_refund_ratio', 0.5
    ),
    'items', v_items
  );
end;
$$;

create or replace function public.request_membership_refund_json(
  p_payment_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_payment public.membership_payments%rowtype;
  v_existing public.membership_refund_requests%rowtype;
  v_request public.membership_refund_requests%rowtype;
  v_confirmed_at timestamptz;
  v_policy_band text;
  v_refund_amount numeric(10, 2);
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
  end if;

  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'missing_payment_id');
  end if;

  if v_reason is not null and char_length(v_reason) > 600 then
    return jsonb_build_object('ok', false, 'error_message', 'reason_too_long');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-refund:' || v_user_id::text, 0)
  );

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = p_payment_id
    and mp.user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_found');
  end if;

  select rr.*
  into v_existing
  from public.membership_refund_requests as rr
  where rr.payment_id = v_payment.id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'reused', true,
      'request_id', v_existing.id,
      'status', v_existing.status,
      'policy_band', v_existing.policy_band,
      'refund_amount', v_existing.refund_amount,
      'currency', v_existing.currency,
      'requested_at', v_existing.requested_at
    );
  end if;

  if v_payment.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_confirmed');
  end if;

  if v_payment.amount <= 0 or v_payment.currency not in ('CNY', 'USD') then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_payment_amount');
  end if;

  v_confirmed_at := coalesce(
    v_payment.reviewed_at,
    v_payment.paid_at,
    v_payment.service_started_at,
    v_payment.created_at
  );

  if now() > v_confirmed_at + interval '180 days' then
    return jsonb_build_object('ok', false, 'error_message', 'refund_window_closed');
  end if;

  if exists (
    select 1
    from public.membership_payments as later
    where later.user_id = v_user_id
      and later.id <> v_payment.id
      and later.status = 'confirmed'
      and coalesce(later.service_started_at, later.created_at)
        > coalesce(v_payment.service_started_at, v_payment.created_at)
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'newer_membership_order_exists');
  end if;

  if exists (
    select 1
    from public.membership_payments as pending
    where pending.user_id = v_user_id
      and pending.id <> v_payment.id
      and pending.status in ('pending_payment', 'submitted', 'needs_update')
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'open_membership_order_exists');
  end if;

  if v_payment.service_started_at is not null and v_payment.service_started_at > now() then
    v_policy_band := 'unused_renewal_full';
    v_refund_amount := v_payment.amount;
  elsif now() <= v_confirmed_at + interval '7 days' then
    v_policy_band := 'full_7d';
    v_refund_amount := v_payment.amount;
  else
    v_policy_band := 'half_180d';
    v_refund_amount := round(v_payment.amount * 0.5, 2);
  end if;

  insert into public.membership_refund_requests (
    payment_id,
    user_id,
    status,
    policy_band,
    original_amount,
    refund_amount,
    currency,
    request_reason,
    requested_at,
    updated_at
  )
  values (
    v_payment.id,
    v_user_id,
    'submitted',
    v_policy_band,
    v_payment.amount,
    v_refund_amount,
    v_payment.currency,
    v_reason,
    now(),
    now()
  )
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'reused', false,
    'request_id', v_request.id,
    'status', v_request.status,
    'policy_band', v_request.policy_band,
    'refund_amount', v_request.refund_amount,
    'currency', v_request.currency,
    'requested_at', v_request.requested_at
  );
end;
$$;

create or replace function public.admin_get_membership_refund_queue_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;

  select count(*)
  into v_count
  from public.membership_refund_requests as rr
  where rr.status in ('submitted', 'approved_pending_refund');

  return v_count;
end;
$$;

create or replace function public.admin_list_membership_refund_queue(
  p_limit integer default 100
)
returns table (
  id uuid,
  payment_id uuid,
  user_id uuid,
  email text,
  username text,
  account_number text,
  status text,
  policy_band text,
  original_amount numeric,
  refund_amount numeric,
  currency text,
  request_reason text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  refund_reference text,
  refunded_at timestamptz,
  benefits_ended_at timestamptz,
  order_number text,
  payment_method text,
  payment_reference text,
  paid_at timestamptz,
  service_started_at timestamptz,
  service_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;

  return query
  select
    rr.id,
    rr.payment_id,
    rr.user_id,
    au.email::text,
    pr.username,
    u.account_number,
    rr.status,
    rr.policy_band,
    rr.original_amount,
    rr.refund_amount,
    rr.currency,
    rr.request_reason,
    rr.requested_at,
    rr.reviewed_at,
    rr.review_note,
    rr.refund_reference,
    rr.refunded_at,
    rr.benefits_ended_at,
    mp.order_number,
    mp.payment_method,
    mp.payment_reference,
    mp.paid_at,
    mp.service_started_at,
    mp.service_ends_at
  from public.membership_refund_requests as rr
  join public.membership_payments as mp on mp.id = rr.payment_id
  left join auth.users as au on au.id = rr.user_id
  left join public.profiles as pr on pr.id = rr.user_id
  left join public.users as u on u.id = rr.user_id
  order by
    case rr.status
      when 'submitted' then 0
      when 'approved_pending_refund' then 1
      else 2
    end,
    rr.requested_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

create or replace function public.admin_approve_membership_refund_json(
  p_request_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_request public.membership_refund_requests%rowtype;
  v_payment public.membership_payments%rowtype;
  v_membership public.user_memberships%rowtype;
begin
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  if v_note is not null and char_length(v_note) > 600 then
    return jsonb_build_object('ok', false, 'error_message', 'review_note_too_long');
  end if;

  select rr.*
  into v_request
  from public.membership_refund_requests as rr
  where rr.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'refund_request_not_found');
  end if;

  if v_request.status = 'approved_pending_refund' then
    return jsonb_build_object(
      'ok', true,
      'already_approved', true,
      'request_id', v_request.id,
      'status', v_request.status,
      'refund_amount', v_request.refund_amount,
      'currency', v_request.currency
    );
  end if;

  if v_request.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'error_message', 'refund_request_not_submitted');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-refund:' || v_request.user_id::text, 0)
  );

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = v_request.payment_id
    and mp.user_id = v_request.user_id
  for update;

  if not found or v_payment.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_confirmed');
  end if;

  if exists (
    select 1
    from public.membership_payments as later
    where later.user_id = v_request.user_id
      and later.id <> v_payment.id
      and later.status = 'confirmed'
      and coalesce(later.service_started_at, later.created_at)
        > coalesce(v_payment.service_started_at, v_payment.created_at)
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'newer_membership_order_exists');
  end if;

  select um.*
  into v_membership
  from public.user_memberships as um
  where um.user_id = v_request.user_id
  for update;

  if not found
     or v_payment.service_ends_at is null
     or v_membership.paid_until is distinct from v_payment.service_ends_at then
    return jsonb_build_object('ok', false, 'error_message', 'membership_term_changed');
  end if;

  update public.membership_refund_requests as rr
  set
    status = 'approved_pending_refund',
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    review_note = v_note,
    updated_at = now()
  where rr.id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'already_approved', false,
    'request_id', v_request.id,
    'status', v_request.status,
    'refund_amount', v_request.refund_amount,
    'currency', v_request.currency,
    'payment_method', v_payment.payment_method,
    'payment_reference', v_payment.payment_reference
  );
end;
$$;

create or replace function public.admin_reject_membership_refund_json(
  p_request_id uuid,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_request public.membership_refund_requests%rowtype;
begin
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  if v_note is null then
    return jsonb_build_object('ok', false, 'error_message', 'review_note_required');
  end if;

  if char_length(v_note) > 600 then
    return jsonb_build_object('ok', false, 'error_message', 'review_note_too_long');
  end if;

  select rr.*
  into v_request
  from public.membership_refund_requests as rr
  where rr.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'refund_request_not_found');
  end if;

  if v_request.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'error_message', 'refund_request_not_submitted');
  end if;

  update public.membership_refund_requests as rr
  set
    status = 'rejected',
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    review_note = v_note,
    updated_at = now()
  where rr.id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'review_note', v_request.review_note
  );
end;
$$;

create or replace function public.admin_complete_membership_refund_json(
  p_request_id uuid,
  p_refund_reference text,
  p_confirmed_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_reference text := nullif(trim(coalesce(p_refund_reference, '')), '');
  v_request public.membership_refund_requests%rowtype;
  v_payment public.membership_payments%rowtype;
  v_membership public.user_memberships%rowtype;
  v_benefits_end timestamptz := now();
  v_is_future_renewal boolean := false;
  v_has_prior_payment boolean := false;
  v_has_signup_trial boolean := false;
begin
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  if v_reference is null then
    return jsonb_build_object('ok', false, 'error_message', 'refund_reference_required');
  end if;

  if char_length(v_reference) > 160 then
    return jsonb_build_object('ok', false, 'error_message', 'refund_reference_too_long');
  end if;

  select rr.*
  into v_request
  from public.membership_refund_requests as rr
  where rr.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'refund_request_not_found');
  end if;

  if v_request.status = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'already_completed', true,
      'request_id', v_request.id,
      'status', v_request.status,
      'refund_reference', v_request.refund_reference,
      'refunded_at', v_request.refunded_at
    );
  end if;

  if v_request.status <> 'approved_pending_refund' then
    return jsonb_build_object('ok', false, 'error_message', 'refund_not_approved');
  end if;

  if p_confirmed_amount is null
     or round(p_confirmed_amount, 2) <> v_request.refund_amount then
    return jsonb_build_object('ok', false, 'error_message', 'refund_amount_mismatch');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-refund:' || v_request.user_id::text, 0)
  );

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = v_request.payment_id
    and mp.user_id = v_request.user_id
  for update;

  if not found or v_payment.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_confirmed');
  end if;

  select um.*
  into v_membership
  from public.user_memberships as um
  where um.user_id = v_request.user_id
  for update;

  if not found
     or v_payment.service_ends_at is null
     or v_membership.paid_until is distinct from v_payment.service_ends_at then
    return jsonb_build_object('ok', false, 'error_message', 'membership_term_changed');
  end if;

  v_is_future_renewal :=
    v_payment.service_started_at is not null
    and v_payment.service_started_at > now();

  select exists (
    select 1
    from public.membership_payments as earlier
    where earlier.user_id = v_request.user_id
      and earlier.id <> v_payment.id
      and earlier.status in ('confirmed', 'refunded')
      and coalesce(earlier.service_started_at, earlier.created_at)
        < coalesce(v_payment.service_started_at, v_payment.created_at)
  )
  into v_has_prior_payment;

  select exists (
    select 1
    from public.users as u
    where u.id = v_request.user_id
      and u.signup_trial_slot is not null
  )
  into v_has_signup_trial;

  if v_is_future_renewal then
    update public.user_memberships as um
    set
      status = case
        when v_payment.service_started_at > now() then 'active'
        else 'canceled'
      end,
      paid_until = v_payment.service_started_at,
      updated_at = now()
    where um.user_id = v_request.user_id;
    v_benefits_end := v_payment.service_started_at;
  elsif not v_has_prior_payment and v_has_signup_trial then
    update public.user_memberships as um
    set
      plan = 'trial',
      status = 'trialing',
      trial_ends_at = null,
      paid_until = null,
      storage_limit_bytes = 30000000,
      base_market_post_limit = 3,
      updated_at = now()
    where um.user_id = v_request.user_id;
    v_benefits_end := now();
  elsif not v_has_prior_payment then
    delete from public.user_memberships as um
    where um.user_id = v_request.user_id;
    v_benefits_end := now();
  else
    update public.user_memberships as um
    set
      status = 'canceled',
      paid_until = now(),
      updated_at = now()
    where um.user_id = v_request.user_id;
    v_benefits_end := now();
  end if;

  update public.membership_payments as mp
  set
    status = 'refunded',
    note = case
      when mp.note is null or trim(mp.note) = ''
        then 'refund_reference=' || v_reference
      else mp.note || E'\nrefund_reference=' || v_reference
    end,
    updated_at = now()
  where mp.id = v_payment.id;

  update public.membership_refund_requests as rr
  set
    status = 'completed',
    refund_reference = v_reference,
    refunded_at = now(),
    benefits_ended_at = v_benefits_end,
    updated_at = now()
  where rr.id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'request_id', v_request.id,
    'status', v_request.status,
    'refund_amount', v_request.refund_amount,
    'currency', v_request.currency,
    'refund_reference', v_request.refund_reference,
    'refunded_at', v_request.refunded_at,
    'benefits_ended_at', v_request.benefits_ended_at
  );
end;
$$;

-- A pending refund must finish or be rejected before another paid term can be
-- inserted or confirmed. This keeps membership rollback deterministic.
create or replace function private.prevent_payment_change_during_open_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and new.status = 'confirmed'
      and old.status is distinct from new.status
    )
  ) and exists (
    select 1
    from public.membership_refund_requests as rr
    where rr.user_id = new.user_id
      and rr.status in ('submitted', 'approved_pending_refund')
  ) then
    raise exception using errcode = 'P0001', message = 'refund_request_open';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_payment_change_during_open_refund()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_prevent_payment_change_during_open_refund
  on public.membership_payments;
create trigger trg_prevent_payment_change_during_open_refund
before insert or update of status
on public.membership_payments
for each row
execute function private.prevent_payment_change_during_open_refund();

-- The legacy status RPC must not be able to label money as refunded without
-- an approved request, an external refund reference, and entitlement rollback.
create or replace function public.admin_update_membership_payment_status_json(
  p_payment_id uuid,
  p_status text,
  p_note_append text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_payment public.membership_payments%rowtype;
begin
  if not public.is_app_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'missing_payment_id');
  end if;

  if v_status = 'refunded' then
    return jsonb_build_object('ok', false, 'error_message', 'refund_workflow_required');
  end if;

  if v_status not in ('confirmed', 'canceled') then
    return jsonb_build_object('ok', false, 'error_message', 'invalid_status');
  end if;

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_found');
  end if;

  if exists (
    select 1
    from public.membership_refund_requests as rr
    where rr.payment_id = v_payment.id
      and rr.status in ('submitted', 'approved_pending_refund', 'completed')
  ) then
    return jsonb_build_object('ok', false, 'error_message', 'refund_workflow_controls_status');
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
  returning * into v_payment;

  return jsonb_build_object(
    'ok', true,
    'id', v_payment.id,
    'user_id', v_payment.user_id,
    'status', v_payment.status
  );
end;
$$;

revoke all on function public.get_my_membership_refunds_json()
  from public, anon, authenticated, service_role;
revoke all on function public.request_membership_refund_json(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_get_membership_refund_queue_count()
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_membership_refund_queue(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_approve_membership_refund_json(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_reject_membership_refund_json(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_membership_refund_json(uuid, text, numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_update_membership_payment_status_json(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_membership_refunds_json()
  to authenticated, service_role;
grant execute on function public.request_membership_refund_json(uuid, text)
  to authenticated, service_role;
grant execute on function public.admin_get_membership_refund_queue_count()
  to authenticated, service_role;
grant execute on function public.admin_list_membership_refund_queue(integer)
  to authenticated, service_role;
grant execute on function public.admin_approve_membership_refund_json(uuid, text)
  to authenticated, service_role;
grant execute on function public.admin_reject_membership_refund_json(uuid, text)
  to authenticated, service_role;
grant execute on function public.admin_complete_membership_refund_json(uuid, text, numeric)
  to authenticated, service_role;
grant execute on function public.admin_update_membership_payment_status_json(uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
