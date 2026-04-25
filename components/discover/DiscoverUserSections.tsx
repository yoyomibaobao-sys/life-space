import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import type { FeedItem, UserSection } from "@/lib/discover-types";
import { formatDate, getArchiveLifecycleStatus } from "@/lib/discover-utils";
import { DefaultUserAvatar, ProjectCardRows } from "@/components/discover/DiscoverShared";

function DiscoverUserRecordCard({ record, index }: { record: FeedItem; index: number }) {
  const isHelp = record.status_tag === "help";
  const isResolved = record.status_tag === "resolved";

  return (
    <a
      href={`/archive/${record.archive_id}?record=${record.record_id}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "#1f2d1f",
        borderTop: index === 0 ? "none" : "1px solid #f0f2ef",
        padding: "12px 4px",
        background: isHelp
          ? "linear-gradient(90deg, #fffaf6 0%, rgba(255,250,246,0.25) 100%)"
          : isResolved
          ? "linear-gradient(90deg, #f5fbf6 0%, rgba(245,251,246,0.2) 100%)"
          : "transparent",
        borderRadius: isHelp || isResolved ? 12 : 0,
        boxShadow: isHelp
          ? "inset 0 0 0 1px #f0ddd4"
          : isResolved
          ? "inset 0 0 0 1px #d7eadc"
          : "none",
        opacity: getArchiveLifecycleStatus(record) === "ended" ? 0.68 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {record.primary_image_url ? (
          <img
            src={record.primary_image_url}
            alt={record.archive_title || "record image"}
            style={{
              width: 62,
              height: 62,
              objectFit: "cover",
              borderRadius: 11,
              flexShrink: 0,
              background: "#f5f8f4",
            }}
          />
        ) : (
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: 11,
              flexShrink: 0,
              background: record.archive_category === "plant" ? "#f4f9f1" : "#fff9e8",
              color: record.archive_category === "plant" ? "#5f8f55" : "#9a7d2f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              border:
                record.archive_category === "plant"
                  ? "1px solid #dfeadb"
                  : "1px solid #efe1af",
            }}
          >
            {getArchiveCategoryIcon(record.archive_category)}
          </div>
        )}

        <ProjectCardRows
          record={record}
          imageHeight={62}
          titleFontSize={15}
          noteMaxLength={88}
          enableTagLinks
        />
      </div>
    </a>
  );
}

function DiscoverUserSectionCard({
  section,
  isExpanded,
  onToggle,
  onGoUser,
}: {
  section: UserSection;
  isExpanded: boolean;
  onToggle: (userId: string) => void;
  onGoUser: (userId: string) => void;
}) {
  const visibleRecords = isExpanded ? section.records : section.records.slice(0, 2);
  const hiddenCount = Math.max(section.records.length - 2, 0);
  const hasMoreProjectsInSpace = section.total_project_count > 4;

  return (
    <section
      key={section.user_id}
      style={{
        marginBottom: 10,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e8eee5",
        overflow: "hidden",
        boxShadow: "0 1px 8px rgba(0,0,0,0.025)",
      }}
    >
      <button
        type="button"
        onClick={() => onGoUser(section.user_id)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "none",
          borderBottom: "1px solid #f1f4ef",
          background: "#fff",
          padding: "9px 10px",
          cursor: "pointer",
          color: "#1f2d1f",
          textAlign: "left",
          minWidth: 0,
        }}
      >
        {section.avatar_url ? (
          <img
            src={section.avatar_url}
            alt={section.username}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
        ) : (
          <DefaultUserAvatar />
        )}

        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            minWidth: 0,
            fontSize: 12,
            color: "#8a998a",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1f2d1f",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 150,
            }}
          >
            {section.username || "用户"}
          </span>
          {section.user_location ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              · {section.user_location}
            </span>
          ) : null}
          <span>· 更新 {formatDate(section.latest_time)}</span>
        </span>
      </button>

      <div style={{ padding: "2px 10px 6px 10px" }}>
        {visibleRecords.map((record, index) => (
          <DiscoverUserRecordCard key={record.record_id} record={record} index={index} />
        ))}

        {isExpanded && hasMoreProjectsInSpace && (
          <div
            style={{
              borderTop: "1px solid #f0f2ef",
              padding: "10px 0 8px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                color: "#8a998a",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              这里只展示最近 4 个项目，更多内容可以进入他的空间慢慢看。
            </span>

            <button
              type="button"
              onClick={() => onGoUser(section.user_id)}
              style={{
                border: "1px solid #d9e6d0",
                background: "#eef5e8",
                color: "#496b3f",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              进入他的空间
            </button>
          </div>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => onToggle(section.user_id)}
            style={{
              width: "100%",
              border: "none",
              borderTop:
                isExpanded && hasMoreProjectsInSpace ? "none" : "1px solid #f0f2ef",
              background: "transparent",
              color: "#4CAF50",
              cursor: "pointer",
              padding: "7px 0 3px 0",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            {isExpanded ? "收起 ▲" : `展开更多 ${hiddenCount} 个项目 ▼`}
          </button>
        )}
      </div>
    </section>
  );
}

export function DiscoverUserSections({
  sections,
  expandedUserIds,
  onToggle,
  onGoUser,
}: {
  sections: UserSection[];
  expandedUserIds: string[];
  onToggle: (userId: string) => void;
  onGoUser: (userId: string) => void;
}) {
  return (
    <>
      {sections.map((section) => (
        <DiscoverUserSectionCard
          key={section.user_id}
          section={section}
          isExpanded={expandedUserIds.includes(section.user_id)}
          onToggle={onToggle}
          onGoUser={onGoUser}
        />
      ))}
    </>
  );
}
