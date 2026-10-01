-- Current lifecycle override: the one-time cloud trial remains 30 MB / 90 days,
-- while the post-expiry read-only handling period is 30 days.
-- No automatic local download or automatic cloud-to-local conversion is performed.

begin;

alter table private.cloud_trial_settings
  alter column handling_period_days set default 30;

alter table private.cloud_trial_settings
  drop constraint if exists cloud_trial_settings_handling_period_days_check;

update private.cloud_trial_settings
set
  handling_period_days = 30,
  updated_at = now()
where singleton;

alter table private.cloud_trial_settings
  add constraint cloud_trial_settings_handling_period_days_check
  check (handling_period_days = 30);

comment on table private.cloud_trial_settings is
  'Private singleton configuration for the claimable 30 MB / 90-day cloud trial and its 30-day read-only handling period.';

alter table private.cloud_trial_claims
  drop constraint if exists cloud_trial_claims_cleanup_range_check;

update private.cloud_trial_claims as c
set
  cleanup_due_at = c.trial_ends_at + interval '30 days',
  updated_at = now()
from public.users as u
where u.id = c.user_id
  and not coalesce(u.is_internal_test, false)
  and c.cleanup_due_at is distinct from c.trial_ends_at + interval '30 days';

alter table private.cloud_trial_claims
  add constraint cloud_trial_claims_cleanup_range_check
  check (cleanup_due_at >= trial_ends_at);

comment on table private.cloud_trial_claims is
  'Private one-claim-per-account cloud-trial ledger. Formal trials last 90 days; never-paid trial cloud data enters a 30-day read-only handling period before cleanup.';

-- Reuse the existing lifecycle and deletion flow, but align notices with the
-- 30-day handling period. The expiry notice is the handling-start notice;
-- the only additional handling-period reminder is the final seven-day notice.
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
      if v_claim.trial_seven_day_notice_sent_at is null
         and now() >= v_claim.trial_ends_at - interval '7 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'trial_seven_days',
          '云端体验还剩7天 / 7 days left',
          '到期后将停止新增云端内容，并进入30天只读处理期。请在期满前开通 Plus、导出或保存到本机；期满后未保存且未升级为 Plus 的体验云端数据会被清除。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          trial_seven_day_notice_sent_at = now(),
          trial_thirty_day_notice_sent_at = coalesce(
            c.trial_thirty_day_notice_sent_at,
            now()
          ),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      elsif v_claim.trial_thirty_day_notice_sent_at is null
            and now() >= v_claim.trial_ends_at - interval '30 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'trial_thirty_days',
          '云端体验还剩30天 / 30 days left',
          '体验到期后云端数据转为只读，并进入30天处理期。本地记录不受影响；期满后未保存且未升级为 Plus 的体验云端数据会被清除。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          trial_thirty_day_notice_sent_at = now(),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      end if;

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

    if now() < v_claim.cleanup_due_at then
      if v_claim.expiry_notice_sent_at is null then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'trial_expired',
          '云端体验已到期 / Trial ended',
          '云端数据现为只读。你有30天可以开通 Plus、导出或保存到本机；期满后未保存且未升级为 Plus 的体验云端数据会被清除。',
          v_claim.trial_ends_at,
          v_claim.cleanup_due_at
        );
        update private.cloud_trial_claims as c
        set
          expiry_notice_sent_at = now(),
          updated_at = now()
        where c.user_id = v_claim.user_id;
        v_notices := v_notices + 1;
      end if;

      if v_claim.cleanup_seven_day_notice_sent_at is null
         and now() >= v_claim.cleanup_due_at - interval '7 days' then
        perform private.create_cloud_trial_notification(
          v_claim.user_id,
          'cleanup_seven_days',
          '还有7天完成本机保存 / 7 days to save locally',
          '请在7天内开通 Plus、导出或保存到本机。期满后未保存且未升级为 Plus 的体验云端数据会被清除；账号和本机已有内容继续可用。',
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
      perform private.create_cloud_trial_notification(
        v_claim.user_id,
        'cleanup_started',
        '30天处理期已结束 / 30-day handling period ended',
        '正在清理未升级为 Plus 且仍留在云端的体验数据。账号、付款记录和已主动保存到本机的内容继续可用；系统不会自动把云端内容下载到本机。',
        v_claim.trial_ends_at,
        v_claim.cleanup_due_at
      );
      v_notices := v_notices + 1;
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

      perform private.create_cloud_trial_notification(
        v_claim.user_id,
        'cleanup_completed',
        '体验云端清理完成 / Trial cloud cleanup complete',
        '未升级为 Plus 的体验云端数据已完成清理；账号和已主动保存到本机的内容继续可用，之后仍可开通 Plus 使用云端保存与同步。',
        v_claim.trial_ends_at,
        v_claim.cleanup_due_at
      );
      v_notices := v_notices + 1;
      v_cleanup_completed := v_cleanup_completed + 1;
    elsif v_delete_errors > 0 then
      v_cleanup_failed := v_cleanup_failed + 1;
    end if;
  end loop;

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
