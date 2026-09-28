"use client";

import AndroidAppVersionEntry from "@/components/AndroidAppVersionEntry";
import type { OfflineProfileSnapshot } from "@/lib/android-offline-profile";
import { formatStorage } from "@/lib/user-profile-shared";
import { getUserTypeLabel } from "@/lib/membership";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import Link from "next/link";
import { Fragment, useState } from "react";

type ModuleId = "backup" | "account";

type NavItem = {
  label: string;
  href?: string;
  value?: ModuleId;
};

export default function OfflineAndroidProfilePage({
  snapshot,
  onBack,
  onLogout,
}: {
  snapshot: OfflineProfileSnapshot;
  onBack: () => void;
  onLogout: () => void;
}) {
  const { language, setLanguage, t } = useLanguage();
  const [activeModule, setActiveModule] = useState<ModuleId | null>(null);
  const displayName =
    snapshot.username ||
    snapshot.email ||
    (language === "zh" ? "我的信息" : "My profile");
  const storageText =
    snapshot.storageLimit != null
      ? `${formatStorage(snapshot.storageUsed || 0)} / ${formatStorage(snapshot.storageLimit)}`
      : language === "zh" ? "本机可用" : "Available on this device";
  const userType = getUserTypeLabel(
    {
      signedIn: Boolean(snapshot.userId),
      membership: snapshot.membership,
      loading: false,
      failed: false,
    },
    language,
  );

  const modules: NavItem[] = [
    { href: "/membership/payment", label: language === "en" ? "Cloud Membership" : "开通云会员" },
    { href: "/membership/benefits", label: language === "en" ? "Membership types" : "会员类别说明" },
    { href: "/profile/recent", label: language === "en" ? "Browsing history" : "浏览历史" },
    { value: "backup", label: language === "en" ? "Backup & export" : "备份与导出" },
    { href: "/legal", label: t.profile.legal_rules_nav },
    { href: "/feedback", label: t.feedback_and_contact },
    { href: "/profile/trash", label: t.profile.modules.trash },
    { value: "account", label: language === "en" ? "Account management" : "账号管理" },
    { href: "/admin/memberships", label: language === "en" ? "User management" : "用户管理" },
  ];

  return (
    <div data-android-offline-profile="true">
      <MobilePageHeaderView
        title={t.profile.settings_title}
        titleText={t.profile.settings_title}
        showBack
        ariaLabel={t.nav.back}
        onBack={onBack}
      />
      <main style={pageStyle}>
        <section style={identityStyle}>
          <div style={identityTopStyle}>
            {snapshot.avatarUrl ? (
              <img src={snapshot.avatarUrl} alt="" style={avatarStyle} />
            ) : (
              <span style={avatarFallbackStyle}><UiIcon name="sprout" size={24} /></span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={usernameStyle}>{displayName}</div>
              {snapshot.email ? <div style={emailStyle}>{snapshot.email}</div> : null}
            </div>
          </div>
          <div style={statsStyle}>
            <span>{language === "en" ? "User type" : "用户类型"} · {userType}</span>
            <span>{language === "en" ? "Storage" : "空间用量"} · {storageText}</span>
          </div>
        </section>

        <AndroidAppVersionEntry />

        <section style={languageRowStyle}>
          <span style={{ color: "#334c32", fontSize: 15, fontWeight: 800 }}>
            {t.profile.language_setting}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={language === "en"}
            aria-label={t.profile.language_setting}
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            style={languageSwitchStyle}
          >
            {language === "zh" ? t.profile.language_english : t.profile.language_chinese}
          </button>
        </section>

        <nav aria-label={t.profile.module_aria} style={navStyle}>
          {modules.map((item) => {
            const key = `${item.href || item.value}-${item.label}`;
            const expanded = Boolean(item.value && activeModule === item.value);
            return (
              <Fragment key={key}>
                {item.href ? (
                  <Link href={item.href} style={linkStyle}>
                    <span>{item.label}</span>
                    <UiIcon name="arrow-right" size={15} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    style={linkStyle}
                    aria-expanded={expanded}
                    onClick={() =>
                      setActiveModule((current) =>
                        current === item.value ? null : item.value || null,
                      )
                    }
                  >
                    <span>{item.label}</span>
                    <UiIcon name={expanded ? "chevron-up" : "chevron-down"} size={15} />
                  </button>
                )}
                {expanded && item.value === "backup" ? (
                  <p style={hintStyle}>
                    {language === "zh"
                      ? "本机项目、记录和照片仍可在离线使用。云端导出需要联网。"
                      : "Local projects, records, and photos stay available offline. Cloud export needs a network."}
                  </p>
                ) : null}
                {expanded && item.value === "account" ? (
                  <p style={hintStyle}>
                    {language === "zh"
                      ? "注销账号需要联网。退出登录不会删除未同步的本机创作。"
                      : "Account deletion needs a network. Signing out does not remove unsynced local work."}
                  </p>
                ) : null}
              </Fragment>
            );
          })}
        </nav>

        {snapshot.userId ? (
          <button type="button" onClick={onLogout} style={logoutStyle}>
            {t.nav.logout_full}
          </button>
        ) : null}
      </main>
    </div>
  );
}

const pageStyle = {
  padding: "12px 16px 28px",
  display: "grid",
  gap: 12,
} as const;

const identityStyle = {
  background: "#fff",
  border: "1px solid #d7e3d2",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 10,
} as const;

const identityTopStyle = {
  display: "flex",
  gap: 12,
  alignItems: "center",
} as const;

const avatarStyle = {
  width: 56,
  height: 56,
  borderRadius: 18,
  objectFit: "cover" as const,
};

const avatarFallbackStyle = {
  width: 56,
  height: 56,
  borderRadius: 18,
  background: "#e7f0e2",
  display: "grid",
  placeItems: "center",
  color: "#4c7b3f",
} as const;

const usernameStyle = {
  fontSize: 18,
  fontWeight: 800,
  color: "#1f2a1f",
} as const;

const emailStyle = {
  marginTop: 4,
  fontSize: 13,
  color: "#6f7b69",
} as const;

const statsStyle = {
  display: "grid",
  gap: 4,
  fontSize: 13,
  color: "#4d5c49",
} as const;

const languageRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#fff",
  border: "1px solid #d7e3d2",
  borderRadius: 16,
  padding: "12px 14px",
} as const;

const languageSwitchStyle = {
  border: "1px solid #d7e3d2",
  background: "#f6f8f3",
  borderRadius: 999,
  padding: "6px 12px",
  fontWeight: 700,
  color: "#334c32",
} as const;

const navStyle = {
  display: "grid",
  gap: 8,
} as const;

const linkStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  textAlign: "left" as const,
  background: "#fff",
  border: "1px solid #d7e3d2",
  borderRadius: 16,
  padding: "12px 14px",
  color: "#243126",
  fontWeight: 700,
  textDecoration: "none",
} as const;

const hintStyle = {
  margin: "0 4px",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#617258",
} as const;

const logoutStyle = {
  border: "1px solid #efd8d5",
  background: "#fff",
  borderRadius: 16,
  padding: "12px 14px",
  color: "#a33b32",
  fontWeight: 800,
} as const;
