"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import UiIcon from "@/components/ui/UiIcon";

export default function PersonalSpaceMobileIdentity({
  avatarUrl,
  username,
  membershipLabel,
  storageUsagePercent,
  storageTotalLabel,
  experienceLabel,
  experienceCardCount,
  profileHref,
  experienceHref,
  notificationSlot,
  language = "zh",
}: {
  avatarUrl?: string | null;
  username: string;
  membershipLabel?: string | null;
  storageUsagePercent?: number | null;
  storageTotalLabel?: string | null;
  experienceLabel?: string | null;
  experienceCardCount?: number | null;
  profileHref?: string | null;
  experienceHref?: string | null;
  notificationSlot?: ReactNode;
  language?: "zh" | "en";
}) {
  const avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={username}
      style={avatarStyle}
    />
  ) : (
    <span style={avatarFallbackStyle}>
      <UiIcon name="user" size={17} />
    </span>
  );

  const profileName = (
    <span style={usernameStyle}>{username}</span>
  );

  return (
    <section style={identityStyle}>
      <div style={identityLinkStyle}>
        {profileHref ? (
          <Link href={profileHref} style={avatarLinkStyle}>
            {avatar}
          </Link>
        ) : (
          <span style={avatarLinkStyle}>{avatar}</span>
        )}

        <span style={identityTextStyle}>
          <span
            style={
              language === "en"
                ? {
                    ...nameRowStyle,
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 2,
                  }
                : nameRowStyle
            }
          >
            {profileHref ? (
              <Link href={profileHref} style={usernameLinkStyle}>
                {username}
              </Link>
            ) : (
              profileName
            )}
            {membershipLabel ? (
              <span
                style={
                  language === "en"
                    ? {
                        ...membershipStyle,
                        whiteSpace: "normal",
                        overflowWrap: "break-word",
                        lineHeight: 1.2,
                      }
                    : membershipStyle
                }
              >
                {membershipLabel}
              </span>
            ) : null}
          </span>

          {storageTotalLabel ? (
            <span
              style={storageRowStyle}
              aria-label={`${language === "en" ? "Storage total" : "总空间"} ${storageTotalLabel}`}
            >
              <span style={storageTrackStyle}>
                <span
                  style={{
                    ...storageFillStyle,
                    width: `${Math.max(0, Math.min(100, Number(storageUsagePercent || 0)))}%`,
                  }}
                />
              </span>
              <span style={storageTotalStyle}>{storageTotalLabel}</span>
            </span>
          ) : null}
        </span>
      </div>

      {experienceLabel || notificationSlot ? (
        <div style={actionsStyle}>
          {experienceLabel ? (
            experienceHref ? (
              <Link
                href={experienceHref}
                style={inlineEntryStyle}
                aria-label={`${experienceLabel} (${experienceCardCount || 0})`}
              >
                {experienceLabel} {experienceCardCount || 0}
              </Link>
            ) : (
              <span style={inlineEntryStyle}>
                {experienceLabel} {experienceCardCount || 0}
              </span>
            )
          ) : null}
          {notificationSlot}
        </div>
      ) : null}
    </section>
  );
}

const identityStyle: CSSProperties = {
  position: "static",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
  marginTop: 0,
  marginLeft: 0,
  marginRight: 0,
  padding: "7px 2px",
  borderBottom: "1px solid #edf1ea",
  background: "transparent",
};

const identityLinkStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "#253725",
};

const avatarLinkStyle: CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
  textDecoration: "none",
};

const avatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  objectFit: "cover",
  background: "#edf3ea",
  flexShrink: 0,
};

const avatarFallbackStyle: CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  background: "#edf3ea",
  color: "#587155",
  flexShrink: 0,
};

const identityTextStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "grid",
  gap: 3,
};

const nameRowStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "baseline",
  gap: 6,
};

const usernameStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  color: "#253725",
  fontSize: 16,
  fontWeight: 850,
  lineHeight: 1.15,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const usernameLinkStyle: CSSProperties = {
  ...usernameStyle,
  textDecoration: "none",
};

const membershipStyle: CSSProperties = {
  flexShrink: 0,
  color: "#6e7f69",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const storageRowStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const storageTrackStyle: CSSProperties = {
  width: 76,
  maxWidth: 76,
  flex: "0 1 76px",
  height: 6,
  overflow: "hidden",
  borderRadius: 999,
  background: "#e3ebe0",
};

const storageFillStyle: CSSProperties = {
  display: "block",
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #78a96e, #3f7d3d)",
};

const storageTotalStyle: CSSProperties = {
  color: "#7a8675",
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const inlineEntryStyle: CSSProperties = {
  minHeight: 32,
  display: "inline-flex",
  alignItems: "center",
  color: "#4f604d",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  textDecoration: "none",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
  flexShrink: 0,
};
