"use client";

import AndroidAppVersionEntry from "@/components/AndroidAppVersionEntry";
import InternalLink from "@/components/navigation/InternalLink";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
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
import type { ReactNode } from "react";

export default function MobileProfileView({
  email,
  avatarUrl,
  username,
  accountNumber,
  helpfulCount,
  userType,
  storageText,
  identityTop,
  identityAfterStats,
  adminAlert,
  error,
  modules,
  activeModule,
  onModuleChange,
  children,
  showAndroidVersion = true,
  onLogout,
  logoutLabel,
  onBack,
  fallbackHref = "/archive",
}: {
  email?: string | null;
  avatarUrl?: string | null;
  username: string;
  accountNumber: string;
  helpfulCount: string;
  userType: string;
  storageText: string;
  canEditIdentity?: boolean;
  identityTop?: ReactNode;
  identityAfterStats?: ReactNode;
  adminAlert?: ReactNode;
  error?: ReactNode;
  modules: MobileProfileNavItem[];
  activeModule: MobileProfileModule | null;
  onModuleChange: (value: MobileProfileModule) => void;
  children?: ReactNode;
  showAndroidVersion?: boolean;
  onLogout?: () => void;
  logoutLabel?: string;
  onBack?: () => void;
  fallbackHref?: string;
}) {
  const { language, t } = useLanguage();

  return (
    <div data-mobile-profile-view="true">
      {onBack ? (
        <MobilePageHeaderView
          title={t.profile.settings_title}
          titleText={t.profile.settings_title}
          showBack
          ariaLabel={t.nav.back}
          onBack={onBack}
        />
      ) : (
        <MobilePageHeader
          title={t.profile.settings_title}
          titleText={t.profile.settings_title}
          fallbackHref={fallbackHref}
          ariaLabel={t.nav.back}
        />
      )}
      <main style={mobileProfileMainStyle}>
        <section style={mobileProfileShellStyle}>
          {error}
          {adminAlert}
          <section style={profileIdentityCardStyle}>
            <div style={profileIdentityTopStyle}>
              {identityTop || (
                <>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={profileIdentityAvatarStyle} />
                  ) : (
                    <span style={profileIdentityAvatarFallbackStyle}><UiIcon name="sprout" size={24} /></span>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={savedUsernameStyle}>{username}</div>
                  </div>
                </>
              )}
            </div>
            {email ? (
              <div style={profileIdentityEmailStyle} title={email}>{email}</div>
            ) : null}
            <div
              style={{
                ...identityStatsStyle,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <IdentityStat label={language === "en" ? "Member no." : "会员编号"} value={accountNumber} />
              <IdentityStat
                label={language === "en" ? "Suggestions adopted" : "被采纳的次数"}
                value={helpfulCount}
                href="/profile/helpful"
              />
              <IdentityStat label={language === "en" ? "User type" : "用户类型"} value={userType} />
              <IdentityStat label={language === "en" ? "Storage" : "空间用量"} value={storageText} />
            </div>
            {identityAfterStats}
          </section>

          <section
            aria-label={language === "en" ? "Preferences" : "常用设置"}
            style={mobileProfileGroupStyle}
          >
            {showAndroidVersion ? <AndroidAppVersionEntry /> : null}
            <section
              id="language-settings"
              style={{ ...languageInlineStyle, ...mobileGroupedRowStyle }}
            >
              <span style={{ color: "#334c32", fontSize: 15, fontWeight: 800 }}>
                {t.profile.language_setting}
              </span>
              <ProfileLanguageSwitch />
            </section>
            <InternalLink
              href="/profile/project-categories"
              style={{ ...projectCategorySettingsLinkStyle, ...mobileGroupedRowStyle }}
            >
              <span style={{ minWidth: 0 }}>
                <strong style={projectCategorySettingsTitleStyle}>
                  {t.archive_workspace.group_settings_title}
                </strong>
              </span>
              <UiIcon name="arrow-right" size={17} />
            </InternalLink>
          </section>

          <MobileProfileModuleTabs
            active={activeModule}
            modules={modules}
            onChange={onModuleChange}
            compact
          >
            {children}
          </MobileProfileModuleTabs>

          {onLogout ? (
            <button type="button" onClick={onLogout} style={accountLogoutButtonStyle}>
              {logoutLabel || t.nav.logout_full}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
