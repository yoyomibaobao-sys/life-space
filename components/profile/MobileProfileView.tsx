"use client";

import AndroidAppVersionEntry from "@/components/AndroidAppVersionEntry";
import InternalLink from "@/components/navigation/InternalLink";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import AppConfirmDialog from "@/components/mobile/AppConfirmDialog";
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
  androidProfileIdentityAvatarFallbackStyle,
  androidProfileIdentityAvatarStyle,
  androidProfileIdentityEmailStyle,
  androidProfileIdentityUsernameStyle,
  profileIdentityAvatarColumnStyle,
  profileIdentityAvatarFallbackStyle,
  profileIdentityAvatarStyle,
  profileIdentityBottomStyle,
  profileIdentityCardStyle,
  profileIdentityDetailsStyle,
  profileIdentityEmailStyle,
  profileIdentityHelpfulStyle,
  profileIdentityLocationRowStyle,
  profileIdentityMemberNumberStyle,
  profileIdentityStatCellStyle,
  profileIdentityStatLabelStyle,
  profileIdentityStatValueStyle,
  profileIdentityMembershipStyle,
  profileIdentityLogoutButtonStyle,
  profileIdentityTopStyle,
  projectCategorySettingsLinkStyle,
  projectCategorySettingsTitleStyle,
  savedUsernameStyle,
  type MobileProfileModule,
  type MobileProfileNavItem,
} from "@/components/profile/MobileProfilePresentation";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { useState, type CSSProperties, type ReactNode } from "react";

export default function MobileProfileView({
  email,
  avatarUrl,
  username,
  accountNumber,
  helpfulCount,
  userType,
  membershipText,
  experienceCount,
  membershipLine,
  storageText,
  locationText,
  androidIdentityLayout = false,
  identityTop,
  identityAfterStats,
  preferencesExtra,
  adminAlert,
  error,
  modules,
  activeModule,
  onModuleChange,
  children,
  showAndroidVersion = true,
  onLogout,
  onLogin,
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
  membershipText?: string | null;
  experienceCount?: string | null;
  membershipLine?: string | null;
  storageText: string;
  locationText?: string | null;
  androidIdentityLayout?: boolean;
  canEditIdentity?: boolean;
  identityTop?: ReactNode;
  identityAfterStats?: ReactNode;
  preferencesExtra?: ReactNode;
  adminAlert?: ReactNode;
  error?: ReactNode;
  modules: MobileProfileNavItem[];
  activeModule: MobileProfileModule | null;
  onModuleChange: (value: MobileProfileModule) => void;
  children?: ReactNode;
  showAndroidVersion?: boolean;
  onLogout?: () => void;
  onLogin?: () => void;
  logoutLabel?: string;
  onBack?: () => void;
  fallbackHref?: string;
}) {
  const { language, t } = useLanguage();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  return (
    <div data-mobile-profile-view="true">
      {androidIdentityLayout ? (
        <header style={profileBackOnlyHeaderStyle} aria-label={t.nav.back}>
          {onBack ? (
            <button type="button" onClick={onBack} aria-label={t.nav.back} title={t.nav.back} style={profileBackOnlyButtonStyle}>
              <UiIcon name="arrow-left" size={20} strokeWidth={1.8} />
            </button>
          ) : (
            <InternalLink href={fallbackHref} aria-label={t.nav.back} title={t.nav.back} style={profileBackOnlyButtonStyle}>
              <UiIcon name="arrow-left" size={20} strokeWidth={1.8} />
            </InternalLink>
          )}
        </header>
      ) : onBack ? (
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
            {androidIdentityLayout ? (
              <>
                <div style={profileIdentityTopStyle}>
                  {identityTop || (
                    <>
                      <div style={profileIdentityAvatarColumnStyle}>
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" style={androidProfileIdentityAvatarStyle} />
                        ) : (
                          <span style={androidProfileIdentityAvatarFallbackStyle}><UiIcon name="sprout" size={24} /></span>
                        )}
                        {accountNumber && accountNumber !== "—" ? (
                          <span style={profileIdentityMemberNumberStyle}>{accountNumber}</span>
                        ) : null}
                      </div>
                      <div style={profileIdentityDetailsStyle}>
                        <div style={androidProfileIdentityUsernameStyle}>{username}</div>
                        {email ? <div style={androidProfileIdentityEmailStyle} title={email}>{email}</div> : null}
                        <div style={profileIdentityMembershipStyle}>{membershipLine || userType}</div>
                      </div>
                    </>
                  )}
                  {onLogout ? (
                    <button
                      type="button"
                      style={profileIdentityLogoutButtonStyle}
                      onClick={() => setLogoutConfirmOpen(true)}
                    >
                      {logoutLabel || t.nav.logout_full}
                    </button>
                  ) : null}
                </div>
                {identityAfterStats || (locationText ? (
                  <div style={profileIdentityLocationRowStyle}>{locationText}</div>
                ) : null)}
                <div style={profileIdentityBottomStyle}>
                  <InternalLink href="/profile/helpful" style={profileIdentityHelpfulStyle}>
                    <span style={profileIdentityStatLabelStyle}>{language === "en" ? "Adopted" : "被采纳"}</span>
                    <strong style={profileIdentityStatValueStyle}>{helpfulCount}</strong>
                  </InternalLink>
                  <div style={profileIdentityStatCellStyle}>
                    <span style={profileIdentityStatLabelStyle}>{language === "en" ? "Storage" : "空间用量"}</span>
                    <strong style={profileIdentityStatValueStyle}>{storageText}</strong>
                  </div>
                </div>
              </>
            ) : (
              <>
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
                  {membershipText ? <IdentityStat label={language === "en" ? "Membership" : "会员类型"} value={membershipText} /> : null}
                  {experienceCount ? <IdentityStat label={language === "en" ? "Experience cards" : "经验卡数量"} value={experienceCount} href="/experience-cards" /> : null}
                  <IdentityStat label={language === "en" ? "Storage" : "空间用量"} value={storageText} />
                </div>
                {identityAfterStats}
              </>
            )}
          </section>

          {androidIdentityLayout && onLogin ? (
            <button type="button" onClick={onLogin} style={accountLogoutButtonStyle}>
              {language === "zh" ? "登录云空间" : "Sign in to cloud"}
            </button>
          ) : null}

          {showAndroidVersion ? <AndroidAppVersionEntry /> : null}

          <section
            aria-label={language === "en" ? "Preferences" : "常用设置"}
            style={mobileProfileGroupStyle}
          >
            <section
              id="language-settings"
              style={{ ...languageInlineStyle, ...mobileGroupedRowStyle }}
            >
              <span style={{ color: "#334c32", fontSize: 15, fontWeight: 800 }}>
                {t.profile.language_setting}
              </span>
              <ProfileLanguageSwitch />
            </section>
            {preferencesExtra}
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

          {!androidIdentityLayout && onLogout ? (
            <button type="button" onClick={onLogout} style={accountLogoutButtonStyle}>
              {logoutLabel || t.nav.logout_full}
            </button>
          ) : null}
          {!androidIdentityLayout && onLogin ? <button type="button" onClick={onLogin} style={accountLogoutButtonStyle}>
            {language === "zh" ? "登录云空间" : "Sign in to cloud"}
          </button> : null}
        </section>
      </main>
      <AppConfirmDialog
        open={logoutConfirmOpen}
        title={language === "zh" ? "退出登录" : "Sign out"}
        message={language === "zh" ? "确定退出当前账号？" : "Sign out of the current account?"}
        cancelLabel={language === "zh" ? "取消" : "Cancel"}
        confirmLabel={language === "zh" ? "退出登录" : "Sign out"}
        destructive
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          onLogout?.();
        }}
      />
    </div>
  );
}

const profileBackOnlyHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  minHeight: "calc(40px + var(--app-safe-area-top, env(safe-area-inset-top, 0px)))",
  display: "flex",
  alignItems: "flex-end",
  padding: "var(--app-safe-area-top, env(safe-area-inset-top, 0px)) 8px 0",
  background: "rgba(250,252,248,0.97)",
  backdropFilter: "blur(10px)",
  boxSizing: "border-box",
};

const profileBackOnlyButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  display: "inline-grid",
  placeItems: "center",
  padding: 0,
  border: 0,
  borderRadius: 999,
  background: "transparent",
  color: "#50694c",
  textDecoration: "none",
  cursor: "pointer",
  touchAction: "manipulation",
};
