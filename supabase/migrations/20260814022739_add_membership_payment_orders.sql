-- Add a user-submitted membership payment order flow on top of the existing
-- administrator-confirmed membership payment ledger.
--
-- Security model:
-- - order amount, currency and payment method are fixed by a SECURITY DEFINER
--   function; the browser cannot choose an arbitrary amount;
-- - payment proofs live in a private Storage bucket;
-- - users can read their own order rows and proof objects only;
-- - only app administrators can review a submitted order;
-- - membership extension and order confirmation happen in one transaction.

alter table public.membership_payments
  add column if not exists order_number text,
  add column if not exists proof_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text;

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
      'canceled'
    )
  );

create unique index if not exists membership_payments_order_number_uidx
  on public.membership_payments (order_number)
  where order_number is not null;

create unique index if not exists membership_payments_one_open_order_per_user_uidx
  on public.membership_payments (user_id)
  where order_number is not null
    and status in ('pending_payment', 'submitted', 'needs_update');

create index if not exists membership_payments_review_queue_idx
  on public.membership_payments (status, submitted_at desc)
  where status in ('submitted', 'needs_update');

comment on column public.membership_payments.order_number is
  '用户付款订单号；旧的管理员手工付款记录可为空。';
comment on column public.membership_payments.proof_path is
  'payment-proofs 私有 bucket 中的付款凭证对象路径。';
comment on column public.membership_payments.review_note is
  '管理员要求补充凭证时给用户显示的说明。';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_proofs_select_own_or_admin on storage.objects;
drop policy if exists payment_proofs_insert_own_path on storage.objects;
drop policy if exists payment_proofs_update_own_path on storage.objects;

create policy payment_proofs_select_own_or_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_app_admin(auth.uid())
  )
);

create policy payment_proofs_insert_own_path
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 2
  and name = auth.uid()::text || '/' || (storage.foldername(name))[2] || '/proof'
  and exists (
    select 1
    from public.membership_payments as mp
    where mp.id::text = (storage.foldername(name))[2]
      and mp.user_id = auth.uid()
      and mp.status in ('pending_payment', 'needs_update')
  )
);

create policy payment_proofs_update_own_path
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 2
  and name = auth.uid()::text || '/' || (storage.foldername(name))[2] || '/proof'
  and exists (
    select 1
    from public.membership_payments as mp
    where mp.id::text = (storage.foldername(name))[2]
      and mp.user_id = auth.uid()
      and mp.status in ('pending_payment', 'needs_update')
  )
)
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 2
  and name = auth.uid()::text || '/' || (storage.foldername(name))[2] || '/proof'
  and exists (
    select 1
    from public.membership_payments as mp
    where mp.id::text = (storage.foldername(name))[2]
      and mp.user_id = auth.uid()
      and mp.status in ('pending_payment', 'needs_update')
  )
);

drop policy if exists membership_payments_select_own_confirmed
  on public.membership_payments;
drop policy if exists membership_payments_select_own
  on public.membership_payments;

create policy membership_payments_select_own
on public.membership_payments
for select
to authenticated
using (auth.uid() = user_id);

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

  v_amount := case when v_currency = 'CNY' then 64.00 else 8.00 end;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-order:' || v_user_id::text, 0)
  );

  select mp.*
  into v_order
  from public.membership_payments as mp
  where mp.user_id = v_user_id
    and mp.order_number is not null
    and mp.status in ('pending_payment', 'submitted', 'needs_update')
  order by mp.created_at desc
  limit 1
  for update;

  if found then
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
      'created_at', v_order.created_at
    );
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
    'created_at', v_order.created_at
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

  if v_order.status not in ('pending_payment', 'needs_update') then
    return jsonb_build_object('ok', false, 'error_message', 'order_not_editable');
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
    'created_at', v_order.created_at
  );
end;
$$;

create or replace function public.admin_get_membership_payment_queue_count()
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count bigint;
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select count(*)
  into v_count
  from public.membership_payments as mp
  where mp.status = 'submitted';

  return v_count;
end;
$$;

create or replace function public.admin_list_membership_payment_queue()
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
  review_note text
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
    mp.review_note
  from public.membership_payments as mp
  join auth.users as au on au.id = mp.user_id
  left join public.profiles as pr on pr.id = mp.user_id
  where mp.status = 'submitted'
  order by mp.submitted_at asc nulls last, mp.created_at asc
  limit 100;
end;
$$;

create or replace function public.admin_confirm_submitted_membership_payment_json(
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

create or replace function public.admin_request_membership_payment_update_json(
  p_payment_id uuid,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_payment public.membership_payments%rowtype;
begin
  if not public.is_app_admin(auth.uid()) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  if v_note is null then
    return jsonb_build_object('ok', false, 'error_message', 'review_note_required');
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

  if v_payment.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_submitted');
  end if;

  update public.membership_payments as mp
  set
    status = 'needs_update',
    review_note = v_note,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where mp.id = p_payment_id
  returning * into v_payment;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'review_note', v_payment.review_note
  );
end;
$$;

revoke all on function public.create_membership_payment_order_json(text, text)
  from public, anon;
revoke all on function public.submit_membership_payment_order_json(uuid, text, text)
  from public, anon;
revoke all on function public.admin_get_membership_payment_queue_count()
  from public, anon;
revoke all on function public.admin_list_membership_payment_queue()
  from public, anon;
revoke all on function public.admin_confirm_submitted_membership_payment_json(uuid)
  from public, anon;
revoke all on function public.admin_request_membership_payment_update_json(uuid, text)
  from public, anon;

grant execute on function public.create_membership_payment_order_json(text, text)
  to authenticated;
grant execute on function public.submit_membership_payment_order_json(uuid, text, text)
  to authenticated;
grant execute on function public.admin_get_membership_payment_queue_count()
  to authenticated;
grant execute on function public.admin_list_membership_payment_queue()
  to authenticated;
grant execute on function public.admin_confirm_submitted_membership_payment_json(uuid)
  to authenticated;
grant execute on function public.admin_request_membership_payment_update_json(uuid, text)
  to authenticated;

revoke all on table public.membership_payments from public, anon, authenticated;
grant select on table public.membership_payments to authenticated;
grant select, insert, update, delete on table public.membership_payments to service_role;

comment on function public.create_membership_payment_order_json(text, text) is
  '登录用户创建固定价格的云会员付款订单；同一用户只保留一个未完成订单。';
comment on function public.submit_membership_payment_order_json(uuid, text, text) is
  '订单所属用户提交私有付款凭证，进入管理员待确认队列。';
comment on function public.admin_confirm_submitted_membership_payment_json(uuid) is
  '管理员确认用户付款订单，并在同一事务中开通或延长一年基础云会员。';
