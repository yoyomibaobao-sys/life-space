"use client";

import { EmptyState, buttonRowStyle, cardBodyStyle, cardTopRowStyle, ghostButtonStyle, listStyle, noteLineStyle, primaryButtonStyle, projectTitleStyle, statsLineStyle, userAvatarWrapStyle, userCardStyle } from "@/components/follow/FollowShared";
import type { FollowUserCard } from "@/lib/follow-types";
import UserAvatar from "@/components/social/UserAvatar";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function FollowUserList({
  items,
  onOpenUser,
  onUnfollow,
}: {
  items: FollowUserCard[];
  onOpenUser: (userId: string) => void;
  onUnfollow: (userId: string) => void;
}) {
  const { language, t } = useLanguage();
  const followT = t.follow;

  if (!items.length) {
    return (
      <EmptyState
        title={followT.empty_users}
        description={followT.empty_users_intro}
        actionLabel={followT.browse_discover}
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
              {followT.latest_update}
              {item.recentArchiveTitles.length
                ? item.recentArchiveTitles.join(language === "zh" ? "、" : ", ")
                : followT.no_recent_update}
            </div>

            <div style={statsLineStyle}>
              <ProjectMetaLine
                projectCount={item.publicArchiveCount}
                updatedAt={item.latestRecordTime}
              />
            </div>

            <div style={buttonRowStyle}>
              <button type="button" onClick={() => onOpenUser(item.id)} style={primaryButtonStyle}>
                {followT.enter_space}
              </button>
              <button type="button" onClick={() => onUnfollow(item.id)} style={ghostButtonStyle}>
                {followT.unfollow}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
