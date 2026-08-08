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

test("the experience-card owner view keeps editing and video tools compact", async () => {
  const [editor, detail, list, archiveHeader] = await Promise.all([
    source("components/experience-card/ExperienceCardEditor.tsx"),
    source("app/experience-cards/[id]/page.tsx"),
    source("app/experience-cards/page.tsx"),
    source("components/archive-detail/ArchiveDetailHeader.tsx"),
  ]);

  assert.match(editor, /selectedRecordIds/);
  assert.match(editor, /toggleRecord\(record\.id\)/);
  assert.match(editor, /recordIds: selectedRecords\.map/);
  assert.match(editor, /<ExperienceCardVideoPanel/);
  assert.match(editor, /integrated/);
  assert.match(editor, /coverMediaId=\{effectiveCoverMediaId\}/);
  assert.match(editor, /onCoverMediaIdChange=\{setCoverMediaId\}/);
  assert.match(editor, /coverMediaId: effectiveCoverMediaId/);
  assert.match(editor, /保存修改/);
  assert.match(editor, /预览/);
  assert.match(editor, /发布经验卡/);
  assert.match(editor, /项目中其他记录仍保持原来的可见性/);
  assert.match(editor, /embedded = false/);
  assert.match(editor, /编辑经验卡/);
  assert.match(editor, /内容与图片/);
  assert.doesNotMatch(editor, /recordThumbsStyle/);
  assert.doesNotMatch(editor, /打开即可查看和编辑/);
  assert.match(detail, /直接分享/);
  assert.match(detail, /取消公开/);
  assert.match(detail, /来源记录已经变化/);
  assert.match(detail, /type OwnerMode = "view" \| "edit"/);
  assert.match(detail, /ownerMode === "edit"/);
  assert.doesNotMatch(detail, /ownerMode === "video"/);
  assert.doesNotMatch(detail, /生成分享视频/);
  assert.match(detail, /更多/);
  assert.match(detail, /经验过程/);
  assert.match(detail, /ExperienceCardTimeline/);
  assert.ok(
    detail.indexOf("<ExperienceCardVideoPanel") <
      detail.indexOf("<ExperienceCardTimeline")
  );
  assert.ok(
    detail.indexOf("<ExperienceCardVideoPanel") <
      detail.indexOf("<ExperienceCardEditor")
  );
  assert.match(detail, /<ExperienceCardEditor[\s\S]*?cardId=\{id\}[\s\S]*?embedded[\s\S]*?onSaved=/);
  assert.doesNotMatch(detail, /setEditing/);
  assert.match(detail, /detail\.archive\.system_name/);
  assert.match(detail, /href=\{`\/user\/\$\{detail\.card\.user_id\}`\}/);
  assert.match(detail, /href=\{`\/archive\/\$\{detail\.archive\.id\}`\}/);
  assert.match(detail, /<span style=\{sourceLabelStyle\}>用户<\/span>/);
  assert.match(detail, /<span style=\{sourceLabelStyle\}>项目<\/span>/);
  assert.match(detail, /<span style=\{sourceLabelStyle\}>系统名<\/span>/);
  assert.match(detail, /if \(category === "plant" && speciesId\) return `\/plant\/\$\{speciesId\}`/);
  assert.match(detail, /params\.set\("type", "projects"\)/);
  assert.match(detail, /return `\/discover\/search\?\$\{params\.toString\(\)\}`/);
  assert.match(detail, /detail\.archive\.title/);
  assert.match(list, /我的经验卡/);
  assert.match(list, /ExperienceCardListCard/);
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
  const [listCard, loader, timeline, plantDetail] = await Promise.all([
    source("components/experience-card/ExperienceCardListCard.tsx"),
    source("lib/experience-cards.ts"),
    source("components/experience-card/ExperienceCardTimeline.tsx"),
    source("app/plant/[id]/page.tsx"),
  ]);

  assert.match(listCard, /item\.coverUrl/);
  assert.match(listCard, /alt=\{`\$\{item\.title\}封面`\}/);
  assert.match(loader, /row\.cover_media_id/);
  assert.match(loader, /mediaByRecord\.get\(recordId\)\?\.\[0\]/);
  assert.match(loader, /archive\.cover_thumb_path/);
  assert.match(timeline, /thumbWrapStyle/);
  assert.match(timeline, /previewMedia = imageMedia\.slice\(0, 3\)/);
  assert.match(timeline, /共\{imageMedia\.length\}张/);
  assert.doesNotMatch(timeline, />\+\{imageMedia\.length - 1\}</);
  assert.match(timeline, /href=\{`\/archive\/\$\{archive\.id\}\?record=\$\{record\.id\}`\}/);
  assert.match(plantDetail, /hydrateExperienceCardListItems\(cardRows\)/);
  assert.match(plantDetail, /<ExperienceCardListCard/);
});

test("experience card interactions use private collections and restrained helpful feedback", async () => {
  const [migration, detail, interactions, list, editorRedirect] = await Promise.all([
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
  assert.match(detail, /<ExperienceCardEditor[\s\S]*?cardId=\{id\}[\s\S]*?embedded/);
  assert.doesNotMatch(detail, /setEditing\(true\)/);
  assert.match(editorRedirect, /redirect\(`\/experience-cards\/\$\{id\}`\)/);
  assert.match(list, /我的收藏/);
  assert.match(list, /被收藏 \{item\.bookmarkCount\}/);
});


test("experience cards generate and cache a local looping H.264 MP4 with burned record text", async () => {
  const [detail, panel, renderer, cache, packageJson] = await Promise.all([
    source("app/experience-cards/[id]/page.tsx"),
    source("components/experience-card/ExperienceCardVideoPanel.tsx"),
    source("lib/experience-card-video.ts"),
    source("lib/experience-card-video-cache.ts"),
    source("package.json"),
  ]);

  assert.match(detail, /<ExperienceCardVideoPanel detail=\{detail\}/);
  assert.match(panel, /生成竖屏MP4/);
  assert.match(panel, /选择视频画面与封面/);
  assert.match(panel, /视频选图保存在当前设备/);
  assert.match(panel, /自动作为视频片头/);
  assert.match(panel, /selectedImageCount.*张图片/s);
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
    detail.indexOf("<ExperienceCardVideoPanel detail={detail}") <
      detail.indexOf("<article style={cardShellStyle}")
  );
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
  assert.match(detail, /metaLineStyle/);
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
