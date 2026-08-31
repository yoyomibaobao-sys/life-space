-- LOCAL / ISOLATED SUPABASE ONLY. Every fixture is rolled back.
begin;

do $$
begin
  if (
    select count(*) from public.guide_entries entry
    join public.guide_sections section on section.id = entry.section_id
    where entry.category = 'system' and section.slug = 'soil_compost'
      and entry.name in ('沤肥', '腐叶土', '蚯蚓堆肥', '绿肥种植与还田', '覆盖与秸秆还田', '板结改良', '排水改良', '土壤酸碱调整', '焖烧土堆')
      and entry.is_active and entry.source = 'preset'
      and length(entry.name_en) > 0 and length(entry.summary_en) > 0
  ) <> 9 then
    raise exception 'Nine bilingual soil presets must be in the existing soil section';
  end if;
end;
$$;

create temporary table soil_guides_before_repeat as
select entry.id, to_jsonb(entry) as row_data from public.guide_entries entry;

\ir ../migrations/20260831084807_expand_soil_practice_guides.sql

do $$
begin
  if exists (
    select 1 from soil_guides_before_repeat original
    full join public.guide_entries entry on entry.id = original.id
    where to_jsonb(entry) is distinct from original.row_data
  ) then
    raise exception 'Repeating the preset migration must not change any existing guide';
  end if;
end;
$$;

-- Simulate an administrator approving, editing, and hiding a colliding name.
update public.guide_entries
set source = 'approved', is_active = false,
    name_en = 'Reviewed fixture', summary = '保留管理员概要',
    content = '{"sections":[{"title":"保留内容","items":["管理员已核对"]}]}',
    content_en = '{"overview":"Keep the reviewed English text"}', sort_order = 999
where category = 'system' and normalized_name = public.normalize_guide_name('沤肥');

-- One genuinely absent name should still be inserted on a partially filled DB.
delete from public.guide_entries
where category = 'system' and normalized_name = public.normalize_guide_name('蚯蚓堆肥');

create temporary table soil_guides_before_partial as
select entry.id, to_jsonb(entry) as row_data from public.guide_entries entry;

\ir ../migrations/20260831084807_expand_soil_practice_guides.sql

do $$
begin
  if exists (
    select 1 from soil_guides_before_partial original
    left join public.guide_entries entry on entry.id = original.id
    where to_jsonb(entry) is distinct from original.row_data
  ) then
    raise exception 'Presets must preserve IDs, approval, visibility, and edited contents';
  end if;
  if (select count(*) from public.guide_entries) <> (select count(*) + 1 from soil_guides_before_partial) then
    raise exception 'Only the missing preset should be inserted';
  end if;
end;
$$;

set local role anon;
do $$
begin
  if exists (select 1 from public.guide_entries where category = 'system' and name = '沤肥') then
    raise exception 'A hidden guide must stay hidden from public readers';
  end if;
  if (select count(*) from public.guide_entries where category = 'system' and name = '蚯蚓堆肥') <> 1 then
    raise exception 'The newly inserted active guide must be publicly readable';
  end if;
end;
$$;
reset role;

rollback;
