-- LOCAL SUPABASE ONLY. Catalog assertions for the live Experience playback manifest.

do $$
declare
  v_definition text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'experience_cards'
      and column_name = 'playback_media_ids'
      and data_type = 'ARRAY'
      and udt_name = '_uuid'
      and is_nullable = 'YES'
  ) then
    raise exception 'experience playback manifest column is missing or invalid';
  end if;

  if not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'save_experience_card_playback_selection'
      and p.prosecdef
      and exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as setting
        where setting = 'search_path=""'
           or setting = 'search_path='
      )
  ) then
    raise exception 'experience playback manifest function is missing or unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.save_experience_card_playback_selection(uuid,uuid[])',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.save_experience_card_playback_selection(uuid,uuid[])',
       'execute'
     ) then
    raise exception 'experience playback manifest grants are invalid';
  end if;

  select pg_get_functiondef(
    'public.save_experience_card_playback_selection(uuid,uuid[])'::regprocedure
  ) into v_definition;

  v_definition := lower(v_definition);

  if v_definition not like '%is_user_membership_active%'
     or v_definition not like '%v_card.user_id is distinct from v_user_id%'
     or v_definition not like '%m.id = any(v_media_ids)%'
     or v_definition not like '%cr.record_id = m.record_id%'
     or v_definition like '%storage.objects%'
     or v_definition like '%.mp4%' then
    raise exception 'experience playback manifest validation is incomplete';
  end if;
end;
$$;
