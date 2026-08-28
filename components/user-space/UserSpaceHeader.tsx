import Link from "next/link";
import UserAvatar from "@/components/social/UserAvatar";
import { useLanguage } from "@/lib/i18n/useLanguage";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";

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
    <>
    <MobilePageHeader
      title={
        <span style={mobileTitleStyle}>
          <UserAvatar avatarUrl={avatarUrl || null} size={28} iconSize={14} />
          <span style={mobileTitleTextStyle}>
            {username || t.profile.space.user_space}
          </span>
        </span>
      }
      titleText={username || t.profile.space.user_space}
      fallbackHref="/discover"
      ariaLabel={t.nav.back}
      right={
        !isSelf && onToggleFollow ? (
          <button
            type="button"
            disabled={followBusy}
            onClick={onToggleFollow}
            style={mobileFollowButtonStyle}
          >
            {followBusy
              ? t.profile.public_profile.processing
              : isFollowing
                ? t.profile.public_profile.following
                : t.profile.public_profile.follow}
          </button>
        ) : null
      }
    />
    <section
      className="mobile-app-desktop-only"
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
    </>
  );
}

const mobileTitleStyle = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
} as const;

const mobileTitleTextStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const mobileFollowButtonStyle = {
  minHeight: 34,
  maxWidth: 94,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  border: "1px solid #d6e4d2",
  borderRadius: 999,
  background: "#f2f8ef",
  color: "#3f703e",
  padding: "0 9px",
  fontSize: 12,
  fontWeight: 750,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  cursor: "pointer",
} as const;

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
