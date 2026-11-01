-- R26 corrective FORWARD migration, approved Plus = 1 GB decimal (1,000,000,000 bytes).
-- Do not delete/rewrite the previously executed 500 MB migration or historical
-- payment/membership rows. Preserve large/seller 5 GB defaults and all metadata.
-- Stop atomically on any unexpected body drift. Safe to rerun if already restored.
do $r26_correction$
declare
  target record;
  fn regprocedure;
  body_before text;
  definition_before text;
  restored_body text;
  restored_definition text;
  acl_before aclitem[];
  owner_before oid;
  config_before text[];
  security_before boolean;
  volatility_before "char";
  parallel_before "char";
  strict_before boolean;
  leakproof_before boolean;
begin
  perform set_config('lock_timeout', '5s', true);
  for target in
    select * from (values
      ('public.admin_confirm_membership_payment_json(uuid,text,numeric,text,text,text,text,timestamp with time zone,integer,bigint,integer)',
        '982737582ecbdec0ba391b159931f62d', '269936e19a537da4ce3fab023714fa4a', 'admin'),
      ('public.admin_confirm_submitted_membership_payment_json(uuid)',
        'ceb256d51f1cf26bd94506996e7a415d', '1ac3e6f33ba817779f8383b38c2033f3', 'other'),
      ('public.confirm_paypal_membership_payment_json(uuid,text,text,timestamp with time zone)',
        'cc787dc0b8d881c721f041c75f82fc5b', 'cff9838716161de2873518ba6b32af22', 'other')
    ) as v(signature, r26_md5, restored_md5, mode)
  loop
    fn := to_regprocedure(target.signature);
    if fn is null then
      raise exception 'R26 correction missing function: %', target.signature;
    end if;
    select prosrc, pg_get_functiondef(oid), proacl, proowner, proconfig,
           prosecdef, provolatile, proparallel, proisstrict, proleakproof
    into body_before, definition_before, acl_before, owner_before,
         config_before, security_before, volatility_before, parallel_before,
         strict_before, leakproof_before
    from pg_proc where oid = fn;
    if md5(body_before) = target.restored_md5 then
      continue;
    end if;
    if md5(body_before) <> target.r26_md5 then
      raise exception 'R26 correction function drift: %', target.signature;
    end if;
    if target.mode = 'admin' then
      -- Only the two Plus/basic literals changed by R26. Never touch the
      -- existing 5,000,000,000-byte large/seller values.
      restored_body := replace(
        replace(body_before,
          'when v_plan = ''basic'' then 500000000',
          'when v_plan = ''basic'' then 1000000000'),
          'else 500000000', 'else 1000000000');
      restored_definition := replace(
        replace(definition_before,
          'when v_plan = ''basic'' then 500000000',
          'when v_plan = ''basic'' then 1000000000'),
          'else 500000000', 'else 1000000000');
    else
      -- Only the two fixed 500 MB values in these exact R26-signed bodies.
      restored_body := replace(body_before, '500000000,', '1000000000,');
      restored_definition := replace(definition_before, '500000000,', '1000000000,');
    end if;
    if md5(restored_body) <> target.restored_md5 then
      raise exception 'R26 correction candidate mismatch: %', target.signature;
    end if;
    execute restored_definition;
    if not exists (
      select 1 from pg_proc
      where oid = fn
        and md5(prosrc) = target.restored_md5
        and proacl is not distinct from acl_before
        and proowner = owner_before
        and proconfig is not distinct from config_before
        and prosecdef = security_before
        and provolatile = volatility_before
        and proparallel = parallel_before
        and proisstrict = strict_before
        and proleakproof = leakproof_before
    ) then
      raise exception 'R26 correction metadata/body mismatch: %', target.signature;
    end if;
  end loop;
end;
$r26_correction$;
