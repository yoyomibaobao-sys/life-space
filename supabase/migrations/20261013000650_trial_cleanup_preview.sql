-- Read-only admin preview. No deletion and no changes to lifecycle triggers.
-- Do not apply until the accompanying blocked lifecycle migration is reviewed.
begin;

create or replace function public.admin_preview_trial_cloud_cleanup(
  p_bands text[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
begin
  if auth.uid() is null or not public.is_app_admin(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if coalesce(pg_catalog.array_length(p_bands, 1), 0) = 0
     or exists (
       select 1 from pg_catalog.unnest(p_bands) as chosen(band)
       where chosen.band is null
          or chosen.band not in ('lt_6m', 'm6_12', 'y1_3', 'y3_6', 'gte_6y')
     ) then
    raise exception 'invalid_cleanup_bands' using errcode = '22023';
  end if;

  with eligible as (
    select
      c.user_id,
      case
        when c.cleanup_due_at > now() - interval '6 months' then 'lt_6m'
        when c.cleanup_due_at > now() - interval '1 year' then 'm6_12'
        when c.cleanup_due_at > now() - interval '3 years' then 'y1_3'
        when c.cleanup_due_at > now() - interval '6 years' then 'y3_6'
        else 'gte_6y'
      end as band
    from private.cloud_trial_claims c
    where c.cleanup_due_at <= now()
      and c.cleanup_completed_at is null
      and c.cleanup_started_at is null
      and c.converted_to_paid_at is null
      and not exists (
        select 1 from public.membership_payments mp
        where mp.user_id = c.user_id and mp.status = 'confirmed'
      )
      and not exists (
        select 1 from public.user_memberships um
        where um.user_id = c.user_id and um.plan <> 'trial'
      )
  ), selected as (
    select e.user_id from eligible e where e.band = any(p_bands)
  ), stats as (
    select
      s.user_id,
      (select count(*) from public.archives a where a.user_id = s.user_id) as project_count,
      (select count(*) from public.media m
         where m.user_id = s.user_id and m.type = 'image') as photo_count,
      (select coalesce(sum(m.size_bytes), 0) from public.media m
         where m.user_id = s.user_id and m.type = 'image') as registered_photo_bytes
    from selected s
  )
  select pg_catalog.jsonb_build_object(
    'accounts', count(*),
    'projects', coalesce(sum(stats.project_count), 0),
    'photos', coalesce(sum(stats.photo_count), 0),
    'registered_photo_bytes', coalesce(sum(stats.registered_photo_bytes), 0),
    'measurement', 'media_metadata_only',
    'bands', pg_catalog.to_jsonb(p_bands)
  )
  into v_summary from stats;

  return v_summary;
end;
$$;

revoke all on function public.admin_preview_trial_cloud_cleanup(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.admin_preview_trial_cloud_cleanup(text[])
  to authenticated;

comment on function public.admin_preview_trial_cloud_cleanup(text[]) is
  'Admin-only read-only count for selected handling-expiry bands. Bytes are indexed media metadata, not a physical Storage/R2 measurement.';

commit;
