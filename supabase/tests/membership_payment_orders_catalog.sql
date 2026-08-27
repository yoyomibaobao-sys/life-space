-- LOCAL SUPABASE ONLY. Catalog assertions for user-submitted membership orders.

do $$
declare
  v_function_names text[] := array[
    'create_membership_payment_order_json',
    'submit_membership_payment_order_json',
    'cancel_membership_payment_order_json',
    'get_my_open_membership_payment_order_json',
    'admin_get_membership_payment_queue_count',
    'admin_list_membership_payment_queue',
    'admin_list_membership_payment_queue_v2',
    'admin_confirm_submitted_membership_payment_json',
    'admin_request_membership_payment_update_json'
  ];
  v_name text;
  v_definition text;
begin
  foreach v_name in array v_function_names loop
    if not exists (
      select 1
      from pg_proc as p
      join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = v_name
        and p.prosecdef
        and exists (
          select 1
          from unnest(coalesce(p.proconfig, array[]::text[])) as setting
          where setting like 'search_path=pg_catalog, public%'
        )
    ) then
      raise exception 'missing or unsafe payment-order function: %', v_name;
    end if;
  end loop;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'membership_payments'
      and column_name = 'order_number'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'membership_payments'
      and column_name = 'proof_path'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'membership_payments'
      and column_name = 'review_note'
  ) then
    raise exception 'membership payment order columns are incomplete';
  end if;

  if exists (
    select 1
    from unnest(array[
      'expires_at',
      'payment_destination_key',
      'payment_destination_label',
      'payment_destination_url',
      'payment_destination_version',
      'closed_at',
      'close_reason'
    ]) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns as c
      where c.table_schema = 'public'
        and c.table_name = 'membership_payments'
        and c.column_name = required.column_name
    )
  ) then
    raise exception 'payment expiry or destination snapshot columns are incomplete';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'payment-proofs'
      and public = false
      and file_size_limit = 5242880
  ) then
    raise exception 'private payment-proofs bucket is missing or unsafe';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'membership_payments'
      and indexname = 'membership_payments_one_open_order_per_user_uidx'
      and indexdef like 'CREATE UNIQUE INDEX%'
      and indexdef like '%pending_payment%'
      and indexdef like '%submitted%'
      and indexdef like '%needs_update%'
  ) then
    raise exception 'one-open-payment-order constraint is missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'membership_payments'
      and indexname = 'membership_payments_pending_expiry_idx'
      and indexdef like '%WHERE (status = ''pending_payment''%'
  ) then
    raise exception 'pending payment expiry index is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger as tg
    join pg_class as c on c.oid = tg.tgrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'membership_payments'
      and tg.tgname = 'trg_protect_membership_payment_order_snapshot'
      and not tg.tgisinternal
  ) then
    raise exception 'payment destination snapshot immutability trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payment_proofs_insert_own_path'
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payment_proofs_select_own_or_admin'
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payment_proofs_update_own_path'
  ) then
    raise exception 'payment proof Storage policies are missing';
  end if;

  if has_function_privilege('anon', 'public.create_membership_payment_order_json(text,text)', 'execute')
     or has_function_privilege('anon', 'public.submit_membership_payment_order_json(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.cancel_membership_payment_order_json(uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_my_open_membership_payment_order_json()', 'execute')
     or has_function_privilege('anon', 'public.admin_list_membership_payment_queue_v2()', 'execute')
     or has_function_privilege('anon', 'public.admin_get_membership_payment_queue_count()', 'execute')
     or has_function_privilege('anon', 'public.admin_list_membership_payment_queue()', 'execute')
     or has_function_privilege('anon', 'public.admin_confirm_submitted_membership_payment_json(uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_request_membership_payment_update_json(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_membership_payment_order_json(text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.submit_membership_payment_order_json(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.cancel_membership_payment_order_json(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_my_open_membership_payment_order_json()', 'execute') then
    raise exception 'user payment-order function grants are invalid';
  end if;

  if has_table_privilege('anon', 'public.membership_payments', 'select')
     or has_table_privilege('anon', 'public.membership_payments', 'insert')
     or has_table_privilege('authenticated', 'public.membership_payments', 'insert')
     or has_table_privilege('authenticated', 'public.membership_payments', 'update')
     or has_table_privilege('authenticated', 'public.membership_payments', 'delete')
     or has_table_privilege('authenticated', 'public.membership_payments', 'truncate')
     or has_table_privilege('authenticated', 'public.membership_payments', 'references')
     or has_table_privilege('authenticated', 'public.membership_payments', 'trigger')
     or not has_table_privilege('authenticated', 'public.membership_payments', 'select') then
    raise exception 'membership payment table grants are not least privilege';
  end if;

  if not exists (
    select 1
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'membership_payments'
      and c.relrowsecurity
  ) then
    raise exception 'membership payment table RLS is not enabled';
  end if;

  select pg_get_functiondef(
    'public.admin_confirm_submitted_membership_payment_json(uuid)'::regprocedure
  ) into v_definition;

  if v_definition not like '%status = ''confirmed''%'
     or v_definition not like '%on conflict (user_id) do update%'
     or v_definition not like '%interval ''12 months''%'
     or v_definition not like '%for update%' then
    raise exception 'payment confirmation is not transactional or idempotent';
  end if;

  select lower(pg_get_functiondef(
    'public.create_membership_payment_order_json(text,text)'::regprocedure
  )) into v_definition;

  if v_definition not like '%interval ''24 hours''%'
     or v_definition not like '%payment_destination_version%'
     or v_definition not like '%close_reason = ''destination_changed''%'
     or v_definition not like '%status in (''submitted'', ''needs_update'')%'
     or v_definition not like '%pg_advisory_xact_lock%' then
    raise exception 'payment creation does not preserve destination and expiry semantics';
  end if;

  select lower(pg_get_functiondef(
    'public.submit_membership_payment_order_json(uuid,text,text)'::regprocedure
  )) into v_definition;

  if v_definition not like '%v_order.status = ''pending_payment''%'
     or v_definition not like '%v_order.status not in (''pending_payment'', ''needs_update'')%'
     or v_definition not like '%expires_at = null%'
     or v_definition not like '%payment_destination_url%' then
    raise exception 'payment submission expiry or destination behavior is unsafe';
  end if;

  select lower(pg_get_functiondef(
    'public.cancel_membership_payment_order_json(uuid)'::regprocedure
  )) into v_definition;

  if v_definition not like '%v_order.status <> ''pending_payment''%'
     or v_definition not like '%close_reason = ''user_canceled''%' then
    raise exception 'payment cancellation is not limited to unpaid orders';
  end if;

  select lower(pg_get_functiondef(
    'public.protect_membership_payment_order_snapshot()'::regprocedure
  )) into v_definition;

  if v_definition not like '%payment_destination_key%'
     or v_definition not like '%payment_destination_label%'
     or v_definition not like '%payment_destination_url%'
     or v_definition not like '%payment_destination_version%'
     or v_definition not like '%payment_order_snapshot_is_immutable%' then
    raise exception 'payment destination snapshot can be rewritten';
  end if;
end;
$$;
