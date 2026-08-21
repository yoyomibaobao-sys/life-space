import Link from "next/link";
import UserAvatar from "@/components/social/UserAvatar";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  username: string;
  avatarUrl?: string | null;
  isSelf?: boolean;
  isFollowing?: boolean;
  followBusy?: boolean;
  onToggleFollow?: () => void;
};

export default function UserSpaceHeader({
  username,
  avatarUrl,
  isSelf = false,
  isFollowing = false,
  followBusy = false,
  onToggleFollow,
}: Props) {
  const { t } = useLanguage();
  return (
    <section
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginBottom: 18,
        flexWrap: "nowrap",
        padding: "7px 2px 10px",
        borderBottom: "1px solid #edf1ea",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          style={{
            display: "inline-flex",
            flexShrink: 0,
          }}
        >
          <UserAvatar avatarUrl={avatarUrl || null} size={40} iconSize={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "block",
              overflow: "hidden",
              color: "#243424",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 17,
              fontWeight: 750,
            }}
          >
            {username || t.profile.space.user_space}
          </div>
        </div>
      </div>

      {isSelf ? (
        <Link href="/archive" style={spaceButtonStyle}>{t.nav.my_space}</Link>
      ) : onToggleFollow ? (
        <button type="button" disabled={followBusy} onClick={onToggleFollow} style={spaceButtonStyle}>
          {followBusy
            ? t.profile.public_profile.processing
            : isFollowing
              ? t.profile.public_profile.following
              : t.profile.public_profile.follow}
        </button>
      ) : null}
    </section>
  );
}

const spaceButtonStyle = {
  minHeight: 38,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d6e4d2",
  borderRadius: 999,
  background: "#f2f8ef",
  color: "#3f703e",
  padding: "0 13px",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const;
