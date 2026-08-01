import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260730090616_add_experience_cards_v1.sql";

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
  assert.doesNotMatch(timeline, /查看原记录/);
  assert.match(timeline, /getExperienceCardStageLabel/);
  assert.match(detail, /href=\{`\/archive\/\$\{detail\.archive\.id\}`\}/);
  assert.match(detail, /href=\{guideHref\}/);
  assert.match(list, /我的经验卡/);
  assert.match(archiveHeader, /生成经验卡/);
});

test("experience cards have a persistent personal-space entry", async () => {
  const [profile, navbar, archivePage, archiveCards] = await Promise.all([
    source("app/profile/page.tsx"),
    source("components/navbar.tsx"),
    source("app/archive/[id]/page.tsx"),
    source("components/archive-detail/ArchiveExperienceCards.tsx"),
  ]);

  assert.match(profile, /href="\/experience-cards"/);
  assert.match(profile, /label="我的经验卡"/);
  assert.match(profile, /value: "space", label: "个人空间"/);
  assert.match(navbar, /activePaths: \["\/archive", "\/experience-cards"\]/);
  assert.match(navbar, /pathname\.startsWith\("\/experience-cards"\)/);
  assert.match(navbar, />\s*关注\s*</);
  assert.match(navbar, />\s*个人空间\s*</);
  assert.doesNotMatch(navbar, />\s*我的关注\s*</);
  assert.doesNotMatch(navbar, />\s*本人空间\s*</);

  assert.match(archivePage, /<ArchiveExperienceCards/);
  assert.match(archiveCards, /\.eq\("archive_id", archiveId\)/);
  assert.match(archiveCards, /\/experience-cards\/\$\{item\.id\}\/edit/);
  assert.match(archiveCards, /deleteExperienceCard\(deleteTarget\.id\)/);
  assert.match(archiveCards, /if \(!isOwner\) return null/);
});


test("experience cards generate a local looping H.264 MP4 with burned record text", async () => {
  const [detail, panel, renderer, packageJson] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
    source("package.json"),
  ]);

  assert.match(detail, /<ExperienceCardVideoPanel detail=\{detail\}/);
  assert.match(panel, /生成竖屏MP4/);
  assert.match(panel, /自动串联全部来源记录/);
  assert.match(panel, /文字烧录为字幕/);
  assert.match(panel, /<video[\s\S]*?autoPlay[\s\S]*?muted[\s\S]*?playsInline/);
  assert.match(panel, /onEnded=\{\(event\) => restartGeneratedVideo\(event\.currentTarget\)\}/);
  assert.match(panel, /video\.currentTime = 0/);
  assert.match(panel, /video\.play\(\)\.catch/);
  assert.match(panel, /保存后的MP4是否循环由相册或视频平台决定/);
  assert.match(panel, /navigator\.canShare/);
  assert.match(panel, /不上传云端，也不占云空间/);
  assert.match(panel, /repeat\(auto-fit/);

  assert.match(renderer, /new Mp4OutputFormat\(\{ fastStart: "in-memory" \}\)/);
  assert.match(renderer, /codec: "avc"/);
  assert.match(renderer, /EXPERIENCE_CARD_VIDEO_WIDTH = 720/);
  assert.match(renderer, /EXPERIENCE_CARD_VIDEO_HEIGHT = 1280/);
  assert.match(renderer, /splitExperienceCardVideoText\(record\.note\)/);
  assert.match(renderer, /detail\.records\.forEach/);
  assert.match(renderer, /发布者 · \$\{authorName\}/);
  assert.match(renderer, /INTRO_DURATION_SECONDS = 4\.8/);
  assert.match(renderer, /context\.fillText\(scene\.date, contentX, cursorY\)/);
  assert.doesNotMatch(renderer, /fillText\(scene\.date, width - 48/);
  assert.match(packageJson, /"mediabunny"/);
});


test("experience card MP4 is shown first, supports optional record images, and preserves photo area", async () => {
  const [detail, panel, renderer] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
  ]);

  assert.ok(
    detail.indexOf("<ExperienceCardVideoPanel detail={detail}") <
      detail.indexOf("<article style={cardShellStyle}")
  );
  assert.match(panel, /选择图片与封面/);
  assert.match(panel, /不使用图片/);
  assert.match(panel, /selectedImageByRecordId/);
  assert.match(panel, /设为封面/);
  assert.match(panel, /getRecordImageOptions\(record\)\.map/);
  assert.match(panel, /selectedUrls\.includes\(option\.sourceUrl\)/);
  assert.match(renderer, /imageSelection\?: ExperienceCardVideoImageSelection/);
  assert.match(renderer, /Record<string, string\[\]>/);
  assert.match(renderer, /const sceneCount = Math\.max\(imageUrls\.length, chunks\.length, 1\)/);
  assert.match(renderer, /imageUrls\[partIndex % imageUrls\.length\]/);
  assert.match(renderer, /coverImageUrl !== undefined/);
  assert.match(renderer, /counterText/);
  assert.match(renderer, /`\$\{scene\.recordIndex! \+ 1\}\/\$\{scene\.recordCount\}`/);
  assert.match(renderer, /drawExperienceName\(context, scene\.title/);
  assert.doesNotMatch(renderer, /\$\{scene\.stage\}/);
  assert.doesNotMatch(renderer, /width - 94 \* scale/);
  assert.match(renderer, /const hasCaption = Boolean\(scene\.text\.trim\(\)\)/);
  assert.match(renderer, /const panelHeight =/);
  assert.doesNotMatch(renderer, /这条记录没有文字。/);
  assert.doesNotMatch(renderer, /scene\.date} · \$\{scene\.subtitle/);
  assert.doesNotMatch(detail, /coverWrapStyle/);
  assert.doesNotMatch(detail, /metaGridStyle/);
  assert.match(detail, /metaLineStyle/);
});

test("mobile project details expose archive, records, experience cards, and growth line as peers", async () => {
  const archiveDetail = await source("app/archive/[id]/page.tsx");

  assert.match(
    archiveDetail,
    /type MobileArchiveDetailTab = "profile" \| "records" \| "experience" \| "growth"/
  );
  assert.match(archiveDetail, />\s*档案\s*</);
  assert.match(archiveDetail, />\s*记录\s*</);
  assert.match(archiveDetail, />\s*经验卡\s*</);
  assert.match(archiveDetail, />\s*生长线\s*</);
  assert.match(archiveDetail, /mobileDetailTab === "experience"/);
  assert.match(archiveDetail, /mobileDetailTab === "growth"/);
  assert.match(archiveDetail, /repeat\(4, minmax\(0, 1fr\)\)/);
});

test("personal space project page has a direct My Experience Cards entry", async () => {
  const personalSpace = await source("app/archive/page.tsx");

  assert.match(personalSpace, /href="\/experience-cards"/);
  assert.match(personalSpace, /我的经验卡/);
  assert.doesNotMatch(personalSpace, /集中查看和管理全部项目的经验卡/);
  assert.match(personalSpace, /display: "inline-flex"/);
  assert.match(personalSpace, /minHeight: 34/);
});
