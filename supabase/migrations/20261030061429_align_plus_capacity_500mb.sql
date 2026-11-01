-- R26: align future Plus grants with the approved 500 MB (decimal) plan.
-- No stored membership/payment/profile rows are rewritten. Existing custom,
-- Free/trial, large/seller/admin entitlements and 12-month/idempotency logic stay.
-- Guard the installed bodies so this cannot overwrite unrelated function work.
do $r26$
declare
  target record;
  fn regprocedure;
  body_before text;
  definition_before text;
  acl_before aclitem[];
  owner_before oid;
  config_before text[];
  security_before boolean;
begin
  perform set_config('lock_timeout', '5s', true);
  for target in select * from (values
    ('public.admin_confirm_membership_payment_json(uuid,text,numeric,text,text,text,text,timestamp with time zone,integer,bigint,integer)', '269936e19a537da4ce3fab023714fa4a', '982737582ecbdec0ba391b159931f62d'),
    ('public.admin_confirm_submitted_membership_payment_json(uuid)', '1ac3e6f33ba817779f8383b38c2033f3', 'ceb256d51f1cf26bd94506996e7a415d'),
    ('public.confirm_paypal_membership_payment_json(uuid,text,text,timestamp with time zone)', 'cff9838716161de2873518ba6b32af22', 'cc787dc0b8d881c721f041c75f82fc5b')
  ) as t(signature, before_md5, after_md5)
  loop
    fn := to_regprocedure(target.signature);
    if fn is null then
      raise exception 'R26 required function missing: %', target.signature;
    end if;
    select prosrc, pg_get_functiondef(oid), proacl, proowner, proconfig, prosecdef
      into body_before, definition_before, acl_before, owner_before, config_before, security_before
      from pg_proc where oid = fn;
    if md5(body_before) = target.after_md5 then
      continue;
    end if;
    if md5(body_before) <> target.before_md5
       or (length(body_before) - length(replace(body_before, '1000000000', ''))) / 10 <> 2 then
      raise exception 'R26 function drift; inspect before applying: %', target.signature;
    end if;
    execute replace(definition_before, '1000000000', '500000000');
    if not exists (
      select 1 from pg_proc
      where oid = fn and md5(prosrc) = target.after_md5
        and proacl is not distinct from acl_before
        and proowner = owner_before
        and proconfig is not distinct from config_before
        and prosecdef = security_before
    ) then
      raise exception 'R26 function metadata/body changed unexpectedly: %', target.signature;
    end if;
  end loop;
end;
$r26$;
