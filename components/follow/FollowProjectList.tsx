import Link from "next/link";
import { EmptyState, StatusBadge, buttonRowStyle, cardBodyStyle, cardStyle, coverImageStyle, coverStyle, ghostButtonStyle, listStyle, metaLineStyle, noteLineStyle, primaryButtonStyle, projectInlineMetaStyle, projectStatsPillStyle, projectTitleStyle, textLinkStyle } from "@/components/follow/FollowShared";
import type { FollowProjectCard } from "@/lib/follow-types";
import { getArchiveDisplayName } from "@/lib/social-space-shared";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";

export default function FollowProjectList({
  items,
  onOpenArchive,
  onUnfollow,
}: {
  items: FollowProjectCard[];
  onOpenArchive: (archiveId: string) => void;
  onUnfollow: (archiveId: string) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        title="还没有关注的项目"
        description="去别人的项目页点“关注项目”后，这里就会出现。"
        actionLabel="去发现页看看"
        href="/discover"
      />
    );
  }

  return (
    <div style={listStyle}>
      {items.map((item) => {
        const meta = [item.displaySystemName, item.ownerName];
        if (item.subTagName) meta.push(item.subTagName);
        if (item.groupTagName) meta.push(item.groupTagName);

        return (
          <article
            key={item.id}
            style={{
              ...cardStyle,
              gridTemplateColumns: "100px minmax(0, 1fr)",
              gap: 10,
              padding: 8,
              borderRadius: 16,
              alignItems: "start",
            }}
          >
            <div style={{ ...coverStyle, width: 100, height: 100, minHeight: 100, maxHeight: 100, alignSelf: "start", borderRadius: 14 }}>
              {item.coverUrl ? (
                <img src={item.coverUrl} alt="" style={coverImageStyle} />
              ) : (
                <UiIcon name={item.categoryIcon} size={32} strokeWidth={1.6} />
              )}
            </div>

            <div style={{ ...cardBodyStyle, display: "grid", gridTemplateRows: "auto auto auto auto", gap: 3, alignContent: "space-between" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 6,
                  minWidth: 0,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={projectInlineMetaStyle}>{item.categoryLabel} ·</span>
                <span
                  style={{
                    ...projectTitleStyle,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {getArchiveDisplayName(item.title, item.displaySystemName)}
                </span>
                <ProjectMetaLine recordCount={item.recordCount} durationDays={item.durationDays} />
                {item.statusKind !== "normal" ? (
                  <StatusBadge kind={item.statusKind}>{item.statusLabel}</StatusBadge>
                ) : null}
              </div>

              <div style={metaLineStyle}>{meta.filter(Boolean).join(" · ") || "关注项目"}</div>
              <div style={noteLineStyle}>
                {item.latestNote}
                {item.latestRecordTime ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <CompactActivityTime value={item.latestRecordTime} />
                  </>
                ) : null}
              </div>

              <div style={{ ...buttonRowStyle, gap: 5, flexWrap: "nowrap", overflow: "hidden", marginTop: 0 }}>
                <button type="button" onClick={() => onOpenArchive(item.id)} style={{ ...primaryButtonStyle, padding: "4px 8px", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                  查看记录
                </button>
                <button type="button" onClick={() => onUnfollow(item.id)} style={{ ...ghostButtonStyle, padding: "4px 8px", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                  取消关注
                </button>
                <Link href={`/user/${item.ownerId}`} style={{ ...textLinkStyle, fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                  进入空间
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
