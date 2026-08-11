import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type { ArchiveStat, UserSpaceArchive, UserSpaceTag } from "@/lib/user-space-types";
import {
  followedBadgeStyle,
  endedBadgeStyle,
  helpBadgeStyle,
  typeBadgeStyle,
} from "@/components/user-space/UserSpaceShared";
import { getGroupTagName, getSubTagName } from "@/lib/user-space-utils";
import { getArchiveDisplayName } from "@/lib/social-space-shared";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  archives: UserSpaceArchive[];
  subTags: UserSpaceTag[];
  groupTags: UserSpaceTag[];
  statsMap: Record<string, ArchiveStat>;
  coverMap: Record<string, string>;
  followedArchiveIds: string[];
  onOpenArchive: (archiveId: string) => void;
};

export default function UserSpaceArchiveList({
  archives,
  subTags,
  groupTags,
  statsMap,
  coverMap,
  followedArchiveIds,
  onOpenArchive,
}: Props) {
  const { language, t } = useLanguage();
  if (archives.length === 0) {
    return (
      <div
        style={{
          border: "1px solid #edf1e8",
          borderRadius: 16,
          padding: 28,
          textAlign: "center",
          color: "#8b9487",
          background: "#fff",
        }}
      >
        {t.profile.space.no_public_projects}
      </div>
    );
  }

  return (
    <>
      {archives.map((archive) => {
        const stat = statsMap[archive.id];
        const latest = stat?.latest;
        const cover = coverMap[archive.id];
        const subTagName = getSubTagName(subTags, archive.sub_tag_id, language);
        const groupTagName = getGroupTagName(groupTags, archive.group_tag_id);
        const isEnded = archive.status === "ended";
        const hasHelp = stat?.hasHelp;

        const metaItems = [subTagName, groupTagName].filter(Boolean);

        return (
          <article
            key={archive.id}
            onClick={() => onOpenArchive(archive.id)}
            style={{
              display: "flex",
              gap: 12,
              border: "1px solid #e4eadf",
              borderRadius: 16,
              padding: 12,
              marginBottom: 12,
              background: isEnded ? "#fbfbf8" : "#fff",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                flex: "0 0 96px",
                borderRadius: 12,
                overflow: "hidden",
                background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9aaa9a",
                fontSize: 28,
              }}
            >
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <UiIcon name={getArchiveCategoryIcon(archive.category)} size={22} />
              )}
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                height: 96,
                display: "grid",
                gridTemplateRows: "1fr 1fr 1fr",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <span style={typeBadgeStyle}>{getArchiveCategoryLabel(archive.category, language)}</span>

                {hasHelp && <span style={helpBadgeStyle}>{t.profile.space.help}</span>}

                {isEnded && <span style={endedBadgeStyle}>{t.profile.space.ended}</span>}

                {followedArchiveIds.includes(archive.id) && (
                  <span style={followedBadgeStyle}>{t.profile.space.followed}</span>
                )}

                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: 650,
                    color: "#263326",
                  }}
                >
                  {getArchiveDisplayName(archive.title, archive.system_name || archive.species_name_snapshot, language)}
                </span>
              </div>

              <div
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "#5f6b5c",
                  fontSize: 14,
                }}
              >
                {latest?.note || t.profile.space.no_public_records}
                {latest?.record_time ? (
                  <span style={{ color: "#9a9f94" }}>
                    <span aria-hidden="true"> · </span>
                    <CompactActivityTime value={latest.record_time} />
                  </span>
                ) : null}
              </div>

              <div
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "#90998c",
                  fontSize: 13,
                }}
              >
                {metaItems.length ? `${metaItems.join(" · ")} · ` : null}
                <ProjectMetaLine
                  recordCount={stat?.count || archive.record_count || 0}
                  viewCount={archive.view_count || 0}
                />
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
}
