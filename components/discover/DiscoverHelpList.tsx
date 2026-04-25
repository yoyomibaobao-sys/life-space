import { getArchiveCategoryIcon } from "@/lib/archive-categories";
import type { FeedItem } from "@/lib/discover-types";
import { getArchiveLifecycleStatus } from "@/lib/discover-utils";
import { ProjectCardRows } from "@/components/discover/DiscoverShared";

export function DiscoverHelpList({ items }: { items: FeedItem[] }) {
  return (
    <div>
      {items.map((record) => {
        const isHelp = record.status_tag === "help";

        return (
          <a
            key={record.record_id}
            href={`/archive/${record.archive_id}?record=${record.record_id}`}
            style={{
              display: "block",
              textDecoration: "none",
              color: "#1f2d1f",
              background: isHelp ? "#fffaf6" : "#fff",
              border: isHelp ? "1px solid #f0ddd4" : "1px solid #e8eee5",
              boxShadow: isHelp
                ? "inset 0 0 0 1px rgba(166, 95, 69, 0.04)"
                : "0 2px 10px rgba(0,0,0,0.025)",
              borderRadius: 16,
              padding: 10,
              marginBottom: 10,
              opacity: getArchiveLifecycleStatus(record) === "ended" ? 0.68 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
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
                    background: "#f5f8f4",
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
      })}
    </div>
  );
}
