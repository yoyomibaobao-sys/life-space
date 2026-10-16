-- Incremental cloud-trial lifecycle change. Validate in isolated QA before production.
begin;
alter table private.cloud_trial_claims add column if not exists ended_early_at timestamptz;
alter table private.cloud_trial_claims drop constraint cloud_trial_claims_trial_range_check;
alter table private.cloud_trial_claims add constraint cloud_trial_claims_trial_range_check
  check (trial_ends_at >= claimed_at and trial_ends_at <= claimed_at + interval '90 days');

create or replace function public.end_my_cloud_trial_early()
returns table(ok boolean, already_ended boolean, reason text, ended_at timestamptz, cleanup_due_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim private.cloud_trial_claims%rowtype;
  v_member public.user_memberships%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    return query select false, false, 'not_authenticated'::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('membership-payment:' || v_user_id::text, 0)
  );
  select c.* into v_claim from private.cloud_trial_claims as c where c.user_id = v_user_id for update;
  if not found then
    return query select false, false, 'no_formal_trial'::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_claim.ended_early_at is not null then
    return query select true, true, 'already_ended'::text, v_claim.trial_ends_at, v_claim.cleanup_due_at;
    return;
  end if;
  if v_claim.converted_to_paid_at is not null or exists (
    select 1 from public.membership_payments as mp
    where mp.user_id = v_user_id and mp.status = 'confirmed'
  ) then
    return query select false, false, 'paid_membership_history'::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  select m.* into v_member from public.user_memberships as m where m.user_id = v_user_id for update;
  if not found or v_member.plan <> 'trial' or v_member.status <> 'trialing'
     or (v_member.paid_until is not null and v_member.paid_until > v_now)
     or v_claim.trial_ends_at <= v_now then
    return query select false, false, 'trial_not_active'::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  update private.cloud_trial_claims as c set trial_ends_at = v_now,
    cleanup_due_at = v_now + interval '30 days', ended_early_at = v_now, updated_at = v_now
  where c.user_id = v_user_id;
  update public.user_memberships as m set status = 'expired',
    trial_ends_at = v_now, updated_at = v_now
  where m.user_id = v_user_id and m.plan = 'trial';
  update public.market_posts as mp set status = 'ended', updated_at = v_now
  where mp.user_id = v_user_id and mp.status = 'active';
  return query select true, false, 'ended'::text, v_now, v_now + interval '30 days';
end;
$$;
revoke all on function public.end_my_cloud_trial_early() from public, anon, authenticated, service_role;
grant execute on function public.end_my_cloud_trial_early() to authenticated, service_role;

create or replace function public.get_my_cloud_trial_server_time()
returns timestamptz language sql stable security definer set search_path = ''
as $$ select case when auth.uid() is null then null else now() end $$;
revoke all on function public.get_my_cloud_trial_server_time() from public, anon, authenticated, service_role;
grant execute on function public.get_my_cloud_trial_server_time() to authenticated, service_role;

-- Retain the bounded cleanup, conversion, and account isolation logic.

create or replace function public.process_cloud_trial_lifecycle(
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim private.cloud_trial_claims%rowtype;
  v_claim_user_id uuid;
  v_previous_claim_sub text;
  v_converted_at timestamptz;
  v_market_post record;
  v_archive record;
  v_delete_ok boolean;
  v_delete_error text;
  v_processed integer := 0;
  v_notices integer := 0;
  v_converted integer := 0;
  v_cleanup_started integer := 0;
  v_cleanup_completed integer := 0;
  v_cleanup_failed integer := 0;
  v_delete_errors integer;
  v_last_error text;
  v_has_business_rows boolean;
  v_has_unfinished_jobs boolean;
  v_was_cleanup_started boolean;
begin
  for v_claim in
    select c.*
    from private.cloud_trial_claims as c
    where c.converted_to_paid_at is null
      and c.cleanup_completed_at is null
      and c.trial_ends_at <= now() + interval '30 days'
    order by c.trial_ends_at, c.user_id
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    v_claim_user_id := v_claim.user_id;
    -- Payment confirmation, refund completion, claiming, and lifecycle work
    -- all take this account-scoped lock before any claim or membership row
    -- lock. Keeping one lock order avoids payment/lifecycle deadlocks.
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'membership-payment:' || v_claim_user_id::text,
        0
      )
    ) then
      continue;
    end if;

    select c.*
    into v_claim
    from private.cloud_trial_claims as c
    where c.user_id = v_claim_user_id
      and c.converted_to_paid_at is null
      and c.cleanup_completed_at is null
      and c.trial_ends_at <= now() + interval '30 days'
    for update;

    if not found then
      continue;
    end if;

    v_processed := v_processed + 1;

    -- Any real paid conversion permanently removes the account from the
    -- free-trial cleanup path. Refunding the first and only paid term clears
    -- this marker in the refund override below.
    select coalesce(
      (
        select min(coalesce(mp.paid_at, mp.created_at))
        from public.membership_payments as mp
        where mp.user_id = v_claim.user_id
          and mp.status = 'confirmed'
      ),
      (
        select coalesce(m.updated_at, now())
        from public.user_memberships as m
        where m.user_id = v_claim.user_id
          and (
            m.plan = 'admin'
            or (
              m.plan <> 'trial'
              and m.paid_until is not null
              and m.paid_until > now()
            )
          )
        limit 1
      )
    )
    into v_converted_at;

    if v_converted_at is not null then
      update private.cloud_trial_claims as c
      set
        converted_to_paid_at = v_converted_at,
        cleanup_last_error_code = null,
        updated_at = now()
      where c.user_id = v_claim.user_id;
      v_converted := v_converted + 1;
      continue;
    end if;

    if now() < v_claim.trial_ends_at then
      continue;
    end if;

    update public.user_memberships as m
    set
      status = 'expired',
      updated_at = now()
    where m.user_id = v_claim.user_id
      and m.plan = 'trial'
      and m.trial_ends_at is not distinct from v_claim.trial_ends_at
      and (m.paid_until is null or m.paid_until <= now());

    update public.market_posts as mp set status = 'ended', updated_at = now()
    where mp.user_id = v_claim.user_id and mp.status = 'active';

    if now() < v_claim.cleanup_due_at then
      update private.cloud_trial_claims as c
      set expiry_notice_sent_at = coalesce(c.expiry_notice_sent_at, now()), updated_at = now()
      where c.user_id = v_claim.user_id;

      if v_claim.cleanup_seven_day_notice_sent_at is null
         and now() >= v_claim.cleanup_due_at - interval '7 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'cleanup_seven_days',
          '还有7天完成本机保存 / 7 days to save locally',
          '处理期还剩7天。请及时开通 Plus、备份导出或逐个保存云端项目到本机；账号和本机已有内容继续可用。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          cleanup_seven_day_notice_sent_at = now(),
          cleanup_thirty_day_notice_sent_at = coalesce(
            c.cleanup_thirty_day_notice_sent_at,
            now()
          ),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;

      end if;

      continue;
    end if;

    v_delete_errors := 0;
    v_last_error := null;
    v_was_cleanup_started := v_claim.cleanup_started_at is not null;
    v_previous_claim_sub := current_setting('request.jwt.claim.sub', true);
    perform set_config('request.jwt.claim.sub', v_claim.user_id::text, true);

    -- Bound each pass. Accounts with more rows continue on a later daily run.
    for v_market_post in
      select mp.id
      from public.market_posts as mp
      where mp.user_id = v_claim.user_id
      order by mp.created_at, mp.id
      limit 200
    loop
      begin
        select d.ok, d.error_code
        into v_delete_ok, v_delete_error
        from public.request_delete_market_post(v_market_post.id) as d;

        if not coalesce(v_delete_ok, false) then
          v_delete_errors := v_delete_errors + 1;
          v_last_error := coalesce(v_delete_error, 'market_post_delete_failed');
        end if;
      exception when others then
        v_delete_errors := v_delete_errors + 1;
        v_last_error := 'market_post_delete_failed';
      end;
    end loop;

    for v_archive in
      select a.id
      from public.archives as a
      where a.user_id = v_claim.user_id
      order by a.created_at, a.id
      limit 200
    loop
      begin
        select d.ok, d.error_code
        into v_delete_ok, v_delete_error
        from public.request_delete_archive(v_archive.id) as d;

        if not coalesce(v_delete_ok, false) then
          v_delete_errors := v_delete_errors + 1;
          v_last_error := coalesce(v_delete_error, 'archive_delete_failed');
        end if;
      exception when others then
        v_delete_errors := v_delete_errors + 1;
        v_last_error := 'archive_delete_failed';
      end;
    end loop;

    perform set_config(
      'request.jwt.claim.sub',
      coalesce(v_previous_claim_sub, ''),
      true
    );

    if not v_was_cleanup_started then
      v_cleanup_started := v_cleanup_started + 1;
    end if;

    update private.cloud_trial_claims as c
    set
      cleanup_started_at = coalesce(c.cleanup_started_at, now()),
      cleanup_last_attempt_at = now(),
      cleanup_attempt_count = c.cleanup_attempt_count + 1,
      cleanup_last_error_code = case
        when v_delete_errors > 0 then coalesce(v_last_error, 'delete_failed')
        else null
      end,
      updated_at = now()
    where c.user_id = v_claim.user_id;

    select exists (
      select 1 from public.archives as a
      where a.user_id = v_claim.user_id
      union all
      select 1 from public.market_posts as mp
      where mp.user_id = v_claim.user_id
    ) into v_has_business_rows;

    select exists (
      select 1
      from public.storage_deletion_jobs as j
      where j.owner_user_id = v_claim.user_id
        and j.source_type in ('archive', 'market_post')
        and j.status <> 'succeeded'
    ) into v_has_unfinished_jobs;

    if v_delete_errors = 0
       and not v_has_business_rows
       and not v_has_unfinished_jobs then
      update private.cloud_trial_claims as c
      set
        cleanup_completed_at = now(),
        cleanup_last_error_code = null,
        updated_at = now()
      where c.user_id = v_claim.user_id
        and c.cleanup_completed_at is null;

      v_cleanup_completed := v_cleanup_completed + 1;
    elsif v_delete_errors > 0 then
      v_cleanup_failed := v_cleanup_failed + 1;
    end if;
  end loop;

  -- End public listings when an unrenewed paid term expires. Keep the
  -- posts, media, and consultation history for the paid retention policy.
  update public.market_posts as mp
  set status = 'ended', updated_at = now()
  where mp.status = 'active'
    and exists (
      select 1 from public.user_memberships as m
      where m.user_id = mp.user_id
        and m.plan in ('basic', 'large', 'seller')
        and m.paid_until is not null
        and m.paid_until <= now()
        and not public.is_user_membership_active(m.user_id)
    );

  return jsonb_build_object(
    'processed', v_processed,
    'notifications_created', v_notices,
    'converted_to_paid', v_converted,
    'cleanup_started', v_cleanup_started,
    'cleanup_completed', v_cleanup_completed,
    'cleanup_failed', v_cleanup_failed
  );
end;
$$;
revoke all on function public.process_cloud_trial_lifecycle(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.process_cloud_trial_lifecycle(integer)
  to service_role;

comment on function public.process_cloud_trial_lifecycle(integer) is
  'Service-only daily lifecycle. Expires formal trials and routes never-paid trial content through safe deletion jobs after the 30-day read-only handling period. No automatic local download occurs.';

commit;
