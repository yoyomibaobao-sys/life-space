"use client";

import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";

export type MobileProfileModule = "membership" | "payment" | "backup" | "account";
export type MobileProfileNavItem = {
  label: string;
  value?: MobileProfileModule;
  href?: string;
};

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
              <Link
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
              </Link>
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
    const membershipItems = modules.filter((item) => item.href?.startsWith("/membership") || item.value === "payment" || item.value === "membership");
    const adminItems = modules.filter((item) => item.href?.startsWith("/admin"));
    const accountItems = modules.filter((item) => !membershipItems.includes(item) && !adminItems.includes(item));
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {[
          { title: language === "en" ? "Membership" : "会员服务", items: membershipItems },
          { title: language === "en" ? "Data & account" : "数据与账号", items: accountItems },
          { title: language === "en" ? "Administration" : "管理", items: adminItems },
        ].filter((group) => group.items.length).map((group) => (
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
      <div style={{ marginTop: 3, color: "#2e422d", fontSize: 12, fontWeight: 800, lineHeight: 1.4, overflowWrap: "anywhere" }}>{value}</div>
    </>
  );

  return href ? (
    <Link href={href} style={identityStatLinkStyle}>{content}</Link>
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
