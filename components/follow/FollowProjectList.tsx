import Link from "next/link";
import { EmptyState, StatusBadge, buttonRowStyle, cardBodyStyle, cardStyle, coverImageStyle, coverStyle, ghostButtonStyle, lineClampOneStyle, listStyle, metaLineStyle, noteLineStyle, primaryButtonStyle, projectTitleStyle, statsLineStyle, textLinkStyle, cardTopRowStyle } from "@/components/follow/FollowShared";
import type { FollowProjectCard } from "@/lib/follow-types";
import { formatDateTime } from "@/lib/follow-utils";
import { getArchiveDisplayName } from "@/lib/social-space-shared";

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
        const meta = [item.ownerName, item.categoryLabel];
        if (item.subTagName) meta.push(item.subTagName);
        if (item.groupTagName) meta.push(item.groupTagName);

        const stats = [
          `${formatDateTime(item.latestRecordTime)}更新`,
          `${item.recordCount}条记录`,
          `已持续${item.durationDays}天`,
        ];

        return (
          <article key={item.id} style={cardStyle}>
            <div style={coverStyle}>
              {item.coverUrl ? (
                <img src={item.coverUrl} alt="" style={coverImageStyle} />
              ) : (
                <span style={{ fontSize: 34 }}>{item.categoryIcon}</span>
              )}
            </div>

            <div style={cardBodyStyle}>
              <div style={cardTopRowStyle}>
                <div style={lineClampOneStyle}>
                  <span style={projectTitleStyle}>{getArchiveDisplayName(item.title, item.displaySystemName)}</span>
                </div>

                {item.statusKind !== "normal" ? (
                  <StatusBadge kind={item.statusKind}>{item.statusLabel}</StatusBadge>
                ) : null}
              </div>

              <div style={metaLineStyle}>{meta.join(" · ")}</div>
              <div style={noteLineStyle}>最近记录：{item.latestNote}</div>
              <div style={statsLineStyle}>{stats.join(" · ")}</div>

              <div style={buttonRowStyle}>
                <button type="button" onClick={() => onOpenArchive(item.id)} style={primaryButtonStyle}>
                  查看记录
                </button>
                <button type="button" onClick={() => onUnfollow(item.id)} style={ghostButtonStyle}>
                  取消关注
                </button>
                <Link href={`/user/${item.ownerId}`} style={textLinkStyle}>
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
