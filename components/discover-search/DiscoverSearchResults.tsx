import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import DiscoverSearchResultCard from "@/components/discover-search/DiscoverSearchResultCard";
import searchCardStyles from "@/components/discover-search/DiscoverSearchResultCard.module.css";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import type { DiscoverSearchKind } from "@/lib/discover-search-types";
import type { FeedItem } from "@/lib/discover-types";
import {
  CategoryBadge,
  EndedBadge,
  HelpBadge,
  RecordTagPill,
  ResolvedBadge,
  getFeedItemDisplayImageUrl,
} from "@/components/discover/DiscoverShared";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import { getArchiveLifecycleStatus } from "@/lib/discover-utils";
import { getDurationDays } from "@/lib/follow-utils";
import { useLanguage } from "@/lib/i18n/useLanguage";
import type { Language } from "@/lib/i18n";

type Props = {
  kind: DiscoverSearchKind;
  projectItems: DiscoveryProjectFeedItem[];
  recordItems: FeedItem[];
  experienceItems: ExperienceCardListItem[];
  loading: boolean;
  hasRun: boolean;
  hideHeader?: boolean;
};

function getProjectSystemName(item: DiscoveryProjectFeedItem) {
  return item.category === "plant"
    ? item.species_name_snapshot || item.system_name
    : item.system_name || item.species_name_snapshot;
}

function getRecordSystemName(record: FeedItem) {
  return record.archive_category === "plant"
    ? record.species_name_snapshot || record.system_name
    : record.system_name || record.species_name_snapshot;
}

function getDistinctSystemName(title: string, systemName?: string | null) {
  const normalizedTitle = title.trim().toLocaleLowerCase();
  const normalizedSystem = String(systemName || "").trim().toLocaleLowerCase();
  if (!normalizedSystem || normalizedTitle.includes(normalizedSystem)) return null;
  return String(systemName).trim();
}

function getCompactRegion(region: string | null | undefined, language: Language) {
  const value = String(region || "").trim();
  if (language !== "zh") return value;
  return value.replace(/^中国\s*(?:[·•｜|/]\s*|\s+)/, "").trim();
}

export default function DiscoverSearchResults({
  kind,
  projectItems,
  recordItems,
  experienceItems,
  loading,
  hasRun,
  hideHeader = false,
}: Props) {
  const { language, t } = useLanguage();
  const kindLabels: Record<DiscoverSearchKind, { title: string; unit: string }> = {
    projects: {
      title: t.discover.search_ui.projects,
      unit: t.discover.search_ui.project_unit,
    },
    records: {
      title: t.discover.search_ui.records,
      unit: t.discover.search_ui.record_unit,
    },
    experience: {
      title: t.discover.search_ui.experience_cards,
      unit: t.discover.search_ui.card_unit,
    },
  };
  const itemCount =
    kind === "projects"
      ? projectItems.length
      : kind === "records"
        ? recordItems.length
        : experienceItems.length;
  const labels = kindLabels[kind];

  return (
    <section>
      {!hideHeader ? <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 9,
          color: "#6f7f6f",
          fontSize: 12,
        }}
      >
        <span>{labels.title}</span>
        {hasRun && !loading ? <span>{itemCount} {labels.unit}</span> : null}
      </div> : null}

      {loading ? (
        <div
          style={{
            padding: "22px 12px",
            textAlign: "center",
            color: "#8a998a",
            fontSize: 13,
          }}
        >
          {t.discover.search_ui.searching}
        </div>
      ) : hasRun && itemCount === 0 ? (
        <div
          style={{
            padding: "28px 12px",
            textAlign: "center",
            color: "#8a998a",
            fontSize: 13,
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #edf2ea",
          }}
        >
          {t.discover.search_ui.no_results_prefix}{labels.title}
        </div>
      ) : kind === "projects" ? (
        <div className={searchCardStyles.grid}>
          {projectItems.map((item) => {
            const title = item.archive_title?.trim() || t.discover.unnamed_project;
            const systemName = getProjectSystemName(item);
            const ownerName = item.profile_display_name?.trim() || t.discover.default_grower;
            const region = getCompactRegion(item.profile_region, language);

            return (
              <DiscoverSearchResultCard
                key={item.archive_id}
                href={`/archive/${item.archive_id}`}
                ariaLabel={`${t.discover.search_ui.view_project_prefix}${title}`}
                title={title}
                secondaryTitle={getDistinctSystemName(title, systemName)}
                imageUrl={item.display_image_url}
                imageAlt={title}
                fallbackIcon={getArchiveCategoryIcon(item.category)}
                category={<CategoryBadge category={item.category} />}
                status={
                  <>
                    {item.has_public_help ? <HelpBadge /> : null}
                    {item.archive_ended_at ? <EndedBadge /> : null}
                  </>
                }
                dateValue={item.public_activity_at}
                summary={item.card_summary?.trim() || undefined}
                author={`${ownerName}${region ? ` · ${region}` : ""}`}
                meta={
                  <ProjectMetaLine
                    recordCount={item.public_record_count}
                    durationDays={getDurationDays(
                      item.archive_created_at,
                      item.archive_ended_at
                    )}
                    ended={Boolean(item.archive_ended_at)}
                    viewCount={hideHeader ? undefined : item.view_count}
                    compactProjectStats
                    style={{ fontSize: 11, gap: "4px 8px" }}
                  />
                }
              />
            );
          })}
        </div>
      ) : kind === "experience" ? (
        <div className={searchCardStyles.grid}>
          {experienceItems.map((item) => (
            <DiscoverSearchResultCard
              key={item.id}
              href={`/experience-cards/${item.id}`}
              ariaLabel={`${t.discover.search_ui.view_experience_prefix}${item.title}`}
              title={item.title}
              imageUrl={item.coverUrl}
              imageAlt={`${item.title}${t.discover.search_ui.experience_cover_suffix}`}
              fallbackIcon={getArchiveCategoryIcon(item.archiveCategory)}
              category={<CategoryBadge category={item.archiveCategory} />}
              dateValue={item.published_at}
              detail={
                <>
                  {t.discover.search_ui.source}{item.archiveTitle}
                  {item.systemName ? ` · ${item.systemName}` : ""}
                </>
              }
              summary={item.description?.trim() || undefined}
              author={`${item.authorName}${getCompactRegion(item.authorRegion, language) ? ` · ${getCompactRegion(item.authorRegion, language)}` : ""}`}
              meta={
                <ProjectMetaLine
                  recordCount={item.source_record_count}
                  durationDays={item.durationDays}
                  style={{ fontSize: 11, gap: "4px 8px" }}
                />
              }
            />
          ))}
        </div>
      ) : (
        <div className={searchCardStyles.grid}>
          {recordItems.map((record) => {
            const isHelp = record.status_tag === "help";
            const isResolved = record.status_tag === "resolved";
            const isEnded = getArchiveLifecycleStatus(record) === "ended";
            const displayImageUrl = getFeedItemDisplayImageUrl(record);
            const title = record.archive_title?.trim() || t.discover.unnamed_project;
            const systemName = getRecordSystemName(record);
            const tags = Array.isArray(record.display_tags)
              ? record.display_tags.slice(0, 2)
              : [];
            const authorName = record.username?.trim() || t.discover.default_user;
            const location = getCompactRegion(record.user_location, language);

            return (
              <DiscoverSearchResultCard
                key={record.record_id}
                href={`/archive/${record.archive_id}?record=${record.record_id}`}
                ariaLabel={`${t.discover.search_ui.view_record_prefix}${title}`}
                title={title}
                secondaryTitle={getDistinctSystemName(title, systemName)}
                imageUrl={displayImageUrl}
                imageAlt={`${title}${t.discover.search_ui.record_image_suffix}`}
                fallbackIcon={getArchiveCategoryIcon(record.archive_category)}
                category={<CategoryBadge category={record.archive_category} />}
                status={
                  <>
                    {isHelp ? <HelpBadge /> : null}
                    {isResolved ? <ResolvedBadge /> : null}
                    {isEnded ? <EndedBadge /> : null}
                  </>
                }
                dateValue={record.record_time}
                detail={
                  tags.length > 0 ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {tags.map((tag) => (
                        <RecordTagPill key={tag} record={record} tag={tag} />
                      ))}
                    </span>
                  ) : null
                }
                summary={record.note?.trim() || undefined}
                author={`${authorName}${location ? ` · ${location}` : ""}`}
                meta={
                  <ProjectMetaLine
                    photoCount={record.media_count}
                    commentCount={record.comment_count}
                    viewCount={record.archive_view_count ?? record.view_count}
                    style={{ fontSize: 11, gap: "4px 8px" }}
                  />
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
