-- Account deletion must remove the Auth identity after retaining only the
-- minimum payment/refund audit. Older Storage objects can also predate the
-- user-id folder convention, so server deletion needs an ownership-based list.

set lock_timeout = '5s';

alter table public.membership_payments
  drop constraint if exists membership_payments_user_id_fkey;

alter table public.membership_payments
  alter column user_id drop not null;

alter table public.membership_payments
  add constraint membership_payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

comment on column public.membership_payments.user_id is
  'Owning Auth user while the account exists; cleared when an account is permanently deleted while the payment audit is retained.';

alter table public.membership_refund_requests
  alter column user_id drop not null;

comment on column public.membership_refund_requests.user_id is
  'Owning Auth user while the account exists; cleared after a closed refund audit is retained for a permanently deleted account.';

create or replace function public.list_storage_objects_owned_by_user(
  p_user_id uuid
)
returns table (
  bucket_id text,
  object_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    objects.bucket_id::text,
    objects.name::text
  from storage.objects as objects
  where objects.owner_id = p_user_id::text
    and objects.bucket_id in ('media', 'avatars', 'payment-proofs')
  order by objects.bucket_id, objects.name;
$$;

revoke all on function public.list_storage_objects_owned_by_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_storage_objects_owned_by_user(uuid)
  to service_role;

comment on function public.list_storage_objects_owned_by_user(uuid) is
  'Service-role-only Storage ownership lookup used before permanent account deletion; returned objects must be removed through the Storage API.';

-- Finalize accounts that the previous workflow had already marked completed
-- using Auth soft deletion. Audit rows remain, but their user relationship and
-- free-form notes are cleared before the Auth identity is hard-deleted.
update public.membership_refund_requests as refund
set
  user_id = null,
  request_reason = null,
  review_note = null,
  updated_at = now()
where refund.user_id in (
  select distinct auth_user.id
  from auth.users as auth_user
  join public.account_deletion_audits as audit
    on audit.target_user_id = auth_user.id
   and audit.status = 'completed'
  where auth_user.deleted_at is not null
)
  and refund.status not in ('submitted', 'approved_pending_refund');

update public.membership_payments as payment
set
  user_id = null,
  proof_path = null,
  note = null,
  review_note = 'account_deleted',
  updated_at = now()
where payment.user_id in (
  select distinct auth_user.id
  from auth.users as auth_user
  join public.account_deletion_audits as audit
    on audit.target_user_id = auth_user.id
   and audit.status = 'completed'
  where auth_user.deleted_at is not null
);

delete from auth.users as auth_user
where auth_user.deleted_at is not null
  and exists (
    select 1
    from public.account_deletion_audits as audit
    where audit.target_user_id = auth_user.id
      and audit.status = 'completed'
  )
  and not exists (
    select 1
    from public.membership_refund_requests as refund
    where refund.user_id = auth_user.id
      and refund.status in ('submitted', 'approved_pending_refund')
  )
  and not exists (
    select 1
    from storage.objects as object
    where object.owner_id = auth_user.id::text
  );

-- Include valid UUID Storage owners in the existing administrator search so
-- orphaned flat-path objects can be passed through the audited deletion route.
create or replace function public.admin_search_memberships(
  p_keyword text default ''
)
returns table (
  user_id uuid,
  email text,
  username text,
  plan text,
  status text,
  trial_ends_at timestamptz,
  paid_until timestamptz,
  storage_used bigint,
  storage_limit_bytes bigint,
  base_market_post_limit integer,
  active_market_post_count integer,
  market_post_limit integer,
  created_at timestamptz,
  updated_at timestamptz,
  account_number text,
  is_internal_test boolean,
  registered_at timestamptz,
  last_sign_in_at timestamptz,
  archive_count bigint,
  record_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate_users as (
    select au.id as user_id
    from auth.users as au
    where au.deleted_at is null

    union

    select u.id
    from public.users as u

    union

    select p.id
    from public.profiles as p

    union

    select a.user_id
    from public.archives as a
    where a.user_id is not null

    union

    select r.user_id
    from public.records as r
    where r.user_id is not null

    union

    select m.user_id
    from public.media as m
    where m.user_id is not null

    union

    select um.user_id
    from public.user_memberships as um

    union

    select market.user_id
    from public.market_posts as market
    where market.user_id is not null

    union

    select c.user_id
    from public.comments as c
    where c.user_id is not null

    union

    select l.user_id
    from public.locations as l
    where l.user_id is not null

    union

    select g.user_id
    from public.group_tags as g
    where g.user_id is not null

    union

    select s.user_id
    from public.sub_tags as s
    where s.user_id is not null

    union

    select objects.owner_id::uuid
    from storage.objects as objects
    where objects.bucket_id in ('media', 'avatars', 'payment-proofs')
      and objects.owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
  select
    candidates.user_id,
    au.email::text,
    p.username,
    m.plan,
    case
      when m.plan = 'admin' then 'active'
      when m.paid_until is not null and m.paid_until > now() then 'active'
      when m.plan = 'trial'
       and (
         (m.trial_ends_at is null and m.status = 'trialing')
         or m.trial_ends_at > now()
       ) then 'trialing'
      when m.status in ('past_due', 'canceled') then m.status
      else 'expired'
    end,
    m.trial_ends_at,
    m.paid_until,
    coalesce(p.storage_used, 0)::bigint,
    m.storage_limit_bytes,
    m.base_market_post_limit,
    public.get_user_active_market_post_count(candidates.user_id),
    public.get_user_market_post_limit(candidates.user_id),
    m.created_at,
    m.updated_at,
    u.account_number,
    coalesce(u.is_internal_test, false),
    au.created_at,
    au.last_sign_in_at,
    coalesce(archive_totals.archive_count, 0),
    coalesce(record_totals.record_count, 0)
  from candidate_users as candidates
  left join auth.users as au on au.id = candidates.user_id
  left join public.profiles as p on p.id = candidates.user_id
  left join public.users as u on u.id = candidates.user_id
  left join public.user_memberships as m on m.user_id = candidates.user_id
  left join lateral (
    select
      count(*)::bigint as archive_count,
      min(a.created_at) as first_archive_at
    from public.archives as a
    where a.user_id = candidates.user_id
  ) as archive_totals on true
  left join lateral (
    select count(*)::bigint as record_count
    from public.records as r
    where r.user_id = candidates.user_id
      or exists (
        select 1
        from public.archives as owned_archive
        where owned_archive.id = r.archive_id
          and owned_archive.user_id = candidates.user_id
      )
  ) as record_totals on true
  where public.is_app_admin(auth.uid())
    and (
      coalesce(nullif(trim(p_keyword), ''), '') = ''
      or au.email ilike '%' || trim(p_keyword) || '%'
      or p.username ilike '%' || trim(p_keyword) || '%'
      or u.account_number ilike '%' || trim(p_keyword) || '%'
      or candidates.user_id::text = trim(p_keyword)
    )
  order by coalesce(au.created_at, u.created_at, archive_totals.first_archive_at) desc nulls last
  limit 50;
$$;

revoke all on function public.admin_search_memberships(text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_search_memberships(text)
  to authenticated, service_role;

comment on function public.admin_search_memberships(text) is
  'Admin-only registration/member and residual-account search, including Storage-only owners, with usage and content totals.';
