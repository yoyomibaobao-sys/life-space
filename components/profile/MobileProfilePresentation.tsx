"use client";

import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import InternalLink from "@/components/navigation/InternalLink";
import { Fragment, type CSSProperties, type ReactNode } from "react";

export type MobileProfileModule = "membership" | "payment" | "backup" | "account";
export type MobileProfileNavSection = "membership" | "data" | "account" | "support" | "admin";

export type MobileProfileNavItem = {
  label: string;
  value?: MobileProfileModule;
  href?: string;
  section?: MobileProfileNavSection;
};

export function mobileProfileNavigation(input: {
  language: "zh" | "en";
  native: boolean;
  admin: boolean;
  refundLabel: string;
  legalLabel: string;
  feedbackLabel: string;
  trashLabel: string;
  adminSupportLabel: string;
}): MobileProfileNavItem[] {
  const en = input.language === "en";
  return [
    ...(!input.native ? [
      { href: "/", label: en ? "Website introduction" : "网站介绍主页", section: "support" as const },
      { href: "/download/android", label: en ? "Download Android app" : "下载安卓版", section: "support" as const },
    ] : []),
    { href: "/membership/payment", label: en ? "Cloud Membership" : "开通云会员", section: "membership" },
    { value: "payment", label: en ? "Order progress" : "订单进度查询", section: "membership" },
    { href: "/membership/refund", label: input.refundLabel, section: "membership" },
    { href: "/membership/benefits", label: en ? "Membership types" : "会员类别说明", section: "membership" },
    { href: "/profile/recent", label: en ? "Browsing history" : "浏览历史", section: "data" },
    { value: "backup", label: en ? "Backup & export" : "备份与导出", section: "data" },
    { href: "/profile/data-security", label: en ? "Data rules" : "数据规则", section: "support" },
    { href: "/profile/trash", label: input.trashLabel, section: "data" },
    { value: "account", label: en ? "Account management" : "账号管理", section: "account" },
    { href: "/legal", label: input.legalLabel, section: "support" },
    { href: "/feedback", label: input.feedbackLabel, section: "support" },
    ...(input.admin ? [
      { href: "/admin/memberships", label: en ? "User management" : "用户管理", section: "admin" as const },
      { href: "/admin/guides", label: en ? "Linked guide review" : "关联指引审核", section: "admin" as const },
      { href: "/admin/support", label: input.adminSupportLabel, section: "admin" as const },
    ] : []),
  ] as MobileProfileNavItem[];
}

export function MobileProfileModuleTabs({
  active,
  modules,
  onChange,
  compact,
  children,
}: {
  active: MobileProfileModule | null;
  modules: MobileProfileNavItem[];
  onChange: (value: MobileProfileModule) => void;
  compact: boolean;
  children: ReactNode;
}) {
  const { language, t } = useLanguage();
  const renderNavigation = (entries: MobileProfileNavItem[]) => (
    <nav
      style={{
        ...mobileProfileTabsStyle,
        gridTemplateColumns: "1fr",
      }}
      aria-label={t.profile.module_aria}
    >
      {entries.map((item) => {
        const key = `${item.href || item.value}-${item.label}`;
        const isActive = Boolean(item.value && active === item.value);
        return (
          <Fragment key={key}>
            {item.href ? (
              <InternalLink
                href={item.href}
                style={
                  item.href === "/admin/memberships"
                    ? {
                        ...mobileAdminMembershipEntryStyle,
                        ...(compact ? mobileProfileCompactTabStyle : {}),
                      }
                    : {
                        ...mobileProfileLinkTabStyle,
                        ...(compact ? mobileProfileCompactTabStyle : {}),
                      }
                }
              >
                <span>{item.label}</span>
                <UiIcon name="arrow-right" size={15} />
              </InternalLink>
            ) : item.value ? (
              <button
                type="button"
                onClick={() => onChange(item.value as MobileProfileModule)}
                style={{
                  ...mobileProfileTabButtonStyle(isActive),
                  ...(compact ? mobileProfileCompactTabStyle : {}),
                }}
                aria-expanded={isActive}
              >
                <span>{item.label}</span>
                <UiIcon name={isActive ? "chevron-up" : "chevron-down"} size={15} />
              </button>
            ) : null}
            {compact && isActive ? (
              <div style={mobileInlineModuleStyle}>{children}</div>
            ) : null}
          </Fragment>
        );
      })}
    </nav>
  );

  if (compact) {
    const groups = [
      { key: "membership", title: language === "en" ? "Membership" : "会员服务" },
      { key: "data", title: language === "en" ? "Data & records" : "数据与记录" },
      { key: "account", title: language === "en" ? "Account" : "账号" },
      { key: "support", title: language === "en" ? "Support & rules" : "支持与规则" },
      { key: "admin", title: language === "en" ? "Administration" : "管理" },
    ] as const;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {groups.map((group) => ({
          ...group,
          items: modules.filter((item) => item.section === group.key),
        })).filter((group) => group.items.length).map((group) => (
          <section key={group.title} style={mobileProfileGroupStyle} aria-label={group.title}>
            <h2 style={{ margin: "2px 12px 4px", fontSize: 12, fontWeight: 600, color: "#73816e" }}>{group.title}</h2>
            {renderNavigation(group.items)}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div style={desktopProfileModulesStyle}>
      {renderNavigation(modules)}
      <div style={desktopProfileModuleContentStyle}>{children}</div>
    </div>
  );
}

export function IdentityStat({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <div style={{ color: "#7a8676", fontSize: 11 }}>{label}</div>
      <div style={{ marginTop: 3, color: "#2e422d", fontSize: 14, fontWeight: 800, lineHeight: 1.4, overflowWrap: "anywhere" }}>{value}</div>
    </>
  );

  return href ? (
    <InternalLink href={href} style={identityStatLinkStyle}>{content}</InternalLink>
  ) : (
    <div style={{ minWidth: 0 }}>{content}</div>
  );
}

export function ProfileLanguageSwitch() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={language === "en"}
      aria-label={t.profile.language_setting}
      onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
      style={languageSwitchStyle}
    >
      <span style={languageSwitchThumbStyle(language === "en")} />
      <span style={languageSwitchLabelStyle(language === "zh")}>{t.profile.language_chinese}</span>
      <span style={languageSwitchLabelStyle(language === "en")}>{t.profile.language_english}</span>
    </button>
  );
}

export const profileIdentityCardStyle: CSSProperties = {
  marginTop: 10,
  padding: 12,
  border: "1px solid #dfeadd",
  borderRadius: 16,
  background: "#f9fcf7",
};

export const profileIdentityTopStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  minWidth: 0,
};

export const profileIdentityAvatarStyle: CSSProperties = {
  width: 54,
  height: 54,
  flex: "0 0 54px",
  borderRadius: "50%",
  objectFit: "cover",
};

export const profileIdentityAvatarFallbackStyle: CSSProperties = {
  ...profileIdentityAvatarStyle,
  display: "grid",
  placeItems: "center",
  background: "#eaf3e6",
  color: "#5e8057",
};

export const androidProfileIdentityAvatarStyle: CSSProperties = {
  ...profileIdentityAvatarStyle,
  width: 60,
  height: 60,
  flex: "0 0 60px",
};

export const androidProfileIdentityAvatarFallbackStyle: CSSProperties = {
  ...profileIdentityAvatarFallbackStyle,
  width: 60,
  height: 60,
  flex: "0 0 60px",
};

export const profileIdentityAvatarColumnStyle: CSSProperties = {
  width: 64,
  flex: "0 0 64px",
  display: "grid",
  justifyItems: "center",
  alignContent: "start",
  gap: 2,
};

export const profileIdentityMemberNumberStyle: CSSProperties = {
  color: "#98a295",
  fontSize: 10,
  fontWeight: 650,
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

export const profileIdentityDetailsStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "grid",
  gridTemplateRows: "30px 18px 24px",
  gap: 2,
  alignContent: "start",
  alignItems: "center",
  paddingRight: 74,
  boxSizing: "border-box",
};

export const profileIdentityUsernameButtonStyle: CSSProperties = {
  width: "fit-content",
  maxWidth: "100%",
  border: 0,
  padding: 0,
  background: "transparent",
  color: "#253523",
  fontSize: 19,
  fontWeight: 850,
  lineHeight: 1.3,
  textAlign: "left",
  cursor: "text",
  overflowWrap: "anywhere",
};

export const androidProfileIdentityUsernameStyle: CSSProperties = {
  minHeight: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  color: "#253523",
  fontSize: 19,
  fontWeight: 850,
  lineHeight: 1.3,
};

export const androidProfileIdentityEmailStyle: CSSProperties = {
  minWidth: 0,
  height: 18,
  color: "#667364",
  fontSize: 13,
  lineHeight: "18px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const profileIdentityMembershipStyle: CSSProperties = {
  minHeight: 24,
  display: "flex",
  alignItems: "center",
  color: "#4d6a49",
  fontSize: 14,
  fontWeight: 760,
  lineHeight: 1.35,
};

export const profileIdentityLogoutButtonStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  minHeight: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d8e2d4",
  borderRadius: 8,
  padding: "5px 8px",
  background: "#f4f8f1",
  color: "#52684f",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

export const profileIdentityBottomStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginTop: 10,
  paddingTop: 9,
  borderTop: "1px solid #e4ece0",
};

export const profileIdentityStatCellStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 54,
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 3,
  padding: "7px 8px",
  borderRadius: 12,
  background: "#f1f7ed",
  textAlign: "center",
};

export const profileIdentityStatLabelStyle: CSSProperties = {
  color: "#778273",
  fontSize: 11,
  lineHeight: 1.25,
};

export const profileIdentityStatValueStyle: CSSProperties = {
  maxWidth: "100%",
  color: "#2e422d",
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.3,
  overflowWrap: "anywhere",
};

export const profileIdentityHelpfulStyle: CSSProperties = {
  ...profileIdentityStatCellStyle,
  color: "inherit",
  textDecoration: "none",
};

export const profileIdentityLocationRowStyle: CSSProperties = {
  height: 42,
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  gap: 5,
  marginTop: 10,
  paddingTop: 8,
  borderTop: "1px solid #e4ece0",
  color: "#425640",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35,
  minWidth: 0,
  flexWrap: "nowrap",
  overflowX: "auto",
  boxSizing: "border-box",
};

export const profileIdentityLocationButtonStyle: CSSProperties = {
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  border: 0,
  padding: "5px 2px",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "text",
  textAlign: "left",
};

export const profileIdentityInlineControlStyle: CSSProperties = {
  minWidth: 68,
  maxWidth: 112,
  height: 32,
  minHeight: 32,
  flex: "1 1 0",
  border: "1px solid #d8e3d3",
  borderRadius: 9,
  background: "#fff",
  color: "#2d3d2c",
  padding: "5px 7px",
  fontSize: 14,
  boxSizing: "border-box",
};

export const savedUsernameStyle: CSSProperties = {
  minHeight: 40,
  display: "flex",
  alignItems: "center",
  color: "#253523",
  fontSize: 19,
  fontWeight: 850,
  lineHeight: 1.3,
};

export const profileIdentityEmailStyle: CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "7px 9px",
  borderRadius: 10,
  background: "#fff",
  color: "#536250",
  fontSize: 14,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
  overflowX: "auto",
  boxSizing: "border-box",
};

export const identityStatsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  marginTop: 11,
  paddingTop: 10,
  borderTop: "1px solid #e4ece0",
};

export const identityStatLinkStyle: CSSProperties = {
  minWidth: 0,
  padding: "2px 4px",
  margin: "-2px -4px",
  borderRadius: 8,
  color: "inherit",
  textDecoration: "none",
  background: "#f0f7ec",
};

export const languageInlineStyle: CSSProperties = {
  minHeight: 58,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  margin: "10px 0",
  padding: "8px 12px",
  border: "1px solid #dfe8da",
  borderRadius: 14,
  background: "#f7f9f5",
  boxSizing: "border-box",
};

export const projectCategorySettingsLinkStyle: CSSProperties = {
  minHeight: 62,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  margin: "0 0 10px",
  padding: "9px 14px",
  border: "1px solid #dfe8da",
  borderRadius: 14,
  background: "#f7f9f5",
  color: "#334c32",
  textDecoration: "none",
  boxSizing: "border-box",
};

export const projectCategorySettingsTitleStyle: CSSProperties = {
  display: "block",
  fontSize: 15,
  fontWeight: 800,
};

const languageSwitchStyle: CSSProperties = {
  position: "relative",
  width: 154,
  height: 40,
  flex: "0 0 154px",
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "center",
  padding: 3,
  border: "1px solid #cdddc8",
  borderRadius: 999,
  background: "#edf2ea",
  cursor: "pointer",
  overflow: "hidden",
};

function languageSwitchThumbStyle(english: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: english ? "calc(50% + 1px)" : 3,
    width: "calc(50% - 4px)",
    borderRadius: 999,
    background: "#4f7b45",
    boxShadow: "0 2px 6px rgba(41, 72, 36, 0.22)",
    transition: "left 180ms ease",
  };
}

function languageSwitchLabelStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    color: active ? "#fff" : "#5f705b",
    fontSize: 13,
    fontWeight: active ? 850 : 700,
    textAlign: "center",
    transition: "color 180ms ease",
  };
}

export const mobileProfileMainStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  margin: "0 auto",
  padding: "8px 8px 84px",
  boxSizing: "border-box",
  overflowX: "hidden",
};

export const mobileProfileShellStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  display: "grid",
  gap: 12,
  boxSizing: "border-box",
};

export const mobileProfileGroupStyle: CSSProperties = {
  minWidth: 0,
  padding: "8px 4px",
  border: "1px solid #e2e9dd",
  borderRadius: 14,
  background: "#fff",
};

export const mobileGroupedRowStyle: CSSProperties = {
  minHeight: 48,
  margin: 0,
  border: 0,
  borderBottom: "1px solid #edf1e9",
  borderRadius: 0,
  background: "transparent",
};

const mobileProfileTabsStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  overflowX: "visible",
  margin: "0 0 10px",
  padding: "2px 0 3px",
};

const mobileProfileCompactTabStyle: CSSProperties = {
  ...mobileGroupedRowStyle,
  width: "100%",
  minWidth: 0,
  minHeight: 46,
  padding: "0 15px",
  justifyContent: "space-between",
  textAlign: "left",
};

function mobileProfileTabButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    border: active ? "1px solid #9bc98f" : "1px solid #dfe8da",
    borderRadius: 13,
    background: active ? "#edf8e9" : "#f7f8f6",
    color: active ? "#2f6a31" : "#52634e",
    padding: "0 14px",
    fontSize: 15,
    fontWeight: 700,
    whiteSpace: "normal",
    lineHeight: 1.15,
    cursor: "pointer",
  };
}

const mobileProfileLinkTabStyle: CSSProperties = {
  ...mobileProfileTabButtonStyle(false),
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  textAlign: "left",
  textDecoration: "none",
  boxSizing: "border-box",
};

const mobileInlineModuleStyle: CSSProperties = {
  minWidth: 0,
  padding: "0 2px 4px",
};

const desktopProfileModulesStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
  marginTop: 10,
};

const desktopProfileModuleContentStyle: CSSProperties = {
  minWidth: 0,
};

const mobileAdminMembershipEntryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  border: "1px solid #c9d8be",
  borderRadius: 11,
  background: "#f3faef",
  color: "#2f5a27",
  padding: "0 12px",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.2,
  boxSizing: "border-box",
};

export const accountLogoutButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  marginBottom: 10,
  border: "1px solid #dfe7dc",
  borderRadius: 12,
  background: "#fff",
  color: "#52634e",
  fontSize: 14,
  fontWeight: 750,
  cursor: "pointer",
};

export const offlineProfileModuleHintStyle: CSSProperties = {
  margin: "4px 12px 8px",
  color: "#617258",
  fontSize: 13,
  lineHeight: 1.5,
};
