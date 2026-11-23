-- Paid creation and registered reading use separate predicates.;

CREATE OR REPLACE FUNCTION private.has_active_plus(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_user_id IS NOT NULL
    AND p_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_memberships AS m
      WHERE m.user_id = p_user_id
        AND m.plan IN ('basic','large')
        AND m.paid_until > statement_timestamp()
        AND (
          m.status='active'
          OR (m.status='past_due' AND EXISTS (
             SELECT 1 FROM public.membership_payments AS mp
             WHERE mp.user_id=m.user_id
               AND mp.plan IN ('basic','large')
               AND mp.status='confirmed'
               AND mp.service_started_at<=statement_timestamp()
               AND mp.service_ends_at>statement_timestamp()
          ))
        )
    );
$function$;

revoke all on function private.has_active_plus(uuid) from public, anon, authenticated;

create or replace function private.can_read_full_guide(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select p_user_id is not null and p_user_id = (select auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.save_experience_card(p_card_id uuid, p_archive_id uuid, p_title text, p_record_ids uuid[], p_cover_media_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_card_id uuid := p_card_id;
  v_existing public.experience_cards%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_record_count integer := coalesce(cardinality(p_record_ids), 0);
  v_was_published boolean := false;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_auth_required';
  end if;

  if p_card_id is null and not private.has_active_plus(v_user_id) then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_cloud_access_required';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 120 then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_title_invalid';
  end if;

  perform private.validate_experience_card_selection(
    v_user_id,
    p_archive_id,
    p_record_ids,
    p_cover_media_id
  );

  if v_card_id is null then
    insert into public.experience_cards (
      user_id,
      archive_id,
      title,
      cover_media_id,
      status,
      source_record_count,
      published_at
    )
    values (
      v_user_id,
      p_archive_id,
      v_title,
      p_cover_media_id,
      'draft',
      v_record_count,
      null
    )
    returning id into v_card_id;
  else
    select c.*
    into v_existing
    from public.experience_cards as c
    where c.id = v_card_id
    for update;

    if not found
       or v_existing.user_id is distinct from v_user_id
       or v_existing.archive_id is distinct from p_archive_id then
      raise exception using
        errcode = 'P0001',
        message = 'experience_card_not_found_or_forbidden';
    end if;

    v_was_published := v_existing.status = 'published';

    update public.experience_cards as c
    set
      title = v_title,
      cover_media_id = p_cover_media_id,
      source_record_count = v_record_count
    where c.id = v_card_id;

    delete from public.experience_card_records as cr
    where cr.card_id = v_card_id;
  end if;

  insert into public.experience_card_records (card_id, record_id)
  select v_card_id, selected.record_id
  from unnest(p_record_ids) as selected(record_id);

  if v_was_published then
    update public.archives as a
    set is_public = true
    where a.id = p_archive_id
      and a.user_id = v_user_id
      and a.trashed_at is null
      and a.trash_entry_id is null;

    update public.records as r
    set visibility = 'public'
    where r.id = any(p_record_ids)
      and r.archive_id = p_archive_id
      and r.user_id = v_user_id
      and r.trashed_at is null
      and r.trash_entry_id is null;
  end if;

  return v_card_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_experience_card(p_card_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_card public.experience_cards%rowtype;
  v_record_ids uuid[];
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_auth_required';
  end if;



  select c.*
  into v_card
  from public.experience_cards as c
  where c.id = p_card_id
  for update;

  if not found or v_card.user_id is distinct from v_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_not_found_or_forbidden';
  end if;

  select array_agg(cr.record_id order by r.record_time, r.created_at, r.id)
  into v_record_ids
  from public.experience_card_records as cr
  join public.records as r
    on r.id = cr.record_id
  where cr.card_id = v_card.id;

  if coalesce(cardinality(v_record_ids), 0) <> v_card.source_record_count then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_source_changed';
  end if;

  perform private.validate_experience_card_selection(
    v_user_id,
    v_card.archive_id,
    v_record_ids,
    v_card.cover_media_id
  );

  update public.archives as a
  set is_public = true
  where a.id = v_card.archive_id
    and a.user_id = v_user_id
    and a.trashed_at is null;

  update public.records as r
  set visibility = 'public'
  where r.id = any(v_record_ids)
    and r.archive_id = v_card.archive_id
    and r.user_id = v_user_id
    and r.trashed_at is null;

  update public.experience_cards as c
  set
    status = 'published',
    published_at = now()
  where c.id = v_card.id;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_experience_card_description(p_card_id uuid, p_description text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_auth_required';
  end if;



  if v_description is not null and char_length(v_description) > 500 then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_description_invalid';
  end if;

  update public.experience_cards as card
  set description = v_description
  where card.id = p_card_id
    and card.user_id = v_user_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_not_found_or_forbidden';
  end if;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_experience_card_playback_selection(p_card_id uuid, p_media_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_card public.experience_cards%rowtype;
  v_media_ids uuid[] := coalesce(p_media_ids, array[]::uuid[]);
  v_media_count integer := coalesce(cardinality(v_media_ids), 0);
  v_valid_count integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_auth_required';
  end if;



  select c.*
  into v_card
  from public.experience_cards as c
  where c.id = p_card_id
  for update;

  if not found or v_card.user_id is distinct from v_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_not_found_or_forbidden';
  end if;

  if exists (
    select 1
    from unnest(v_media_ids) as selected(media_id)
    where selected.media_id is null
  ) or (
    select count(distinct selected.media_id)::integer
    from unnest(v_media_ids) as selected(media_id)
  ) <> v_media_count then
    raise exception using
      errcode = 'P0001',
      message = 'experience_card_playback_selection_invalid';
  end if;

  if v_media_count > 0 then
    select count(*)::integer
    into v_valid_count
    from public.media as m
    where m.id = any(v_media_ids)
      and m.user_id = v_user_id
      and m.trashed_at is null
      and m.trash_entry_id is null
      and (
        coalesce(m.mime_type, '') like 'image/%'
        or lower(coalesce(m.type, '')) in ('image', 'photo')
      )
      and exists (
        select 1
        from public.experience_card_records as cr
        where cr.card_id = v_card.id
          and cr.record_id = m.record_id
      );

    if v_valid_count <> v_media_count then
      raise exception using
        errcode = 'P0001',
        message = 'experience_card_playback_selection_invalid';
    end if;
  end if;

  update public.experience_cards as c
  set playback_media_ids = v_media_ids
  where c.id = v_card.id;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_record_effectively_public(p_record_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is not null or (select auth.role()) = 'service_role') and exists (
    select 1
    from public.records r
    join public.archives a
      on a.id = r.archive_id
     and a.user_id = r.user_id
    left join public.record_moderation_states s
      on s.record_id = r.id
    where r.id = p_record_id
      and r.visibility = 'public'
      and a.is_public is true
      and r.trashed_at is null
      and r.trash_entry_id is null
      and a.trashed_at is null
      and a.trash_entry_id is null
      and coalesce(s.is_hidden, false) is false
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_experience_card_public(p_card_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ((select auth.uid()) is not null or (select auth.role()) = 'service_role') and exists (
    select 1
    from public.experience_cards c
    join public.archives a
      on a.id = c.archive_id
     and a.user_id = c.user_id
    where c.id = p_card_id
      and c.status = 'published'
      and c.published_at is not null
      and c.source_record_count >= 3
      and a.is_public is true
      and a.trashed_at is null
      and a.trash_entry_id is null
      and (
        select count(*)::integer
        from public.experience_card_records cr
        where cr.card_id = c.id
      ) = c.source_record_count
      and not exists (
        select 1
        from public.experience_card_records cr
        left join public.records r
          on r.id = cr.record_id
        where cr.card_id = c.id
          and (
            r.id is null
            or r.archive_id is distinct from c.archive_id
            or r.user_id is distinct from c.user_id
            or r.visibility is distinct from 'public'
            or r.trashed_at is not null
            or r.trash_entry_id is not null
            or not public.is_record_effectively_public(r.id)
          )
      )
  );
$function$;

alter policy "archive follows allow insert own" on public.archive_follows
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (select auth.uid()) is not null));

alter policy "comments_insert_own_active_visible_record" on public.comments
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (select auth.uid()) is not null AND can_access_record(record_id)));

alter policy "comments_update_own" on public.comments
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (select auth.uid()) is not null));

alter policy "experience_card_bookmarks_insert_active_member" on public.experience_card_bookmarks
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (select auth.uid()) is not null AND is_experience_card_public(card_id) AND (EXISTS ( SELECT 1
   FROM experience_cards c
  WHERE ((c.id = experience_card_bookmarks.card_id) AND (c.user_id <> ( SELECT auth.uid() AS uid)))))));

alter policy "experience_card_comments_insert_active_member" on public.experience_card_comments
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (select auth.uid()) is not null AND is_experience_card_public(card_id)));

alter policy "experience_card_comments_update_own" on public.experience_card_comments
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (select auth.uid()) is not null AND is_experience_card_public(card_id)));

alter policy "experience_card_helpful_insert_active_member" on public.experience_card_helpful_marks
  with check (((( SELECT auth.uid() AS uid) = user_id) AND (select auth.uid()) is not null AND is_experience_card_public(card_id) AND (EXISTS ( SELECT 1
   FROM experience_cards c
  WHERE ((c.id = experience_card_helpful_marks.card_id) AND (c.user_id <> ( SELECT auth.uid() AS uid)))))));

alter policy "experience_cards_update_description_owner_active" on public.experience_cards
  using (((user_id = ( SELECT auth.uid() AS uid)) AND (select auth.uid()) is not null))
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (select auth.uid()) is not null));

alter policy "allow insert own follow" on public.follows
  with check (((( SELECT auth.uid() AS uid) = follower_id) AND (select auth.uid()) is not null));
revoke select on public.guide_entries from anon, public;
revoke select(content,content_en) on public.guide_entries from anon, public;
grant select(id,category,name,normalized_name,source,created_at,updated_at,section_id,name_en,summary,summary_en,content_template,sort_order,is_active) on public.guide_entries to anon;

