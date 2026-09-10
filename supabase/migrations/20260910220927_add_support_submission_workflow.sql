begin;

create table public.support_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  category text not null,
  content text not null default '',
  source_url text,
  target_type text,
  target_id text,
  target_url text,
  target_key text,
  supplement text,
  supplemented_at timestamptz,
  status text not null default 'submitted',
  resolution text,
  admin_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_submissions_kind_check
    check (kind in ('feedback', 'report')),
  constraint support_submissions_category_check
    check (
      (kind = 'feedback' and category in ('feature', 'problem', 'experience', 'other'))
      or
      (kind = 'report' and category in ('spam', 'harassment', 'misleading', 'unsafe', 'ip', 'impersonation', 'other'))
    ),
  constraint support_submissions_content_check
    check (
      char_length(content) <= 4000
      and (kind = 'report' or char_length(trim(content)) between 1 and 4000)
      and (category <> 'other' or char_length(trim(content)) between 1 and 4000)
    ),
  constraint support_submissions_source_url_check
    check (source_url is null or char_length(source_url) <= 2000),
  constraint support_submissions_target_type_check
    check (target_type is null or target_type ~ '^[a-z0-9_-]{1,40}$'),
  constraint support_submissions_target_id_check
    check (target_id is null or char_length(target_id) <= 240),
  constraint support_submissions_target_url_check
    check (target_url is null or char_length(target_url) <= 2000),
  constraint support_submissions_target_key_check
    check (
      (kind = 'feedback' and target_key is null)
      or
      (kind = 'report' and target_key is not null and char_length(target_key) <= 80)
    ),
  constraint support_submissions_supplement_check
    check (supplement is null or char_length(trim(supplement)) between 1 and 3000),
  constraint support_submissions_status_check
    check (status in ('submitted', 'needs_info', 'resolved')),
  constraint support_submissions_resolution_check
    check (
      resolution is null
      or resolution in ('recorded', 'action_taken', 'no_violation', 'duplicate', 'not_planned', 'closed')
    ),
  constraint support_submissions_resolution_state_check
    check (
      (status = 'resolved' and resolution is not null and resolved_at is not null)
      or
      (status <> 'resolved' and resolution is null and resolved_at is null)
    ),
  constraint support_submissions_admin_note_check
    check (admin_note is null or char_length(admin_note) <= 1000)
);

alter table public.support_submissions enable row level security;
revoke all on table public.support_submissions from public, anon, authenticated;
grant all on table public.support_submissions to service_role;

create index support_submissions_user_created_idx
  on public.support_submissions (user_id, created_at desc);
create index support_submissions_queue_idx
  on public.support_submissions (kind, status, created_at asc);
create index support_submissions_target_queue_idx
  on public.support_submissions (target_key, status, created_at asc)
  where kind = 'report';
create unique index support_submissions_open_report_user_target_uniq
  on public.support_submissions (user_id, target_key)
  where kind = 'report' and status in ('submitted', 'needs_info');

comment on table public.support_submissions is
  'Structured in-app feedback and reports. Direct client table access is denied; narrow RPCs provide own-record and admin workflows.';
comment on column public.support_submissions.admin_note is
  'Administrator-only internal note. Never returned by user-facing RPCs.';

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'comment',
    'user_follow',
    'archive_follow',
    'flower',
    'followed_archive_record',
    'experience_comment',
    'experience_helpful',
    'market_comment',
    'market_reply',
    'cloud_trial',
    'report_update',
    'feedback_update'
  ));

create function public.submit_support_submission(
  p_kind text,
  p_category text,
  p_content text default '',
  p_source_url text default null,
  p_target_type text default null,
  p_target_id text default null,
  p_target_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_category text := lower(trim(coalesce(p_category, '')));
  v_content text := trim(coalesce(p_content, ''));
  v_source_url text := nullif(trim(coalesce(p_source_url, '')), '');
  v_target_type text := nullif(lower(trim(coalesce(p_target_type, ''))), '');
  v_target_id text := nullif(trim(coalesce(p_target_id, '')), '');
  v_target_url text := nullif(trim(coalesce(p_target_url, '')), '');
  v_target_seed text;
  v_target_key text;
  v_existing_id uuid;
  v_existing_status text;
  v_created_id uuid;
  v_recent_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'authentication_required');
  end if;

  if not exists (select 1 from public.profiles as p where p.id = v_user_id) then
    return jsonb_build_object('ok', false, 'error', 'profile_required');
  end if;

  if v_kind not in ('feedback', 'report') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  if v_kind = 'feedback' then
    if v_category not in ('feature', 'problem', 'experience', 'other') then
      return jsonb_build_object('ok', false, 'error', 'invalid_category');
    end if;
    if char_length(v_content) < 1 or char_length(v_content) > 4000 then
      return jsonb_build_object('ok', false, 'error', 'invalid_content');
    end if;
  else
    if v_category not in ('spam', 'harassment', 'misleading', 'unsafe', 'ip', 'impersonation', 'other') then
      return jsonb_build_object('ok', false, 'error', 'invalid_category');
    end if;
    if char_length(v_content) > 4000 or (v_category = 'other' and char_length(v_content) < 1) then
      return jsonb_build_object('ok', false, 'error', 'invalid_content');
    end if;
    if v_target_type is null or v_target_type !~ '^[a-z0-9_-]{1,40}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_target');
    end if;

    v_target_seed := coalesce(v_target_id, v_target_url, v_source_url);
    if v_target_seed is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_target');
    end if;
    v_target_key := v_target_type || ':' || md5(v_target_seed);

    select s.id, s.status
      into v_existing_id, v_existing_status
    from public.support_submissions as s
    where s.user_id = v_user_id
      and s.kind = 'report'
      and s.target_key = v_target_key
      and s.status in ('submitted', 'needs_info')
    order by s.created_at desc
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'id', v_existing_id,
        'status', v_existing_status
      );
    end if;
  end if;

  select count(*)::integer
    into v_recent_count
  from public.support_submissions as s
  where s.user_id = v_user_id
    and s.created_at >= now() - interval '24 hours';

  if v_recent_count >= 20 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.support_submissions (
    user_id,
    kind,
    category,
    content,
    source_url,
    target_type,
    target_id,
    target_url,
    target_key
  ) values (
    v_user_id,
    v_kind,
    v_category,
    v_content,
    case when v_source_url is null then null else left(v_source_url, 2000) end,
    v_target_type,
    case when v_target_id is null then null else left(v_target_id, 240) end,
    case when v_target_url is null then null else left(v_target_url, 2000) end,
    v_target_key
  )
  returning id into v_created_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'id', v_created_id,
    'status', 'submitted'
  );
exception
  when unique_violation then
    select s.id, s.status
      into v_existing_id, v_existing_status
    from public.support_submissions as s
    where s.user_id = v_user_id
      and s.kind = 'report'
      and s.target_key = v_target_key
      and s.status in ('submitted', 'needs_info')
    order by s.created_at desc
    limit 1;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'id', v_existing_id,
      'status', coalesce(v_existing_status, 'submitted')
    );
end;
$$;

revoke all on function public.submit_support_submission(text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_support_submission(text, text, text, text, text, text, text)
  to authenticated, service_role;

create function public.get_my_support_submissions(
  p_kind text default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  kind text,
  category text,
  content text,
  source_url text,
  target_type text,
  target_id text,
  target_url text,
  supplement text,
  supplemented_at timestamptz,
  status text,
  resolution text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.kind,
    s.category,
    s.content,
    s.source_url,
    s.target_type,
    s.target_id,
    s.target_url,
    s.supplement,
    s.supplemented_at,
    s.status,
    s.resolution,
    s.created_at,
    s.updated_at,
    s.resolved_at
  from public.support_submissions as s
  where s.user_id = auth.uid()
    and (p_kind is null or trim(p_kind) = '' or s.kind = lower(trim(p_kind)))
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.get_my_support_submissions(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_support_submissions(text, integer)
  to authenticated, service_role;

create function public.supplement_support_submission(
  p_submission_id uuid,
  p_supplement text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_supplement text := trim(coalesce(p_supplement, ''));
  v_updated_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'authentication_required');
  end if;
  if char_length(v_supplement) < 1 or char_length(v_supplement) > 3000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_supplement');
  end if;

  update public.support_submissions as s
  set
    supplement = v_supplement,
    supplemented_at = now(),
    status = 'submitted',
    updated_at = now()
  where s.id = p_submission_id
    and s.user_id = v_user_id
    and s.status = 'needs_info'
    and s.supplement is null
  returning s.id into v_updated_id;

  if v_updated_id is null then
    return jsonb_build_object('ok', false, 'error', 'supplement_unavailable');
  end if;

  return jsonb_build_object('ok', true, 'id', v_updated_id, 'status', 'submitted');
end;
$$;

revoke all on function public.supplement_support_submission(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.supplement_support_submission(uuid, text)
  to authenticated, service_role;

create function public.admin_get_support_submission_queue_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_app_admin(auth.uid()) then (
      select count(*)::bigint
      from public.support_submissions as s
      where s.kind = 'report'
        and s.status in ('submitted', 'needs_info')
    )
    else 0::bigint
  end;
$$;

revoke all on function public.admin_get_support_submission_queue_count()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_get_support_submission_queue_count()
  to authenticated, service_role;

create function public.admin_list_support_submissions(
  p_kind text default 'report',
  p_status text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  user_id uuid,
  kind text,
  category text,
  content text,
  source_url text,
  target_type text,
  target_id text,
  target_url text,
  supplement text,
  supplemented_at timestamptz,
  status text,
  resolution text,
  admin_note text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  same_target_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.user_id,
    s.kind,
    s.category,
    s.content,
    s.source_url,
    s.target_type,
    s.target_id,
    s.target_url,
    s.supplement,
    s.supplemented_at,
    s.status,
    s.resolution,
    s.admin_note,
    s.created_at,
    s.updated_at,
    s.resolved_at,
    case
      when s.kind = 'report' and s.target_key is not null then (
        select count(*)::bigint
        from public.support_submissions as related
        where related.kind = 'report'
          and related.target_key = s.target_key
          and related.status in ('submitted', 'needs_info')
      )
      else 1::bigint
    end as same_target_count
  from public.support_submissions as s
  where public.is_app_admin(auth.uid())
    and (p_kind is null or trim(p_kind) = '' or s.kind = lower(trim(p_kind)))
    and (p_status is null or trim(p_status) = '' or s.status = lower(trim(p_status)))
  order by
    case s.status when 'submitted' then 0 when 'needs_info' then 1 else 2 end,
    s.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.admin_list_support_submissions(text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_support_submissions(text, text, integer)
  to authenticated, service_role;

create function public.admin_update_support_submission(
  p_submission_id uuid,
  p_status text,
  p_resolution text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status, '')));
  v_resolution text := nullif(lower(trim(coalesce(p_resolution, ''))), '');
  v_admin_note text := nullif(trim(coalesce(p_admin_note, '')), '');
  v_submission public.support_submissions%rowtype;
  v_item record;
  v_count integer := 0;
  v_title text;
  v_body text;
  v_related_url text;
begin
  if not public.is_app_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if v_admin_note is not null and char_length(v_admin_note) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'admin_note_too_long');
  end if;

  select * into v_submission
  from public.support_submissions as s
  where s.id = p_submission_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_status = 'needs_info' then
    if v_submission.status = 'resolved' then
      return jsonb_build_object('ok', false, 'error', 'already_resolved');
    end if;
    if v_submission.supplement is not null then
      return jsonb_build_object('ok', false, 'error', 'followup_already_used');
    end if;

    update public.support_submissions as s
    set
      status = 'needs_info',
      resolution = null,
      resolved_by = null,
      resolved_at = null,
      admin_note = v_admin_note,
      updated_at = now()
    where s.id = p_submission_id;

    if v_submission.kind = 'report' then
      v_title := '举报需要补充 / Report needs more information';
      v_body := '请打开举报记录补充一次说明；无需通过邮件回复。 / Please add one supplement in your report record; no email reply is needed.';
      v_related_url := '/report?submission=' || p_submission_id::text;
    else
      v_title := '反馈需要补充 / Feedback needs more information';
      v_body := '请打开反馈记录补充一次说明；无需通过邮件回复。 / Please add one supplement in your feedback record; no email reply is needed.';
      v_related_url := '/feedback?submission=' || p_submission_id::text;
    end if;

    perform public.create_notification(
      v_submission.user_id,
      null,
      case when v_submission.kind = 'report' then 'report_update' else 'feedback_update' end,
      v_title,
      v_body,
      null,
      null,
      null,
      v_related_url,
      jsonb_build_object('support_submission_id', p_submission_id, 'status', 'needs_info')
    );

    return jsonb_build_object('ok', true, 'updated_count', 1, 'status', 'needs_info');
  end if;

  if v_status <> 'resolved' then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  if v_submission.kind = 'report' then
    if v_resolution not in ('action_taken', 'no_violation', 'duplicate', 'closed') then
      return jsonb_build_object('ok', false, 'error', 'invalid_resolution');
    end if;

    if v_resolution = 'action_taken' then
      v_body := '已处理相关内容。感谢你的举报。 / Action has been taken on the reported content. Thank you.';
    elsif v_resolution = 'no_violation' then
      v_body := '已完成核查，暂未发现需要处理的问题。 / Review completed; no action is required at this time.';
    elsif v_resolution = 'duplicate' then
      v_body := '该举报已与同一内容的其他举报合并处理。 / This report was merged with other reports about the same content.';
    else
      v_body := '举报已完成处理。 / Your report has been reviewed and closed.';
    end if;
    v_title := '举报处理更新 / Report update';

    for v_item in
      update public.support_submissions as s
      set
        status = 'resolved',
        resolution = v_resolution,
        resolved_by = v_admin_id,
        resolved_at = now(),
        admin_note = v_admin_note,
        updated_at = now()
      where s.kind = 'report'
        and s.status in ('submitted', 'needs_info')
        and (
          (v_submission.target_key is not null and s.target_key = v_submission.target_key)
          or
          (v_submission.target_key is null and s.id = v_submission.id)
        )
      returning s.id, s.user_id
    loop
      v_count := v_count + 1;
      perform public.create_notification(
        v_item.user_id,
        null,
        'report_update',
        v_title,
        v_body,
        null,
        null,
        null,
        '/report?submission=' || v_item.id::text,
        jsonb_build_object('support_submission_id', v_item.id, 'status', 'resolved', 'resolution', v_resolution)
      );
    end loop;
  else
    if v_resolution not in ('recorded', 'action_taken', 'not_planned', 'closed') then
      return jsonb_build_object('ok', false, 'error', 'invalid_resolution');
    end if;

    if v_resolution = 'recorded' then
      v_body := '反馈已记录，无需邮件回复。 / Your feedback has been recorded; no email reply is needed.';
    elsif v_resolution = 'action_taken' then
      v_body := '已根据反馈完成处理。 / Action has been taken based on your feedback.';
    elsif v_resolution = 'not_planned' then
      v_body := '已完成评估，当前暂不调整。 / Review completed; no change is planned at this time.';
    else
      v_body := '反馈已完成处理。 / Your feedback has been reviewed and closed.';
    end if;
    v_title := '反馈处理更新 / Feedback update';

    update public.support_submissions as s
    set
      status = 'resolved',
      resolution = v_resolution,
      resolved_by = v_admin_id,
      resolved_at = now(),
      admin_note = v_admin_note,
      updated_at = now()
    where s.id = v_submission.id
      and s.status in ('submitted', 'needs_info');

    if found then
      v_count := 1;
      perform public.create_notification(
        v_submission.user_id,
        null,
        'feedback_update',
        v_title,
        v_body,
        null,
        null,
        null,
        '/feedback?submission=' || v_submission.id::text,
        jsonb_build_object('support_submission_id', v_submission.id, 'status', 'resolved', 'resolution', v_resolution)
      );
    end if;
  end if;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_resolved');
  end if;

  return jsonb_build_object(
    'ok', true,
    'updated_count', v_count,
    'status', 'resolved',
    'resolution', v_resolution
  );
end;
$$;

revoke all on function public.admin_update_support_submission(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_support_submission(uuid, text, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
