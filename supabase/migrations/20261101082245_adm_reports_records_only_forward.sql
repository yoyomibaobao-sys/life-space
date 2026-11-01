begin;
-- Forward-only ADM2 R03 correction: old project/market reports remain reviewable,
-- but new submissions can target only a public record. Never rewrite applied migrations.
create or replace function public.submit_support_submission(
  p_kind text,
  p_category text,
  p_content text default '',
  p_source_url text default null,
  p_target_type text default null,
  p_target_id text default null,
  p_target_url text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text := lower(trim(coalesce(p_kind,'')));
  v_category text := lower(trim(coalesce(p_category,'')));
  v_content text := trim(coalesce(p_content,''));
  v_source_url text := nullif(trim(coalesce(p_source_url,'')),'');
  v_target_type text := nullif(lower(trim(coalesce(p_target_type,''))),'');
  v_target_id text := nullif(trim(coalesce(p_target_id,'')),'');
  v_target_url text := nullif(trim(coalesce(p_target_url,'')),'');
  v_target_key text;
  v_existing_id uuid;
  v_existing_status text;
  v_created_id uuid;
  v_recent_count integer;
  v_archive_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok',false,'error','authentication_required');
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id) then
    return jsonb_build_object('ok',false,'error','profile_required');
  end if;
  if v_kind not in ('feedback','report') then
    return jsonb_build_object('ok',false,'error','invalid_kind');
  end if;

  if v_kind = 'feedback' then
    if v_category not in ('feature','problem','experience','other') then
      return jsonb_build_object('ok',false,'error','invalid_category');
    end if;
    if char_length(v_content) < 1 or char_length(v_content) > 4000 then
      return jsonb_build_object('ok',false,'error','invalid_content');
    end if;
  else
    if v_category not in ('violence_threat_hate','harassment_privacy_fraud','other_severe') then
      return jsonb_build_object('ok',false,'error','invalid_category');
    end if;
    if char_length(v_content) > 4000 then
      return jsonb_build_object('ok',false,'error','invalid_content');
    end if;
    if v_target_type is null or v_target_type <> 'record' then
      return jsonb_build_object('ok',false,'error','invalid_target');
    end if;
    if v_target_id is null or v_target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok',false,'error','invalid_target');
    end if;

    -- Only publicly visible records within publicly visible, non-trashed projects.
    -- The supplied URL is untrusted. Derive the project association and URL from DB.
    select r.archive_id into v_archive_id
    from public.records r
    join public.archives a on a.id = r.archive_id
    where r.id = v_target_id::uuid
      and r.visibility = 'public'
      and r.trashed_at is null
      and r.trash_entry_id is null
      and a.is_public is true
      and a.trashed_at is null
      and a.trash_entry_id is null;
    if v_archive_id is null then
      return jsonb_build_object('ok',false,'error','target_unavailable');
    end if;
    v_target_url := '/archive/' || lower(v_archive_id::text) || '?record=' || lower(v_target_id);

    -- Canonical ID prevents duplicate-report bypass through forged URL/seed.
    v_target_id := lower(v_target_id);
    v_target_key := v_target_type || ':' || md5(v_target_id);
    select s.id,s.status into v_existing_id,v_existing_status
    from public.support_submissions s
    where s.user_id = v_user_id and s.kind = 'report'
      and s.target_key = v_target_key and s.status in ('submitted','needs_info')
    order by s.created_at desc limit 1;
    if v_existing_id is not null then
      return jsonb_build_object('ok',true,'duplicate',true,'id',v_existing_id,'status',v_existing_status);
    end if;
  end if;

  select count(*)::integer into v_recent_count
  from public.support_submissions s
  where s.user_id = v_user_id and s.created_at >= now() - interval '24 hours';
  if v_recent_count >= 20 then
    return jsonb_build_object('ok',false,'error','rate_limited');
  end if;

  insert into public.support_submissions (
    user_id,kind,category,content,source_url,target_type,target_id,target_url,target_key
  ) values (
    v_user_id,v_kind,v_category,v_content,
    case when v_source_url is null then null else left(v_source_url,2000) end,
    case when v_kind='report' then v_target_type else null end,
    case when v_kind='report' then v_target_id else null end,
    case when v_kind='report' then v_target_url else null end,
    v_target_key
  ) returning id into v_created_id;
  return jsonb_build_object('ok',true,'duplicate',false,'id',v_created_id,'status','submitted');
exception when unique_violation then
  if v_kind <> 'report' or v_target_key is null then raise; end if;
  select s.id,s.status into v_existing_id,v_existing_status
  from public.support_submissions s
  where s.user_id=v_user_id and s.kind='report' and s.target_key=v_target_key
    and s.status in ('submitted','needs_info')
  order by s.created_at desc limit 1;
  if v_existing_id is null then raise; end if;
  return jsonb_build_object('ok',true,'duplicate',true,'id',v_existing_id,'status',v_existing_status);
end;
$$;
revoke all on function public.submit_support_submission(text,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.submit_support_submission(text,text,text,text,text,text,text)
  to authenticated,service_role;


notify pgrst, 'reload schema';
commit;
