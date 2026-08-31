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
const descriptionHardeningMigrationPath =
  "supabase/migrations/20260809053213_harden_experience_card_description_update.sql";
const playbackManifestMigrationPath =
  "supabase/migrations/20260820101631_add_experience_playback_manifest.sql";

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
  const [migration, hardeningMigration, detail, library, types, dynamicTest, zhCopy, enCopy] = await Promise.all([
    source(descriptionMigrationPath),
    source(descriptionHardeningMigrationPath),
    source("app/experience-cards/[id]/page.tsx"),
    source("lib/experience-cards.ts"),
    source("lib/experience-card-types.ts"),
    source("supabase/tests/experience_cards_dynamic.sql"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
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
  assert.match(
    hardeningMigration,
    /create policy experience_cards_update_description_owner_active[\s\S]*?for update[\s\S]*?to authenticated[\s\S]*?user_id = \(select auth\.uid\(\)\)[\s\S]*?is_user_membership_active\(\(select auth\.uid\(\)\)\)[\s\S]*?with check/i
  );
  assert.match(
    hardeningMigration,
    /grant update \(description\) on table public\.experience_cards\s+to authenticated/i
  );
  assert.match(
    hardeningMigration,
    /create or replace function public\.update_experience_card_description[\s\S]*?security invoker[\s\S]*?set search_path = ''/i
  );
  assert.doesNotMatch(
    hardeningMigration,
    /create or replace function public\.update_experience_card_description[\s\S]*?security definer/i
  );

  assert.match(types, /description: string \| null/);
  assert.match(library, /export async function updateExperienceCardDescription/);
  assert.match(library, /"update_experience_card_description"/);
  assert.match(detail, /label=\{t\.experience\.created\}[\s\S]*?\{t\.experience\.description\}/);
  assert.match(detail, /aria-label=\{t\.experience\.edit_description_aria\}/);
  assert.match(detail, /aria-label=\{t\.experience\.description\}/);
  assert.match(zhCopy, /description: "详情描述"/);
  assert.match(enCopy, /description: "Description"/);
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
  assert.match(editor, /\{t\.experience\.all_records\}/);
  assert.match(editor, /renderAvailableRecord/);
  assert.match(editor, /t\.experience\.photos_add_default_suffix/);
  assert.match(editor, /t\.experience\.editor_hint/);
  assert.match(editor, /t\.experience\.selection_rule/);
  assert.match(editor, /\.is\("trashed_at", null\)/);
  assert.doesNotMatch(editor, /selectedRecords\.length <= 12/);
  assert.doesNotMatch(editor, /最多关联12条/);
  assert.match(editor, /recordIds: selectedRecords\.map/);
  assert.match(editor, /saveExperienceCardVideoSelection\(savedCardId/);
  assert.match(editor, /deleteCachedExperienceCardVideo\(cardId\)/);
  assert.doesNotMatch(editor, /<ExperienceCardVideoPanel/);
  assert.match(editor, /coverMediaId: effectiveCoverMediaId/);
  assert.match(editor, /t\.experience\.save_changes/);
  assert.match(editor, /t\.experience\.preview/);
  assert.match(editor, /t\.experience\.publish_card/);
  assert.match(editor, /t\.experience\.save_public_message_suffix/);
  assert.match(editor, /if \(mode === "publish"\)/);
  assert.doesNotMatch(editor, /cardId && wasPublished/);
  assert.match(editor, /embedded = false/);
  assert.match(editor, /compact \? compactEditorSectionStyle : editorSectionStyle/);
  assert.match(editor, /t\.experience\.editor_title_full/);
  assert.match(editor, /recordThumbnailStyle/);
  assert.doesNotMatch(editor, /<ArchiveAddRecordSection/);
  assert.doesNotMatch(editor, /新增项目记录/);
  assert.doesNotMatch(editor, /新增第一条记录/);
  assert.match(editor, /refreshProjectRecords/);
  assert.doesNotMatch(editor, /newlyAddedRecords\.map\(\(record\) => record\.id\)/);
  assert.match(editor, /t\.experience\.records_updated_prefix[\s\S]*?nextRecords\.length[\s\S]*?t\.experience\.records_updated_suffix/);
  assert.doesNotMatch(editor, /打开即可查看和编辑/);
  assert.doesNotMatch(detail, /分享经验卡/);
  assert.match(detail, /t\.experience\.make_private/);
  assert.match(detail, /t\.experience\.source_changed_warning/);
  assert.doesNotMatch(detail, /type OwnerMode/);
  assert.doesNotMatch(detail, /ownerMode/);
  assert.doesNotMatch(detail, /ownerMode === "video"/);
  assert.doesNotMatch(detail, /生成分享视频/);
  assert.doesNotMatch(detail, /更多/);
  assert.equal(
    detail.match(/onClick=\{\(\) => void copyCardLink\(\)\}/g)?.length,
    1
  );
  assert.match(detail, /t\.experience\.delete_title/);
  assert.match(detail, /t\.experience\.generate_mp4/);
  assert.match(detail, /t\.experience\.regenerate_mp4/);
  assert.match(detail, /externalControls/);
  assert.match(detail, /onStatusChange=\{setVideoStatus\}/);
  assert.match(detail, /onClick=\{shareVideo\}[\s\S]*?t\.experience\.share_mp4/);
  assert.doesNotMatch(detail, /分享视频/);
  assert.doesNotMatch(detail, /直接分享视频/);
  assert.match(detail, /t\.experience\.save_mp4/);
  assert.match(detail, /videoStatus\.progress/);
  assert.match(detail, /videoStatus\.selectedImageCount/);
  assert.match(detail, /formatStorageBytes\(videoStatus\.sizeBytes\)/);
  assert.match(detail, /aria-label=\{t\.experience\.mp4_actions_aria\}/);
  assert.match(detail, /<span style=\{overviewLabelStyle\}>\{t\.experience\.status\}<\/span>/);
  assert.match(detail, /style=\{overviewStatusItemStyle\}/);
  assert.match(detail, /<section style=\{deleteSectionStyle\} aria-label=\{t\.experience\.delete_aria\}>/);
  assert.match(detail, /<UiIcon name="trash" size=\{14\} \/> \{t\.experience\.delete_title\}/);
  assert.doesNotMatch(detail, /aria-label="删除操作"/);
  assert.doesNotMatch(detail, /aria-label="公开与管理"/);
  assert.doesNotMatch(detail, /经验卡管理/);
  assert.match(detail, /aria-label=\{t\.experience\.visibility_aria\}/);
  assert.match(detail, /\{t\.experience\.private\}/);
  assert.doesNotMatch(detail, />\s*默认\s*</);
  assert.match(detail, /\{t\.experience\.public\}/);
  assert.match(detail, /requestVisibility\(false\)/);
  assert.match(detail, /requestVisibility\(true\)/);
  assert.match(detail, /t\.experience\.process/);
  assert.match(detail, /ExperienceCardTimeline/);
  assert.match(detail, /\{!isOwner \? \([\s\S]*?t\.experience\.process/);
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
  assert.ok(
    detail.indexOf("<ExperienceCardEditWorkspace") <
      detail.indexOf("aria-label={t.experience.delete_aria}")
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
  assert.ok(detail.indexOf("label={t.experience.project}") < detail.indexOf("label={t.experience.records}"));
  assert.ok(detail.indexOf("label={t.experience.system_name}") < detail.indexOf("label={t.experience.records}"));
  assert.ok(detail.indexOf("label={t.experience.records}") < detail.indexOf("label={t.experience.created}"));
  assert.match(detail, /label=\{t\.experience\.records\}/);
  assert.doesNotMatch(detail, /recordPeriod/);
  assert.match(detail, /durationDays \? `\$\{durationDays\}\$\{t\.experience\.day_suffix\}`/);
  assert.match(detail, /`\$\{detail\.records\.length\}\$\{t\.experience\.record_suffix\}`/);
  assert.match(detail, /value=\{createdDate \|\| t\.experience\.time_missing\}/);
  assert.doesNotMatch(detail, /创建于 \{createdDate/);
  assert.doesNotMatch(detail, /label="时长"/);
  assert.doesNotMatch(detail, /label="记录数"/);
  assert.doesNotMatch(detail, /label="图片数"/);
  assert.doesNotMatch(detail, /label="创建时间"/);
  assert.match(detail, /aria-label=\{`\$\{t\.experience\.edit_name_prefix\}/);
  assert.match(detail, /aria-label=\{t\.experience\.card_name_aria\}/);
  assert.match(detail, /saveExperienceCard\(/);
  assert.match(detail, /publishExperienceCard\(detail\.card\.id\)/);
  assert.match(detail, /deleteCachedExperienceCardVideo\(detail\.card\.id\)/);
  assert.doesNotMatch(detail, /编辑内容/);
  assert.match(detail, /editorOpen \? t\.experience\.collapse_editor : t\.experience\.edit_card/);
  assert.doesNotMatch(detail, /打开编辑/);
  assert.doesNotMatch(detail, /记录与图片/);
  assert.doesNotMatch(detail, /editorSectionHeadingStyle/);
  assert.match(detail, /detail\.archive\.system_name/);
  assert.match(
    detail,
    /href=\{isOwner \? "\/archive" : `\/user\/\$\{detail\.card\.user_id\}`\}/
  );
  assert.match(detail, /href=\{`\/archive\/\$\{detail\.archive\.id\}`\}/);
  assert.match(detail, /<span style=\{sourceLabelStyle\}>\{t\.experience\.user\}<\/span>/);
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
  assert.match(list, /t\.experience\.my_cards/);
  assert.match(list, /ExperienceCardListCard/);
  assert.match(list, /shareExperienceCard\(item as CardListItem\)/);
  assert.match(list, /copyExperienceCardLink\(item as CardListItem\)/);
  assert.match(list, /getExperienceCardShareUrl\(item\.id\)/);
  assert.match(list, /t\.experience\.public_link_copied/);
  assert.doesNotMatch(list, /取消公开/);
  assert.doesNotMatch(list, /unpublishExperienceCard/);
  assert.doesNotMatch(list, /在同一处查看、编辑和管理/);
  assert.doesNotMatch(list, /新建经验卡请先进入/);
  assert.doesNotMatch(archiveHeader, /生成经验卡/);
});

test("experience cards stay reachable from projects after profile space shortcuts are removed", async () => {
  const [profile, navbar, archivePage, archiveCards, zhCopy, enCopy] = await Promise.all([
    source("app/profile/page.tsx"),
    source("components/navbar.tsx"),
    source("app/archive/[id]/page.tsx"),
    source("components/archive-detail/ArchiveExperienceCards.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.doesNotMatch(profile, /href="\/experience-cards"/);
  assert.doesNotMatch(profile, /value: "space", label: t\.profile\.modules\.space/);
  assert.match(
    navbar,
    /isPersonalExperiencePath[\s\S]*?pathname === "\/experience-cards"/
  );
  assert.match(navbar, /pathname\.startsWith\("\/experience-cards"\)/);
  assert.match(navbar, /\{t\.nav\.following\}/);
  assert.match(navbar, /\{t\.nav\.personal_space\}/);
  assert.doesNotMatch(navbar, />\s*我的关注\s*</);
  assert.doesNotMatch(navbar, />\s*本人空间\s*</);

  assert.match(archivePage, /activeDetailTab === "experience"/);
  assert.match(archivePage, /profileExtra=\{isOwner \? \([\s\S]*?<ArchiveCycleSettings/);
  assert.match(
    archivePage,
    /activeDetailTab === "experience" \? \([\s\S]*?<ArchiveExperienceCards/
  );
  assert.match(archiveCards, /\.eq\("archive_id", archiveId\)/);
  assert.match(archiveCards, /href=\{`\/experience-cards\/\$\{item\.id\}`\}/);
  assert.doesNotMatch(archiveCards, /\/experience-cards\/\$\{item\.id\}\/edit/);
  assert.match(archiveCards, /deleteExperienceCard\(deleteTarget\.id\)/);
  assert.match(archiveCards, /aria-label=\{t\.experience\.archive_panel_aria\}/);
  assert.match(
    archiveCards,
    /<div style=\{eyebrowStyle\}>\{t\.experience\.archive_panel_title\}<\/div>/
  );
  assert.match(zhCopy, /archive_panel_aria: "项目经验卡"/);
  assert.match(enCopy, /archive_panel_aria: "Project Experience Cards"/);
  assert.match(archiveCards, /onCountChange\?\.\(rows\.length\)/);
  assert.match(archiveCards, /hydrateExperienceCardListItems\(rows\)/);
  assert.match(archiveCards, /ExperienceCardListCard/);
  assert.match(archivePage, /\{archiveCopy\.experience_cards\}/);
  assert.match(archivePage, /experienceCardCount/);
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
  assert.match(listCard, /alt=\{`\$\{item\.title\}\$\{t\.experience\.card_cover_suffix\}`\}/);
  assert.match(listCardStyles, /\.card \{[\s\S]*?padding: 10px;[\s\S]*?border-radius: 15px;/);
  assert.match(listCardStyles, /\.card > a:first-child \{[\s\S]*?position: relative;[\s\S]*?width: 104px;[\s\S]*?height: 104px;[\s\S]*?border-radius: 11px;/);
  assert.match(listCardStyles, /\.cover,[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?height: 100%;/);
  assert.doesNotMatch(listCardStyles, /^\s*height: 124px;/m);
  assert.match(searchCardStyles, /\.card \{[\s\S]*?padding: 8px;[\s\S]*?border-radius: 14px;/);
  assert.match(searchCardStyles, /\.media \{[\s\S]*?position: relative;[\s\S]*?width: 108px;[\s\S]*?height: 108px;[\s\S]*?border-radius: 10px;/);
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
  assert.match(timeline, /t\.experience\.total_photos_prefix\}\{imageMedia\.length\}\{t\.experience\.total_photos_suffix/);
  assert.doesNotMatch(timeline, />\+\{imageMedia\.length - 1\}</);
  assert.match(timeline, /href=\{`\/archive\/\$\{archive\.id\}\?record=\$\{record\.id\}`\}/);
  assert.doesNotMatch(timeline, /这条记录以照片为主|这条记录没有文字/);
  assert.match(plantDetail, /hydrateExperienceCardListItems\(cardRows, language\)/);
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
  assert.match(interactions, /t\.experience\.helpful_hint/);
  assert.match(interactions, /experience_card_bookmarks/);
  assert.match(interactions, /experience_card_helpful_marks/);
  assert.match(interactions, /experience_card_comments/);
  assert.match(interactions, /id="experience-card-interactions"/);
  assert.match(interactions, /\{t\.experience\.write_comment\}/);
  assert.match(interactions, /href=\{\s*currentUserId[\s\S]*?buildLoginHref\(getCurrentInternalPath\(\)\)/);
  assert.doesNotMatch(interactions, /if \(!available\) return null/);
  assert.match(detail, /<ExperienceCardInteractions/);
  assert.doesNotMatch(detail, /<ExperienceCardEditor/);
  assert.doesNotMatch(detail, /setEditing\(true\)/);
  assert.match(editorPage, /redirect\(`\/experience-cards\/\$\{id\}#experience-card-editor`\)/);
  assert.match(list, /t\.experience\.saved_cards/);
  assert.match(list, /t\.experience\.bookmarked_prefix\}\{item\.bookmarkCount/);
});


test("experience cards generate and cache a local looping H.264 MP4 with burned record text", async () => {
  const [detail, editWorkspace, panel, renderer, playback, cache, packageJson] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardEditWorkspace.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
    source("lib/experience-card-playback.ts"),
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
  assert.match(panel, /t\.experience\.generate_vertical_mp4/);
  assert.match(panel, /t\.experience\.video_image_title/);
  assert.match(panel, /t\.experience\.video_image_hint/);
  assert.match(panel, /selectedImageCount[\s\S]*?t\.experience\.image_suffix/);
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
  assert.match(renderer, /EXPERIENCE_CARD_INTRO_SECONDS/);
  assert.match(renderer, /EXPERIENCE_CARD_OUTRO_SECONDS/);
  assert.match(playback, /EXPERIENCE_CARD_INTRO_SECONDS = 4\.8/);
  assert.match(playback, /EXPERIENCE_CARD_OUTRO_SECONDS = 5\.5/);
  assert.match(renderer, /websiteUrl/);
  assert.match(renderer, /context\.fillText\(scene\.date, contentX, cursorY\)/);
  assert.match(renderer, /fitInlineCaptionText/);
  assert.match(renderer, /scene\.authorName, scene\.title/);
  assert.match(renderer, /rgba\(15,30,17,0\.46\)/);
  assert.match(renderer, /setFont\(context, 23 \* scale, 800\)/);
  assert.match(renderer, /setFont\(context, 27 \* scale, 800\)/);
  assert.match(renderer, /const dateFontSize = 27 \* scale/);
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

test("public Experience opens compact previews into live full-screen playback without another video", async () => {
  const [
    migration,
    editor,
    player,
    gallery,
    feedPage,
    feedStyles,
    experienceSearch,
    zhCopy,
  ] = await Promise.all([
    source(playbackManifestMigrationPath),
    source("components/experience-card/ExperienceCardEditor.tsx"),
    source("components/experience-card/PublicExperiencePlayer.tsx"),
    source("components/experience-card/PublicExperienceGallery.tsx"),
    source("app/experience/page.tsx"),
    source("components/experience-card/PublicExperienceFeed.module.css"),
    source("app/experience/search/page.tsx"),
    source("lib/i18n/zh.ts"),
  ]);

  assert.match(migration, /add column if not exists playback_media_ids uuid\[\]/i);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(migration, /v_card\.user_id is distinct from v_user_id/i);
  assert.match(migration, /m\.id = any\(v_media_ids\)/i);
  assert.match(migration, /cr\.card_id = v_card\.id[\s\S]*?cr\.record_id = m\.record_id/i);
  assert.match(migration, /revoke all on function[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function[\s\S]*?to authenticated, service_role/i);
  assert.doesNotMatch(migration, /storage\.objects|\.mp4|video\//i);

  assert.match(editor, /saveExperienceCardPlaybackSelection/);
  assert.match(editor, /selectedMediaIds/);
  assert.match(player, /buildExperienceCardVideoScenes/);
  assert.match(player, /detail\.card\.playback_media_ids/);
  assert.doesNotMatch(player, /<video|Blob|\.mp4/);
  assert.match(player, /!fullscreen \? <div[\s\S]*?href=\{`\/experience-cards\/\$\{detail\.card\.id\}`\}/);
  assert.match(gallery, /item\.coverUrl/);
  assert.match(gallery, /loading="lazy"/);
  assert.match(gallery, /loadExperienceCard\(item\.id\)/);
  assert.match(gallery, /Math\.abs\(index - activeIndex\) <= 1/);
  assert.match(gallery, /active=\{index === activeIndex\}/);
  assert.match(gallery, /data-mobile-swipe-ignore="true"/);
  assert.match(gallery, /role="dialog"/);
  assert.match(gallery, /role="button"[\s\S]*?onClick=\{\(event\) => handleCardClick\(event, index\)\}/);
  assert.match(gallery, /<ExperienceCardSummary item=\{item\}/);
  assert.doesNotMatch(gallery, /item\.durationDays/);
  assert.match(feedPage, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(feedPage, /PublicExperienceGallery/);
  assert.match(feedStyles, /scroll-snap-type: y mandatory/);
  assert.match(feedStyles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(feedStyles, /@media \(max-width: 759px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(experienceSearch, /fetchDiscoverExperienceCardSearchResults/);
  assert.match(zhCopy, /private: "私密"/);
  assert.match(zhCopy, /public: "公开"/);
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
  assert.match(detail, /<section style=\{heroStyle\} aria-label=\{t\.experience\.finished_aria\}/);
  assert.match(panel, /t\.experience\.video_selection\} \{selectedImageCount\}\/\{totalImageCount\}\{t\.experience\.image_suffix\}/);
  assert.match(panel, /imageOptions\.map/);
  assert.doesNotMatch(panel, /第 \{index \+ 1\} 条记录/);
  assert.match(panel, /selectedImageByRecordId/);
  assert.match(panel, /t\.experience\.set_cover/);
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
  assert.match(renderer, /"rgba\(18,31,20,0\.64\)"/);
  assert.doesNotMatch(renderer, /这条记录没有文字。/);
  assert.doesNotMatch(renderer, /scene\.date} · \$\{scene\.subtitle/);
  assert.doesNotMatch(detail, /按记录时间排列/);
  assert.doesNotMatch(detail, /coverWrapStyle/);
  assert.doesNotMatch(detail, /metaGridStyle/);
  assert.match(detail, /overviewGridStyle/);
  assert.doesNotMatch(detail, /imageCount/);
});

test("guidance favorites and discovery cards use the simplified hierarchy without duplicate plans", async () => {
  const [guide, plantDetail, plantHero, discoverCard, discoverStyles] =
    await Promise.all([
      source("app/plant/page.tsx"),
      source("app/plant/[id]/page.tsx"),
      source("components/plant-detail/PlantDetailHero.tsx"),
      source("components/discover/DiscoverProjectCard.tsx"),
      source("components/discover/DiscoverProjectFeed.module.css"),
    ]);

  assert.match(guide, /buildLoginHref\(`\/archive\/interests\?section=\$\{category\}`\)/);
  assert.match(guide, /\{t\.plant\.my_saved\}\{signedIn && interestCount !== null/);
  assert.match(guide, /getGuideInterestCount\(user\.id\)/);
  const guideInterests = await source("lib/guide-interests.ts");
  for (const table of ["user_plant_interests", "user_guide_interests"]) {
    assert.match(guideInterests, new RegExp(`from\\("${table}"\\)[\\s\\S]*?count: "exact", head: true[\\s\\S]*?eq\\("user_id", userId\\)`));
  }
  assert.match(guide, /placeholder=\{t\.plant\.search_placeholder\}/);
  assert.match(guide, /type="submit"[\s\S]*?\{t\.plant\.search\}[\s\S]*?<\/button>/);
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
  assert.doesNotMatch(guide, /role="dialog"/);
  assert.match(guide, /<HomeSectionTabs\s+active="guide"[\s\S]*?searchEnabled=\{false\}/);
  assert.doesNotMatch(guide, /isMobileSearchOpen/);
  assert.doesNotMatch(guide, /aria-label=\{t\.plant\.back_to_guide\}/);
  assert.doesNotMatch(plantDetail, /from\("user_plant_interests"\)[\s\S]*?\.delete\(\)/);
  assert.match(plantDetail, /<SavedGuideStatus/);
  assert.match(await source("app/archive/interests/page.tsx"), /from\("user_plant_interests"\)[\s\S]*?\.delete\(\)/);
  assert.doesNotMatch(plantDetail, /from\("user_plant_plans"\)/);
  assert.doesNotMatch(plantDetail, /copy\.plan_already_added/);
  assert.match(plantDetail, /copy\.saved/);
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
  const [plantDetail, archiveDetail, archiveHeader, discoverHeader, zhCopy, enCopy] =
    await Promise.all([
      source("app/plant/[id]/page.tsx"),
      source("app/archive/[id]/page.tsx"),
      source("components/archive-detail/ArchiveDetailHeader.tsx"),
      source("components/discover/DiscoverHeader.tsx"),
      source("lib/i18n/zh.ts"),
      source("lib/i18n/en.ts"),
    ]);

  assert.match(
    plantDetail,
    /experienceCardTabCount = relatedExperienceCards\.length/
  );
  assert.match(plantDetail, /plantingRecordTabCount = Array\.from/);
  assert.match(plantDetail, /experienceCardTabCount > 0/);
  assert.match(plantDetail, /plantingRecordTabCount > 0/);
  assert.match(plantDetail, /`\$\{copy\.experience_cards\} \(\$\{experienceCardTabCount\}\)`/);
  assert.match(plantDetail, /`\$\{copy\.growing_records\} \(\$\{plantingRecordTabCount\}\)`/);

  assert.match(
    archiveDetail,
    /href=\{`\/user\/\$\{activeArchive\.user_id\}`\}/
  );
  assert.match(
    archiveDetail,
    /archiveCopy\.enter_user_space_prefix\}\{displayUsername\}\{archiveCopy\.enter_user_space_suffix/
  );
  assert.match(archiveDetail, /style=\{attributeCreatorLinkStyle\}/);
  assert.doesNotMatch(archiveHeader, /进入\{username\}的空间/);

  assert.match(discoverHeader, /href="\/discover\/search"/);
  assert.match(discoverHeader, /<UiIcon name="search"/);
  assert.match(discoverHeader, /\{t\.discover\.search\}/);
  assert.match(zhCopy, /search: "搜索"/);
  assert.match(enCopy, /search: "Search"/);
  assert.doesNotMatch(discoverHeader, /width: "100%"/);
  assert.doesNotMatch(discoverHeader, /搜索记录/);
});

test("project details hide the unfinished growth line and keep the three complete peer tabs", async () => {
  const [archiveDetail, archiveHeader, headerView] = await Promise.all([
    source("app/archive/[id]/page.tsx"),
    source("components/archive-detail/ArchiveDetailHeader.tsx"),
    source("components/archive-ui/ArchiveDetailHeaderView.tsx"),
  ]);

  assert.match(
    archiveDetail,
    /type ArchiveDetailTab = "profile" \| "records" \| "experience"/
  );
  assert.match(archiveDetail, /\{archiveCopy\.details\}/);
  assert.match(archiveDetail, /\{archiveCopy\.dossier\}/);
  assert.match(archiveDetail, /\{archiveCopy\.experience_cards\}/);
  assert.doesNotMatch(archiveDetail, /\{archiveCopy\.growth_line\}/);
  assert.match(archiveDetail, /experienceCardCount/);
  assert.match(archiveDetail, /activeDetailTab === "experience"/);
  assert.doesNotMatch(archiveDetail, /activeDetailTab === "growth"/);
  assert.match(archiveDetail, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(archiveDetail, /className="mobile-app-grid-only"/);
  assert.match(archiveDetail, /onCountChange=\{setExperienceCardCount\}/);
  assert.match(archiveHeader, /profileAlwaysOpen/);
  assert.match(headerView, /profileAlwaysOpen \|\| profileOpen/);
});

test("personal space project page has a direct Experience Cards entry", async () => {
  const [personalSpace, zhCopy, enCopy] = await Promise.all([
    source("app/archive/page.tsx"),
    source("lib/i18n/zh.ts"),
    source("lib/i18n/en.ts"),
  ]);

  assert.match(personalSpace, /href="\/experience-cards"/);
  assert.match(personalSpace, /href="\/profile"/);
  assert.match(personalSpace, /spaceProfile\?\.avatar_url/);
  assert.match(personalSpace, /t\.archive_workspace\.personal_info/);
  assert.match(
    personalSpace,
    /\{t\.archive_workspace\.experience_cards\} \{experienceCardCount\}/
  );
  assert.match(zhCopy, /experience_cards: "经验卡"/);
  assert.match(enCopy, /experience_cards: "Experience Cards"/);
  assert.match(zhCopy, /my_experience_cards: "我的经验卡"/);
  assert.match(enCopy, /my_experience_cards: "My experience cards"/);
  assert.match(personalSpace, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.doesNotMatch(personalSpace, /集中查看和管理全部项目的经验卡/);
  assert.match(personalSpace, /display: "inline-flex"/);
  assert.match(personalSpace, /minHeight: 34/);
});
