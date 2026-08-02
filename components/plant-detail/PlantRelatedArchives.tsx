import Link from "next/link";
import type { PlantRelatedArchiveItem } from "@/lib/plant-detail-types";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";

function getHelpLabel(status?: string | null) {
  if (status === "open") return "求助中";
  if (status === "resolved") return "求助已解决";
  return "";
}

export default function PlantRelatedArchives({
  archives,
}: {
  archives: PlantRelatedArchiveItem[];
}) {
  const uniqueArchives = Array.from(
    new Map(archives.map((archive) => [archive.archive_id, archive])).values()
  );

  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>相关种植项目</h2>
      </div>

      {uniqueArchives.length === 0 ? (
        <div
          style={{
            padding: 18,
            border: "1px solid #eee",
            borderRadius: 14,
            color: "#888",
            background: "#fff",
          }}
        >
          还没有相关公开项目
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {uniqueArchives.map((archive) => {
            const imageUrl =
              archive.display_cover_image_url ||
              archive.display_last_public_record_image_url;
            const helpLabel = getHelpLabel(archive.archive_help_status);
            const visibilityLabel = archive.is_own_archive
              ? archive.archive_is_public
                ? "我的公开项目"
                : "我的项目 · 仅自己可见"
              : "公开项目";

            return (
              <Link
                key={archive.archive_id}
                href={`/archive/${archive.archive_id}?mode=viewer`}
                style={{
                  display: "grid",
                  gridTemplateColumns: imageUrl ? "96px minmax(0, 1fr)" : "1fr",
                  gap: 12,
                  padding: 14,
                  border: "1px solid #eee",
                  borderRadius: 14,
                  background: "#fff",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    style={{
                      width: 96,
                      height: 96,
                      objectFit: "cover",
                      borderRadius: 10,
                      background: "#f4f6f1",
                    }}
                  />
                ) : null}

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#263326" }}>
                    {archive.archive_title || "种植项目"}
                  </div>
                  <div style={{ marginTop: 4, color: "#70806a", fontSize: 13 }}>
                    {archive.species_name_snapshot || archive.system_name || "未填写植物名"}
                  </div>
                  <div style={{ marginTop: 8, color: "#6a7564", fontSize: 13 }}>
                    {visibilityLabel}
                    {helpLabel ? ` · ${helpLabel}` : ""}
                  </div>
                  <ProjectMetaLine
                    recordCount={Number(archive.public_record_count || 0)}
                    updatedAt={archive.last_public_record_time}
                    style={{ marginTop: 7 }}
                  />
                  <div
                    style={{
                      marginTop: 6,
                      color: "#555",
                      fontSize: 14,
                      lineHeight: 1.6,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {archive.last_public_record_note || "还没有公开记录摘要"}
                  </div>
                  {archive.username ? (
                    <div style={{ marginTop: 8, color: "#8a9584", fontSize: 12 }}>
                      来自 {archive.username}
                    </div>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
