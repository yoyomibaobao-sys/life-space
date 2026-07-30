import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260730075346_add_experience_cards_v1.sql";

test("experience cards reference 3-12 source records without copying content or media", async () => {
  const migration = await source(migrationPath);
  const cardTable =
    migration.match(
      /create table if not exists public\.experience_cards[\s\S]*?\n\);/
    )?.[0] ?? "";
  const relationTable =
    migration.match(
      /create table if not exists public\.experience_card_records[\s\S]*?\n\);/
    )?.[0] ?? "";

  assert.match(cardTable, /archive_id uuid not null/i);
  assert.match(cardTable, /source_record_count smallint not null/i);
  assert.match(cardTable, /check \(source_record_count between 3 and 12\)/i);
  assert.match(cardTable, /cover_media_id uuid references public\.media/i);
  assert.doesNotMatch(cardTable, /\b(note|body|media_url|photo_url)\b/i);

  assert.match(relationTable, /record_id uuid not null/i);
  assert.match(relationTable, /references public\.records\(id\) on delete cascade/i);
  assert.match(relationTable, /primary key \(card_id, record_id\)/i);
  assert.doesNotMatch(relationTable, /\b(note|body|media_url|photo_url)\b/i);
});

test("experience-card RLS keeps drafts private and gates public reads on every source", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /alter table public\.experience_cards enable row level security/i
  );
  assert.match(
    migration,
    /alter table public\.experience_card_records enable row level security/i
  );
  assert.match(
    migration,
    /create policy experience_cards_select_owner_or_public[\s\S]*?user_id = \(select auth\.uid\(\)\)[\s\S]*?public\.is_experience_card_public\(id\)/i
  );
  assert.match(
    migration,
    /c\.status = 'published'[\s\S]*?a\.is_public is true[\s\S]*?r\.visibility is distinct from 'public'[\s\S]*?r\.trashed_at is not null/i
  );
  assert.match(
    migration,
    /count\(\*\)::integer[\s\S]*?= c\.source_record_count/i
  );
  assert.match(
    migration,
    /grant select on table public\.experience_cards\s+to anon, authenticated/i
  );
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete).*experience_cards.*authenticated/i
  );
});

test("card mutations are atomic RPCs with active-cloud and ownership checks", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /create or replace function public\.save_experience_card/i
  );
  assert.match(
    migration,
    /not public\.is_user_membership_active\(v_user_id\)[\s\S]*?experience_card_cloud_access_required/i
  );
  assert.match(
    migration,
    /perform private\.validate_experience_card_selection/i
  );
  assert.match(
    migration,
    /update public\.experience_cards[\s\S]*?status = 'draft'[\s\S]*?published_at = null/i
  );
  assert.match(
    migration,
    /create or replace function public\.publish_experience_card/i
  );
  assert.match(
    migration,
    /update public\.archives[\s\S]*?set is_public = true/i
  );
  assert.match(
    migration,
    /update public\.records[\s\S]*?set visibility = 'public'[\s\S]*?r\.id = any\(v_record_ids\)/i
  );
  assert.match(
    migration,
    /create or replace function public\.unpublish_experience_card/i
  );
  assert.match(
    migration,
    /create or replace function public\.delete_experience_card/i
  );
});

test("the experience-card UI covers selection, preview, publication, source links, and sharing", async () => {
  const [editor, detail, timeline, list, archiveHeader] = await Promise.all([
    source("components/experience-card/ExperienceCardEditor.tsx"),
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardTimeline.tsx"),
    source("app/experience-cards/page.tsx"),
    source("components/archive-detail/ArchiveDetailHeader.tsx"),
  ]);

  assert.match(editor, /请选择3～12条记录|3～12条/);
  assert.match(editor, /保存草稿/);
  assert.match(editor, /预览/);
  assert.match(editor, /发布经验卡/);
  assert.match(editor, /其他未选择的记录仍保持原来的可见性/);
  assert.match(detail, /直接分享/);
  assert.match(detail, /取消公开/);
  assert.match(detail, /来源记录已经变化/);
  assert.match(timeline, /查看原记录/);
  assert.match(timeline, /getExperienceCardStageLabel/);
  assert.match(list, /我的经验卡/);
  assert.match(archiveHeader, /生成经验卡/);
});

test("experience cards have a persistent personal-space entry", async () => {
  const [profile, navbar] = await Promise.all([
    source("app/profile/page.tsx"),
    source("components/navbar.tsx"),
  ]);

  assert.match(profile, /href="\/experience-cards"/);
  assert.match(profile, /label="我的经验卡"/);
  assert.match(navbar, /activePaths: \["\/archive", "\/experience-cards"\]/);
  assert.match(navbar, /pathname\.startsWith\("\/experience-cards"\)/);
});
