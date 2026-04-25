import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import type { FeedItem } from "@/lib/discover-types";
import { ProjectCardRows } from "@/components/discover/DiscoverShared";

type Props = {
  items: FeedItem[];
  loading: boolean;
  hasRun: boolean;
};

export default function DiscoverSearchResults({ items, loading, hasRun }: Props) {
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
        <span>全部记录</span>
        {hasRun && !loading ? <span>{items.length} 条</span> : null}
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
      ) : hasRun && items.length === 0 ? (
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
          没有找到符合条件的公开记录
        </div>
      ) : (
        items.map((record) => {
          const isHelp = record.status_tag === "help";
          const isResolved = record.status_tag === "resolved";

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
                {record.primary_image_url ? (
                  <img
                    src={record.primary_image_url}
                    alt={record.archive_title || "record image"}
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
                    {getArchiveCategoryIcon(record.archive_category)}
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
