"use client";

import AndroidAppVersionEntry from "@/components/AndroidAppVersionEntry";
import type { OfflineProfileSnapshot } from "@/lib/android-offline-profile";
import { formatStorage } from "@/lib/user-profile-shared";
import { getUserTypeLabel } from "@/lib/membership";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import {
  IdentityStat,
  MobileProfileModuleTabs,
  ProfileLanguageSwitch,
  accountLogoutButtonStyle,
  identityStatsStyle,
  languageInlineStyle,
  mobileGroupedRowStyle,
  mobileProfileGroupStyle,
  mobileProfileMainStyle,
  mobileProfileShellStyle,
  offlineProfileModuleHintStyle,
  profileIdentityAvatarFallbackStyle,
  profileIdentityAvatarStyle,
  profileIdentityCardStyle,
  profileIdentityEmailStyle,
  profileIdentityTopStyle,
  projectCategorySettingsLinkStyle,
  projectCategorySettingsTitleStyle,
  savedUsernameStyle,
  type MobileProfileModule,
  type MobileProfileNavItem,
} from "@/components/profile/MobileProfilePresentation";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import Link from "next/link";
import { useState } from "react";

export default function OfflineAndroidProfilePage({
  snapshot,
  onBack,
  onLogout,
}: {
  snapshot: OfflineProfileSnapshot;
  onBack: () => void;
  onLogout: () => void;
}) {
  const { language, t } = useLanguage();
  const [mobileProfileModule, setMobileProfileModule] = useState<MobileProfileModule | null>(null);
  const displayName = snapshot.username || t.profile.unset_username;
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

  const modules: MobileProfileNavItem[] = [
    { href: "/membership/payment", label: language === "en" ? "Cloud Membership" : "开通云会员" },
    { value: "payment", label: language === "en" ? "Order progress" : "订单进度查询" },
    { href: "/membership/refund", label: t.profile.refund_request_nav },
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
      <main style={mobileProfileMainStyle}>
        <section style={mobileProfileShellStyle}>
          <section style={profileIdentityCardStyle}>
            <div style={profileIdentityTopStyle}>
              {snapshot.avatarUrl ? (
                <img src={snapshot.avatarUrl} alt="" style={profileIdentityAvatarStyle} />
              ) : (
                <span style={profileIdentityAvatarFallbackStyle}><UiIcon name="sprout" size={24} /></span>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={savedUsernameStyle}>{displayName}</div>
              </div>
            </div>
            {snapshot.email ? (
              <div style={profileIdentityEmailStyle} title={snapshot.email}>{snapshot.email}</div>
            ) : null}
            <div
              style={{
                ...identityStatsStyle,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <IdentityStat label={language === "en" ? "Member no." : "会员编号"} value="—" />
              <IdentityStat
                label={language === "en" ? "Suggestions adopted" : "被采纳的次数"}
                value={language === "en" ? "0" : "0次"}
                href="/profile/helpful"
              />
              <IdentityStat label={language === "en" ? "User type" : "用户类型"} value={userType} />
              <IdentityStat label={language === "en" ? "Storage" : "空间用量"} value={storageText} />
            </div>
          </section>

          <section
            aria-label={language === "en" ? "Preferences" : "常用设置"}
            style={mobileProfileGroupStyle}
          >
            <AndroidAppVersionEntry />
            <section
              id="language-settings"
              style={{ ...languageInlineStyle, ...mobileGroupedRowStyle }}
            >
              <span style={{ color: "#334c32", fontSize: 15, fontWeight: 800 }}>
                {t.profile.language_setting}
              </span>
              <ProfileLanguageSwitch />
            </section>
            <Link
              href="/profile/project-categories"
              style={{ ...projectCategorySettingsLinkStyle, ...mobileGroupedRowStyle }}
            >
              <span style={{ minWidth: 0 }}>
                <strong style={projectCategorySettingsTitleStyle}>
                  {t.archive_workspace.group_settings_title}
                </strong>
              </span>
              <UiIcon name="arrow-right" size={17} />
            </Link>
          </section>

          <MobileProfileModuleTabs
            active={mobileProfileModule}
            modules={modules}
            onChange={(value) => {
              setMobileProfileModule((current) => (current === value ? null : value));
            }}
            compact
          >
            {mobileProfileModule === "payment" ? (
              <p style={offlineProfileModuleHintStyle}>
                {language === "zh" ? "需要联网。" : "A network connection is required."}
              </p>
            ) : null}
            {mobileProfileModule === "backup" ? (
              <p style={offlineProfileModuleHintStyle}>
                {language === "zh"
                  ? "本机项目、记录和照片仍可在离线使用。云端导出需要联网。"
                  : "Local projects, records, and photos stay available offline. Cloud export needs a network."}
              </p>
            ) : null}
            {mobileProfileModule === "account" ? (
              <p style={offlineProfileModuleHintStyle}>
                {language === "zh"
                  ? "注销账号需要联网。退出登录不会删除未同步的本机创作。"
                  : "Account deletion needs a network. Signing out does not remove unsynced local work."}
              </p>
            ) : null}
          </MobileProfileModuleTabs>

          {snapshot.userId ? (
            <button type="button" onClick={onLogout} style={accountLogoutButtonStyle}>
              {t.nav.logout_full}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
