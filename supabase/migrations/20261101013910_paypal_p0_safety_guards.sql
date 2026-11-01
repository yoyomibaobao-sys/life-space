-- LifeSpace B M1: forward-only PayPal payment safety guards.
-- Changes only two existing RPC bodies and their existing least-privilege ACLs.
-- No payment, membership, order, refund, or R25 QA rows are changed.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $m1_paypal_confirmation$
declare
  fn regprocedure;
  body_before text;
  body_after text;
  definition_before text;
  restored_definition text;
  expected_body text;
  old_block text;
  new_block text;
  temp_block text;
  old_block_lf constant text := $old$

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
$old$;
  new_block_lf constant text := $new$

  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'error_message', 'payment_already_refunded');
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
        updated_at = now()
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
$new$;
  temp_block_lf constant text := $temp$
  if v_payment.provider_capture_id is not null then
    -- The same Capture has already been granted, even if a legacy action
    -- has incorrectly changed the payment status away from confirmed.
    -- Fail closed for manual reconciliation; never grant another year.
    if v_payment.provider_capture_id = v_capture_id then
      return jsonb_build_object(
        'ok', false,
        'error_message', 'paypal_capture_already_processed_in_nonconfirmed_state',
        'payment_id', v_payment.id
      );
    end if;
    return jsonb_build_object('ok', false, 'error_message', 'paypal_capture_mismatch');
  end if;$temp$;
  acl_before aclitem[];
  acl_after aclitem[];
  owner_before oid;
  owner_after oid;
  config_before text[];
  config_after text[];
  security_before boolean;
  security_after boolean;
  volatility_before "char";
  volatility_after "char";
  parallel_before "char";
  parallel_after "char";
  strict_before boolean;
  strict_after boolean;
  leakproof_before boolean;
  leakproof_after boolean;
begin
  fn := to_regprocedure(
    'public.confirm_paypal_membership_payment_json(uuid,text,text,timestamptz)'
  );
  if fn is null then
    raise exception 'M1 STOP: PayPal confirmation RPC is missing';
  end if;

  select p.prosrc, pg_get_functiondef(p.oid), p.proacl, p.proowner, p.proconfig,
         p.prosecdef, p.provolatile, p.proparallel, p.proisstrict, p.proleakproof
  into body_before, definition_before, acl_before, owner_before, config_before,
       security_before, volatility_before, parallel_before, strict_before, leakproof_before
  from pg_proc as p
  where p.oid = fn;

  if position(E'\r\n' in body_before) > 0 then
    old_block := replace(old_block_lf, E'\n', E'\r\n');
    new_block := replace(new_block_lf, E'\n', E'\r\n');
    temp_block := replace(temp_block_lf, E'\n', E'\r\n');
  else
    old_block := old_block_lf;
    new_block := new_block_lf;
    temp_block := temp_block_lf;
  end if;

  if position('1000000000' in body_before) = 0
     or position('interval ''12 months''' in body_before) = 0
     or position('base_market_post_limit' in body_before) = 0
     or position('provider_capture_id' in body_before) = 0 then
    raise exception 'M1 STOP: PayPal confirmation RPC no longer matches the R26 1GB/12-month contract';
  end if;

  if position('M1: stored Capture is the idempotency key' in body_before) > 0 then
    expected_body := body_before;
    if position(old_block in body_before) > 0 or position(temp_block in body_before) > 0 then
      raise exception 'M1 STOP: confirmation RPC contains a conflicting idempotency branch';
    end if;
  elsif position('paypal_capture_already_processed_in_nonconfirmed_state' in body_before) > 0 then
    if length(body_before) - length(replace(body_before, temp_block, '')) <> length(temp_block) then
      raise exception 'M1 STOP: temporary QA Capture guard is not unique';
    end if;
    expected_body := replace(body_before, temp_block, new_block);
    restored_definition := replace(definition_before, temp_block, new_block);
    if expected_body = body_before
       or position('M1: stored Capture is the idempotency key' in expected_body) = 0
       or restored_definition = definition_before then
      raise exception 'M1 STOP: temporary QA Capture guard conversion is incomplete';
    end if;
    execute restored_definition;
  else
    if length(body_before) - length(replace(body_before, old_block, '')) <> length(old_block) then
      raise exception 'M1 STOP: PayPal confirmation RPC exact source block drifted';
    end if;

    expected_body := replace(body_before, old_block, new_block);
    restored_definition := replace(definition_before, old_block, new_block);
    if expected_body = body_before
       or position('M1: stored Capture is the idempotency key' in expected_body) = 0
       or restored_definition = definition_before then
      raise exception 'M1 STOP: PayPal confirmation patch candidate is incomplete';
    end if;

    execute restored_definition;
  end if;

  select p.prosrc, p.proacl, p.proowner, p.proconfig,
         p.prosecdef, p.provolatile, p.proparallel, p.proisstrict, p.proleakproof
  into body_after, acl_after, owner_after, config_after,
       security_after, volatility_after, parallel_after, strict_after, leakproof_after
  from pg_proc as p
  where p.oid = fn;

  if body_after is distinct from expected_body
     or acl_after is distinct from acl_before
     or owner_after is distinct from owner_before
     or config_after is distinct from config_before
     or security_after is distinct from security_before
     or volatility_after is distinct from volatility_before
     or parallel_after is distinct from parallel_before
     or strict_after is distinct from strict_before
     or leakproof_after is distinct from leakproof_before then
    raise exception 'M1 STOP: PayPal confirmation RPC body or protected metadata verification failed';
  end if;
end;
$m1_paypal_confirmation$;

do $m1_admin_status$
declare
  fn regprocedure;
  body_before text;
  body_after text;
  definition_before text;
  restored_definition text;
  expected_body text;
  old_block text;
  new_block text;
  temp_block text;
  new_guard text;
  old_block_lf constant text := $old$

  if not found then
    return jsonb_build_object('ok', false, 'error_message', 'payment_not_found');
  end if;

  if exists (
$old$;
  new_block_lf constant text := $new$

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
$new$;
  temp_block_lf constant text := $temp$
  -- The legacy status-only API must not undo a confirmed PayPal/Capture fact.
  -- Payment completion belongs to the dedicated official confirmation RPC.
  if v_status = 'canceled' and
     (v_payment.status = 'confirmed' or v_payment.provider_capture_id is not null) then
    return jsonb_build_object(
      'ok', false, 'error_message', 'confirmed_payment_cannot_be_canceled');
  end if;$temp$;
  new_guard_lf constant text := $guard$
  -- M1: the legacy status RPC cannot downgrade a confirmed or settled payment.
  if v_status = 'canceled'
     and (
       v_payment.status in ('confirmed', 'refunded')
       or v_payment.provider_capture_id is not null
     ) then
    return jsonb_build_object('ok', false, 'error_message', 'confirmed_payment_cannot_be_canceled');
  end if;$guard$;
  acl_before aclitem[];
  acl_after aclitem[];
  owner_before oid;
  owner_after oid;
  config_before text[];
  config_after text[];
  security_before boolean;
  security_after boolean;
  volatility_before "char";
  volatility_after "char";
  parallel_before "char";
  parallel_after "char";
  strict_before boolean;
  strict_after boolean;
  leakproof_before boolean;
  leakproof_after boolean;
begin
  fn := to_regprocedure(
    'public.admin_update_membership_payment_status_json(uuid,text,text)'
  );
  if fn is null then
    raise exception 'M1 STOP: legacy admin payment status RPC is missing';
  end if;

  select p.prosrc, pg_get_functiondef(p.oid), p.proacl, p.proowner, p.proconfig,
         p.prosecdef, p.provolatile, p.proparallel, p.proisstrict, p.proleakproof
  into body_before, definition_before, acl_before, owner_before, config_before,
       security_before, volatility_before, parallel_before, strict_before, leakproof_before
  from pg_proc as p
  where p.oid = fn;

  if position(E'\r\n' in body_before) > 0 then
    old_block := replace(old_block_lf, E'\n', E'\r\n');
    new_block := replace(new_block_lf, E'\n', E'\r\n');
    temp_block := replace(temp_block_lf, E'\n', E'\r\n');
    new_guard := replace(new_guard_lf, E'\n', E'\r\n');
  else
    old_block := old_block_lf;
    new_block := new_block_lf;
    temp_block := temp_block_lf;
    new_guard := new_guard_lf;
  end if;

  if position('membership_refund_requests' in body_before) = 0 then
    raise exception 'M1 STOP: legacy admin payment status RPC source drifted';
  end if;

  if position('M1: the legacy status RPC cannot downgrade' in body_before) > 0 then
    expected_body := body_before;
    if position(old_block in body_before) > 0 or position(temp_block in body_before) > 0 then
      raise exception 'M1 STOP: admin status RPC contains a conflicting cancellation guard';
    end if;
  elsif position('The legacy status-only API must not undo a confirmed PayPal/Capture fact.' in body_before) > 0 then
    if length(body_before) - length(replace(body_before, temp_block, '')) <> length(temp_block) then
      raise exception 'M1 STOP: temporary QA admin guard is not unique';
    end if;
    expected_body := replace(body_before, temp_block, new_guard);
    restored_definition := replace(definition_before, temp_block, new_guard);
    if expected_body = body_before
       or position('M1: the legacy status RPC cannot downgrade' in expected_body) = 0
       or restored_definition = definition_before then
      raise exception 'M1 STOP: temporary QA admin guard conversion is incomplete';
    end if;
    execute restored_definition;
  else
    if length(body_before) - length(replace(body_before, old_block, '')) <> length(old_block) then
      raise exception 'M1 STOP: legacy admin payment status RPC exact source block drifted';
    end if;

    expected_body := replace(body_before, old_block, new_block);
    restored_definition := replace(definition_before, old_block, new_block);
    if expected_body = body_before
       or position('M1: the legacy status RPC cannot downgrade' in expected_body) = 0
       or restored_definition = definition_before then
      raise exception 'M1 STOP: admin status guard patch candidate is incomplete';
    end if;

    execute restored_definition;
  end if;

  select p.prosrc, p.proacl, p.proowner, p.proconfig,
         p.prosecdef, p.provolatile, p.proparallel, p.proisstrict, p.proleakproof
  into body_after, acl_after, owner_after, config_after,
       security_after, volatility_after, parallel_after, strict_after, leakproof_after
  from pg_proc as p
  where p.oid = fn;

  if body_after is distinct from expected_body
     or acl_after is distinct from acl_before
     or owner_after is distinct from owner_before
     or config_after is distinct from config_before
     or security_after is distinct from security_before
     or volatility_after is distinct from volatility_before
     or parallel_after is distinct from parallel_before
     or strict_after is distinct from strict_before
     or leakproof_after is distinct from leakproof_before then
    raise exception 'M1 STOP: admin status RPC body or protected metadata verification failed';
  end if;
end;
$m1_admin_status$;

revoke all on function public.confirm_paypal_membership_payment_json(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_paypal_membership_payment_json(uuid, text, text, timestamptz)
  to service_role;

revoke all on function public.admin_update_membership_payment_status_json(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_membership_payment_status_json(uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
