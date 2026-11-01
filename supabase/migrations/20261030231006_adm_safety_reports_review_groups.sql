begin;

-- Preserve every historical report row/category; only new submissions use three options.
alter table public.support_submissions drop constraint if exists support_submissions_category_check;
alter table public.support_submissions add constraint support_submissions_category_check check (
  (kind = 'feedback' and category in ('feature','problem','experience','other'))
  or
  (kind = 'report' and category in (
    'spam','harassment','misleading','unsafe','ip','impersonation','other',
    'violence_threat_hate','harassment_privacy_fraud','other_severe'
  ))
);

-- Retain the installed RPC signature, feedback flow, 24-hour limit, and open-target unique index.
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
    if v_target_type is null or v_target_type not in ('archive','market_post') then
      return jsonb_build_object('ok',false,'error','invalid_target');
    end if;
    if v_target_id is null or v_target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok',false,'error','invalid_target');
    end if;

    -- A public project is the only project target; do not reveal private or trashed projects.
    if v_target_type = 'archive' then
      if not exists (
        select 1 from public.archives a
        where a.id = v_target_id::uuid and a.is_public is true and a.trashed_at is null
      ) then
        return jsonb_build_object('ok',false,'error','target_unavailable');
      end if;
      v_target_url := '/archive/' || lower(v_target_id);
    else
      if not exists (
        select 1 from public.market_posts m
        where m.id = v_target_id::uuid and m.status in ('active','ended')
      ) then
        return jsonb_build_object('ok',false,'error','target_unavailable');
      end if;
      v_target_url := '/market/' || lower(v_target_id);
    end if;

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

-- Group BEFORE pagination. Preserve historical target_type/target_id rather than rewriting reports.
create or replace function public.admin_list_support_report_groups(
  p_status text default 'open', p_limit integer default 40, p_offset integer default 0
)
returns table(
  target_type text, target_id text, target_url text, representative_id uuid,
  report_count bigint, first_report_at timestamptz, group_status text
)
language sql stable security definer set search_path = ''
as $$
  with eligible as (
    select s.*,
      coalesce(nullif(s.target_type,''),'legacy') as grouping_type,
      coalesce(nullif(s.target_id,''),s.id::text) as grouping_id
    from public.support_submissions s
    where public.is_app_admin(auth.uid()) and s.kind='report'
      and case when p_status='resolved' then s.status='resolved'
               else s.status in ('submitted','needs_info') end
  )
  select e.grouping_type,e.grouping_id,
    (array_agg(e.target_url order by e.created_at,e.id))[1],
    (array_agg(e.id order by e.created_at,e.id))[1],
    count(*)::bigint,min(e.created_at),
    case when p_status='resolved' then 'resolved' else 'open' end
  from eligible e
  group by e.grouping_type,e.grouping_id
  order by min(e.created_at),e.grouping_type,e.grouping_id
  limit least(greatest(coalesce(p_limit,40),1),50)
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_list_support_report_groups(text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_list_support_report_groups(text,integer,integer)
  to authenticated,service_role;

-- Details remain individual records, each page bounded and independently authorized.
create or replace function public.admin_get_support_report_group_details(
  p_target_type text, p_target_id text,
  p_status text default 'open', p_limit integer default 50, p_offset integer default 0
)
returns table(
  id uuid,user_id uuid,category text,content text,source_url text,
  target_type text,target_id text,target_url text,supplement text,
  supplemented_at timestamptz,status text,resolution text,admin_note text,
  created_at timestamptz,updated_at timestamptz,resolved_at timestamptz,
  total_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select s.id,s.user_id,s.category,s.content,s.source_url,
    s.target_type,s.target_id,s.target_url,s.supplement,s.supplemented_at,
    s.status,s.resolution,s.admin_note,s.created_at,s.updated_at,s.resolved_at,
    count(*) over()::bigint
  from public.support_submissions s
  where public.is_app_admin(auth.uid()) and s.kind='report'
    and coalesce(nullif(s.target_type,''),'legacy')=p_target_type
    and coalesce(nullif(s.target_id,''),s.id::text)=p_target_id
    and case when p_status='resolved' then s.status='resolved'
             else s.status in ('submitted','needs_info') end
  order by s.created_at,s.id
  limit least(greatest(coalesce(p_limit,50),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.admin_get_support_report_group_details(text,text,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_get_support_report_group_details(text,text,text,integer,integer)
  to authenticated,service_role;

-- No content moderation/deletion/ban action is authorized by this migration.
notify pgrst, 'reload schema';
commit;
