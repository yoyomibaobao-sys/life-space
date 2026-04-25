import { EmptyState, buttonRowStyle, cardBodyStyle, cardTopRowStyle, ghostButtonStyle, listStyle, noteLineStyle, primaryButtonStyle, projectTitleStyle, statsLineStyle, userAvatarWrapStyle, userCardStyle } from "@/components/follow/FollowShared";
import type { FollowUserCard } from "@/lib/follow-types";
import { formatDateTime } from "@/lib/follow-utils";
import UserAvatar from "@/components/social/UserAvatar";

export default function FollowUserList({
  items,
  onOpenUser,
  onUnfollow,
}: {
  items: FollowUserCard[];
  onOpenUser: (userId: string) => void;
  onUnfollow: (userId: string) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        title="还没有关注的用户"
        description="去别人的空间页点“关注用户”后，这里就会出现。"
        actionLabel="去发现页看看"
        href="/discover"
      />
    );
  }

  return (
    <div style={listStyle}>
      {items.map((item) => (
        <article key={item.id} style={userCardStyle}>
          <div style={userAvatarWrapStyle}>
            <UserAvatar avatarUrl={item.avatarUrl} size={48} iconSize={22} />
          </div>

          <div style={cardBodyStyle}>
            <div style={cardTopRowStyle}>
              <div style={projectTitleStyle}>{item.username}</div>
            </div>

            <div style={noteLineStyle}>
              最近更新：
              {item.recentArchiveTitles.length
                ? item.recentArchiveTitles.join("、")
                : "最近还没有公开项目更新"}
            </div>

            <div style={statsLineStyle}>
              {formatDateTime(item.latestRecordTime)}更新 · 共{item.publicArchiveCount}个公开项目
            </div>

            <div style={buttonRowStyle}>
              <button type="button" onClick={() => onOpenUser(item.id)} style={primaryButtonStyle}>
                进入空间
              </button>
              <button type="button" onClick={() => onUnfollow(item.id)} style={ghostButtonStyle}>
                取消关注
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
