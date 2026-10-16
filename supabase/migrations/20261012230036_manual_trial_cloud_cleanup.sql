-- PR #95: disable automatic trial deletion; use database time for read access.
-- This is an incremental migration. Never rewrite executed migrations.
-- REVIEW BLOCK: The admin job, payment/Storage deletion coordination, and
-- immediate revocation of already-issued media signed URLs are not implemented
-- or QA-validated. The one-hour signed URL can remain valid despite RLS and
-- its cached response may outlive token expiry. This draft must not apply.
begin;
do $$ begin
  raise exception using errcode = 'P0001', message = 'trial_manual_cleanup_migration_incomplete';
end $$;

-- Old deletion jobs have no trial provenance. Fail before changing anything
-- if an account already entered an unfinished automatic cleanup. Resolve
-- those items individually without canceling user-initiated deletion jobs.
do $$
begin
  if exists (
    select 1 from private.cloud_trial_claims c
    where c.cleanup_started_at is not null
      and c.cleanup_completed_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'legacy_trial_cleanup_in_progress';
  end if;
end;
$$;

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
  v_converted_at timestamptz;
  v_processed integer := 0;
  v_notices integer := 0;
  v_converted integer := 0;
begin
  for v_claim in
    select c.*
    from private.cloud_trial_claims as c
    where c.converted_to_paid_at is null
      and c.cleanup_completed_at is null
      and c.trial_ends_at <= now() + interval '30 days'
      and (
        c.cleanup_due_at > now()
        or exists (
          select 1 from public.user_memberships m
          where m.user_id = c.user_id and m.plan = 'trial'
            and m.status <> 'expired'
        )
        or exists (
          select 1 from public.market_posts mp
          where mp.user_id = c.user_id and mp.status = 'active'
        )
      )
    order by c.trial_ends_at, c.user_id
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    v_claim_user_id := v_claim.user_id;
    -- Do not lock payment rows here: PayPal confirmation locks its payment
    -- row before this account advisory lock. This lifecycle path only reads
    -- payment history and never queues trial data for deletion.
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
      and (
        c.cleanup_due_at > now()
        or exists (
          select 1 from public.user_memberships m
          where m.user_id = c.user_id and m.plan = 'trial'
            and m.status <> 'expired'
        )
        or exists (
          select 1 from public.market_posts mp
          where mp.user_id = c.user_id and mp.status = 'active'
        )
      )
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

    -- No automatic physical deletion after the handling period.
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
    'cleanup_started', 0,
    'cleanup_completed', 0,
    'cleanup_failed', 0
  );
end;
$$;
revoke all on function public.process_cloud_trial_lifecycle(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.process_cloud_trial_lifecycle(integer)
  to service_role;


comment on function public.process_cloud_trial_lifecycle(integer) is
  'Daily lifecycle expires trial writes and paid listings and sends the existing final-seven-day notice. It never starts free-trial physical deletion.';

-- Internal test accounts have no formal claim. Confirmed and unrevoked paid
-- history restores access even when the trial handling deadline has passed.
create or replace function public.can_read_trial_cloud_owner(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null and not exists (
    select 1 from private.cloud_trial_claims c
    where c.user_id = p_user_id
      and c.cleanup_due_at <= now()
      -- Completion must NOT restore read access to leftover files/rows.
      -- Paid conversion is the only legitimate post-deadline bypass.
      and not exists (
        select 1 from public.membership_payments mp
        where mp.user_id = p_user_id and mp.status = 'confirmed'
      )
      and not exists (
        select 1 from public.user_memberships m
        where m.user_id = p_user_id
          and (m.plan = 'admin' or (m.plan <> 'trial' and m.paid_until > now()))
      )
  );
$$;
revoke all on function public.can_read_trial_cloud_owner(uuid) from public, anon, authenticated, service_role;
grant execute on function public.can_read_trial_cloud_owner(uuid) to anon, authenticated, service_role;

-- Restrictive policies compose with existing permissive owner/public rules;
-- they do not grant any new access or change the write and delete paths.
create policy trial_cloud_archives_read on public.archives as restrictive
  for select to anon, authenticated using (public.can_read_trial_cloud_owner(user_id));
create policy trial_cloud_records_read on public.records as restrictive
  for select to anon, authenticated using (public.can_read_trial_cloud_owner(user_id));
create policy trial_cloud_media_read on public.media as restrictive
  for select to anon, authenticated using (public.can_read_trial_cloud_owner(user_id));
create policy trial_cloud_cycles_read on public.archive_cycles as restrictive
  for select to anon, authenticated using (
    exists (select 1 from public.archives a where a.id = archive_id)
  );
create policy trial_cloud_record_tags_read on public.record_tags as restrictive
  for select to anon, authenticated using (
    exists (select 1 from public.records r where r.id = record_id)
  );

-- Storage policies run as anon/authenticated and cannot query the private
-- claim ledger directly. This definer helper accepts the existing owner path
-- convention, and leaves unrecognized names to the preexisting media policies.
create or replace function public.can_read_trial_media_path(p_object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from private.cloud_trial_claims c
    where c.user_id::text = (storage.foldername(p_object_name))[1]
      and not public.can_read_trial_cloud_owner(c.user_id)
  );
$$;
revoke all on function public.can_read_trial_media_path(text) from public, anon, authenticated, service_role;
grant execute on function public.can_read_trial_media_path(text) to anon, authenticated, service_role;

-- The private media bucket cannot mint a new signed URL for an expired
-- owner's object. This does not revoke an existing signed URL or its CDN
-- response; keep the migration blocked until protected delivery is proven.
create policy trial_cloud_storage_read on storage.objects as restrictive
  for select to anon, authenticated using (
    bucket_id <> 'media' or public.can_read_trial_media_path(name)
  );

-- SECURITY DEFINER helpers bypass caller RLS, so they must check the same
-- claim deadline themselves.
create or replace function public.can_access_record(p_record_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = p_record_id and r.trashed_at is null and a.trashed_at is null
      and public.can_read_trial_cloud_owner(r.user_id)
      and (auth.uid() = r.user_id or (r.visibility = 'public' and a.is_public is true))
  );
$$;

create or replace function public.is_archive_not_trashed(p_archive_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.archives a
    where a.id = p_archive_id and a.trashed_at is null
      and public.can_read_trial_cloud_owner(a.user_id)
  );
$$;

commit;
