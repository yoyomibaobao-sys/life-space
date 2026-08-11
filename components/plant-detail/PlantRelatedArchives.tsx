"use client";

import Link from "next/link";
import type { PlantRelatedArchiveItem } from "@/lib/plant-detail-types";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import { useLanguage } from "@/lib/i18n/useLanguage";

function getHelpLabel(
  status: string | null | undefined,
  labels: { open: string; resolved: string }
) {
  if (status === "open") return labels.open;
  if (status === "resolved") return labels.resolved;
  return "";
}

export default function PlantRelatedArchives({
  archives,
}: {
  archives: PlantRelatedArchiveItem[];
}) {
  const { t } = useLanguage();
  const copy = t.plant.detail;
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
        <h2 style={{ margin: 0, fontSize: 18 }}>{copy.related_projects}</h2>
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
          {copy.no_related_public_projects}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {uniqueArchives.map((archive) => {
            const imageUrl =
              archive.display_cover_image_url ||
              archive.display_last_public_record_image_url;
            const helpLabel = getHelpLabel(archive.archive_help_status, {
              open: copy.help_open,
              resolved: copy.help_resolved,
            });
            const visibilityLabel = archive.is_own_archive
              ? archive.archive_is_public
                ? copy.my_public_project
                : copy.my_private_project
              : copy.public_project;

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
                    {archive.archive_title || copy.planting_project}
                  </div>
                  <div style={{ marginTop: 4, color: "#70806a", fontSize: 13 }}>
                    {archive.species_name_snapshot || archive.system_name || copy.plant_name_missing}
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
                    {archive.last_public_record_note || copy.no_public_record_summary}
                  </div>
                  {archive.username ? (
                    <div style={{ marginTop: 8, color: "#8a9584", fontSize: 12 }}>
                      {copy.from_prefix}{archive.username}
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
