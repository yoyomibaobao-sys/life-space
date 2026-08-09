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
      <div
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
      </div>

      {loading ? (
        <div
          style={{
            padding: "22px 12px",
            textAlign: "center",
            color: "#8a998a",
            fontSize: 13,
          }}
        >
          搜索中...
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
          没有找到符合条件的公开{labels.title}
        </div>
      ) : kind === "projects" ? (
        <div className={searchCardStyles.grid}>
          {projectItems.map((item) => {
            const title = item.archive_title?.trim() || "未命名项目";
            const systemName = getProjectSystemName(item);
            const ownerName = item.profile_display_name?.trim() || "一位种植者";
            const region = item.profile_region?.trim();

            return (
              <DiscoverSearchResultCard
                key={item.archive_id}
                href={`/archive/${item.archive_id}`}
                ariaLabel={`查看项目：${title}`}
                title={title}
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
                detail={systemName}
                summary={item.card_summary || "项目刚刚开始"}
                author={`${ownerName}${region ? ` · ${region}` : ""}`}
                meta={
                  <ProjectMetaLine
                    recordCount={item.public_record_count}
                    durationDays={getDurationDays(
                      item.archive_created_at,
                      item.archive_ended_at
                    )}
                    ended={Boolean(item.archive_ended_at)}
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
              ariaLabel={`查看经验卡：${item.title}`}
              title={item.title}
              imageUrl={item.coverUrl}
              imageAlt={`${item.title}封面`}
              fallbackIcon={getArchiveCategoryIcon(item.archiveCategory)}
              category={<CategoryBadge category={item.archiveCategory} />}
              dateValue={item.published_at}
              detail={
                <>
                  来源：{item.archiveTitle}
                  {item.systemName ? ` · ${item.systemName}` : ""}
                </>
              }
              summary="查看按原始时间排列的真实记录与照片"
              author={`${item.authorName}${item.authorRegion ? ` · ${item.authorRegion}` : ""}`}
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
            const title = record.archive_title?.trim() || "未命名项目";
            const systemName = getRecordSystemName(record);
            const tags = Array.isArray(record.display_tags)
              ? record.display_tags.slice(0, 2)
              : [];
            const authorName = record.username?.trim() || "用户";
            const location = record.user_location?.trim();

            return (
              <DiscoverSearchResultCard
                key={record.record_id}
                href={`/archive/${record.archive_id}?record=${record.record_id}`}
                ariaLabel={`查看记录：${title}`}
                title={title}
                imageUrl={displayImageUrl}
                imageAlt={`${title}记录图片`}
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
                  systemName || tags.length > 0 ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {systemName ? <span>{systemName}</span> : null}
                      {tags.map((tag) => (
                        <RecordTagPill key={tag} record={record} tag={tag} />
                      ))}
                    </span>
                  ) : null
                }
                summary={
                  record.note?.trim() ||
                  (displayImageUrl
                    ? "这条记录以照片为主"
                    : "这条记录没有文字")
                }
                author={`${authorName}${location ? ` · ${location}` : ""}`}
                meta={
                  <ProjectMetaLine
                    photoCount={record.media_count}
                    commentCount={record.comment_count}
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
