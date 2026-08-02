import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import { DiscoverProjectCard } from "@/components/discover/DiscoverProjectCard";
import ExperienceCardListCard from "@/components/experience-card/ExperienceCardListCard";
import type { ExperienceCardListItem } from "@/lib/experience-card-types";
import type { DiscoveryProjectFeedItem } from "@/lib/discover-project-types";
import type { DiscoverSearchKind } from "@/lib/discover-search-types";
import type { FeedItem } from "@/lib/discover-types";
import { ProjectCardRows, getFeedItemDisplayImageUrl } from "@/components/discover/DiscoverShared";
import UiIcon from "@/components/ui/UiIcon";

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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
            gap: 12,
          }}
        >
          {projectItems.map((item, index) => (
            <DiscoverProjectCard
              key={item.archive_id}
              item={item}
              eager={index < 4}
            />
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
                display: "block",
                textDecoration: "none",
                color: "#1f2d1f",
                background: isHelp ? "#fffaf6" : isResolved ? "#f5fbf6" : "#fff",
                border: isHelp
                  ? "1px solid #f0ddd4"
                  : isResolved
                  ? "1px solid #d7eadc"
                  : "1px solid #e8eee5",
                boxShadow: isHelp
                  ? "inset 0 0 0 1px rgba(166, 95, 69, 0.04)"
                  : isResolved
                  ? "inset 0 0 0 1px rgba(77, 124, 91, 0.04)"
                  : "none",
                borderRadius: 13,
                padding: 9,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                {displayImageUrl ? (
                  <img
                    src={displayImageUrl}
                    alt={record.archive_title || "record image"}
                    loading="lazy"
                    style={{
                      width: 58,
                      height: 58,
                      objectFit: "cover",
                      borderRadius: 9,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 9,
                      flexShrink: 0,
                      background: "#f5f8f4",
                      color: "#9aaa9a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                    }}
                  >
                    <UiIcon name={getArchiveCategoryIcon(record.archive_category)} size={20} />
                  </div>
                )}

                <ProjectCardRows
                  record={record}
                  imageHeight={58}
                  titleFontSize={14}
                  noteMaxLength={96}
                  showUsername
                />
              </div>
            </a>
          );
        })
      )}
    </section>
  );
}
