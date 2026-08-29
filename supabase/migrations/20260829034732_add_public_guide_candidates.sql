-- A user-entered related guide is usable immediately in the user's archive.
-- It becomes an admin-review candidate only after three distinct users use it.

create or replace function public.normalize_guide_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create table if not exists public.guide_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  normalized_name text not null,
  source text not null default 'preset',
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guide_entries_category_check
    check (category in ('plant', 'system', 'insect_fish', 'other')),
  constraint guide_entries_source_check
    check (source in ('preset', 'approved')),
  constraint guide_entries_name_check
    check (char_length(btrim(name)) between 1 and 120),
  unique (category, normalized_name)
);

create table if not exists public.guide_candidates (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  normalized_name text not null,
  status text not null default 'personal',
  usage_count integer not null default 0,
  distinct_user_count integer not null default 0,
  review_threshold integer not null default 3,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  public_guide_id uuid references public.guide_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guide_candidates_category_check
    check (category in ('plant', 'system', 'insect_fish', 'other')),
  constraint guide_candidates_status_check
    check (status in ('personal', 'pending_review', 'approved', 'rejected')),
  constraint guide_candidates_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint guide_candidates_count_check
    check (usage_count >= 0 and distinct_user_count >= 0 and review_threshold >= 1),
  unique (category, normalized_name)
);

create table if not exists public.guide_candidate_usages (
  candidate_id uuid not null references public.guide_candidates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  archive_id uuid not null references public.archives(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (candidate_id, archive_id),
  unique (archive_id)
);

create index if not exists guide_candidates_review_queue_idx
  on public.guide_candidates (status, distinct_user_count desc, updated_at asc);

create index if not exists guide_candidate_usages_user_idx
  on public.guide_candidate_usages (user_id, created_at desc);

alter table public.guide_entries enable row level security;
alter table public.guide_candidates enable row level security;
alter table public.guide_candidate_usages enable row level security;

revoke all on table public.guide_entries from anon, authenticated;
revoke all on table public.guide_candidates from anon, authenticated;
revoke all on table public.guide_candidate_usages from anon, authenticated;
grant select on table public.guide_entries to anon, authenticated;
grant select on table public.guide_candidates to authenticated;
grant select on table public.guide_candidate_usages to authenticated;

create policy "guide entries public read"
  on public.guide_entries for select
  to anon, authenticated
  using (true);

create policy "guide entries admin insert"
  on public.guide_entries for insert
  to authenticated
  with check (public.is_app_admin(auth.uid()));

create policy "guide entries admin update"
  on public.guide_entries for update
  to authenticated
  using (public.is_app_admin(auth.uid()))
  with check (public.is_app_admin(auth.uid()));

create policy "guide entries admin delete"
  on public.guide_entries for delete
  to authenticated
  using (public.is_app_admin(auth.uid()));

create policy "guide candidates involved user read"
  on public.guide_candidates for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_app_admin(auth.uid())
    or exists (
      select 1
      from public.guide_candidate_usages usage
      where usage.candidate_id = guide_candidates.id
        and usage.user_id = auth.uid()
    )
  );

create policy "guide candidate usages own read"
  on public.guide_candidate_usages for select
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin(auth.uid()));

create or replace function public.refresh_guide_candidate_counts(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_count integer;
  v_distinct_user_count integer;
begin
  select count(*)::integer, count(distinct usage.user_id)::integer
  into v_usage_count, v_distinct_user_count
  from public.guide_candidate_usages usage
  where usage.candidate_id = p_candidate_id;

  update public.guide_candidates candidate
  set usage_count = coalesce(v_usage_count, 0),
      distinct_user_count = coalesce(v_distinct_user_count, 0),
      status = case
        when candidate.status = 'personal'
          and coalesce(v_distinct_user_count, 0) >= candidate.review_threshold
        then 'pending_review'
        else candidate.status
      end,
      updated_at = now()
  where candidate.id = p_candidate_id;
end;
$$;

create or replace function public.refresh_guide_candidate_counts_after_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_guide_candidate_counts(new.candidate_id);
  elsif tg_op = 'DELETE' then
    perform public.refresh_guide_candidate_counts(old.candidate_id);
  elsif new.candidate_id is distinct from old.candidate_id then
    perform public.refresh_guide_candidate_counts(old.candidate_id);
    perform public.refresh_guide_candidate_counts(new.candidate_id);
  end if;
  return null;
end;
$$;

drop trigger if exists guide_candidate_usages_refresh_counts
  on public.guide_candidate_usages;
create trigger guide_candidate_usages_refresh_counts
after insert or update of candidate_id or delete
on public.guide_candidate_usages
for each row execute function public.refresh_guide_candidate_counts_after_usage();

create or replace function public.track_archive_guide_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_normalized_name text;
  v_candidate_id uuid;
begin
  if tg_op = 'UPDATE' then
    delete from public.guide_candidate_usages usage
    where usage.archive_id = new.id;
  end if;

  v_name := case
    when new.category = 'plant' then new.species_name_snapshot
    else new.system_name
  end;
  v_name := btrim(coalesce(v_name, ''));
  v_normalized_name := public.normalize_guide_name(v_name);

  if v_normalized_name = '' or new.user_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.guide_entries entry
    where entry.category = new.category
      and entry.normalized_name = v_normalized_name
  ) then
    return new;
  end if;

  insert into public.guide_candidates (
    category,
    name,
    normalized_name,
    created_by
  )
  values (
    new.category,
    v_name,
    v_normalized_name,
    new.user_id
  )
  on conflict (category, normalized_name)
  do update set updated_at = now()
  returning id into v_candidate_id;

  insert into public.guide_candidate_usages (candidate_id, user_id, archive_id)
  values (v_candidate_id, new.user_id, new.id)
  on conflict (archive_id) do nothing;

  return new;
end;
$$;

drop trigger if exists archives_track_guide_usage on public.archives;
create trigger archives_track_guide_usage
after insert or update of category, species_name_snapshot, system_name
on public.archives
for each row execute function public.track_archive_guide_usage();

create or replace function public.list_pending_guide_candidates()
returns table (
  id uuid,
  category text,
  name text,
  usage_count integer,
  distinct_user_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin(auth.uid()) then
    raise exception 'not_authorized';
  end if;

  return query
  select candidate.id,
         candidate.category,
         candidate.name,
         candidate.usage_count,
         candidate.distinct_user_count,
         candidate.created_at,
         candidate.updated_at
  from public.guide_candidates candidate
  where candidate.status = 'pending_review'
  order by candidate.distinct_user_count desc,
           candidate.updated_at asc;
end;
$$;

create or replace function public.review_guide_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_candidate public.guide_candidates%rowtype;
  v_guide_id uuid;
begin
  if not public.is_app_admin(v_admin_id) then
    raise exception 'not_authorized';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_decision';
  end if;

  select * into v_candidate
  from public.guide_candidates candidate
  where candidate.id = p_candidate_id
    and candidate.status = 'pending_review'
  for update;

  if v_candidate.id is null then
    return false;
  end if;

  if p_decision = 'approve' then
    insert into public.guide_entries (
      category,
      name,
      normalized_name,
      source,
      created_by,
      approved_by
    )
    values (
      v_candidate.category,
      v_candidate.name,
      v_candidate.normalized_name,
      'approved',
      v_candidate.created_by,
      v_admin_id
    )
    on conflict (category, normalized_name)
    do update set updated_at = now()
    returning id into v_guide_id;

    update public.guide_candidates
    set status = 'approved',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_note = nullif(btrim(coalesce(p_review_note, '')), ''),
        public_guide_id = v_guide_id,
        updated_at = now()
    where id = p_candidate_id;
  else
    update public.guide_candidates
    set status = 'rejected',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_note = nullif(btrim(coalesce(p_review_note, '')), ''),
        updated_at = now()
    where id = p_candidate_id;
  end if;

  return true;
end;
$$;

revoke all on function public.refresh_guide_candidate_counts(uuid) from public, anon, authenticated;
revoke all on function public.refresh_guide_candidate_counts_after_usage() from public, anon, authenticated;
revoke all on function public.track_archive_guide_usage() from public, anon, authenticated;
revoke all on function public.list_pending_guide_candidates() from public, anon;
revoke all on function public.review_guide_candidate(uuid, text, text) from public, anon;
grant execute on function public.list_pending_guide_candidates() to authenticated;
grant execute on function public.review_guide_candidate(uuid, text, text) to authenticated;

insert into public.guide_entries (category, name, normalized_name, source)
select 'plant', source.name, public.normalize_guide_name(source.name), 'preset'
from (
  select distinct coalesce(nullif(btrim(species.common_name), ''), nullif(btrim(species.scientific_name), '')) as name
  from public.plant_species species
  where species.is_active = true
) source
where source.name is not null
on conflict (category, normalized_name) do nothing;

insert into public.guide_entries (category, name, normalized_name, source)
select source.category, source.name, public.normalize_guide_name(source.name), 'preset'
from (values
  ('system', '土培'),
  ('system', '水培'),
  ('system', '半水培'),
  ('system', '无土栽培'),
  ('system', '鱼菜共生'),
  ('system', '补光灯'),
  ('system', '育苗盒'),
  ('system', '花架'),
  ('system', '温室/小棚'),
  ('system', '滴灌'),
  ('insect_fish', '孔雀鱼'),
  ('insect_fish', '斗鱼'),
  ('insect_fish', '红绿灯鱼'),
  ('insect_fish', '瓢虫'),
  ('insect_fish', '蚜虫'),
  ('insect_fish', '白粉虱'),
  ('insect_fish', '蜗牛'),
  ('insect_fish', '米虾'),
  ('other', '自然观察'),
  ('other', '家庭手作'),
  ('other', '食物保存'),
  ('other', '环境记录')
) as source(category, name)
on conflict (category, normalized_name) do nothing;

-- Backfill existing project values without publishing them.
insert into public.guide_candidates (category, name, normalized_name, created_by)
select source.category,
       min(source.name),
       source.normalized_name,
       min(source.user_id::text)::uuid
from (
  select archive.category,
         case when archive.category = 'plant'
           then btrim(coalesce(archive.species_name_snapshot, ''))
           else btrim(coalesce(archive.system_name, ''))
         end as name,
         public.normalize_guide_name(
           case when archive.category = 'plant'
             then archive.species_name_snapshot
             else archive.system_name
           end
         ) as normalized_name,
         archive.user_id
  from public.archives archive
  where archive.category in ('plant', 'system', 'insect_fish', 'other')
) source
where source.normalized_name <> ''
  and not exists (
    select 1 from public.guide_entries entry
    where entry.category = source.category
      and entry.normalized_name = source.normalized_name
  )
group by source.category, source.normalized_name
on conflict (category, normalized_name) do nothing;

insert into public.guide_candidate_usages (candidate_id, user_id, archive_id, created_at)
select candidate.id, archive.user_id, archive.id, archive.created_at
from public.archives archive
join public.guide_candidates candidate
  on candidate.category = archive.category
 and candidate.normalized_name = public.normalize_guide_name(
   case when archive.category = 'plant'
     then archive.species_name_snapshot
     else archive.system_name
   end
 )
on conflict (archive_id) do nothing;

do $$
declare
  v_candidate_id uuid;
begin
  for v_candidate_id in select id from public.guide_candidates loop
    perform public.refresh_guide_candidate_counts(v_candidate_id);
  end loop;
end;
$$;

comment on table public.guide_entries is
  'Platform presets and admin-approved related guides visible in the public guide library.';
comment on table public.guide_candidates is
  'User-entered related guide candidates; automatically queued after three distinct users.';
