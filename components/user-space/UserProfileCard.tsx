import UserAvatar from "@/components/social/UserAvatar";
import type { UserCardProfile } from "@/lib/user-space-types";

type Props = {
  open: boolean;
  profile: UserCardProfile | null;
  username: string;
  isFollowing: boolean;
  followSubmitting: boolean;
  onClose: () => void;
  onFollowAction: () => void;
};

export default function UserProfileCard({
  open,
  profile,
  username,
  isFollowing,
  followSubmitting,
  onClose,
  onFollowAction,
}: Props) {
  if (!open || !profile) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.36)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 280,
          background: "#fff",
          borderRadius: 18,
          padding: 22,
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        }}
      >
        <UserAvatar
          avatarUrl={profile.avatar_url}
          size={64}
          iconSize={28}
          style={{ margin: "0 auto" }}
        />

        <div style={{ marginTop: 12, fontWeight: 650 }}>
          {profile.username || username || "未设置用户名"}
        </div>

        <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
          Lv.{profile.level || 1} · 🌸 {profile.flower_count || 0}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
          关注 {profile.followingCount || 0} · 粉丝 {profile.followerCount || 0}
        </div>

        <button
          type="button"
          onClick={onFollowAction}
          style={{
            marginTop: 16,
            padding: "8px 16px",
            background: isFollowing ? "#f2f2f2" : "#4f7b45",
            color: isFollowing ? "#333" : "#fff",
            borderRadius: 999,
            cursor: "pointer",
            border: "none",
            fontSize: 14,
          }}
        >
          {followSubmitting ? "处理中..." : isFollowing ? "已关注" : "关注"}
        </button>

        <div
          onClick={onClose}
          style={{
            marginTop: 14,
            fontSize: 12,
            color: "#999",
            cursor: "pointer",
          }}
        >
          关闭
        </div>
      </div>
    </div>
  );
}
