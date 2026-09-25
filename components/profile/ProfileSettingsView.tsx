"use client";

import type { CSSProperties, ReactNode } from "react";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import ConnectivityNotice from "@/components/mobile/ConnectivityNotice";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { showToast } from "@/components/Toast";

export type ProfileSettingsIdentity = {
  username: string;
  membershipLabel: string;
  storageLabel: string;
  avatarUrl?: string | null;
};

export default function ProfileSettingsView({
  identity,
  onBack,
  onLogout,
  onOpenProjectCategories,
  cloudLocked = false,
  extraLocalSettings,
}: {
  identity: ProfileSettingsIdentity;
  onBack: () => void;
  onLogout: () => void;
  onOpenProjectCategories: () => void;
  cloudLocked?: boolean;
  extraLocalSettings?: ReactNode;
}) {
  const { language, setLanguage, t } = useLanguage();
  const cloudHint = t.archive_workspace.cloud_setting_requires_network;

  function requireCloud() {
    showToast(cloudHint);
  }

  const cloudRows = [
    { key: "membership", label: language === "en" ? "Cloud Membership" : "开通云会员" },
    { key: "orders", label: language === "en" ? "Order progress" : "订单进度查询" },
    { key: "account", label: language === "en" ? "Account management" : "账号管理" },
    { key: "email", label: language === "en" ? "Email & security" : "邮箱与账号安全" },
  ];

  return (
    <>
      <MobilePageHeaderView
        title={t.profile.settings_title}
        titleText={t.profile.settings_title}
        onBack={onBack}
        ariaLabel={t.nav.back}
      />
      <main style={pageStyle}>
        {cloudLocked ? (
          <div style={{ marginBottom: 12 }}>
            <ConnectivityNotice message={t.archive_workspace.offline_notice} />
          </div>
        ) : null}

        <section style={identityCardStyle}>
          <div style={identityTopStyle}>
            {identity.avatarUrl ? (
              <img src={identity.avatarUrl} alt="" style={avatarStyle} />
            ) : (
              <span style={avatarFallbackStyle}>
                <UiIcon name="sprout" size={24} />
              </span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={usernameStyle}>{identity.username}</div>
              <div style={metaStyle}>{identity.membershipLabel}</div>
              <div style={metaStyle}>{identity.storageLabel}</div>
            </div>
          </div>
        </section>

        <section style={groupStyle}>
          <div style={rowStyle}>
            <span style={rowTitleStyle}>{t.profile.language_setting}</span>
            <button
              type="button"
              role="switch"
              aria-checked={language === "en"}
              onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
              style={languageSwitchStyle}
            >
              <span style={thumbStyle(language === "en")} />
              <span style={langLabelStyle(language === "zh")}>{t.profile.language_chinese}</span>
              <span style={langLabelStyle(language === "en")}>{t.profile.language_english}</span>
            </button>
          </div>

          <button type="button" onClick={onOpenProjectCategories} style={navRowStyle}>
            <span>
              <strong style={rowTitleStyle}>{t.archive_workspace.group_settings_title}</strong>
            </span>
            <UiIcon name="arrow-right" size={17} />
          </button>
          {extraLocalSettings}
        </section>

        <section style={groupStyle} aria-label={language === "en" ? "Cloud settings" : "云端设置"}>
          {cloudRows.map((row) => (
            <button
              key={row.key}
              type="button"
              disabled={cloudLocked}
              onClick={cloudLocked ? requireCloud : requireCloud}
              style={navRowStyle}
            >
              <span style={{ color: cloudLocked ? "#8a9586" : "#334c32" }}>{row.label}</span>
              <UiIcon name="arrow-right" size={17} />
            </button>
          ))}
        </section>

        <button type="button" onClick={onLogout} style={logoutStyle}>
          {t.nav.logout_full}
        </button>
      </main>
    </>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "12px 12px 110px",
  background: "#f7faf5",
  color: "#263626",
};
const identityCardStyle: CSSProperties = {
  border: "1px solid #dfe8da",
  borderRadius: 18,
  background: "#fff",
  padding: 14,
  marginBottom: 12,
};
const identityTopStyle: CSSProperties = { display: "flex", gap: 12, alignItems: "center" };
const avatarStyle: CSSProperties = { width: 52, height: 52, borderRadius: 16, objectFit: "cover" };
const avatarFallbackStyle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  background: "#eef4ea",
};
const usernameStyle: CSSProperties = { fontSize: 18, fontWeight: 850, color: "#243524" };
const metaStyle: CSSProperties = { marginTop: 3, fontSize: 13, color: "#6b7b66" };
const groupStyle: CSSProperties = {
  overflow: "hidden",
  border: "1px solid #dfe8da",
  borderRadius: 16,
  background: "#fff",
  marginBottom: 12,
};
const rowStyle: CSSProperties = {
  minHeight: 54,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "0 15px",
  borderBottom: "1px solid #f0f3ed",
};
const navRowStyle: CSSProperties = {
  ...rowStyle,
  width: "100%",
  border: 0,
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
};
const rowTitleStyle: CSSProperties = { color: "#334c32", fontSize: 15, fontWeight: 800 };
const languageSwitchStyle: CSSProperties = {
  position: "relative",
  width: 86,
  height: 32,
  border: "1px solid #cad8c6",
  borderRadius: 999,
  background: "#e8eee5",
  padding: 0,
};
function thumbStyle(english: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 3,
    left: english ? 54 : 3,
    width: 26,
    height: 24,
    borderRadius: 999,
    background: "#fff",
    boxShadow: "0 1px 4px rgba(31, 46, 30, .25)",
  };
}
function langLabelStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    width: 43,
    display: "inline-block",
    textAlign: "center",
    fontSize: 11,
    fontWeight: 800,
    color: active ? "#2f6331" : "#7d8b79",
  };
}
const logoutStyle: CSSProperties = {
  width: "100%",
  minHeight: 50,
  border: "1px solid #ead3d0",
  borderRadius: 14,
  background: "#fff7f6",
  color: "#a44943",
  fontSize: 16,
  fontWeight: 800,
};
