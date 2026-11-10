-- LifeSpace B R07: ONLY remove 21 membership-driven Market auto-end UPDATEs in 17 existing SECURITY DEFINER functions.
-- Exact QA pg_proc MD5, ownership, ACL and SECURITY DEFINER are guarded before and after.
-- No RLS, GRANT, schema, trigger, Cron, payment state, webhook or owner-end changes.
-- Generated from QA function snapshots dated 2026-11-10. Do not install on production.
-- Supabase migration runner owns the transaction; do not COMMIT inside a versioned migration.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $r07_guard$
DECLARE
  v record;
  v_actual text;
  v_acl text;
  v_secdef boolean;
  v_owner text;
  v_original_count integer := 0;
  v_patched_count integer := 0;
BEGIN
  -- Allow a clean first application, or an already-patched QA with no migration-history row.
  -- Mixed/unknown function sets, changed ACLs or owner drift always fail closed.
  FOR v IN SELECT * FROM (VALUES
  ('public.admin_approve_membership_refund_json(uuid,text)', '19ea971c5afae09c4a623f74f80caaf2', '1ce7e49adf16b263cace60b8a50348e1', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_complete_membership_refund_json(uuid,text,numeric)', 'c619b432cd2a77f17cfe6eaee18147e1', '8db3c7532bee158b799e2a864cfb9f71', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_confirm_membership_payment_json(uuid,text,numeric,text,text,text,text,timestamp with time zone,integer,bigint,integer)', 'a84a05ce84f2f9f68be18dc0444fb124', '79e4f09be3fdc908bee707dd05d44f90', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_confirm_submitted_membership_payment_json(uuid)', '540edea15114433dbdde62e55fbbf46d', '4e840846cb91b8326a753f2399e68960', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.admin_reject_membership_refund_json(uuid,text)', '79cae3fad5cee27139c9196ded6f553e', '6bd2fabcf2f02abac1b5fa8522fda55e', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_request_membership_payment_update_json(uuid,text)', 'f6577ece60b053bab42f50f4446d351e', '4e79e62790dc3927cec77847aae7d3fb', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.admin_update_membership_payment_status_json(uuid,text,text)', '655ecda95d88e7ef43cf017e9990b954', 'f20e9c7bb12721273a06d9d1d8c33954', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_update_user_membership(uuid,text,timestamp with time zone,bigint,integer)', '89605be9982300458ff3b381a50f9efb', '63bce281c52ac51dc981cc8d7cebd745', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_update_user_membership_json(uuid,text,timestamp with time zone,bigint,integer)', '3fa6dcd8e2c4b63f3443043fa3ee4d5d', 'e75c1821b53b3e553f934cb04d435adf', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_update_user_membership_safe(uuid,text,timestamp with time zone,bigint,integer)', '510f763e294573fca9d3a17eeac7dbc6', '27efcfbf2d04317802ab1da1a5038093', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.bind_paypal_membership_order_json(uuid,uuid,text)', '9eb92692263995dcd973dfc6beacf2e0', '75bfd27a9fec8afcaf57e07a0cb9eab4', '{postgres=X/postgres,service_role=X/postgres}'),
  ('public.cancel_membership_payment_order_json(uuid)', '3e238f30b6664255367bde3f90a9f7b2', '77a735f9cbc98e638e57b333ee6081ab', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.confirm_paypal_membership_payment_json(uuid,text,text,timestamp with time zone)', '0aa2a2ce22539d0f39c7c8db88c2559e', '33b309d2756120b99da8fb25e10e065a', '{postgres=X/postgres,service_role=X/postgres}'),
  ('public.create_membership_payment_order_json(text,text)', '534b20367b60263be02eb5b3a8cf6a6e', '78ae57afeae9da3e28b7219240bdbae0', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.get_my_open_membership_payment_order_json()', '526212e5d20069a527803c38df8125a7', 'fdda2083fde077ec01413915345f40ef', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.request_membership_refund_json(uuid,text)', '13fc694875082292bf8791d0beacecec', '331295643060ed359555312963b2f354', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.submit_membership_payment_order_json(uuid,text,text)', 'e2f35fbf3dd8f7f6e1b39488797e8222', '6a83e757212a60e0e365f3577ae6de0e', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')
  ) AS expected(identity, before_md5, after_md5, expected_acl) LOOP
    SELECT md5(p.prosrc),p.proacl::text,p.prosecdef,pg_get_userbyid(p.proowner)
      INTO v_actual,v_acl,v_secdef,v_owner
      FROM pg_proc p WHERE p.oid=to_regprocedure(v.identity);
    IF NOT FOUND OR v_acl IS DISTINCT FROM v.expected_acl OR v_secdef IS DISTINCT FROM true OR v_owner IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'R07 function permission or ownership drift for %',v.identity;
    END IF;
    IF v_actual = v.before_md5 THEN
      v_original_count := v_original_count + 1;
    ELSIF v_actual = v.after_md5 THEN
      v_patched_count := v_patched_count + 1;
    ELSE
      RAISE EXCEPTION 'R07 function definition drift for %; actual %',v.identity,v_actual;
    END IF;
  END LOOP;
  IF NOT ((v_original_count=17 AND v_patched_count=0) OR (v_original_count=0 AND v_patched_count=17)) THEN
    RAISE EXCEPTION 'R07 mixed version set: original %, patched %',v_original_count,v_patched_count;
  END IF;
END $r07_guard$;

CREATE OR REPLACE FUNCTION public.admin_approve_membership_refund_json(p_request_id uuid, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_request public.membership_refund_requests%rowtype;
  v_payment public.membership_payments%rowtype;
  v_membership public.user_memberships%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    select rr.user_id into v_m2_user_id from public.membership_refund_requests rr where rr.id=p_request_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
    and rr.user_id = v_m2_user_id
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
    reviewed_at = v_m2_now,
    review_note = v_note,
    updated_at = v_m2_now
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_complete_membership_refund_json(p_request_id uuid, p_refund_reference text, p_confirmed_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_reference text := nullif(trim(coalesce(p_refund_reference, '')), '');
  v_request public.membership_refund_requests%rowtype;
  v_payment public.membership_payments%rowtype;
  v_membership public.user_memberships%rowtype;
  v_claim private.cloud_trial_claims%rowtype;
  v_benefits_end timestamptz := now();
  v_is_future_renewal boolean := false;
  v_has_prior_payment boolean := false;
  v_has_claim boolean := false;
  v_remaining_end timestamptz;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    select rr.user_id into v_m2_user_id from public.membership_refund_requests rr where rr.id=p_request_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
    and rr.user_id = v_m2_user_id
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

  -- Match the claim/payment/lifecycle serialization key first, then retain the
  -- refund-specific lock used by the existing workflow.

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
    and v_payment.service_started_at > v_m2_now;

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

  select c.*
  into v_claim
  from private.cloud_trial_claims as c
  where c.user_id = v_request.user_id
  for update;
  v_has_claim := found;

  select max(mp.service_ends_at) into v_remaining_end
  from public.membership_payments mp
  where mp.user_id=v_request.user_id and mp.id<>v_payment.id
    and mp.status='confirmed' and mp.service_ends_at>v_m2_now;
  -- Keep the compatible basic row, with an expired/canceled Free fallback.
  -- No Claim reset, no Trial grant, no membership deletion.
  update public.user_memberships um set
    plan='basic',
    status=case when v_remaining_end>v_m2_now then 'active' else 'canceled' end,
    paid_until=greatest(coalesce(v_remaining_end,v_m2_now),v_m2_now),
    storage_limit_bytes=case when v_remaining_end>v_m2_now then 1000000000 else 30000000 end,
    base_market_post_limit=case when v_remaining_end>v_m2_now then 30 else 5 end,
    updated_at=v_m2_now
  where um.user_id=v_request.user_id;
  v_benefits_end := case when v_remaining_end>v_m2_now then v_remaining_end else v_m2_now end;

  update public.membership_payments as mp
  set
    status = 'refunded',
    note = case
      when mp.note is null or trim(mp.note) = ''
        then 'refund_reference=' || v_reference
      else mp.note || E'\nrefund_reference=' || v_reference
    end,
    updated_at = v_m2_now
  where mp.id = v_payment.id;

  update public.membership_refund_requests as rr
  set
    status = 'completed',
    refund_reference = v_reference,
    refunded_at = v_m2_now,
    benefits_ended_at = v_benefits_end,
    updated_at = v_m2_now
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
$function$;

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
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    v_m2_user_id := p_user_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
  v_service_months := 12;
  if coalesce(p_service_months,12)<>12 then return jsonb_build_object('ok',false,'error_message','annual_plan_required'); end if;

  if v_plan <> 'basic' then
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

  if exists(select 1 from public.membership_refund_requests rr where rr.user_id=p_user_id and rr.status in ('submitted','approved_pending_refund')) then
    return jsonb_build_object('ok',false,'error_message','refund_request_open');
  end if;
  if v_payment_method='paypal' then
    return jsonb_build_object('ok',false,'error_message','paypal_official_confirmation_required');
  end if;

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

  v_storage_limit_bytes := 1000000000;
  v_base_market_post_limit := 30;

  select um.paid_until
  into v_current_paid_until
  from public.user_memberships as um
  where um.user_id = p_user_id;

  v_service_started_at := greatest(coalesce(v_current_paid_until, v_m2_now), v_m2_now);
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
    v_m2_now,
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
    coalesce(p_paid_at, v_m2_now),
    v_service_started_at,
    v_service_ends_at,
    auth.uid(),
    v_m2_now
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
    v_m2_now
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = 'active',
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = v_m2_now;

  update public.profiles as pr
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = v_m2_now
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
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    select mp.user_id into v_m2_user_id from public.membership_payments mp where mp.id=p_payment_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error_message', 'permission_denied');
  end if;

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = p_payment_id
    and mp.user_id = v_m2_user_id
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

  if v_payment.payment_method='paypal' or v_payment.provider_order_id is not null or v_payment.provider_capture_id is not null then
    return jsonb_build_object('ok',false,'error_message','paypal_official_confirmation_required');
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


  select um.paid_until
  into v_current_paid_until
  from public.user_memberships as um
  where um.user_id = v_payment.user_id
  for update;

  v_service_started_at := greatest(coalesce(v_current_paid_until, v_m2_now), v_m2_now);
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
    v_m2_now,
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
    paid_at = coalesce(mp.paid_at, mp.submitted_at, v_m2_now),
    service_started_at = v_service_started_at,
    service_ends_at = v_service_ends_at,
    created_by = v_admin_id,
    reviewed_by = v_admin_id,
    reviewed_at = v_m2_now,
    review_note = null,
    updated_at = v_m2_now
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
    v_m2_now
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = v_m2_now;

  update public.profiles as pr
  set
    storage_limit = 1000000000,
    updated_at = v_m2_now
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

CREATE OR REPLACE FUNCTION public.admin_reject_membership_refund_json(p_request_id uuid, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_request public.membership_refund_requests%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    select rr.user_id into v_m2_user_id from public.membership_refund_requests rr where rr.id=p_request_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
    and rr.user_id = v_m2_user_id
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
    reviewed_at = v_m2_now,
    review_note = v_note,
    updated_at = v_m2_now
  where rr.id = v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'review_note', v_request.review_note
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_request_membership_payment_update_json(p_payment_id uuid, p_review_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_note text := nullif(trim(coalesce(p_review_note, '')), '');
  v_payment public.membership_payments%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    select mp.user_id into v_m2_user_id from public.membership_payments mp where mp.id=p_payment_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
    and mp.user_id = v_m2_user_id
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
    reviewed_at = v_m2_now,
    updated_at = v_m2_now
  where mp.id = p_payment_id
    and mp.user_id = v_m2_user_id
  returning * into v_payment;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'review_note', v_payment.review_note
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_membership_payment_status_json(p_payment_id uuid, p_status text, p_note_append text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_payment public.membership_payments%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    select mp.user_id into v_m2_user_id from public.membership_payments mp where mp.id=p_payment_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
    and mp.user_id = v_m2_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_found');
  end if;

  -- M1: the legacy status RPC cannot downgrade a confirmed or settled payment.
  if v_status = 'canceled'
     and (
       v_payment.status in ('confirmed', 'refunded')
       or v_payment.provider_capture_id is not null
     ) then
    return jsonb_build_object('ok', false, 'error_message', 'confirmed_payment_cannot_be_canceled');
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
    updated_at = v_m2_now
  where mp.id = p_payment_id
    and mp.user_id = v_m2_user_id
  returning * into v_payment;

  return jsonb_build_object(
    'ok', true,
    'id', v_payment.id,
    'user_id', v_payment.user_id,
    'status', v_payment.status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_membership(p_user_id uuid, p_plan text, p_paid_until timestamp with time zone, p_storage_limit_bytes bigint, p_base_market_post_limit integer)
 RETURNS TABLE(user_id uuid, plan text, status text, trial_ends_at timestamp with time zone, paid_until timestamp with time zone, storage_limit_bytes bigint, base_market_post_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_status text;
  v_storage_limit_bytes bigint;
  v_base_market_post_limit integer;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    v_m2_user_id := p_user_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
  if not public.is_app_admin(auth.uid()) then
    raise exception 'permission_denied';
  end if;

  if public.is_app_admin(auth.uid()) and exists (
    select 1 from public.membership_payments mp where mp.user_id=p_user_id and mp.status='confirmed' and mp.service_ends_at>v_m2_now
      and (p_paid_until is null or p_paid_until<mp.service_ends_at or p_plan is distinct from 'basic')
  ) then
    raise exception using errcode='P0001',message='paid_service_term_protected';
  end if;

  if p_user_id is null then
    raise exception 'missing_user_id';
  end if;

  -- Old callers may still send trial: interpret it as permanent Free, not Trial.
  if lower(trim(coalesce(p_plan,''))) in ('free','trial') then
    p_plan := 'basic'; p_paid_until := least(coalesce(p_paid_until,v_m2_now),v_m2_now);
  end if;
  v_plan := trim(coalesce(p_plan, ''));

  if v_plan <> 'basic' then
    raise exception 'invalid_plan: %', v_plan;
  end if;

  v_storage_limit_bytes := case when p_paid_until>v_m2_now then 1000000000 else 30000000 end;
  v_base_market_post_limit := case when p_paid_until>v_m2_now then 30 else 5 end;

  if v_storage_limit_bytes <= 0 then
    raise exception 'invalid_storage_limit';
  end if;

  v_status := case when p_paid_until>v_m2_now then 'active' else 'canceled' end;

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
    v_m2_now,
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
    v_m2_now
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = v_m2_now;

  update public.profiles as p
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = v_m2_now
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_membership_json(p_user_id uuid, p_plan text, p_paid_until timestamp with time zone, p_storage_limit_bytes bigint, p_base_market_post_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_status text;
  v_storage_limit_bytes bigint;
  v_base_market_post_limit integer;
  v_row public.user_memberships%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    v_m2_user_id := p_user_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
  if not public.is_app_admin(auth.uid()) then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'permission_denied',
      'error_detail', 'auth.uid=' || coalesce(auth.uid()::text, 'null')
    );
  end if;

  if public.is_app_admin(auth.uid()) and exists (
    select 1 from public.membership_payments mp where mp.user_id=p_user_id and mp.status='confirmed' and mp.service_ends_at>v_m2_now
      and (p_paid_until is null or p_paid_until<mp.service_ends_at or p_plan is distinct from 'basic')
  ) then
    raise exception using errcode='P0001',message='paid_service_term_protected';
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

  -- Old callers may still send trial: interpret it as permanent Free, not Trial.
  if lower(trim(coalesce(p_plan,''))) in ('free','trial') then
    p_plan := 'basic'; p_paid_until := least(coalesce(p_paid_until,v_m2_now),v_m2_now);
  end if;
  v_plan := trim(coalesce(p_plan, ''));

  if v_plan <> 'basic' then
    return jsonb_build_object(
      'ok', false,
      'error_message', 'invalid_plan',
      'error_detail', v_plan
    );
  end if;

  v_storage_limit_bytes := case when p_paid_until>v_m2_now then 1000000000 else 30000000 end;
  v_base_market_post_limit := case when p_paid_until>v_m2_now then 30 else 5 end;

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

  v_status := case when p_paid_until>v_m2_now then 'active' else 'canceled' end;

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
    v_m2_now,
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
    v_m2_now
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = v_m2_now;

  -- 同步 profiles.storage_limit
  update public.profiles as pr
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = v_m2_now
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_membership_safe(p_user_id uuid, p_plan text, p_paid_until timestamp with time zone, p_storage_limit_bytes bigint, p_base_market_post_limit integer)
 RETURNS TABLE(ok boolean, error_message text, error_detail text, user_id uuid, plan text, status text, trial_ends_at timestamp with time zone, paid_until timestamp with time zone, storage_limit_bytes bigint, base_market_post_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_status text;
  v_storage_limit_bytes bigint;
  v_base_market_post_limit integer;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if public.is_app_admin(auth.uid()) then
    v_m2_user_id := p_user_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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

  if public.is_app_admin(auth.uid()) and exists (
    select 1 from public.membership_payments mp where mp.user_id=p_user_id and mp.status='confirmed' and mp.service_ends_at>v_m2_now
      and (p_paid_until is null or p_paid_until<mp.service_ends_at or p_plan is distinct from 'basic')
  ) then
    raise exception using errcode='P0001',message='paid_service_term_protected';
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

  -- Old callers may still send trial: interpret it as permanent Free, not Trial.
  if lower(trim(coalesce(p_plan,''))) in ('free','trial') then
    p_plan := 'basic'; p_paid_until := least(coalesce(p_paid_until,v_m2_now),v_m2_now);
  end if;
  v_plan := trim(coalesce(p_plan, ''));

  if v_plan <> 'basic' then
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

  v_storage_limit_bytes := case when p_paid_until>v_m2_now then 1000000000 else 30000000 end;
  v_base_market_post_limit := case when p_paid_until>v_m2_now then 30 else 5 end;

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

  v_status := case when p_paid_until>v_m2_now then 'active' else 'canceled' end;

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
    v_m2_now,
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
    v_m2_now
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = v_m2_now;

  update public.profiles as p
  set
    storage_limit = v_storage_limit_bytes,
    updated_at = v_m2_now
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
$function$;

CREATE OR REPLACE FUNCTION public.bind_paypal_membership_order_json(p_payment_id uuid, p_user_id uuid, p_paypal_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_provider_order_id text := nullif(trim(coalesce(p_paypal_order_id, '')), '');
  v_payment public.membership_payments%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if true then
    v_m2_user_id := p_user_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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

  if coalesce(v_payment.expires_at, v_payment.created_at + interval '24 hours') <= v_m2_now then
    update public.membership_payments as mp
    set
      status = 'expired',
      closed_at = v_m2_now,
      close_reason = 'expired_24h',
      updated_at = v_m2_now
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
    provider_order_created_at = v_m2_now,
    updated_at = v_m2_now
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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_membership_payment_order_json(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.membership_payments%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if auth.uid() is not null then
    v_m2_user_id := auth.uid();
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
    closed_at = v_m2_now,
    close_reason = 'user_canceled',
    updated_at = v_m2_now
  where mp.id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'ok', true,
    'already_closed', false,
    'id', v_order.id,
    'status', v_order.status
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
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if true then
    select mp.user_id into v_m2_user_id from public.membership_payments mp where mp.id=p_payment_id;
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
  if p_payment_id is null or v_order_id is null or v_capture_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'missing_paypal_confirmation');
  end if;

  select mp.*
  into v_payment
  from public.membership_payments as mp
  where mp.id = p_payment_id
    and mp.user_id = v_m2_user_id
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


  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_already_refunded');
  end if;

  if v_payment.provider_capture_id is not null and v_payment.status <> 'confirmed'
     and exists(select 1 from public.membership_refund_requests rr where rr.user_id=v_payment.user_id and rr.status in ('submitted','approved_pending_refund')) then
    return jsonb_build_object('ok',false,'error_message','paypal_refund_reconciliation_required','payment_id',v_payment.id);
  end if;

  if v_payment.provider_capture_id is not null then
    if v_payment.provider_capture_id <> v_capture_id then
      return jsonb_build_object('ok', false, 'error_message', 'paypal_capture_mismatch');
    end if;

    -- M1: stored Capture is the idempotency key, not mutable payment status.
    if v_payment.status <> 'confirmed' then
      update public.membership_payments as mp
      set
        status = 'confirmed',
        expires_at = null,
        closed_at = null,
        close_reason = null,
        updated_at = v_m2_now
      where mp.id = v_payment.id
      returning * into v_payment;
    end if;

    return jsonb_build_object(
      'ok', true,
      'already_confirmed', true,
      'payment_id', v_payment.id,
      'user_id', v_payment.user_id,
      'service_ends_at', v_payment.service_ends_at
    );
  end if;

  if v_payment.status = 'confirmed' then
    return jsonb_build_object('ok', false, 'error_message', 'paypal_capture_mismatch');
  end if;


  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_already_refunded');
  end if;

  -- The server reaches this function only after reading a COMPLETED capture
  -- directly from PayPal. If the browser canceled/expired the local order just
  -- before PayPal completed, the money still wins: activate the paid service
  -- rather than leaving a paid customer without membership.

  select um.paid_until
  into v_current_paid_until
  from public.user_memberships as um
  where um.user_id = v_payment.user_id
  for update;

  v_service_started_at := greatest(coalesce(v_current_paid_until, v_m2_now), v_m2_now);
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
    v_m2_now,
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
    paid_at = coalesce(p_paid_at, v_m2_now),
    provider_capture_id = v_capture_id,
    provider_paid_at = coalesce(p_paid_at, v_m2_now),
    service_started_at = v_service_started_at,
    service_ends_at = v_service_ends_at,
    expires_at = null,
    reviewed_by = null,
    reviewed_at = null,
    review_note = null,
    closed_at = null,
    close_reason = null,
    updated_at = v_m2_now
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
    v_m2_now
  )
  on conflict (user_id) do update
  set
    plan = excluded.plan,
    status = excluded.status,
    paid_until = excluded.paid_until,
    storage_limit_bytes = excluded.storage_limit_bytes,
    base_market_post_limit = excluded.base_market_post_limit,
    updated_at = v_m2_now;

  update public.profiles as pr
  set
    storage_limit = 1000000000,
    updated_at = v_m2_now
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

CREATE OR REPLACE FUNCTION public.create_membership_payment_order_json(p_currency text, p_payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if auth.uid() is not null then
    v_m2_user_id := auth.uid();
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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


  if exists(select 1 from public.membership_refund_requests rr where rr.user_id=v_user_id and rr.status in ('submitted','approved_pending_refund')) then
    return jsonb_build_object('ok',false,'error_message','refund_request_open');
  end if;

  update public.membership_payments as mp
  set
    status = 'expired',
    closed_at = v_m2_now,
    close_reason = 'expired_24h',
    updated_at = v_m2_now
  where mp.user_id = v_user_id
    and mp.order_number is not null
    and mp.status = 'pending_payment'
    and coalesce(mp.expires_at, mp.created_at + interval '24 hours') <= v_m2_now;

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
      closed_at = v_m2_now,
      close_reason = 'destination_changed',
      updated_at = v_m2_now
    where mp.id = v_order.id;
  end if;

  v_order_number :=
    'YS-' ||
    to_char(v_m2_now at time zone 'UTC', 'YYYYMMDD') ||
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
    v_m2_now + interval '24 hours',
    v_destination_key,
    v_destination_label,
    v_destination_url,
    v_destination_version,
    v_m2_now
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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_open_membership_payment_order_json()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.membership_payments%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if auth.uid() is not null then
    v_m2_user_id := auth.uid();
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
  end if;


  update public.membership_payments as mp
  set
    status = 'expired',
    closed_at = v_m2_now,
    close_reason = 'expired_24h',
    updated_at = v_m2_now
  where mp.user_id = v_user_id
    and mp.order_number is not null
    and mp.status = 'pending_payment'
    and coalesce(mp.expires_at, mp.created_at + interval '24 hours') <= v_m2_now;

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
$function$;

CREATE OR REPLACE FUNCTION public.request_membership_refund_json(p_payment_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_payment public.membership_payments%rowtype;
  v_existing public.membership_refund_requests%rowtype;
  v_request public.membership_refund_requests%rowtype;
  v_confirmed_at timestamptz;
  v_policy_band text;
  v_refund_amount numeric(10, 2);
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if auth.uid() is not null then
    v_m2_user_id := auth.uid();
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'authentication_required');
  end if;

  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'error_message', 'missing_payment_id');
  end if;

  if v_reason is not null and char_length(v_reason) > 600 then
    return jsonb_build_object('ok', false, 'error_message', 'reason_too_long');
  end if;


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

  if v_m2_now > v_confirmed_at + interval '180 days' then
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

  if v_payment.service_started_at is not null and v_payment.service_started_at > v_m2_now then
    v_policy_band := 'unused_renewal_full';
    v_refund_amount := v_payment.amount;
  elsif v_m2_now <= v_confirmed_at + interval '7 days' then
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
    v_m2_now,
    v_m2_now
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
$function$;

CREATE OR REPLACE FUNCTION public.submit_membership_payment_order_json(p_order_id uuid, p_proof_path text, p_payment_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_proof_path text := trim(coalesce(p_proof_path, ''));
  v_reference text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_expected_path text;
  v_order public.membership_payments%rowtype;
  v_m2_user_id uuid;
  v_m2_now timestamptz;
begin

  -- M2: owner lookup above is nonlocking; no business lock precedes Kp.
  if auth.uid() is not null then
    v_m2_user_id := auth.uid();
    if v_m2_user_id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-payment:'||v_m2_user_id::text,0));
      -- Ks reuses the live quota owner gate; it also protects absent Free M rows.
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('storage-upload-owner:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-refund:'||v_m2_user_id::text,0));
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('membership-order:'||v_m2_user_id::text,0));
      -- Uniform account-local business row order; rows are not changed here.
      perform 1 from public.users u where u.id=v_m2_user_id for update;
      perform 1 from private.cloud_trial_claims c where c.user_id=v_m2_user_id for update;
      perform 1 from public.membership_payments mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.membership_refund_requests rr where rr.user_id=v_m2_user_id order by rr.id for update;
      perform 1 from public.market_posts mp where mp.user_id=v_m2_user_id order by mp.id for update;
      perform 1 from public.user_memberships um where um.user_id=v_m2_user_id for update;
      perform 1 from public.profiles pr where pr.id=v_m2_user_id for update;
      v_m2_now := clock_timestamp();

    end if;
  end if;
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
     and coalesce(v_order.expires_at, v_order.created_at + interval '24 hours') <= v_m2_now then
    update public.membership_payments as mp
    set
      status = 'expired',
      closed_at = v_m2_now,
      close_reason = 'expired_24h',
      updated_at = v_m2_now
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
    submitted_at = v_m2_now,
    reviewed_at = null,
    reviewed_by = null,
    review_note = null,
    expires_at = null,
    updated_at = v_m2_now
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
$function$;
DO $r07_guard$
DECLARE
  v record;
  v_actual text;
  v_acl text;
  v_secdef boolean;
  v_owner text;
BEGIN
  FOR v IN SELECT * FROM (VALUES
  ('public.admin_approve_membership_refund_json(uuid,text)', '1ce7e49adf16b263cace60b8a50348e1', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_complete_membership_refund_json(uuid,text,numeric)', '8db3c7532bee158b799e2a864cfb9f71', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_confirm_membership_payment_json(uuid,text,numeric,text,text,text,text,timestamp with time zone,integer,bigint,integer)', '79e4f09be3fdc908bee707dd05d44f90', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_confirm_submitted_membership_payment_json(uuid)', '4e840846cb91b8326a753f2399e68960', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.admin_reject_membership_refund_json(uuid,text)', '6bd2fabcf2f02abac1b5fa8522fda55e', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_request_membership_payment_update_json(uuid,text)', '4e79e62790dc3927cec77847aae7d3fb', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.admin_update_membership_payment_status_json(uuid,text,text)', 'f20e9c7bb12721273a06d9d1d8c33954', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_update_user_membership(uuid,text,timestamp with time zone,bigint,integer)', '63bce281c52ac51dc981cc8d7cebd745', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_update_user_membership_json(uuid,text,timestamp with time zone,bigint,integer)', 'e75c1821b53b3e553f934cb04d435adf', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.admin_update_user_membership_safe(uuid,text,timestamp with time zone,bigint,integer)', '27efcfbf2d04317802ab1da1a5038093', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.bind_paypal_membership_order_json(uuid,uuid,text)', '75bfd27a9fec8afcaf57e07a0cb9eab4', '{postgres=X/postgres,service_role=X/postgres}'),
  ('public.cancel_membership_payment_order_json(uuid)', '77a735f9cbc98e638e57b333ee6081ab', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.confirm_paypal_membership_payment_json(uuid,text,text,timestamp with time zone)', '33b309d2756120b99da8fb25e10e065a', '{postgres=X/postgres,service_role=X/postgres}'),
  ('public.create_membership_payment_order_json(text,text)', '78ae57afeae9da3e28b7219240bdbae0', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.get_my_open_membership_payment_order_json()', 'fdda2083fde077ec01413915345f40ef', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.request_membership_refund_json(uuid,text)', '331295643060ed359555312963b2f354', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.submit_membership_payment_order_json(uuid,text,text)', '6a83e757212a60e0e365f3577ae6de0e', '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')
  ) AS expected(identity, expected_md5, expected_acl) LOOP
    SELECT md5(p.prosrc),p.proacl::text,p.prosecdef,pg_get_userbyid(p.proowner)
      INTO v_actual,v_acl,v_secdef,v_owner
      FROM pg_proc p WHERE p.oid=to_regprocedure(v.identity);
    IF NOT FOUND OR v_actual IS DISTINCT FROM v.expected_md5 OR v_acl IS DISTINCT FROM v.expected_acl OR v_secdef IS DISTINCT FROM true OR v_owner IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'R07 pre/post guard mismatch for % expected % got %',v.identity,v.expected_md5,v_actual;
    END IF;
  END LOOP;
END $r07_guard$;
