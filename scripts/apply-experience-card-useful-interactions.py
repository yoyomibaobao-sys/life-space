from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str, flags=0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"regex anchor not found or repeated: {label} ({count})")
    return updated


# ---------------------------------------------------------------------------
# Migration: comments, favorites, and useful marks for public experience cards.
# ---------------------------------------------------------------------------
migration_path = Path("supabase/migrations/20260802060000_add_experience_card_interactions.sql")
migration_path.write_text(r'''-- Public experience-card interactions.
--
-- Public cards can receive comments, private favorites and public aggregate
-- "useful" marks. The existing comment_flowers table remains in place for
-- backward compatibility, but the product language now treats those rows as
-- useful marks on answers to help records.

create table if not exists public.experience_card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.experience_cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_card_comments_content_check
    check (char_length(btrim(content)) between 1 and 1000)
);

create table if not exists public.experience_card_favorites (
  card_id uuid not null references public.experience_cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create table if not exists public.experience_card_useful_marks (
  card_id uuid not null references public.experience_cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create index if not exists experience_card_comments_card_created_idx
  on public.experience_card_comments (card_id, created_at, id);
create index if not exists experience_card_comments_user_created_idx
  on public.experience_card_comments (user_id, created_at desc, id desc);
create index if not exists experience_card_favorites_user_created_idx
  on public.experience_card_favorites (user_id, created_at desc, card_id);
create index if not exists experience_card_useful_user_created_idx
  on public.experience_card_useful_marks (user_id, created_at desc, card_id);

alter table public.experience_card_comments enable row level security;
alter table public.experience_card_favorites enable row level security;
alter table public.experience_card_useful_marks enable row level security;

drop trigger if exists trg_experience_card_comments_updated_at
  on public.experience_card_comments;
create trigger trg_experience_card_comments_updated_at
before update on public.experience_card_comments
for each row execute function public.set_updated_at();

drop policy if exists experience_card_comments_select_accessible
  on public.experience_card_comments;
create policy experience_card_comments_select_accessible
on public.experience_card_comments
for select
to anon, authenticated
using (public.can_access_experience_card(card_id));

drop policy if exists experience_card_comments_insert_public
  on public.experience_card_comments;
create policy experience_card_comments_insert_public
on public.experience_card_comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_active_cloud_access()
  and public.is_experience_card_public(card_id)
);

drop policy if exists experience_card_comments_update_own
  on public.experience_card_comments;
create policy experience_card_comments_update_own
on public.experience_card_comments
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and public.has_active_cloud_access()
  and public.is_experience_card_public(card_id)
);

drop policy if exists experience_card_comments_delete_author_or_card_owner
  on public.experience_card_comments;
create policy experience_card_comments_delete_author_or_card_owner
on public.experience_card_comments
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.experience_cards as c
    where c.id = card_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists experience_card_favorites_select_accessible
  on public.experience_card_favorites;
create policy experience_card_favorites_select_accessible
on public.experience_card_favorites
for select
to anon, authenticated
using (public.can_access_experience_card(card_id));

drop policy if exists experience_card_favorites_insert_own
  on public.experience_card_favorites;
create policy experience_card_favorites_insert_own
on public.experience_card_favorites
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_active_cloud_access()
  and public.is_experience_card_public(card_id)
);

drop policy if exists experience_card_favorites_delete_own
  on public.experience_card_favorites;
create policy experience_card_favorites_delete_own
on public.experience_card_favorites
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists experience_card_useful_select_accessible
  on public.experience_card_useful_marks;
create policy experience_card_useful_select_accessible
on public.experience_card_useful_marks
for select
to anon, authenticated
using (public.can_access_experience_card(card_id));

drop policy if exists experience_card_useful_insert_own
  on public.experience_card_useful_marks;
create policy experience_card_useful_insert_own
on public.experience_card_useful_marks
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_active_cloud_access()
  and public.is_experience_card_public(card_id)
  and not exists (
    select 1
    from public.experience_cards as c
    where c.id = card_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists experience_card_useful_delete_own
  on public.experience_card_useful_marks;
create policy experience_card_useful_delete_own
on public.experience_card_useful_marks
for delete
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.experience_card_comments from public, anon, authenticated;
revoke all on table public.experience_card_favorites from public, anon, authenticated;
revoke all on table public.experience_card_useful_marks from public, anon, authenticated;

grant select on table public.experience_card_comments to anon, authenticated;
grant insert, update, delete on table public.experience_card_comments to authenticated;
grant select on table public.experience_card_favorites to anon, authenticated;
grant insert, delete on table public.experience_card_favorites to authenticated;
grant select on table public.experience_card_useful_marks to anon, authenticated;
grant insert, delete on table public.experience_card_useful_marks to authenticated;
grant all on table public.experience_card_comments to service_role;
grant all on table public.experience_card_favorites to service_role;
grant all on table public.experience_card_useful_marks to service_role;

create or replace function public.get_user_useful_counts(p_user_id uuid)
returns table(received_count bigint, marked_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.comment_flowers as f
      where f.receiver_user_id = p_user_id
        and f.revoked_at is null
    ) + (
      select count(*)
      from public.experience_card_useful_marks as m
      join public.experience_cards as c on c.id = m.card_id
      where c.user_id = p_user_id
    ) as received_count,
    (
      select count(*)
      from public.comment_flowers as f
      where f.sender_user_id = p_user_id
        and f.revoked_at is null
    ) + (
      select count(*)
      from public.experience_card_useful_marks as m
      where m.user_id = p_user_id
    ) as marked_count;
$$;

revoke all on function public.get_user_useful_counts(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_user_useful_counts(uuid)
  to anon, authenticated, service_role;

comment on table public.experience_card_comments is
  'Comments attached to a currently public experience card.';
comment on table public.experience_card_favorites is
  'Per-user saved public experience cards.';
comment on table public.experience_card_useful_marks is
  'Public value signal for experience cards. Card authors cannot mark their own cards useful.';
comment on function public.get_user_useful_counts(uuid) is
  'Aggregate received and marked useful counts across help-answer marks and experience-card marks.';
''', encoding="utf-8")


# ---------------------------------------------------------------------------
# Shared date and metadata formatting.
# ---------------------------------------------------------------------------
Path("lib/activity-time.ts").write_text(r'''const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RECENT_DAY_LIMIT = 7;

function formatNumericDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCompactActivityTime(
  value?: string | number | Date | null,
  now = Date.now()
) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return "";

  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < HOUR_MS) {
    return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))}分钟前`;
  }
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}小时前`;
  if (elapsed < RECENT_DAY_LIMIT * DAY_MS) {
    return `${Math.floor(elapsed / DAY_MS)}天前`;
  }
  return formatNumericDate(date);
}

export function formatFullActivityTime(value?: string | number | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatNumericDate(date)} ${hours}:${minutes}`;
}
''', encoding="utf-8")

Path("components/ui/ProjectMetaLine.tsx").write_text(r'''import type { CSSProperties } from "react";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import { formatCompactActivityTime } from "@/lib/activity-time";

const compactNumberFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type MetaItem = {
  key: string;
  accessibleLabel: string;
  value: string | number;
  icon?: UiIconName;
  dateValue?: string | null;
};

export default function ProjectMetaLine({
  recordCount,
  durationDays,
  ended = false,
  viewCount,
  followerCount,
  commentCount,
  photoCount,
  projectCount,
  updatedAt,
  className,
  style,
}: {
  recordCount?: number | null;
  durationDays?: number | null;
  ended?: boolean;
  viewCount?: number | null;
  followerCount?: number | null;
  commentCount?: number | null;
  photoCount?: number | null;
  projectCount?: number | null;
  updatedAt?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const items: MetaItem[] = [];
  const normalizeCount = (value?: number | null) =>
    Math.max(0, Number(value) || 0);

  if (recordCount !== null && recordCount !== undefined) {
    const count = normalizeCount(recordCount);
    items.push({
      key: "record",
      accessibleLabel: `记录 ${count}`,
      value: `${compactNumberFormatter.format(count)}条记录`,
    });
  }

  if (durationDays !== null && durationDays !== undefined) {
    const days = Math.max(1, Math.round(Number(durationDays) || 1));
    const prefix = ended ? "历时" : "持续";
    items.push({
      key: "duration",
      accessibleLabel: `${prefix} ${days} 天`,
      value: `${prefix}${compactNumberFormatter.format(days)}天`,
    });
  }

  const addCount = (
    key: string,
    icon: UiIconName,
    label: string,
    value?: number | null
  ) => {
    if (value === null || value === undefined) return;
    const normalized = normalizeCount(value);
    items.push({
      key,
      icon,
      accessibleLabel: `${label} ${normalized}`,
      value: compactNumberFormatter.format(normalized),
    });
  };

  addCount("view", "view", "浏览", viewCount);
  addCount("follow", "follow", "关注", followerCount);
  addCount("comment", "comment", "评论", commentCount);
  addCount("photo", "image", "照片", photoCount);
  addCount("project", "project", "项目", projectCount);
  if (updatedAt) {
    items.push({
      key: "update",
      icon: "clock",
      accessibleLabel: `更新 ${formatCompactActivityTime(updatedAt)}`,
      value: "",
      dateValue: updatedAt,
    });
  }

  if (items.length === 0) return null;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "5px 10px",
        color: "#748171",
        fontSize: 12,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {items.map((item) => (
        <span
          key={item.key}
          aria-label={item.accessibleLabel}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {item.icon ? (
            <UiIcon name={item.icon} size={14} strokeWidth={1.75} />
          ) : null}
          {item.dateValue ? (
            <CompactActivityTime value={item.dateValue} />
          ) : (
            item.value
          )}
        </span>
      ))}
    </span>
  );
}
''', encoding="utf-8")


# ---------------------------------------------------------------------------
# Experience-card list presentation and timeline image-count wording.
# ---------------------------------------------------------------------------
Path("components/experience-card/ExperienceCardListCard.tsx").write_text(r'''import Link from "next/link";
import type { ReactNode } from "react";
import styles from "@/components/experience-card/ExperienceCardListCard.module.css";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";

export default function ExperienceCardListCard({
  item,
  dateText,
  dateValue,
  status,
  actions,
  showAuthor = false,
}: {
  item: ExperienceCardListItem;
  dateText?: string | null;
  dateValue?: string | null;
  status?: ReactNode;
  actions?: ReactNode;
  showAuthor?: boolean;
}) {
  const sourceText = showAuthor
    ? `${item.authorName} · ${item.archiveTitle}`
    : item.archiveTitle;
  const hasInteractions =
    item.usefulCount > 0 || item.favoriteCount > 0 || item.commentCount > 0;

  return (
    <div className={styles.card}>
      <Link href={`/experience-cards/${item.id}`} aria-label={item.title}>
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={`${item.title}封面`}
            className={styles.cover}
            loading="lazy"
          />
        ) : (
          <div className={styles.placeholder}>无图</div>
        )}
      </Link>

      <div className={styles.content}>
        {status || dateValue || dateText ? (
          <div className={styles.statusRow}>
            {status}
            {dateValue ? (
              <CompactActivityTime value={dateValue} fallback={dateText} />
            ) : dateText ? (
              <span>{dateText}</span>
            ) : null}
          </div>
        ) : null}
        <Link href={`/experience-cards/${item.id}`} className={styles.title}>
          {item.title}
        </Link>
        <p className={styles.source}>{sourceText}</p>
        <ProjectMetaLine
          recordCount={item.source_record_count}
          durationDays={item.durationDays}
          style={{ marginTop: 6 }}
        />
        {hasInteractions ? (
          <div className={styles.interactions}>
            {item.usefulCount > 0 ? <span>有用 {item.usefulCount}</span> : null}
            {item.favoriteCount > 0 ? <span>收藏 {item.favoriteCount}</span> : null}
            {item.commentCount > 0 ? <span>评论 {item.commentCount}</span> : null}
          </div>
        ) : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  );
}
''', encoding="utf-8")

Path("components/experience-card/ExperienceCardListCard.module.css").write_text(r'''.card {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  min-height: 112px;
  overflow: hidden;
  color: #2b382a;
  text-decoration: none;
  background: #fff;
  border: 1px solid #e1e8de;
  border-radius: 15px;
}

.cover,
.placeholder {
  width: 112px;
  height: 112px;
}

.cover {
  display: block;
  object-fit: cover;
}

.placeholder {
  display: grid;
  place-items: center;
  color: #82917f;
  background: linear-gradient(145deg, #edf4e8, #f8faf5);
}

.content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 112px;
  padding: 11px 13px;
}

.statusRow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: #748171;
  font-size: 12px;
}

.title {
  margin: 6px 0 3px;
  overflow: hidden;
  color: #2d3b2c;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source {
  margin: 0;
  overflow: hidden;
  color: #687664;
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.interactions,
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px 12px;
}

.interactions {
  margin-top: 6px;
  color: #748171;
  font-size: 12px;
}

.actions {
  margin-top: 9px;
}

@media (max-width: 520px) {
  .card {
    grid-template-columns: 92px minmax(0, 1fr);
    min-height: 104px;
  }

  .cover,
  .placeholder {
    width: 92px;
    height: 92px;
  }

  .content {
    min-height: 104px;
    padding: 10px 11px;
  }
}
''', encoding="utf-8")

# Update the timeline badge and keep its current compact layout.
timeline_path = Path("components/experience-card/ExperienceCardTimeline.tsx")
timeline = timeline_path.read_text(encoding="utf-8")
timeline = replace_once(
    timeline,
    '<span style={mediaCountStyle}>+{imageMedia.length - 1}</span>',
    '<span style={mediaCountStyle}>共{imageMedia.length}张</span>',
    "experience timeline total image count",
)
timeline_path.write_text(timeline, encoding="utf-8")


# ---------------------------------------------------------------------------
# Experience-card types and hydration: duration and interaction counts.
# ---------------------------------------------------------------------------
types_path = Path("lib/experience-card-types.ts")
types = types_path.read_text(encoding="utf-8")
types = replace_once(
    types,
    '''  authorCityName: string | null;\n};''',
    '''  authorCityName: string | null;\n  durationDays: number;\n  usefulCount: number;\n  favoriteCount: number;\n  commentCount: number;\n};''',
    "experience card list interaction fields",
)
types_path.write_text(types, encoding="utf-8")

cards_path = Path("lib/experience-cards.ts")
cards = cards_path.read_text(encoding="utf-8")ncards = cards.replace(
    '''type ExperienceCardListRelationRow = {\n  card_id: string;\n  record_id: string;\n};''',
    '''type ExperienceCardListRelationRow = {\n  card_id: string;\n  record_id: string;\n};\n\ntype ExperienceCardListRecordTimeRow = {\n  id: string;\n  record_time: string | null;\n};\n\ntype ExperienceCardListInteractionRow = {\n  card_id: string;\n};''',
    1,
)
if "type ExperienceCardListRecordTimeRow" not in cards:
    raise SystemExit("experience card list helper types not inserted")

hydrate_function = r'''export async function hydrateExperienceCardListItems(
  rows: ExperienceCardRow[]
): Promise<ExperienceCardListItem[]> {
  if (rows.length === 0) return [];

  const archiveIds = Array.from(new Set(rows.map((row) => row.archive_id)));
  const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const cardIds = rows.map((row) => row.id);

  const [
    archiveResult,
    profileResult,
    relationResult,
    usefulResult,
    favoriteResult,
    commentResult,
  ] = await Promise.all([
    supabase
      .from("archives")
      .select(
        "id, title, category, system_name, species_name_snapshot, cover_image_url, cover_image_path, cover_thumb_url, cover_thumb_path"
      )
      .in("id", archiveIds),
    supabase
      .from("public_profiles")
      .select(
        "id, username, avatar_url, country_code, country_name, region_name, city_name"
      )
      .in("id", authorIds),
    supabase
      .from("experience_card_records")
      .select("card_id, record_id")
      .in("card_id", cardIds),
    supabase
      .from("experience_card_useful_marks")
      .select("card_id")
      .in("card_id", cardIds),
    supabase
      .from("experience_card_favorites")
      .select("card_id")
      .in("card_id", cardIds),
    supabase
      .from("experience_card_comments")
      .select("card_id")
      .in("card_id", cardIds),
  ]);

  const archives = (archiveResult.data || []) as ExperienceCardListArchiveRow[];
  const profiles = (profileResult.data || []) as ExperienceCardListProfileRow[];
  const relations = (relationResult.data || []) as ExperienceCardListRelationRow[];
  const usefulRows = (usefulResult.data || []) as ExperienceCardListInteractionRow[];
  const favoriteRows = (favoriteResult.data || []) as ExperienceCardListInteractionRow[];
  const commentRows = (commentResult.data || []) as ExperienceCardListInteractionRow[];
  const archiveById = new Map(archives.map((archive) => [archive.id, archive]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const recordIds = Array.from(new Set(relations.map((row) => row.record_id)));
  const mediaByRecord = new Map<string, ExperienceCardMedia[]>();
  const recordTimeById = new Map<string, string>();

  if (recordIds.length > 0) {
    const [mediaResult, recordResult] = await Promise.all([
      supabase
        .from("media")
        .select(CARD_MEDIA_SELECT)
        .in("record_id", recordIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("records")
        .select("id, record_time")
        .in("id", recordIds),
    ]);
    const mediaRows = await attachMediaDisplayUrls(
      supabase,
      (mediaResult.data || []) as unknown as ExperienceCardMedia[]
    );

    mediaRows.forEach((media) => {
      const list = mediaByRecord.get(media.record_id) || [];
      list.push(media);
      mediaByRecord.set(media.record_id, list);
    });
    ((recordResult.data || []) as ExperienceCardListRecordTimeRow[]).forEach(
      (record) => {
        if (record.record_time) recordTimeById.set(record.id, record.record_time);
      }
    );
  }

  const archiveCoverRows = await attachMediaDisplayUrls(
    supabase,
    archives.map((archive) => ({
      id: archive.id,
      url: archive.cover_image_url,
      storage_path: archive.cover_image_path,
      thumb_url: archive.cover_thumb_url,
      thumb_path: archive.cover_thumb_path,
    }))
  );
  const archiveCoverById = new Map(
    archiveCoverRows.map((archive) => [
      archive.id,
      archive.display_thumb_url || archive.display_url || null,
    ])
  );
  const recordIdsByCard = new Map<string, string[]>();
  relations.forEach((relation) => {
    const list = recordIdsByCard.get(relation.card_id) || [];
    list.push(relation.record_id);
    recordIdsByCard.set(relation.card_id, list);
  });

  const countByCard = (items: ExperienceCardListInteractionRow[]) => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      counts.set(item.card_id, (counts.get(item.card_id) || 0) + 1);
    });
    return counts;
  };
  const usefulCountByCard = countByCard(usefulRows);
  const favoriteCountByCard = countByCard(favoriteRows);
  const commentCountByCard = countByCard(commentRows);

  return rows.map((row) => {
    const archive = archiveById.get(row.archive_id);
    const profile = profileById.get(row.user_id);
    const relatedRecordIds = recordIdsByCard.get(row.id) || [];
    const relatedMedia = relatedRecordIds.flatMap(
      (recordId) => mediaByRecord.get(recordId) || []
    );
    const preferredCover = row.cover_media_id
      ? relatedMedia.find((media) => media.id === row.cover_media_id)
      : null;
    const firstSourceCover = relatedRecordIds
      .map((recordId) => mediaByRecord.get(recordId)?.[0])
      .find(Boolean);
    const cover = preferredCover || firstSourceCover;
    const timestamps = relatedRecordIds
      .map((recordId) => recordTimeById.get(recordId))
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const durationDays = timestamps.length > 1
      ? Math.max(1, Math.floor((timestamps[timestamps.length - 1] - timestamps[0]) / 86400000) + 1)
      : 1;

    return {
      ...row,
      archiveTitle: archive?.title?.trim() || "来源项目当前不可用",
      archiveCategory: archive?.category || null,
      systemName:
        archive?.system_name?.trim() ||
        archive?.species_name_snapshot?.trim() ||
        null,
      coverUrl:
        cover?.display_thumb_url ||
        cover?.display_url ||
        archiveCoverById.get(row.archive_id) ||
        null,
      authorName: profile?.username?.trim() || "用户",
      authorAvatarUrl: profile?.avatar_url || null,
      authorRegion: joinExperienceCardRegion(profile),
      authorCountryCode: profile?.country_code || null,
      authorCountryName: profile?.country_name || null,
      authorRegionName: profile?.region_name || null,
      authorCityName: profile?.city_name || null,
      durationDays,
      usefulCount: usefulCountByCard.get(row.id) || 0,
      favoriteCount: favoriteCountByCard.get(row.id) || 0,
      commentCount: commentCountByCard.get(row.id) || 0,
    };
  });
}

'''
cards = regex_once(
    cards,
    r'export async function hydrateExperienceCardListItems\([\s\S]*?\n}\n\n(?=export function getExperienceCardStageLabel)',
    hydrate_function,
    "replace experience card hydration",
)
# ISO-style numeric date throughout the card timeline and detail.
cards = regex_once(
    cards,
    r'export function formatExperienceCardDate\(value\?: string \| null\) \{[\s\S]*?\n}\n',
    '''export function formatExperienceCardDate(value?: string | null) {\n  if (!value) return "";\n  const date = new Date(value);\n  if (Number.isNaN(date.getTime())) return "";\n  const year = date.getFullYear();\n  const month = String(date.getMonth() + 1).padStart(2, "0");\n  const day = String(date.getDate()).padStart(2, "0");\n  return `${year}-${month}-${day}`;\n}\n''',
    "numeric experience card date",
)
cards_path.write_text(cards, encoding="utf-8")


# ---------------------------------------------------------------------------
# Public experience-card interaction component.
# ---------------------------------------------------------------------------
Path("components/experience-card/ExperienceCardInteractions.tsx").write_text(r'''"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import { formatFullActivityTime } from "@/lib/activity-time";
import { PUBLIC_PROFILE_SELECT, type AppProfile } from "@/lib/domain-types";
import {
  canCreateMembershipContent,
  getCreateContentBlockedText,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import { supabase } from "@/lib/supabase";

type CardCommentRow = {
  id: string;
  card_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type CardCommentItem = CardCommentRow & {
  profile: Pick<AppProfile, "id" | "username" | "avatar_url"> | null;
};

export default function ExperienceCardInteractions({
  cardId,
  cardOwnerId,
  isPubliclyAvailable,
}: {
  cardId: string;
  cardOwnerId: string;
  isPubliclyAvailable: boolean;
}) {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usefulCount, setUsefulCount] = useState(0);
  const [usefulByMe, setUsefulByMe] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [favoritedByMe, setFavoritedByMe] = useState(false);
  const [comments, setComments] = useState<CardCommentItem[]>([]);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState<"useful" | "favorite" | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const isOwner = Boolean(viewerId && viewerId === cardOwnerId);
  const canWrite = Boolean(
    viewerId &&
      !membershipLoading &&
      canCreateMembershipContent(membership)
  );

  async function load() {
    if (!isPubliclyAvailable) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const nextViewerId = user?.id || null;
    setViewerId(nextViewerId);

    const [usefulResult, favoriteResult, commentResult] = await Promise.all([
      supabase
        .from("experience_card_useful_marks")
        .select("user_id")
        .eq("card_id", cardId),
      supabase
        .from("experience_card_favorites")
        .select("user_id")
        .eq("card_id", cardId),
      supabase
        .from("experience_card_comments")
        .select("id, card_id, user_id, content, created_at")
        .eq("card_id", cardId)
        .order("created_at", { ascending: true }),
    ]);

    const usefulRows = (usefulResult.data || []) as Array<{ user_id: string }>;
    const favoriteRows = (favoriteResult.data || []) as Array<{ user_id: string }>;
    const commentRows = (commentResult.data || []) as CardCommentRow[];
    const profileIds = Array.from(new Set(commentRows.map((item) => item.user_id)));
    const profileResult = profileIds.length
      ? await supabase
          .from("public_profiles")
          .select(PUBLIC_PROFILE_SELECT)
          .in("id", profileIds)
      : { data: [] as Pick<AppProfile, "id" | "username" | "avatar_url">[] };
    const profileMap = new Map(
      ((profileResult.data || []) as Pick<
        AppProfile,
        "id" | "username" | "avatar_url"
      >[]).map((profile) => [profile.id, profile])
    );

    setUsefulCount(usefulRows.length);
    setUsefulByMe(usefulRows.some((item) => item.user_id === nextViewerId));
    setFavoriteCount(favoriteRows.length);
    setFavoritedByMe(favoriteRows.some((item) => item.user_id === nextViewerId));
    setComments(
      commentRows.map((comment) => ({
        ...comment,
        profile: profileMap.get(comment.user_id) || null,
      }))
    );

    if (nextViewerId) {
      setMembershipLoading(true);
      const membershipResult = await supabase.rpc("get_my_membership");
      setMembership(
        membershipResult.error
          ? null
          : normalizeMembershipRpcResult(membershipResult.data)
      );
      setMembershipLoading(false);
    } else {
      setMembership(null);
      setMembershipLoading(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, isPubliclyAvailable]);

  function requireWriteAccess() {
    if (!viewerId) {
      showToast("请先登录");
      return false;
    }
    if (membershipLoading) {
      showToast("状态读取中");
      return false;
    }
    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return false;
    }
    return true;
  }

  async function toggleUseful() {
    if (isOwner || !requireWriteAccess() || busyAction) return;
    setBusyAction("useful");
    const result = usefulByMe
      ? await supabase
          .from("experience_card_useful_marks")
          .delete()
          .eq("card_id", cardId)
          .eq("user_id", viewerId)
      : await supabase.from("experience_card_useful_marks").insert({
          card_id: cardId,
          user_id: viewerId,
        });
    setBusyAction(null);

    if (result.error) {
      showToast(usefulByMe ? "取消有用标记失败" : "标记有用失败");
      return;
    }
    setUsefulByMe((value) => !value);
    setUsefulCount((value) => Math.max(0, value + (usefulByMe ? -1 : 1)));
  }

  async function toggleFavorite() {
    if (isOwner || !requireWriteAccess() || busyAction) return;
    setBusyAction("favorite");
    const result = favoritedByMe
      ? await supabase
          .from("experience_card_favorites")
          .delete()
          .eq("card_id", cardId)
          .eq("user_id", viewerId)
      : await supabase.from("experience_card_favorites").insert({
          card_id: cardId,
          user_id: viewerId,
        });
    setBusyAction(null);

    if (result.error) {
      showToast(favoritedByMe ? "取消收藏失败" : "收藏失败");
      return;
    }
    setFavoritedByMe((value) => !value);
    setFavoriteCount((value) => Math.max(0, value + (favoritedByMe ? -1 : 1)));
  }

  async function submitComment() {
    const content = commentText.trim();
    if (!content) {
      showToast("请输入评论");
      return;
    }
    if (!requireWriteAccess()) return;

    setSubmitting(true);
    const { error } = await supabase.from("experience_card_comments").insert({
      card_id: cardId,
      user_id: viewerId,
      content,
    });
    setSubmitting(false);
    if (error) {
      showToast("评论发送失败");
      return;
    }
    setCommentText("");
    showToast("评论已发送");
    await load();
    setCommentsExpanded(true);
  }

  async function deleteComment(comment: CardCommentItem) {
    if (!viewerId || (viewerId !== comment.user_id && viewerId !== cardOwnerId)) {
      showToast("你没有权限删除这条评论");
      return;
    }
    if (!window.confirm("确定删除这条评论吗？")) return;

    setDeletingCommentId(comment.id);
    const { error } = await supabase
      .from("experience_card_comments")
      .delete()
      .eq("id", comment.id);
    setDeletingCommentId(null);
    if (error) {
      showToast("评论删除失败");
      return;
    }
    setComments((items) => items.filter((item) => item.id !== comment.id));
    showToast("评论已删除");
  }

  const actionSummary = useMemo(
    () => [
      `有用 ${usefulCount}`,
      `收藏 ${favoriteCount}`,
      `评论 ${comments.length}`,
    ].join(" · "),
    [usefulCount, favoriteCount, comments.length]
  );

  if (!isPubliclyAvailable) return null;

  return (
    <section style={sectionStyle} aria-label="经验卡互动">
      <div style={actionRowStyle}>
        {isOwner ? (
          <span style={ownerSummaryStyle}>{actionSummary}</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void toggleUseful()}
              disabled={busyAction === "useful"}
              style={actionButtonStyle(usefulByMe)}
            >
              {usefulByMe ? <UiIcon name="check" size={14} /> : null}
              {usefulByMe ? "已标记有用" : "有用"} {usefulCount}
            </button>
            <button
              type="button"
              onClick={() => void toggleFavorite()}
              disabled={busyAction === "favorite"}
              style={actionButtonStyle(favoritedByMe)}
            >
              <UiIcon
                name={favoritedByMe ? "bookmark-filled" : "bookmark"}
                size={14}
              />
              {favoritedByMe ? "已收藏" : "收藏"} {favoriteCount}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setCommentsExpanded((value) => !value)}
          style={actionButtonStyle(commentsExpanded)}
        >
          <UiIcon name="comment" size={14} /> 评论 {comments.length}
        </button>
      </div>

      {commentsExpanded ? (
        <div style={commentsWrapStyle}>
          {loading ? (
            <div style={mutedStyle}>评论加载中...</div>
          ) : comments.length === 0 ? (
            <div style={mutedStyle}>暂无评论</div>
          ) : (
            <div style={commentListStyle}>
              {comments.map((comment) => {
                const username = comment.profile?.username || "用户";
                const canDelete = Boolean(
                  viewerId &&
                    (viewerId === comment.user_id || viewerId === cardOwnerId)
                );
                return (
                  <article key={comment.id} style={commentStyle}>
                    <div style={commentContentStyle}>{comment.content}</div>
                    <div style={commentMetaStyle}>
                      <Link
                        href={`/user/${comment.user_id}/profile`}
                        style={profileLinkStyle}
                      >
                        {username}
                      </Link>
                      <span>{formatFullActivityTime(comment.created_at)}</span>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void deleteComment(comment)}
                          disabled={deletingCommentId === comment.id}
                          style={deleteButtonStyle}
                        >
                          {deletingCommentId === comment.id ? "删除中" : "删除"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {canWrite ? (
            <div style={composerStyle}>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="写评论"
                rows={2}
                maxLength={1000}
                style={textareaStyle}
              />
              <button
                type="button"
                onClick={() => void submitComment()}
                disabled={submitting}
                style={submitButtonStyle}
              >
                {submitting ? "发送中..." : "发布评论"}
              </button>
            </div>
          ) : membershipLoading && viewerId ? (
            <div style={mutedStyle}>状态读取中...</div>
          ) : viewerId ? (
            <div style={mutedStyle}>
              {getCreateContentBlockedText(membership)}，
              <Link href="/membership" style={profileLinkStyle}>
                查看云空间
              </Link>
            </div>
          ) : (
            <div style={mutedStyle}>登录并开通云空间后可评论、收藏和标记有用。</div>
          )}
        </div>
      ) : null}
    </section>
  );
}

const sectionStyle: CSSProperties = {
  marginTop: 14,
  padding: 14,
  border: "1px solid #e0e8dd",
  borderRadius: 16,
  background: "#fff",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};

function actionButtonStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    padding: "7px 11px",
    border: active ? "1px solid #bcd3b5" : "1px solid #dfe6dc",
    borderRadius: 999,
    background: active ? "#f0f7ed" : "#fff",
    color: active ? "#365f32" : "#657163",
    fontSize: 12,
    fontWeight: 750,
    cursor: "pointer",
  };
}

const ownerSummaryStyle: CSSProperties = {
  color: "#687565",
  fontSize: 13,
};
const commentsWrapStyle: CSSProperties = { marginTop: 12 };
const commentListStyle: CSSProperties = { display: "grid", gap: 0 };
const commentStyle: CSSProperties = {
  padding: "9px 0",
  borderTop: "1px solid #edf1ea",
};
const commentContentStyle: CSSProperties = {
  color: "#2f3b2e",
  fontSize: 13,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};
const commentMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 7,
  marginTop: 5,
  color: "#8a9487",
  fontSize: 11,
};
const profileLinkStyle: CSSProperties = {
  color: "#4f7550",
  textDecoration: "none",
  fontWeight: 700,
};
const deleteButtonStyle: CSSProperties = {
  border: "none",
  padding: 0,
  background: "transparent",
  color: "#a36b62",
  fontSize: 11,
  cursor: "pointer",
};
const composerStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
};
const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #dce5d7",
  borderRadius: 12,
  padding: 10,
  background: "#fff",
  color: "#283428",
  fontSize: 13,
  resize: "vertical",
};
const submitButtonStyle: CSSProperties = {
  justifySelf: "end",
  minHeight: 36,
  padding: "7px 13px",
  border: "1px solid #cfe0c9",
  borderRadius: 999,
  background: "#f3f8f0",
  color: "#365f32",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};
const mutedStyle: CSSProperties = {
  color: "#7b8777",
  fontSize: 12,
  lineHeight: 1.7,
};
''', encoding="utf-8")


# Add interactions to the public card detail.
detail_path = Path("app/experience-cards/[id]/page.tsx")
detail = detail_path.read_text(encoding="utf-8")
detail = replace_once(
    detail,
    'import ExperienceCardTimeline from "@/components/experience-card/ExperienceCardTimeline";\n',
    'import ExperienceCardTimeline from "@/components/experience-card/ExperienceCardTimeline";\nimport ExperienceCardInteractions from "@/components/experience-card/ExperienceCardInteractions";\n',
    "experience detail interactions import",
)
detail = replace_once(
    detail,
    '''      </article>\n\n      {isOwner && !detail.sourceIsComplete ? (''',
    '''      </article>\n\n      <ExperienceCardInteractions\n        cardId={detail.card.id}\n        cardOwnerId={detail.card.user_id}\n        isPubliclyAvailable={detail.isPubliclyAvailable}\n      />\n\n      {isOwner && !detail.sourceIsComplete ? (''',
    "experience detail interactions placement",
)
detail_path.write_text(detail, encoding="utf-8")


# ---------------------------------------------------------------------------
# My experience cards: own cards plus a practical saved-card tab.
# ---------------------------------------------------------------------------
Path("app/experience-cards/page.tsx").write_text(r'''"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExperienceCardListCard from "@/components/experience-card/ExperienceCardListCard";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import {
  deleteExperienceCard,
  hydrateExperienceCardListItems,
  unpublishExperienceCard,
} from "@/lib/experience-cards";
import type {
  ExperienceCardListItem,
  ExperienceCardRow,
} from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";

type CardListItem = ExperienceCardListItem & {
  isPubliclyAvailable: boolean;
};
type PageTab = "owned" | "favorites";

export default function MyExperienceCardsPage() {
  const router = useRouter();
  const [items, setItems] = useState<CardListItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<ExperienceCardListItem[]>([]);
  const [tab, setTab] = useState<PageTab>("owned");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardListItem | null>(null);

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const [cardsResult, favoritesResult] = await Promise.all([
      supabase
        .from("experience_cards")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false }),
      supabase
        .from("experience_card_favorites")
        .select("card_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const rows = (cardsResult.data || []) as ExperienceCardRow[];
    const favoriteCardIds = (favoritesResult.data || [])
      .map((item) => item.card_id)
      .filter((id): id is string => typeof id === "string" && Boolean(id));
    const favoriteCardsResult = favoriteCardIds.length
      ? await supabase
          .from("experience_cards")
          .select("*")
          .in("id", favoriteCardIds)
      : { data: [] as ExperienceCardRow[] };

    const [hydratedRows, publicStates, hydratedFavorites] = await Promise.all([
      hydrateExperienceCardListItems(rows),
      Promise.all(
        rows.map(async (row) => {
          const { data } = await supabase.rpc("is_experience_card_public", {
            p_card_id: row.id,
          });
          return Boolean(Array.isArray(data) ? data[0] : data);
        })
      ),
      hydrateExperienceCardListItems(
        (favoriteCardsResult.data || []) as ExperienceCardRow[]
      ),
    ]);

    const favoriteOrder = new Map(
      favoriteCardIds.map((cardId, index) => [cardId, index])
    );
    setItems(
      hydratedRows.map((row, index) => ({
        ...row,
        isPubliclyAvailable: publicStates[index],
      }))
    );
    setFavoriteItems(
      hydratedFavorites.sort(
        (a, b) =>
          (favoriteOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (favoriteOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      )
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnpublish(item: CardListItem) {
    setBusyId(item.id);
    try {
      await unpublishExperienceCard(item.id);
      showToast("经验卡已取消公开");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteExperienceCard(deleteTarget.id);
      showToast("经验卡已删除，原记录不受影响");
      setDeleteTarget(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/archive" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> 我的项目
          </Link>
          <h1 style={titleStyle}>经验卡</h1>
          <p style={mutedStyle}>管理自己的经验卡，也可查看收藏的公开经验卡。</p>
        </div>
      </header>

      <nav style={tabRowStyle} aria-label="经验卡列表">
        <button
          type="button"
          onClick={() => setTab("owned")}
          style={tabButtonStyle(tab === "owned")}
        >
          我的经验卡 {items.length}
        </button>
        <button
          type="button"
          onClick={() => setTab("favorites")}
          style={tabButtonStyle(tab === "favorites")}
        >
          我的收藏 {favoriteItems.length}
        </button>
      </nav>

      {tab === "owned" ? (
        <section style={guideStyle}>
          新建经验卡请先进入一个云端项目，选择“生成经验卡”。每张卡选择3～12条记录，系统按原始日期排列。
        </section>
      ) : null}

      {loading ? (
        <section style={emptyStyle}>正在读取...</section>
      ) : tab === "owned" && items.length === 0 ? (
        <section style={emptyStyle}>
          <h2 style={emptyTitleStyle}>还没有经验卡</h2>
          <p style={mutedStyle}>
            当一个项目已经有起点、过程和结果记录后，就可以把它们串成一张经验卡。
          </p>
          <Link href="/archive" style={primaryLinkStyle}>选择项目</Link>
        </section>
      ) : tab === "favorites" && favoriteItems.length === 0 ? (
        <section style={emptyStyle}>
          <h2 style={emptyTitleStyle}>还没有收藏经验卡</h2>
          <p style={mutedStyle}>在公开经验卡中点击“收藏”，以后可以从这里再次打开。</p>
          <Link href="/discover/search?type=experience" style={primaryLinkStyle}>
            搜索经验卡
          </Link>
        </section>
      ) : tab === "owned" ? (
        <section style={listStyle}>
          {items.map((item) => (
            <ExperienceCardListCard
              key={item.id}
              item={item}
              dateValue={item.updated_at}
              status={
                <span style={statusStyle(item.isPubliclyAvailable)}>
                  {item.isPubliclyAvailable
                    ? "已公开"
                    : item.status === "published"
                      ? "公开已暂停"
                      : "私密草稿"}
                </span>
              }
              actions={
                <>
                  <Link href={`/experience-cards/${item.id}`} style={primaryLinkStyle}>查看</Link>
                  <Link href={`/experience-cards/${item.id}/edit`} style={secondaryLinkStyle}>修改</Link>
                  {item.status === "published" ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleUnpublish(item)}
                      style={secondaryButtonStyle}
                    >
                      取消公开
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => setDeleteTarget(item)}
                    style={dangerButtonStyle}
                  >
                    删除
                  </button>
                </>
              }
            />
          ))}
        </section>
      ) : (
        <section style={listStyle}>
          {favoriteItems.map((item) => (
            <ExperienceCardListCard
              key={item.id}
              item={item}
              dateValue={item.published_at}
              showAuthor
            />
          ))}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除经验卡"
        message="只删除经验卡及其引用关系，原项目、原记录和照片不会删除。"
        confirmText={busyId ? "删除中..." : "确认删除"}
        cancelText="取消"
        danger
        confirmDisabled={Boolean(busyId)}
        cancelDisabled={Boolean(busyId)}
        onClose={() => {
          if (!busyId) setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
      />
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "24px 16px 70px",
  color: "#283428",
};
const headerStyle: CSSProperties = { marginBottom: 14 };
const backLinkStyle: CSSProperties = {
  color: "#6c7869",
  textDecoration: "none",
  fontSize: 14,
};
const titleStyle: CSSProperties = { margin: "8px 0 5px", fontSize: 29 };
const mutedStyle: CSSProperties = {
  margin: 0,
  color: "#738071",
  fontSize: 14,
  lineHeight: 1.65,
};
const tabRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 12,
};
function tabButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 38,
    padding: "8px 13px",
    border: active ? "1px solid #a9c3a1" : "1px solid #dce5d8",
    borderRadius: 999,
    background: active ? "#edf5e9" : "#fff",
    color: active ? "#365f32" : "#687565",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  };
}
const guideStyle: CSSProperties = {
  padding: 13,
  marginBottom: 14,
  borderRadius: 14,
  background: "#f3f7f0",
  border: "1px solid #dfe8db",
  color: "#586d54",
  fontSize: 14,
  lineHeight: 1.7,
};
const listStyle: CSSProperties = { display: "grid", gap: 11 };
function statusStyle(isPublic: boolean): CSSProperties {
  return {
    padding: "4px 9px",
    borderRadius: 999,
    background: isPublic ? "#edf6e9" : "#f3f3ef",
    color: isPublic ? "#4d7348" : "#72766e",
    fontSize: 11,
    fontWeight: 800,
  };
}
const baseActionStyle: CSSProperties = {
  minHeight: 34,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};
const primaryLinkStyle: CSSProperties = {
  ...baseActionStyle,
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #64885e",
  background: "#64885e",
  color: "#fff",
  textDecoration: "none",
};
const secondaryLinkStyle: CSSProperties = {
  ...baseActionStyle,
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #d4dfd0",
  background: "#fff",
  color: "#50604d",
  textDecoration: "none",
};
const secondaryButtonStyle: CSSProperties = {
  ...baseActionStyle,
  border: "1px solid #d4dfd0",
  background: "#fff",
  color: "#50604d",
  cursor: "pointer",
};
const dangerButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  borderColor: "#ecd1ce",
  color: "#b1534f",
};
const emptyStyle: CSSProperties = {
  padding: 24,
  border: "1px solid #e0e8dd",
  borderRadius: 18,
  background: "#fff",
};
const emptyTitleStyle: CSSProperties = { margin: "0 0 7px", fontSize: 20 };
''', encoding="utf-8")


# ---------------------------------------------------------------------------
# Search: project results use the same compact row rhythm as record results;
# experience results retain project-like identity and duration information.
# ---------------------------------------------------------------------------
Path("components/discover-search/DiscoverSearchResults.tsx").write_text(r'''import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import ExperienceCardListCard from "@/components/experience-card/ExperienceCardListCard";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import type { DiscoverSearchKind } from "@/lib/discover-search-types";
import type { FeedItem } from "@/lib/discover-types";
import {
  ProjectCardRows,
  getFeedItemDisplayImageUrl,
} from "@/components/discover/DiscoverShared";
import UiIcon from "@/components/ui/UiIcon";
import { getDurationDays } from "@/lib/follow-utils";

type Props = {
  kind: DiscoverSearchKind;
  projectItems: DiscoveryProjectFeedItem[];
  recordItems: FeedItem[];
  experienceItems: ExperienceCardListItem[];
  loading: boolean;
  hasRun: boolean;
};

const kindLabels: Record<DiscoverSearchKind, { title: string; unit: string }> = {
  projects: { title: "项目", unit: "个" },
  records: { title: "记录", unit: "条" },
  experience: { title: "经验卡", unit: "张" },
};

function ProjectSearchRow({ item }: { item: DiscoveryProjectFeedItem }) {
  const title = item.archive_title?.trim() || "未命名项目";
  const owner = item.profile_display_name?.trim() || "用户";
  const region = item.profile_region?.trim();
  const durationDays = getDurationDays(
    item.archive_created_at,
    item.archive_ended_at
  );

  return (
    <a
      href={`/archive/${item.archive_id}`}
      style={resultLinkStyle}
      aria-label={`查看项目：${title}`}
    >
      {item.display_image_url ? (
        <img
          src={item.display_image_url}
          alt={title}
          loading="lazy"
          style={thumbStyle}
        />
      ) : (
        <div style={placeholderStyle}>
          <UiIcon name={getArchiveCategoryIcon(item.category)} size={20} />
        </div>
      )}
      <div style={compactContentStyle}>
        <strong style={compactTitleStyle}>{title}</strong>
        {item.card_summary ? (
          <span style={compactSummaryStyle}>{item.card_summary}</span>
        ) : null}
        <span style={compactOwnerStyle}>
          {owner}{region ? ` · ${region}` : ""}
          {item.public_activity_at ? (
            <>
              <span aria-hidden="true"> · </span>
              <CompactActivityTime value={item.public_activity_at} />
            </>
          ) : null}
        </span>
        <ProjectMetaLine
          recordCount={item.public_record_count}
          durationDays={durationDays}
          ended={Boolean(item.archive_ended_at)}
        />
      </div>
    </a>
  );
}

export default function DiscoverSearchResults({
  kind,
  projectItems,
  recordItems,
  experienceItems,
  loading,
  hasRun,
}: Props) {
  const itemCount =
    kind === "projects"
      ? projectItems.length
      : kind === "records"
        ? recordItems.length
        : experienceItems.length;
  const labels = kindLabels[kind];

  return (
    <section>
      <div style={resultHeadingStyle}>
        <span>{labels.title}</span>
        {hasRun && !loading ? <span>{itemCount} {labels.unit}</span> : null}
      </div>

      {loading ? (
        <div style={loadingStyle}>搜索中...</div>
      ) : hasRun && itemCount === 0 ? (
        <div style={emptyStyle}>没有找到符合条件的公开{labels.title}</div>
      ) : kind === "projects" ? (
        <div style={{ display: "grid", gap: 8 }}>
          {projectItems.map((item) => (
            <ProjectSearchRow key={item.archive_id} item={item} />
          ))}
        </div>
      ) : kind === "experience" ? (
        <div style={{ display: "grid", gap: 9 }}>
          {experienceItems.map((item) => (
            <ExperienceCardListCard
              key={item.id}
              item={item}
              dateValue={item.published_at}
              showAuthor
            />
          ))}
        </div>
      ) : (
        recordItems.map((record) => {
          const isHelp = record.status_tag === "help";
          const isResolved = record.status_tag === "resolved";
          const displayImageUrl = getFeedItemDisplayImageUrl(record);

          return (
            <a
              key={record.record_id}
              href={`/archive/${record.archive_id}?record=${record.record_id}`}
              style={{
                ...resultLinkStyle,
                background: isHelp ? "#fffaf6" : isResolved ? "#f5fbf6" : "#fff",
                border: isHelp
                  ? "1px solid #f0ddd4"
                  : isResolved
                    ? "1px solid #d7eadc"
                    : "1px solid #e8eee5",
              }}
            >
              {displayImageUrl ? (
                <img
                  src={displayImageUrl}
                  alt={record.archive_title || "记录图片"}
                  loading="lazy"
                  style={thumbStyle}
                />
              ) : (
                <div style={placeholderStyle}>
                  <UiIcon
                    name={getArchiveCategoryIcon(record.archive_category)}
                    size={20}
                  />
                </div>
              )}

              <ProjectCardRows
                record={record}
                imageHeight={58}
                titleFontSize={14}
                noteMaxLength={96}
                showUsername
              />
            </a>
          );
        })
      )}
    </section>
  );
}

const resultHeadingStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 9,
  color: "#6f7f6f",
  fontSize: 12,
} as const;
const loadingStyle = {
  padding: "22px 12px",
  textAlign: "center",
  color: "#8a998a",
  fontSize: 13,
} as const;
const emptyStyle = {
  padding: "28px 12px",
  textAlign: "center",
  color: "#8a998a",
  fontSize: 13,
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #edf2ea",
} as const;
const resultLinkStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: 9,
  marginBottom: 8,
  color: "#1f2d1f",
  textDecoration: "none",
  background: "#fff",
  border: "1px solid #e8eee5",
  borderRadius: 13,
} as const;
const thumbStyle = {
  width: 58,
  height: 58,
  objectFit: "cover",
  borderRadius: 9,
  flexShrink: 0,
} as const;
const placeholderStyle = {
  width: 58,
  height: 58,
  borderRadius: 9,
  flexShrink: 0,
  background: "#f5f8f4",
  color: "#9aaa9a",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;
const compactContentStyle = {
  display: "grid",
  gap: 3,
  minWidth: 0,
  flex: 1,
} as const;
const compactTitleStyle = {
  overflow: "hidden",
  color: "#263326",
  fontSize: 14,
  lineHeight: 1.35,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;
const compactSummaryStyle = {
  overflow: "hidden",
  color: "#556251",
  fontSize: 13,
  lineHeight: 1.45,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;
const compactOwnerStyle = {
  overflow: "hidden",
  color: "#7a8677",
  fontSize: 12,
  lineHeight: 1.4,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;
''', encoding="utf-8")


# ---------------------------------------------------------------------------
# Plant guide: split experience cards into mine and everyone else's public cards.
# ---------------------------------------------------------------------------
plant_path = Path("app/plant/[id]/page.tsx")
plant = plant_path.read_text(encoding="utf-8")
plant_section = r'''function PlantExperienceCardsSection({
  ownCards,
  publicCards,
  isLoggedIn,
}: {
  ownCards: PlantExperienceCardItem[];
  publicCards: PlantExperienceCardItem[];
  isLoggedIn: boolean;
}) {
  const emptyStyle = {
    padding: 18,
    border: "1px solid #eee",
    borderRadius: 14,
    color: "#888",
    background: "#fff",
  } as const;

  return (
    <Section title="经验卡">
      <Subsection title="我的经验卡">
        {!isLoggedIn ? (
          <div style={emptyStyle}>登录后可查看自己的经验卡。</div>
        ) : ownCards.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {ownCards.map((card) => (
              <ExperienceCardListCard
                key={card.id}
                item={card}
                dateValue={card.updated_at}
                status={
                  <span style={{ color: "#657565", fontSize: 12 }}>
                    {card.status === "published" ? "已发布" : "私密草稿"}
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <div style={emptyStyle}>你还没有与这个植物关联的经验卡。</div>
        )}
      </Subsection>

      <Subsection title="大家的公开经验卡">
        {publicCards.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {publicCards.map((card) => (
              <ExperienceCardListCard
                key={card.id}
                item={card}
                dateValue={card.published_at}
                showAuthor
              />
            ))}
          </div>
        ) : (
          <div style={emptyStyle}>还没有与这个植物关联的公开经验卡。</div>
        )}
      </Subsection>
    </Section>
  );
}

'''
plant = regex_once(
    plant,
    r'function PlantExperienceCardsSection\([\s\S]*?\n}\n\n(?=function PlantTabAccessNotice)',
    plant_section,
    "plant experience cards section",
)
plant = replace_once(
    plant,
    '''  const [relatedExperienceCards, setRelatedExperienceCards] = useState<\n    PlantExperienceCardItem[]\n  >([]);''',
    '''  const [ownExperienceCards, setOwnExperienceCards] = useState<\n    PlantExperienceCardItem[]\n  >([]);\n  const [publicExperienceCards, setPublicExperienceCards] = useState<\n    PlantExperienceCardItem[]\n  >([]);''',
    "plant experience card states",
)
old_load_pattern = r'''        const matchingArchiveRows = Array\.from\([\s\S]*?        } else \{\n          setRelatedExperienceCards\(\[\]\);\n        }'''
new_load = r'''        const matchingArchiveRows = Array.from(
          new Map(
            [
              ...((publicArchiveRows || []) as RelatedArchiveSourceRow[]),
              ...((ownArchiveRows || []) as RelatedArchiveSourceRow[]),
            ].map((archive) => [archive.id, archive])
          ).values()
        );
        const matchingArchiveIds = matchingArchiveRows.map((archive) => archive.id);
        if (matchingArchiveIds.length > 0) {
          let publicCardQuery = supabase
            .from("experience_cards")
            .select("*")
            .in("archive_id", matchingArchiveIds)
            .eq("status", "published")
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(RELATED_ARCHIVE_LIMIT);
          if (user) publicCardQuery = publicCardQuery.neq("user_id", user.id);

          const [publicCardResult, ownCardResult] = await Promise.all([
            publicCardQuery,
            user
              ? supabase
                  .from("experience_cards")
                  .select("*")
                  .in("archive_id", matchingArchiveIds)
                  .eq("user_id", user.id)
                  .order("updated_at", { ascending: false })
                  .limit(RELATED_ARCHIVE_LIMIT)
              : Promise.resolve({ data: [] as ExperienceCardRow[] }),
          ]);
          const candidatePublicRows = (publicCardResult.data || []) as ExperienceCardRow[];
          const publicStates = await Promise.all(
            candidatePublicRows.map(async (card) => {
              const { data } = await supabase.rpc("is_experience_card_public", {
                p_card_id: card.id,
              });
              return Boolean(Array.isArray(data) ? data[0] : data);
            })
          );
          const validPublicRows = candidatePublicRows.filter(
            (_card, index) => publicStates[index]
          );
          const [hydratedPublicCards, hydratedOwnCards] = await Promise.all([
            hydrateExperienceCardListItems(validPublicRows),
            hydrateExperienceCardListItems(
              (ownCardResult.data || []) as ExperienceCardRow[]
            ),
          ]);
          setPublicExperienceCards(hydratedPublicCards);
          setOwnExperienceCards(hydratedOwnCards);
        } else {
          setPublicExperienceCards([]);
          setOwnExperienceCards([]);
        }'''
plant = regex_once(
    plant,
    old_load_pattern,
    new_load,
    "plant experience card loading",
)
plant = replace_once(
    plant,
    '''        setRelatedExperienceCards([]);''',
    '''        setPublicExperienceCards([]);\n        setOwnExperienceCards([]);''',
    "plant no-access experience reset",
)
plant = replace_once(
    plant,
    '''          <PlantExperienceCardsSection cards={relatedExperienceCards} />''',
    '''          <PlantExperienceCardsSection\n            ownCards={ownExperienceCards}\n            publicCards={publicExperienceCards}\n            isLoggedIn={isSignedIn}\n          />''',
    "plant experience section render",
)
plant_path.write_text(plant, encoding="utf-8")


# ---------------------------------------------------------------------------
# Help-answer "flowers" become explicit useful marks without changing the
# backward-compatible table name.
# ---------------------------------------------------------------------------
comments_path = Path("components/archive-detail/ArchiveCommentsSection.tsx")
comments = comments_path.read_text(encoding="utf-8")
for old, new in [
    ("canAwardFlowers", "canMarkUseful"),
    ("flowerCount", "usefulCount"),
    ("myFlower", "myUsefulMark"),
    ("handleSendFlower", "handleMarkUseful"),
    ("handleRevokeFlower", "handleRemoveUseful"),
]:
    comments = comments.replace(old, new)

comments = regex_once(
    comments,
    r'  async function handleMarkUseful\(comment: CommentItem\) \{[\s\S]*?\n  }\n\n  async function handleRemoveUseful\(comment: CommentItem\) \{[\s\S]*?\n  }',
    r'''  async function handleMarkUseful(comment: CommentItem) {
    if (!currentUserId || !canMarkUseful) {
      showToast("只有求助记录的主人才能标记有用回答");
      return;
    }
    if (comment.user_id === currentUserId) {
      showToast("不能标记自己的评论");
      return;
    }
    if (comment.myUsefulMark && !comment.myUsefulMark.revoked_at) {
      showToast("这条回答已经标记有用");
      return;
    }

    if (membershipLoading) {
      showToast("状态读取中");
      return;
    }
    if (!canCreateMembershipContent(membership)) {
      showToast(getCreateContentBlockedText(membership));
      return;
    }

    const result = comment.myUsefulMark
      ? await supabase
          .from("comment_flowers")
          .update({ revoked_at: null, reason: "求助回答有用" })
          .eq("id", comment.myUsefulMark.id)
          .eq("sender_user_id", currentUserId)
      : await supabase.from("comment_flowers").insert({
          record_id: recordId,
          comment_id: comment.id,
          sender_user_id: currentUserId,
          receiver_user_id: comment.user_id,
          reason: "求助回答有用",
        });

    if (result.error) {
      showToast("标记有用失败");
      return;
    }
    showToast("已标记有用");
    await loadData();
  }

  async function handleRemoveUseful(comment: CommentItem) {
    const mark = comment.myUsefulMark;
    if (!mark || !currentUserId) return;

    const { error } = await supabase
      .from("comment_flowers")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", mark.id)
      .eq("sender_user_id", currentUserId);

    if (error) {
      showToast("取消有用标记失败");
      return;
    }
    showToast("已取消有用标记");
    await loadData();
  }''',
    "replace help useful handlers",
)
comments = regex_once(
    comments,
    r'  const commentHint = useMemo\(\(\) => \{[\s\S]*?\n  }, \[recordStatusTag\]\);',
    r'''  const commentHint = useMemo(() => {
    if (recordStatusTag === "help")
      return "记录主人可把真正有帮助的回答标记为有用。";
    if (recordStatusTag === "resolved")
      return "已解决的求助仍可补充标记有用回答。";
    return "";
  }, [recordStatusTag]);''',
    "help useful hint",
)
# Static count no longer uses a decorative flower icon.
comments = regex_once(
    comments,
    r'''\{comment\.usefulCount > 0 \? \(\n\s*<span style=\{\{ color: "#9d6f1f", whiteSpace: "nowrap" \}\}>\n\s*<UiIcon name="flower" size=\{13\} /> \{comment\.usefulCount\}\n\s*</span>\n\s*\) : null\}''',
    '''{comment.usefulCount > 0 ? (\n                      <span style={{ color: "#60705d", whiteSpace: "nowrap" }}>\n                        有用 {comment.usefulCount}\n                      </span>\n                    ) : null}''',
    "help useful count display",
)
# Replace the old send/revoke control block with a direct toggle.
comments = regex_once(
    comments,
    r'''\{canMarkUseful && comment\.user_id !== currentUserId \? \([\s\S]*?\n\s*\) : null\}''',
    r'''{canMarkUseful && comment.user_id !== currentUserId ? (
                      comment.myUsefulMark && !comment.myUsefulMark.revoked_at ? (
                        <button
                          type="button"
                          onClick={() => void handleRemoveUseful(comment)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#3f6b34",
                            fontSize: 12,
                            padding: 0,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <UiIcon name="check" size={13} /> 已标记有用
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleMarkUseful(comment)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#60705d",
                            fontSize: 12,
                            padding: 0,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          有用
                        </button>
                      )
                    ) : null}''',
    "help useful action display",
)
comments = comments.replace("记录主人可送花。", "记录主人可标记有用回答。")
comments = comments.replace("可补送花。", "仍可标记有用回答。")
comments = comments.replace("花朵记录可在", "有用来源可在")
comments = comments.replace("我的花朵", "我的有用")
comments = comments.replace("中追溯。", "中查看。")
comments_path.write_text(comments, encoding="utf-8")


# ---------------------------------------------------------------------------
# Profile useful-source page: help answers + experience cards.
# ---------------------------------------------------------------------------
Path("app/profile/flowers/page.tsx").write_text(r'''"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PUBLIC_PROFILE_SELECT } from "@/lib/domain-types";
import { formatProfileDateTime } from "@/lib/user-profile-shared";

type TabKey = "received" | "marked";
type UsefulSourceItem = {
  id: string;
  direction: TabKey;
  kind: "help" | "experience";
  createdAt: string;
  inactive: boolean;
  title: string;
  detail: string;
  counterpart: string;
  href: string | null;
};

type HelpMarkRow = {
  id: string;
  record_id: string;
  comment_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  created_at: string;
  revoked_at?: string | null;
};
type CardMarkRow = {
  card_id: string;
  user_id: string;
  created_at: string;
};

function ProfileUsefulContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab: TabKey = searchParams.get("tab") === "marked" ? "marked" : "received";
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UsefulSourceItem[]>([]);
  const [tab, setTab] = useState<TabKey>(defaultTab);

  useEffect(() => setTab(defaultTab), [defaultTab]);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const [helpResult, ownCardsResult, markedCardResult] = await Promise.all([
        supabase
          .from("comment_flowers")
          .select("id, record_id, comment_id, sender_user_id, receiver_user_id, created_at, revoked_at")
          .or(`receiver_user_id.eq.${user.id},sender_user_id.eq.${user.id}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("experience_cards")
          .select("id, title, user_id")
          .eq("user_id", user.id),
        supabase
          .from("experience_card_useful_marks")
          .select("card_id, user_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const helpRows = (helpResult.data || []) as HelpMarkRow[];
      const ownCards = (ownCardsResult.data || []) as Array<{
        id: string;
        title: string;
        user_id: string;
      }>;
      const markedCardRows = (markedCardResult.data || []) as CardMarkRow[];
      const ownCardIds = ownCards.map((card) => card.id);
      const receivedCardResult = ownCardIds.length
        ? await supabase
            .from("experience_card_useful_marks")
            .select("card_id, user_id, created_at")
            .in("card_id", ownCardIds)
            .order("created_at", { ascending: false })
        : { data: [] as CardMarkRow[] };
      const receivedCardRows = (receivedCardResult.data || []) as CardMarkRow[];

      const profileIds = Array.from(
        new Set([
          ...helpRows.flatMap((item) => [item.sender_user_id, item.receiver_user_id]),
          ...markedCardRows.map((item) => item.user_id),
          ...receivedCardRows.map((item) => item.user_id),
        ])
      );
      const commentIds = Array.from(new Set(helpRows.map((item) => item.comment_id)));
      const recordIds = Array.from(new Set(helpRows.map((item) => item.record_id)));
      const cardIds = Array.from(
        new Set([
          ...ownCardIds,
          ...markedCardRows.map((item) => item.card_id),
          ...receivedCardRows.map((item) => item.card_id),
        ])
      );

      const [profilesResult, commentsResult, recordsResult, cardsResult] = await Promise.all([
        profileIds.length
          ? supabase.from("public_profiles").select(PUBLIC_PROFILE_SELECT).in("id", profileIds)
          : Promise.resolve({ data: [] as Array<{ id: string; username?: string | null }> }),
        commentIds.length
          ? supabase.from("comments").select("id, content").in("id", commentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; content?: string | null }> }),
        recordIds.length
          ? supabase.from("records").select("id, note, archive_id").in("id", recordIds)
          : Promise.resolve({ data: [] as Array<{ id: string; note?: string | null; archive_id?: string | null }> }),
        cardIds.length
          ? supabase.from("experience_cards").select("id, title, user_id").in("id", cardIds)
          : Promise.resolve({ data: [] as Array<{ id: string; title?: string | null; user_id: string }> }),
      ]);

      const profileMap = new Map(
        ((profilesResult.data || []) as Array<{ id: string; username?: string | null }>).map(
          (profile) => [profile.id, profile.username || "用户"]
        )
      );
      const commentMap = new Map(
        ((commentsResult.data || []) as Array<{ id: string; content?: string | null }>).map(
          (comment) => [comment.id, comment.content || "评论内容当前不可见"]
        )
      );
      const recordMap = new Map(
        ((recordsResult.data || []) as Array<{
          id: string;
          note?: string | null;
          archive_id?: string | null;
        }>).map((record) => [
          record.id,
          { note: record.note || "求助记录没有文字", archiveId: record.archive_id || null },
        ])
      );
      const cardMap = new Map(
        ((cardsResult.data || []) as Array<{
          id: string;
          title?: string | null;
          user_id: string;
        }>).map((card) => [card.id, card])
      );

      const nextItems: UsefulSourceItem[] = [];
      helpRows.forEach((mark) => {
        const received = mark.receiver_user_id === user.id;
        const record = recordMap.get(mark.record_id);
        nextItems.push({
          id: `help-${mark.id}`,
          direction: received ? "received" : "marked",
          kind: "help",
          createdAt: mark.created_at,
          inactive: Boolean(mark.revoked_at),
          title: received
            ? `${profileMap.get(mark.sender_user_id) || "用户"}认为你的回答有用`
            : `你把${profileMap.get(mark.receiver_user_id) || "用户"}的回答标记为有用`,
          detail: commentMap.get(mark.comment_id) || "评论内容当前不可见",
          counterpart: record?.note || "求助记录当前不可见",
          href: record?.archiveId
            ? `/archive/${record.archiveId}?record=${mark.record_id}`
            : null,
        });
      });
      receivedCardRows.forEach((mark) => {
        const card = cardMap.get(mark.card_id);
        nextItems.push({
          id: `card-received-${mark.card_id}-${mark.user_id}`,
          direction: "received",
          kind: "experience",
          createdAt: mark.created_at,
          inactive: false,
          title: `${profileMap.get(mark.user_id) || "用户"}认为这张经验卡有用`,
          detail: card?.title || "经验卡当前不可用",
          counterpart: "经验卡有用标记",
          href: card ? `/experience-cards/${card.id}` : null,
        });
      });
      markedCardRows.forEach((mark) => {
        const card = cardMap.get(mark.card_id);
        nextItems.push({
          id: `card-marked-${mark.card_id}-${mark.user_id}`,
          direction: "marked",
          kind: "experience",
          createdAt: mark.created_at,
          inactive: false,
          title: "你把这张经验卡标记为有用",
          detail: card?.title || "经验卡当前不可用",
          counterpart: card ? `来自 ${profileMap.get(card.user_id) || "用户"}` : "来源当前不可见",
          href: card ? `/experience-cards/${card.id}` : null,
        });
      });

      nextItems.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setItems(nextItems);
      setLoading(false);
    }

    void load();
  }, [router]);

  const receivedItems = useMemo(
    () => items.filter((item) => item.direction === "received"),
    [items]
  );
  const markedItems = useMemo(
    () => items.filter((item) => item.direction === "marked"),
    [items]
  );
  const visibleItems = tab === "received" ? receivedItems : markedItems;
  const activeCount = visibleItems.filter((item) => !item.inactive).length;

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <div style={headerRowStyle}>
          <div>
            <div style={eyebrowStyle}>我的有用</div>
            <h1 style={titleStyle}>有用来源</h1>
            <div style={descriptionStyle}>
              同时汇总求助回答和经验卡的有用标记。取消的求助标记保留为历史记录。
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/profile" style={linkStyle}>返回资料页</Link>
            <Link href="/experience-cards" style={linkStyle}>经验卡</Link>
          </div>
        </div>

        <div style={tabRowStyle}>
          <TabButton active={tab === "received"} onClick={() => setTab("received")}>
            收到的有用（{receivedItems.length}）
          </TabButton>
          <TabButton active={tab === "marked"} onClick={() => setTab("marked")}>
            我标记的（{markedItems.length}）
          </TabButton>
        </div>

        <div style={statStyle}>当前有效：<strong>{activeCount}</strong></div>

        <div style={listStyle}>
          {loading ? (
            <div style={mutedStyle}>加载中...</div>
          ) : visibleItems.length === 0 ? (
            <div style={mutedStyle}>
              {tab === "received" ? "还没有收到有用标记" : "还没有标记过有用内容"}
            </div>
          ) : (
            visibleItems.map((item) => (
              <article key={item.id} style={itemStyle(item.inactive)}>
                <div style={itemHeadingStyle}>
                  <strong>{item.title}</strong>
                  <span style={kindBadgeStyle}>
                    {item.kind === "help" ? "求助回答" : "经验卡"}
                  </span>
                </div>
                <div style={itemDateStyle}>
                  {formatProfileDateTime(item.createdAt)}
                  {item.inactive ? " · 已取消" : ""}
                </div>
                <div style={itemDetailStyle}>{item.detail}</div>
                <div style={itemSourceStyle}>{item.counterpart}</div>
                {item.href ? (
                  <Link href={item.href} style={sourceLinkStyle}>查看来源</Link>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

export default function ProfileFlowersPage() {
  return (
    <Suspense fallback={<main style={pageStyle}><section style={shellStyle}>加载中...</section></main>}>
      <ProfileUsefulContent />
    </Suspense>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} style={tabButtonStyle(active)}>
      {children}
    </button>
  );
}

const pageStyle: CSSProperties = { maxWidth: 920, margin: "0 auto", padding: "24px 16px 48px" };
const shellStyle: CSSProperties = { background: "#fff", border: "1px solid #e7efe3", borderRadius: 20, padding: 24, boxShadow: "0 12px 28px rgba(32,56,24,0.06)" };
const headerRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { fontSize: 13, color: "#6d7968" };
const titleStyle: CSSProperties = { margin: "6px 0 0", fontSize: 28, color: "#1f2a1f" };
const descriptionStyle: CSSProperties = { marginTop: 8, fontSize: 14, color: "#62705d", lineHeight: 1.7 };
const tabRowStyle: CSSProperties = { marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
function tabButtonStyle(active: boolean): CSSProperties { return { border: active ? "1px solid #cadbbe" : "1px solid #dde7d8", background: active ? "#f4fbef" : "#fff", color: active ? "#31562d" : "#5d6e58", borderRadius: 999, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }; }
const statStyle: CSSProperties = { display: "inline-block", marginTop: 18, border: "1px solid #e2ebdd", background: "#f9fcf7", borderRadius: 999, padding: "9px 14px", fontSize: 13, color: "#50614b" };
const listStyle: CSSProperties = { marginTop: 20, display: "grid", gap: 12 };
function itemStyle(inactive: boolean): CSSProperties { return { border: "1px solid #e6ece2", borderRadius: 16, padding: 15, background: inactive ? "#fafafa" : "#fff", opacity: inactive ? 0.72 : 1 }; }
const itemHeadingStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", color: "#233022", fontSize: 15 };
const kindBadgeStyle: CSSProperties = { padding: "3px 8px", borderRadius: 999, background: "#f0f5ed", color: "#5c7057", fontSize: 11, fontWeight: 800 };
const itemDateStyle: CSSProperties = { marginTop: 5, color: "#7d8879", fontSize: 12 };
const itemDetailStyle: CSSProperties = { marginTop: 10, color: "#2f3b2e", fontSize: 14, lineHeight: 1.65 };
const itemSourceStyle: CSSProperties = { marginTop: 5, color: "#7a8677", fontSize: 12, lineHeight: 1.5 };
const linkStyle: CSSProperties = { textDecoration: "none", border: "1px solid #d7e2d2", background: "#fff", color: "#40583a", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700 };
const sourceLinkStyle: CSSProperties = { display: "inline-flex", marginTop: 10, color: "#4c7447", fontSize: 12, fontWeight: 800, textDecoration: "none" };
const mutedStyle: CSSProperties = { color: "#6f7b69", lineHeight: 1.8 };
''', encoding="utf-8")


# Profile aggregate counts now include both useful sources.
profile_shared_path = Path("lib/user-profile-shared.ts")
profile_shared = profile_shared_path.read_text(encoding="utf-8")
profile_shared = replace_once(
    profile_shared,
    '''    receivedFlowersResult,\n    sentFlowersResult,''',
    '''    usefulCountsResult,''',
    "profile useful count result destructuring",
)
profile_shared = replace_once(
    profile_shared,
    '''    supabase.from("comment_flowers").select("*", { count: "exact", head: true }).eq("receiver_user_id", userId).is("revoked_at", null),\n    supabase.from("comment_flowers").select("*", { count: "exact", head: true }).eq("sender_user_id", userId).is("revoked_at", null),''',
    '''    supabase.rpc("get_user_useful_counts", { p_user_id: userId }),''',
    "profile useful count rpc",
)
profile_shared = replace_once(
    profile_shared,
    '''  const plans = (plansResult.data || []) as UserPlantPlanRow[];''',
    '''  const usefulCounts = Array.isArray(usefulCountsResult.data)\n    ? usefulCountsResult.data[0]\n    : usefulCountsResult.data;\n  const plans = (plansResult.data || []) as UserPlantPlanRow[];''',
    "profile useful count normalization",
)
profile_shared = replace_once(
    profile_shared,
    '''      receivedFlowerCount: receivedFlowersResult.count || 0,\n      sentFlowerCount: sentFlowersResult.count || 0,''',
    '''      receivedFlowerCount: Number(usefulCounts?.received_count || 0),\n      sentFlowerCount: Number(usefulCounts?.marked_count || 0),''',
    "profile useful count values",
)
profile_shared_path.write_text(profile_shared, encoding="utf-8")

# Remove decorative flower language from user/profile surfaces while keeping the
# existing internal fields and route compatible.
profile_paths = [
    Path("app/profile/page.tsx"),
    Path("app/user/[id]/page.tsx"),
    Path("app/user/[id]/profile/page.tsx"),
    Path("components/user-space/UserProfileCard.tsx"),
    Path("components/user-space/UserSpaceHeader.tsx"),
]
for path in profile_paths:
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    text = text.replace("我的花朵", "我的有用")
    text = text.replace("收到花朵", "获得有用")
    text = text.replace("送出花朵", "标记有用")
    text = text.replace('label="花朵"', 'label="获得有用"')
    text = re.sub(r'<UiIcon name="flower"[^>]*/>\s*', '', text)
    text = text.replace(
        '{Number(profile.flower_count || 0)}',
        '{Number(stats?.receivedFlowerCount || 0)}',
    )
    path.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Product rules and regression tests.
# ---------------------------------------------------------------------------
agents_path = Path("AGENTS.md")
agents = agents_path.read_text(encoding="utf-8")
append_rules = '''\n## 经验卡互动与有用标记（2026-08-02）\n\n* 公开经验卡支持“有用、收藏、评论、分享”；私密草稿不开放公共互动。\n* “有用”是内容参考价值，不等同普通点赞。默认显示“有用 数量”，本人标记后显示勾选状态“已标记有用”。经验卡作者不能给自己的经验卡标记有用。\n* 原求助评论中的“送花”统一改称“标记有用”，数据库表名为兼容历史数据可暂时保留。个人空间的有用来源同时汇总“求助回答有用”和“经验卡有用”。\n* 指引中的经验卡与种植项目一致，分为“我的经验卡”和“大家的公开经验卡”。\n* 经验卡列表封面保持固定方形，不随操作区拉长；多图角标显示总张数，不使用“+1”缩写。\n* 卡片日期使用中文相对时间或 YYYY-MM-DD 数字日期；记录数和持续天数使用“3条记录”“持续130天”等直白文字。\n* 发现搜索中的项目使用与记录一致的紧凑列表节奏；经验卡显示用户名、经验卡名、来源项目、记录数和时长。\n'''
if "## 经验卡互动与有用标记（2026-08-02）" not in agents:
    agents += append_rules
agents_path.write_text(agents, encoding="utf-8")

Path("tests/experience-card-useful-interactions.test.mjs").write_text(r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("experience cards use compact fixed covers and explicit image totals", async () => {
  const [css, timeline, cards] = await Promise.all([
    source("components/experience-card/ExperienceCardListCard.module.css"),
    source("components/experience-card/ExperienceCardTimeline.tsx"),
    source("lib/experience-cards.ts"),
  ]);
  assert.match(css, /height: 112px/);
  assert.doesNotMatch(css, /height: 100%/);
  assert.match(timeline, /共\{imageMedia\.length\}张/);
  assert.doesNotMatch(timeline, />\+\{imageMedia\.length - 1\}</);
  assert.match(cards, /来源项目当前不可用/);
});

test("card dates and primary metadata use direct Chinese wording", async () => {
  const [time, meta, card] = await Promise.all([
    source("lib/activity-time.ts"),
    source("components/ui/ProjectMetaLine.tsx"),
    source("components/experience-card/ExperienceCardListCard.tsx"),
  ]);
  assert.match(time, /分钟前/);
  assert.match(time, /小时前/);
  assert.match(time, /天前/);
  assert.match(time, /return `\$\{year\}-\$\{month\}-\$\{day\}`/);
  assert.doesNotMatch(time, /en-US/);
  assert.match(meta, /条记录/);
  assert.match(meta, /持续/);
  assert.match(meta, /天`/);
  assert.doesNotMatch(meta, /\}d`/);
  assert.match(card, /durationDays=\{item\.durationDays\}/);
  assert.match(card, /\$\{item\.authorName\} · \$\{item\.archiveTitle\}/);
});

test("experience-card comments favorites and useful marks are access controlled", async () => {
  const [migration, interactions, detail] = await Promise.all([
    source("supabase/migrations/20260802060000_add_experience_card_interactions.sql"),
    source("components/experience-card/ExperienceCardInteractions.tsx"),
    source("app/experience-cards/[id]/page.tsx"),
  ]);
  assert.match(migration, /create table if not exists public\.experience_card_comments/);
  assert.match(migration, /create table if not exists public\.experience_card_favorites/);
  assert.match(migration, /create table if not exists public\.experience_card_useful_marks/);
  assert.match(migration, /has_active_cloud_access\(\)/);
  assert.match(migration, /is_experience_card_public\(card_id\)/);
  assert.match(interactions, /已标记有用/);
  assert.match(interactions, /已收藏/);
  assert.match(interactions, /发布评论/);
  assert.match(detail, /ExperienceCardInteractions/);
});

test("help flowers are presented as useful marks and sources include both kinds", async () => {
  const [comments, sources, shared] = await Promise.all([
    source("components/archive-detail/ArchiveCommentsSection.tsx"),
    source("app/profile/flowers/page.tsx"),
    source("lib/user-profile-shared.ts"),
  ]);
  assert.doesNotMatch(comments, /送花|我的花朵|已送花/);
  assert.match(comments, /已标记有用/);
  assert.match(comments, /求助回答有用/);
  assert.match(sources, /求助回答/);
  assert.match(sources, /经验卡/);
  assert.match(sources, /收到的有用/);
  assert.match(shared, /get_user_useful_counts/);
});

test("guidance separates own and public experience cards and search remains compact", async () => {
  const [plant, search] = await Promise.all([
    source("app/plant/[id]/page.tsx"),
    source("components/discover-search/DiscoverSearchResults.tsx"),
  ]);
  assert.match(plant, /我的经验卡/);
  assert.match(plant, /大家的公开经验卡/);
  assert.match(plant, /ownExperienceCards/);
  assert.match(plant, /publicExperienceCards/);
  assert.match(search, /function ProjectSearchRow/);
  assert.doesNotMatch(search, /DiscoverProjectCard/);
  assert.match(search, /ExperienceCardListCard/);
});
''', encoding="utf-8")

print("experience-card useful interaction patch applied")
