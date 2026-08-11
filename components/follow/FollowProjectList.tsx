"use client";

import Link from "next/link";
import { EmptyState, StatusBadge, buttonRowStyle, cardBodyStyle, cardStyle, coverImageStyle, coverStyle, ghostButtonStyle, listStyle, metaLineStyle, noteLineStyle, primaryButtonStyle, projectInlineMetaStyle, projectStatsPillStyle, projectTitleStyle, textLinkStyle } from "@/components/follow/FollowShared";
import type { FollowProjectCard } from "@/lib/follow-types";
import { getArchiveDisplayName } from "@/lib/social-space-shared";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function FollowProjectList({
  items,
  onOpenArchive,
  onUnfollow,
}: {
  items: FollowProjectCard[];
  onOpenArchive: (archiveId: string) => void;
  onUnfollow: (archiveId: string) => void;
}) {
  const { language, t } = useLanguage();
  const followT = t.follow;

  if (!items.length) {
    return (
      <EmptyState
        title={followT.empty_projects}
        description={followT.empty_projects_intro}
        actionLabel={followT.browse_discover}
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
                  {getArchiveDisplayName(item.title, item.displaySystemName, language)}
                </span>
                <ProjectMetaLine recordCount={item.recordCount} durationDays={item.durationDays} />
                {item.statusKind !== "normal" ? (
                  <StatusBadge kind={item.statusKind}>{item.statusLabel}</StatusBadge>
                ) : null}
              </div>

              <div style={metaLineStyle}>{meta.filter(Boolean).join(" · ") || followT.projects}</div>
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
                  {followT.view_records}
                </button>
                <button type="button" onClick={() => onUnfollow(item.id)} style={{ ...ghostButtonStyle, padding: "4px 8px", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {followT.unfollow}
                </button>
                <Link href={`/user/${item.ownerId}`} style={{ ...textLinkStyle, fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {followT.enter_space}
                </Link>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
