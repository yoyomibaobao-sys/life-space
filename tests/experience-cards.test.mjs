import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260730090616_add_experience_cards_v1.sql";
const unlimitedSourceMigrationPath =
  "supabase/migrations/20260808134254_remove_experience_card_source_limit.sql";
const preserveVisibilityMigrationPath =
  "supabase/migrations/20260809120000_preserve_experience_card_visibility_on_save.sql";
const descriptionMigrationPath =
  "supabase/migrations/20260809050320_add_experience_card_description.sql";

test("experience cards reference at least three source records without a product cap or copied content", async () => {
  const [migration, unlimitedSourceMigration] = await Promise.all([
    source(migrationPath),
    source(unlimitedSourceMigrationPath),
  ]);
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
  assert.match(cardTable, /cover_media_id uuid references public\.media/i);
  assert.doesNotMatch(cardTable, /\b(note|body|media_url|photo_url)\b/i);
  assert.match(
    unlimitedSourceMigration,
    /alter column source_record_count type integer/i
  );
  assert.match(
    unlimitedSourceMigration,
    /check \(source_record_count >= 3\)/i
  );
  assert.match(unlimitedSourceMigration, /if v_record_count < 3 then/i);
  assert.doesNotMatch(unlimitedSourceMigration, /v_record_count > 12/i);
  assert.doesNotMatch(unlimitedSourceMigration, /between 3 and 12/i);

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
  const [migration, preserveVisibilityMigration, dynamicTest] = await Promise.all([
    source(migrationPath),
    source(preserveVisibilityMigrationPath),
    source("supabase/tests/experience_cards_dynamic.sql"),
  ]);

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
  assert.match(
    preserveVisibilityMigration,
    /v_was_published := v_existing\.status = 'published'/i
  );
  assert.match(
    preserveVisibilityMigration,
    /update public\.experience_cards as c[\s\S]*?source_record_count = v_record_count[\s\S]*?where c\.id = v_card_id/i
  );
  assert.doesNotMatch(
    preserveVisibilityMigration,
    /update public\.experience_cards as c[\s\S]*?status = 'draft'/i
  );
  assert.match(
    preserveVisibilityMigration,
    /if v_was_published then[\s\S]*?set is_public = true[\s\S]*?set visibility = 'public'/i
  );
  assert.match(dynamicTest, /saving published content changed its visibility/i);
  assert.match(dynamicTest, /saving published content interrupted public availability/i);
});

test("experience-card detail descriptions are bounded and owner-edited without replacing card content", async () => {
  const [migration, detail, library, types, dynamicTest] = await Promise.all([
    source(descriptionMigrationPath),
    source("app/experience-cards/[id]/page.tsx"),
    source("lib/experience-cards.ts"),
    source("lib/experience-card-types.ts"),
    source("supabase/tests/experience_cards_dynamic.sql"),
  ]);

  assert.match(migration, /add column if not exists description text/i);
  assert.match(
    migration,
    /description is null[\s\S]*?char_length\(description\) between 1 and 500/i
  );
  assert.match(
    migration,
    /create or replace function public\.update_experience_card_description/i
  );
  assert.match(
    migration,
    /not public\.is_user_membership_active\(v_user_id\)[\s\S]*?experience_card_cloud_access_required/i
  );
  assert.match(
    migration,
    /where card\.id = p_card_id[\s\S]*?card\.user_id = v_user_id/i
  );
  assert.match(
    migration,
    /grant execute on function public\.update_experience_card_description\(uuid, text\)\s+to authenticated, service_role/i
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.update_experience_card_description\(uuid, text\)\s+to anon/i
  );

  assert.match(types, /description: string \| null/);
  assert.match(library, /export async function updateExperienceCardDescription/);
  assert.match(library, /"update_experience_card_description"/);
  assert.match(detail, /label="创建"[\s\S]*?>详情描述</);
  assert.match(detail, /aria-label="编辑详情描述"/);
  assert.match(detail, /aria-label="详情描述"/);
  assert.match(detail, /maxLength=\{500\}/);
  assert.match(detail, /updateExperienceCardDescription\(/);
  assert.doesNotMatch(
    detail,
    /saveDescription\(\)[\s\S]*?deleteCachedExperienceCardVideo/
  );
  assert.match(dynamicTest, /experience-card description was not saved/i);
  assert.match(dynamicTest, /expired owner modified an experience-card description/i);
});

test("experience-card creation and editing share one inline full-record picker", async () => {
  const [editor, detail, editWorkspace, editPage, list, archiveHeader] = await Promise.all([
    source("components/experience-card/ExperienceCardEditor.tsx"),
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardEditWorkspace.tsx"),
    source("app/experience-cards/[id]/edit/page.tsx"),
    source("app/experience-cards/page.tsx"),
    source("components/archive-detail/ArchiveDetailHeader.tsx"),
  ]);

  assert.match(editor, /selectedRecordIds/);
  assert.match(editor, /toggleRecord\(record\.id\)/);
  assert.match(editor, /nextRecords\.map\(\(record\) => record\.id\)/);
  assert.match(editor, /reconcileMediaSelection/);
  assert.match(editor, /selectedMediaIdsByRecordId: Object\.fromEntries/);
  assert.match(editor, /selectedMediaIdsByRecordId: nextMediaSelection/);
  assert.match(editor, /getRecordImages\(record\)/);
  assert.match(editor, /toggleRecordImage\(record\.id, media\.id\)/);
  assert.match(editor, /toggleAllRecordImages\(record\)/);
  assert.match(editor, /selectedRecords\.map/);
  assert.match(editor, /availableRecords = records\.filter/);
  assert.match(editor, /records\.map\(\(record, index\) =>/);
  assert.match(editor, /selectedRecordIdSet\.has\(record\.id\)/);
  assert.match(editor, />全部记录</);
  assert.match(editor, /renderAvailableRecord/);
  assert.match(editor, /加入后默认全选/);
  assert.match(editor, /所选图片用于当前设备生成MP4/);
  assert.match(editor, /不设累计上限/);
  assert.match(editor, /\.is\("trashed_at", null\)/);
  assert.doesNotMatch(editor, /selectedRecords\.length <= 12/);
  assert.doesNotMatch(editor, /最多关联12条/);
  assert.match(editor, /recordIds: selectedRecords\.map/);
  assert.match(editor, /saveExperienceCardVideoSelection\(savedCardId/);
  assert.match(editor, /deleteCachedExperienceCardVideo\(cardId\)/);
  assert.doesNotMatch(editor, /<ExperienceCardVideoPanel/);
  assert.match(editor, /coverMediaId: effectiveCoverMediaId/);
  assert.match(editor, /保存修改/);
  assert.match(editor, /预览/);
  assert.match(editor, /发布经验卡/);
  assert.match(editor, /项目中其他记录仍保持原来的可见性/);
  assert.match(editor, /if \(mode === "publish"\)/);
  assert.doesNotMatch(editor, /cardId && wasPublished/);
  assert.match(editor, /embedded = false/);
  assert.match(editor, /compact \? compactEditorSectionStyle : editorSectionStyle/);
  assert.match(editor, /标题、记录与图片/);
  assert.match(editor, /recordThumbnailStyle/);
  assert.doesNotMatch(editor, /<ArchiveAddRecordSection/);
  assert.doesNotMatch(editor, /新增项目记录/);
  assert.doesNotMatch(editor, /新增第一条记录/);
  assert.match(editor, /refreshProjectRecords/);
  assert.doesNotMatch(editor, /newlyAddedRecords\.map\(\(record\) => record\.id\)/);
  assert.match(editor, /当前共有\$\{nextRecords\.length\}条可供选择/);
  assert.doesNotMatch(editor, /打开即可查看和编辑/);
  assert.doesNotMatch(detail, /分享经验卡/);
  assert.match(detail, /设为私密/);
  assert.match(detail, /来源记录已经变化/);
  assert.doesNotMatch(detail, /type OwnerMode/);
  assert.doesNotMatch(detail, /ownerMode/);
  assert.doesNotMatch(detail, /ownerMode === "video"/);
  assert.doesNotMatch(detail, /生成分享视频/);
  assert.doesNotMatch(detail, /更多/);
  assert.match(detail, /复制链接/);
  assert.match(detail, /删除经验卡/);
  assert.match(detail, /生成MP4/);
  assert.match(detail, /重新生成MP4/);
  assert.match(detail, /externalControls/);
  assert.match(detail, /onStatusChange=\{setVideoStatus\}/);
  assert.match(detail, /> 分享\s*</);
  assert.doesNotMatch(detail, /分享视频/);
  assert.doesNotMatch(detail, /直接分享视频/);
  assert.match(detail, /保存MP4/);
  assert.match(detail, /videoStatus\.progress/);
  assert.match(detail, /videoStatus\.selectedImageCount/);
  assert.match(detail, /formatStorageBytes\(videoStatus\.sizeBytes\)/);
  assert.match(detail, /aria-label="MP4操作"/);
  assert.match(detail, /aria-label="公开与管理"/);
  assert.doesNotMatch(detail, /经验卡管理/);
  assert.match(detail, /aria-label="经验卡公开方式"/);
  assert.match(detail, />\s*私密\s*</);
  assert.doesNotMatch(detail, />\s*默认\s*</);
  assert.match(detail, />\s*公开\s*</);
  assert.match(detail, /requestVisibility\(false\)/);
  assert.match(detail, /requestVisibility\(true\)/);
  assert.match(detail, /经验过程/);
  assert.match(detail, /ExperienceCardTimeline/);
  assert.match(detail, /\{!isOwner \? \([\s\S]*?经验过程/);
  assert.ok(
    detail.indexOf("<ExperienceCardVideoPanel") <
      detail.indexOf("<ExperienceCardTimeline")
  );
  assert.ok(
    detail.indexOf("<ExperienceCardVideoPanel") <
      detail.indexOf("<ExperienceCardInteractions")
  );
  assert.ok(
    detail.indexOf("<div style={ownerActionStackStyle}") <
      detail.indexOf("<ExperienceCardInteractions")
  );
  assert.ok(
    detail.indexOf("<ExperienceCardInteractions") <
      detail.indexOf("<ExperienceCardEditWorkspace")
  );
  assert.doesNotMatch(detail, /dangerZoneStyle/);
  assert.match(
    detail,
    /<ExperienceCardVideoPanel[\s\S]*?ref=\{videoPanelRef\}[\s\S]*?previewOnly[\s\S]*?hideGenerateAction/
  );
  assert.match(detail, /<ExperienceCardVideoPanel detail=\{detail\} readOnly integrated/);
  assert.doesNotMatch(detail, /<ExperienceCardEditor/);
  assert.match(detail, /<ExperienceCardEditWorkspace/);
  assert.doesNotMatch(detail, /detail\.card\.id\}\/edit/);
  assert.doesNotMatch(detail, /setEditing/);
  assert.doesNotMatch(detail, /经验卡概况/);
  assert.ok(detail.indexOf('label="项目"') < detail.indexOf('label="记录"'));
  assert.ok(detail.indexOf('label="系统名"') < detail.indexOf('label="记录"'));
  assert.ok(detail.indexOf('label="记录"') < detail.indexOf('label="创建"'));
  assert.match(detail, /label="记录"/);
  assert.doesNotMatch(detail, /recordPeriod/);
  assert.match(detail, /durationDays \? `\$\{durationDays\}天`/);
  assert.match(detail, /`\$\{detail\.records\.length\}条`/);
  assert.match(detail, /value=\{createdDate \|\| "时间暂缺"\}/);
  assert.doesNotMatch(detail, /创建于 \{createdDate/);
  assert.doesNotMatch(detail, /label="时长"/);
  assert.doesNotMatch(detail, /label="记录数"/);
  assert.doesNotMatch(detail, /label="图片数"/);
  assert.doesNotMatch(detail, /label="创建时间"/);
  assert.match(detail, /aria-label=\{`修改经验卡名称/);
  assert.match(detail, /aria-label="经验卡名称"/);
  assert.match(detail, /saveExperienceCard\(/);
  assert.match(detail, /publishExperienceCard\(detail\.card\.id\)/);
  assert.match(detail, /deleteCachedExperienceCardVideo\(detail\.card\.id\)/);
  assert.doesNotMatch(detail, /编辑内容/);
  assert.match(detail, /editorOpen \? "收起编辑" : "编辑经验卡"/);
  assert.doesNotMatch(detail, /打开编辑/);
  assert.doesNotMatch(detail, /记录与图片/);
  assert.doesNotMatch(detail, /editorSectionHeadingStyle/);
  assert.match(detail, /detail\.archive\.system_name/);
  assert.match(detail, /href=\{`\/user\/\$\{detail\.card\.user_id\}`\}/);
  assert.match(detail, /href=\{`\/archive\/\$\{detail\.archive\.id\}`\}/);
  assert.match(detail, /<span style=\{sourceLabelStyle\}>用户<\/span>/);
  assert.doesNotMatch(detail, /<span style=\{sourceLabelStyle\}>项目<\/span>/);
  assert.doesNotMatch(detail, /<span style=\{sourceLabelStyle\}>系统名<\/span>/);
  assert.match(detail, /if \(category === "plant" && speciesId\) return `\/plant\/\$\{speciesId\}`/);
  assert.match(detail, /params\.set\("type", "projects"\)/);
  assert.match(detail, /return `\/discover\/search\?\$\{params\.toString\(\)\}`/);
  assert.match(detail, /detail\.archive\.title/);
  assert.doesNotMatch(detail, /\{href \? <UiIcon name="arrow-right"/);
  assert.match(editWorkspace, /<ExperienceCardEditor/);
  assert.match(editWorkspace, /cardId=\{cardId\}/);
  assert.match(editWorkspace, /onSaved=\{handleSaved\}/);
  assert.match(editWorkspace, /showTitleField=\{false\}/);
  assert.match(editWorkspace, /\scompact\s/);
  assert.doesNotMatch(editWorkspace, /ExperienceCardVideoPanel/);
  assert.doesNotMatch(editWorkspace, /预览/);
  assert.match(editPage, /redirect\(`\/experience-cards\/\$\{id\}#experience-card-editor`\)/);
  assert.match(list, /我的经验卡/);
  assert.match(list, /ExperienceCardListCard/);
  assert.doesNotMatch(list, /在同一处查看、编辑和管理/);
  assert.doesNotMatch(list, /新建经验卡请先进入/);
  assert.doesNotMatch(archiveHeader, /生成经验卡/);
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

  assert.match(archivePage, /activeDetailTab === "experience"/);
  assert.doesNotMatch(
    archivePage,
    /profileExtra=\{[\s\S]*?<ArchiveExperienceCards/
  );
  assert.match(archiveCards, /\.eq\("archive_id", archiveId\)/);
  assert.match(archiveCards, /href=\{`\/experience-cards\/\$\{item\.id\}`\}/);
  assert.doesNotMatch(archiveCards, /\/experience-cards\/\$\{item\.id\}\/edit/);
  assert.match(archiveCards, /deleteExperienceCard\(deleteTarget\.id\)/);
  assert.match(archiveCards, /aria-label="项目经验卡"/);
  assert.match(archiveCards, /<div style=\{eyebrowStyle\}>经验卡<\/div>/);
  assert.match(archiveCards, /onCountChange\?\.\(rows\.length\)/);
  assert.match(archiveCards, /hydrateExperienceCardListItems\(rows\)/);
  assert.match(archiveCards, /ExperienceCardListCard/);
  assert.match(archivePage, /经验卡（\{experienceCardCount\}）/);
  assert.doesNotMatch(archivePage, /!isMobileViewport && !isOwner/);
});

test("experience card lists use a shared cover with source and archive fallbacks", async () => {
  const [listCard, listCardStyles, searchCardStyles, loader, timeline, plantDetail] = await Promise.all([
    source("components/experience-card/ExperienceCardListCard.tsx"),
    source("components/experience-card/ExperienceCardListCard.module.css"),
    source("components/discover-search/DiscoverSearchResultCard.module.css"),
    source("lib/experience-cards.ts"),
    source("components/experience-card/ExperienceCardTimeline.tsx"),
    source("app/plant/[id]/page.tsx"),
  ]);

  assert.match(listCard, /item\.coverUrl/);
  assert.match(listCard, /alt=\{`\$\{item\.title\}封面`\}/);
  assert.match(listCardStyles, /\.card \{[\s\S]*?padding: 10px;[\s\S]*?border-radius: 15px;/);
  assert.match(listCardStyles, /\.card > a:first-child \{[\s\S]*?position: relative;[\s\S]*?width: 104px;[\s\S]*?height: 104px;[\s\S]*?border-radius: 11px;/);
  assert.match(listCardStyles, /\.cover,[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?height: 100%;/);
  assert.doesNotMatch(listCardStyles, /^\s*height: 124px;/m);
  assert.match(searchCardStyles, /\.card \{[\s\S]*?padding: 10px;[\s\S]*?border-radius: 14px;/);
  assert.match(searchCardStyles, /\.media \{[\s\S]*?position: relative;[\s\S]*?width: 120px;[\s\S]*?height: 120px;[\s\S]*?border-radius: 11px;/);
  assert.doesNotMatch(searchCardStyles, /min-height: 100%/);
  assert.match(loader, /row\.cover_media_id/);
  assert.match(loader, /mediaByRecord\.get\(recordId\)\?\.\[0\]/);
  assert.doesNotMatch(loader, /cover_thumb_url/);
  assert.match(loader, /archive\.cover_thumb_path/);
  assert.match(loader, /thumb_url: null/);
  assert.match(loader, /sourceState === "error"/);
  assert.match(loader, /来源读取失败，请稍后重试/);
  assert.match(loader, /来源项目已不可用/);
  assert.match(timeline, /thumbWrapStyle/);
  assert.match(timeline, /previewMedia = imageMedia\.slice\(0, 3\)/);
  assert.match(timeline, /共\{imageMedia\.length\}张/);
  assert.doesNotMatch(timeline, />\+\{imageMedia\.length - 1\}</);
  assert.match(timeline, /href=\{`\/archive\/\$\{archive\.id\}\?record=\$\{record\.id\}`\}/);
  assert.match(plantDetail, /hydrateExperienceCardListItems\(cardRows\)/);
  assert.match(plantDetail, /<ExperienceCardListCard/);
});

test("experience card interactions use private collections and restrained helpful feedback", async () => {
  const [migration, detail, interactions, list, editorPage] = await Promise.all([
    source("supabase/migrations/20260808120000_add_experience_card_interactions.sql"),
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardInteractions.tsx"),
    source("app/experience-cards/page.tsx"),
    source("app/experience-cards/[id]/edit/page.tsx"),
  ]);

  assert.match(migration, /create table if not exists public\.experience_card_comments/);
  assert.match(migration, /create table if not exists public\.experience_card_bookmarks/);
  assert.match(migration, /create table if not exists public\.experience_card_helpful_marks/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /public\.is_user_membership_active\(\(select auth\.uid\(\)\)\)/);
  assert.match(migration, /public\.is_experience_card_public\(card_id\)/);
  assert.match(migration, /get_experience_card_interaction_summaries/);
  assert.match(migration, /experience_comment/);
  assert.match(migration, /experience_helpful/);
  assert.match(interactions, /“有帮助”表示这段真实过程值得参考/);
  assert.match(interactions, /experience_card_bookmarks/);
  assert.match(interactions, /experience_card_helpful_marks/);
  assert.match(interactions, /experience_card_comments/);
  assert.match(interactions, /id="experience-card-interactions"/);
  assert.match(interactions, />\s*写评论\s*</);
  assert.match(interactions, /href=\{currentUserId \? "\/membership" : "\/login"\}/);
  assert.doesNotMatch(interactions, /if \(!available\) return null/);
  assert.match(detail, /<ExperienceCardInteractions/);
  assert.doesNotMatch(detail, /<ExperienceCardEditor/);
  assert.doesNotMatch(detail, /setEditing\(true\)/);
  assert.match(editorPage, /redirect\(`\/experience-cards\/\$\{id\}#experience-card-editor`\)/);
  assert.match(list, /我的收藏/);
  assert.match(list, /被收藏 \{item\.bookmarkCount\}/);
});


test("experience cards generate and cache a local looping H.264 MP4 with burned record text", async () => {
  const [detail, editWorkspace, panel, renderer, cache, packageJson] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardEditWorkspace.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
    source("lib/experience-card-video-cache.ts"),
    source("package.json"),
  ]);

  assert.match(
    detail,
    /<ExperienceCardVideoPanel detail=\{detail\} readOnly integrated/
  );
  assert.match(
    detail,
    /<ExperienceCardVideoPanel[\s\S]*?ref=\{videoPanelRef\}[\s\S]*?previewOnly[\s\S]*?hideGenerateAction/
  );
  assert.doesNotMatch(editWorkspace, /ExperienceCardVideoPanel/);
  assert.match(panel, /forwardRef/);
  assert.match(panel, /useImperativeHandle/);
  assert.match(panel, /generate: \(\) =>/);
  assert.match(panel, /stop: handleStop/);
  assert.match(panel, /share: \(\) =>/);
  assert.match(panel, /save: \(\) => downloadVideo\(\)/);
  assert.match(panel, /onStatusChange\?\.\(\{/);
  assert.match(panel, /selectedImageCount,/);
  assert.match(panel, /sizeBytes: videoBlob\?\.size \|\| null/);
  assert.match(panel, /externalControls/);
  assert.match(panel, /hideGenerateAction/);
  assert.match(panel, /生成竖屏MP4/);
  assert.match(panel, /选择视频画面与封面/);
  assert.match(panel, /视频选图保存在当前设备/);
  assert.match(panel, /自动作为视频片头/);
  assert.match(panel, /selectedImageCount.*张图片/s);
  assert.match(panel, /!previewOnly \? \(/);
  assert.doesNotMatch(panel, /9:16 竖屏 · 静音 H\.264 MP4/);
  assert.doesNotMatch(panel, /直接分享视频/);
  assert.match(panel, /<video[\s\S]*?autoPlay[\s\S]*?muted[\s\S]*?playsInline/);
  assert.match(panel, /onEnded=\{\(event\) => restartGeneratedVideo\(event\.currentTarget\)\}/);
  assert.match(panel, /video\.currentTime = 0/);
  assert.match(panel, /video\.play\(\)\.catch/);
  assert.match(panel, /navigator\.canShare/);
  assert.match(panel, /saveCachedExperienceCardVideo/);
  assert.match(panel, /getCachedExperienceCardVideo/);
  assert.match(panel, /getExperienceCardVideoSelection/);
  assert.match(panel, /repeat\(auto-fit/);

  assert.match(renderer, /new Mp4OutputFormat\(\{ fastStart: "in-memory" \}\)/);
  assert.match(renderer, /codec: "avc"/);
  assert.match(renderer, /EXPERIENCE_CARD_VIDEO_WIDTH = 720/);
  assert.match(renderer, /EXPERIENCE_CARD_VIDEO_HEIGHT = 1280/);
  assert.match(renderer, /splitExperienceCardVideoText\(record\.note\)/);
  assert.match(renderer, /detail\.records\.forEach/);
  assert.match(renderer, /发布者 · \$\{authorName\}/);
  assert.match(renderer, /INTRO_DURATION_SECONDS = 4\.8/);
  assert.match(renderer, /OUTRO_DURATION_SECONDS = 5\.5/);
  assert.match(renderer, /websiteUrl/);
  assert.match(renderer, /context\.fillText\(scene\.date, contentX, cursorY\)/);
  assert.match(renderer, /fitInlineCaptionText/);
  assert.match(renderer, /scene\.authorName, scene\.title/);
  assert.match(renderer, /rgba\(15,30,17,0\.34\)/);
  assert.doesNotMatch(renderer, /rgba\(255,255,255,0\.88\)/);
  assert.doesNotMatch(renderer, /fillText\(scene\.date, width - 48/);
  assert.match(cache, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(cache, /sourceSignature/);
  assert.match(cache, /selectedMediaIdsByRecordId/);
  assert.match(cache, /coverMediaId/);
  assert.match(cache, /saveExperienceCardVideoSelection/);
  assert.match(cache, /storagePath/);
  assert.doesNotMatch(cache, /displayUrl/);
  assert.match(cache, /MAX_CACHE_BYTES/);
  assert.match(cache, /experience-card-video-20260801-v4/);
  assert.match(packageJson, /"mediabunny"/);
});


test("experience card MP4 is shown first, selects individual images, and preserves photo area", async () => {
  const [detail, panel, renderer] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
  ]);

  assert.ok(
    detail.indexOf("<ExperienceCardVideoPanel detail={detail} readOnly integrated") <
      detail.indexOf("<article style={infoColumnStyle}")
  );
  assert.match(detail, /<section style=\{heroStyle\} aria-label="经验卡成品与概况"/);
  assert.match(panel, /视频选图 \{selectedImageCount\}\/\{totalImageCount\} 张/);
  assert.match(panel, /imageOptions\.map/);
  assert.doesNotMatch(panel, /第 \{index \+ 1\} 条记录/);
  assert.match(panel, /selectedImageByRecordId/);
  assert.match(panel, /设为封面/);
  assert.doesNotMatch(panel, /设为片头/);
  assert.match(panel, /getRecordImageOptions\(record\)\.map/);
  assert.match(panel, /selectedUrls\.has\(option\.sourceUrl\)/);
  assert.match(renderer, /imageSelection\?: ExperienceCardVideoImageSelection/);
  assert.match(renderer, /Record<string, string\[\]>/);
  assert.match(renderer, /const sceneCount = Math\.max\(imageUrls\.length, chunks\.length, 1\)/);
  assert.match(renderer, /imageUrls\[localImageIndex\]/);
  assert.match(renderer, /coverImageUrl !== undefined/);
  assert.match(renderer, /counterText/);
  assert.match(renderer, /`\$\{scene\.imageIndex \+ 1\}\/\$\{scene\.imageCount\}`/);
  assert.match(renderer, /drawExperienceName\(context, scene\.authorName, scene\.title/);
  assert.doesNotMatch(renderer, /scene\.recordIndex/);
  assert.doesNotMatch(renderer, /width - 94 \* scale/);
  assert.match(renderer, /const hasCaption = Boolean\(scene\.text\.trim\(\)\)/);
  assert.match(renderer, /const panelHeight =/);
  assert.match(renderer, /"rgba\(18,31,20,0\.54\)"/);
  assert.doesNotMatch(renderer, /这条记录没有文字。/);
  assert.doesNotMatch(renderer, /scene\.date} · \$\{scene\.subtitle/);
  assert.doesNotMatch(detail, /coverWrapStyle/);
  assert.doesNotMatch(detail, /metaGridStyle/);
  assert.match(detail, /overviewGridStyle/);
  assert.doesNotMatch(detail, /imageCount/);
});

test("guidance favorites, plan toggles, and discovery cards use the simplified hierarchy", async () => {
  const [guide, plantDetail, plantHero, discoverCard, discoverStyles] =
    await Promise.all([
      source("app/plant/page.tsx"),
      source("app/plant/[id]/page.tsx"),
      source("components/plant-detail/PlantDetailHero.tsx"),
      source("components/discover/DiscoverProjectCard.tsx"),
      source("components/discover/DiscoverProjectFeed.module.css"),
    ]);

  assert.match(guide, /href=\{isSignedIn \? "\/archive\/interests" : "\/login"\}/);
  assert.match(guide, /我的收藏\{isSignedIn && interestCount !== null/);
  assert.match(guide, /from\("user_plant_interests"\)[\s\S]*?count: "exact", head: true/);
  assert.match(guide, /placeholder="搜索植物名、别名或拉丁名"/);
  assert.match(guide, /type="submit"[\s\S]*?>\s*搜索\s*<\/button>/);
  assert.match(guide, /MAX_RECENT_SEARCHES = 8/);
  assert.match(guide, /PLANT_SEARCH_HISTORY_KEY/);
  assert.match(guide, /window\.localStorage\.setItem/);
  assert.match(guide, /removeRecentSearch/);
  assert.match(guide, /clearRecentSearches/);
  assert.match(guide, /window\.sessionStorage\.setItem/);
  assert.match(
    guide,
    /getEntriesByType\(\s*"navigation"\s*\)[\s\S]*?navigationEntry\.type !== "reload"/
  );
  assert.match(guide, /hasCheckedInitialPlantNavigation/);
  assert.match(
    guide,
    /initialUrl\.pathname === window\.location\.pathname[\s\S]*?initialUrl\.search === window\.location\.search/
  );
  assert.match(guide, /pendingScrollYRef/);
  assert.match(guide, /role="dialog"/);
  assert.match(guide, /aria-label="返回植物指引"/);
  assert.match(plantDetail, /from\("user_plant_interests"\)[\s\S]*?\.delete\(\)/);
  assert.match(plantDetail, /from\("user_plant_plans"\)[\s\S]*?\.delete\(\)/);
  assert.match(plantDetail, /已添加计划/);
  assert.match(plantDetail, /已收藏/);
  assert.doesNotMatch(plantHero, /disabled=\{planAdded \|\|/);
  assert.doesNotMatch(plantHero, /disabled=\{interestAdded \|\|/);
  assert.ok(
    discoverCard.indexOf('className={styles.title}') <
      discoverCard.indexOf('className={styles.body}')
  );
  assert.match(discoverStyles, /\.ownerRow/);
  assert.match(discoverStyles, /\.imageTitleArea/);
});

test("guidance counts and public navigation use compact non-duplicated entries", async () => {
  const [plantDetail, archiveDetail, archiveHeader, discoverHeader] =
    await Promise.all([
      source("app/plant/[id]/page.tsx"),
      source("app/archive/[id]/page.tsx"),
      source("components/archive-detail/ArchiveDetailHeader.tsx"),
      source("components/discover/DiscoverHeader.tsx"),
    ]);

  assert.match(
    plantDetail,
    /experienceCardTabCount = relatedExperienceCards\.length/
  );
  assert.match(plantDetail, /plantingRecordTabCount = Array\.from/);
  assert.match(plantDetail, /experienceCardTabCount > 0/);
  assert.match(plantDetail, /plantingRecordTabCount > 0/);
  assert.match(plantDetail, /`经验卡（\$\{experienceCardTabCount\}）`/);
  assert.match(plantDetail, /`种植记录（\$\{plantingRecordTabCount\}）`/);

  assert.match(
    archiveDetail,
    /href=\{`\/user\/\$\{activeArchive\.user_id\}`\}/
  );
  assert.match(archiveDetail, /aria-label=\{`进入\$\{username\}的空间`\}/);
  assert.doesNotMatch(archiveHeader, /进入\{username\}的空间/);

  assert.match(discoverHeader, /href="\/discover\/search"/);
  assert.match(discoverHeader, /<UiIcon name="search"/);
  assert.match(discoverHeader, /> 搜索\s*<\/Link>/);
  assert.doesNotMatch(discoverHeader, /width: "100%"/);
  assert.doesNotMatch(discoverHeader, /搜索记录/);
});

test("project details expose details, archive, experience cards, and growth line as peer tabs on every viewport", async () => {
  const [archiveDetail, archiveHeader, headerView] = await Promise.all([
    source("app/archive/[id]/page.tsx"),
    source("components/archive-detail/ArchiveDetailHeader.tsx"),
    source("components/archive-ui/ArchiveDetailHeaderView.tsx"),
  ]);

  assert.match(
    archiveDetail,
    /type ArchiveDetailTab = "profile" \| "records" \| "experience" \| "growth"/
  );
  assert.match(archiveDetail, />\s*详情\s*</);
  assert.match(archiveDetail, />\s*档案\s*</);
  assert.match(archiveDetail, /经验卡（\{experienceCardCount\}）/);
  assert.match(archiveDetail, />\s*生长线\s*</);
  assert.match(archiveDetail, /activeDetailTab === "experience"/);
  assert.match(archiveDetail, /activeDetailTab === "growth"/);
  assert.match(archiveDetail, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(archiveDetail, /className="mobile-app-grid-only"/);
  assert.match(archiveDetail, /onCountChange=\{setExperienceCardCount\}/);
  assert.match(archiveHeader, /profileAlwaysOpen/);
  assert.match(headerView, /profileAlwaysOpen \|\| profileOpen/);
});

test("personal space project page has a direct My Experience Cards entry", async () => {
  const personalSpace = await source("app/archive/page.tsx");

  assert.match(personalSpace, /href="\/experience-cards"/);
  assert.match(personalSpace, /我的经验卡（\{experienceCardCount\}）/);
  assert.match(personalSpace, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.doesNotMatch(personalSpace, /集中查看和管理全部项目的经验卡/);
  assert.match(personalSpace, /display: "inline-flex"/);
  assert.match(personalSpace, /minHeight: 34/);
});
