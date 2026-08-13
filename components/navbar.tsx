"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";
import UiIcon, { type UiIconName } from "@/components/ui/UiIcon";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/useLanguage";
import type { TranslationDictionary } from "@/lib/i18n";

type MobileArchiveTitleInfo = {
  title: string;
  systemName: string;
  href: string | null;
} | null;

export default function Navbar() {
  const { t } = useLanguage();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [username, setUsername] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const unreadRequestSeq = useRef(0);

  const pathname = usePathname();
  const router = useRouter();
  const [isCompact, setIsCompact] = useState(false);
  const [mobileTitle, setMobileTitle] = useState("");
  const [mobileArchiveTitleInfo, setMobileArchiveTitleInfo] =
    useState<MobileArchiveTitleInfo>(null);
  const [mobileMeMenuOpen, setMobileMeMenuOpen] = useState(false);
  const [mobilePlantMenuOpen, setMobilePlantMenuOpen] = useState(false);
  const [desktopDiscoverTab, setDesktopDiscoverTab] = useState<
    "feed" | "following"
  >("feed");

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    const profile = (data as AppProfile | null) || null;
    setUsername(profile?.username || "");
  }

  async function loadAdminFlag(userId: string) {
    const { data, error } = await supabase.rpc("is_app_admin", {
      p_user_id: userId,
    });

    if (error) {
      console.error("load admin flag error:", error);
      setIsAdmin(false);
      return;
    }

    setIsAdmin(Boolean(data));
  }

  async function loadUnreadCount(userId: string) {
    const requestId = unreadRequestSeq.current + 1;
    unreadRequestSeq.current = requestId;

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (requestId !== unreadRequestSeq.current) return;

    if (error) {
      // 通知数量不是核心功能；开发环境里 Supabase auth/fetch 偶尔会因重复请求出现 AbortError。
      // 这里降级为 0，避免每次后台操作都刷一条控制台错误。
      setUnreadCount(0);
      return;
    }

    setUnreadCount(count || 0);
  }

  useEffect(() => {
    function updateCompact() {
      setIsCompact(window.innerWidth < 760);
    }

    updateCompact();
    window.addEventListener("resize", updateCompact);

    return () => window.removeEventListener("resize", updateCompact);
  }, []);

  useEffect(() => {
    function syncDiscoverTab() {
      const isFollowing =
        pathname === "/discover" &&
        new URLSearchParams(window.location.search).get("tab") === "following";
      setDesktopDiscoverTab(isFollowing ? "following" : "feed");
    }

    function handleDiscoverTabChange(event: Event) {
      const tab = (event as CustomEvent<"feed" | "following">).detail;
      setDesktopDiscoverTab(tab === "following" ? "following" : "feed");
    }

    syncDiscoverTab();
    window.addEventListener("popstate", syncDiscoverTab);
    window.addEventListener("discover-tab-change", handleDiscoverTabChange);

    return () => {
      window.removeEventListener("popstate", syncDiscoverTab);
      window.removeEventListener(
        "discover-tab-change",
        handleDiscoverTabChange,
      );
    };
  }, [pathname]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        void loadProfile(data.user.id);
        void loadUnreadCount(data.user.id);
        void loadAdminFlag(data.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;

      setUser(currentUser);

      if (currentUser) {
        void loadProfile(currentUser.id);
        void loadUnreadCount(currentUser.id);
        void loadAdminFlag(currentUser.id);
      } else {
        setUsername("");
        setUnreadCount(0);
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleNotificationChanged() {
      if (user?.id) {
        void loadUnreadCount(user.id);
      }
    }

    window.addEventListener("notifications-changed", handleNotificationChanged);

    return () => {
      window.removeEventListener(
        "notifications-changed",
        handleNotificationChanged,
      );
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const archiveDetailPath = getArchiveDetailPath(pathname);

    async function loadMobileTitle() {
      if (!archiveDetailPath) return;
      const archiveId = archiveDetailPath.split("/").pop();
      if (!archiveId) return;

      const { data } = await supabase
        .from("archives")
        .select("title, category, species_id, species_name_snapshot, system_name")
        .eq("id", archiveId)
        .maybeSingle();

      if (!cancelled) {
        const title = String(data?.title || t.nav.project);
        const systemName =
          data?.category === "plant"
            ? String(data?.species_name_snapshot || "")
            : String(data?.system_name || "");

        setMobileTitle(title);
        setMobileArchiveTitleInfo({
          title,
          systemName,
          href:
            data?.category === "plant" && data?.species_id
              ? `/plant/${data.species_id}?fromArchive=${encodeURIComponent(archiveId)}`
              : null,
        });
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;

      setMobileMeMenuOpen(false);
      setMobilePlantMenuOpen(false);
      setMobileArchiveTitleInfo(null);

      if (!archiveDetailPath) {
        setMobileTitle(getMobilePageTitle(pathname, t.nav));
        return;
      }

      setMobileTitle(t.nav.project);
      void loadMobileTitle();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [pathname, t.nav]);

  async function handleLogout() {
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
  }

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  if (isCompact) {
    return (
      <>
        <nav style={mobileTopNavStyle}>
          <div
            style={mobilePageTitleStyle}
            title={
              mobileArchiveTitleInfo?.systemName
                ? `${mobileArchiveTitleInfo.title} · ${mobileArchiveTitleInfo.systemName}`
                : mobileTitle || t.nav.brand
            }
          >
            {mobileArchiveTitleInfo ? (
              <>
                <span style={mobileArchiveTitleTextStyle}>
                  {mobileArchiveTitleInfo.title}
                </span>
                {mobileArchiveTitleInfo.systemName ? (
                  <>
                    <span style={mobileArchiveTitleDotStyle}> · </span>
                    {mobileArchiveTitleInfo.href ? (
                      <Link
                        href={mobileArchiveTitleInfo.href}
                        style={mobileArchiveTitleLinkStyle}
                      >
                        {mobileArchiveTitleInfo.systemName}
                      </Link>
                    ) : (
                      <span style={mobileArchiveTitleSystemStyle}>
                        {mobileArchiveTitleInfo.systemName}
                      </span>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              shouldShowMobileProfileEntry(pathname) ? (
                <Link
                  href={user ? "/profile" : "/login"}
                  style={mobileProfileEntryStyle}
                >
                  <UiIcon name="user" size={18} strokeWidth={1.8} />
                  {user ? t.nav.me : t.nav.login}
                </Link>
              ) : (
                mobileTitle || t.nav.brand
              )
            )}
          </div>

          <div style={mobileTopActionGroupStyle}>
            <LanguageSwitcher compact />

            {user ? (
              <Link
                href="/notifications"
                style={mobileNotificationButtonStyle}
                aria-label={t.nav.notification}
                title={t.nav.notification}
              >
                <UiIcon name="bell" size={18} />
              </Link>
            ) : null}

            {isMobileDiscoverIndexPath(pathname) ? (
              <button
                type="button"
                onClick={() => {
                  const tab = new URLSearchParams(window.location.search).get("tab");
                  if (tab === "following") {
                    window.dispatchEvent(new Event("mobile-discover-follow-search-request"));
                    return;
                  }

                  router.push("/discover/search");
                }}
                style={mobileSearchButtonStyle}
              >
                {t.nav.search}
              </button>
            ) : isMobilePlantPath(pathname) ? (
              <div style={mobilePlantMenuWrapStyle}>
                <button
                  type="button"
                  onClick={() => setMobilePlantMenuOpen((open) => !open)}
                  style={mobilePlantButtonStyle}
                >
                  {t.nav.my_plants}
                </button>
                {mobilePlantMenuOpen ? (
                  <div style={mobilePlantMenuStyle}>
                    <Link
                      href={user ? "/archive/interests" : "/login"}
                      style={mobilePlantMenuItemStyle}
                    >
                      {t.nav.interested_plants}
                    </Link>
                    <Link
                      href={user ? "/archive/plans" : "/login"}
                      style={mobilePlantMenuItemStyle}
                    >
                      {t.nav.planting_plan}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : user && isMobileMePath(pathname) ? (
              <div style={mobileMeMenuWrapStyle}>
                <button
                  type="button"
                  onClick={() => setMobileMeMenuOpen((open) => !open)}
                  aria-label={t.nav.more_account_actions}
                  style={mobileMeMoreButtonStyle}
                >
                  <UiIcon name="more" size={20} />
                </button>
                {mobileMeMenuOpen ? (
                  <div style={mobileMeMenuStyle}>
                    <Link href="/" style={mobileMeMenuItemStyle}>
                      {t.nav.home}
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      style={mobileMeLogoutItemStyle}
                    >
                      {t.nav.logout}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : user && shouldShowMobileCreateAction(pathname) ? (
              <Link
                href={getMobileCreateHref(pathname, true)}
                style={mobileCreateButtonStyle}
                aria-label={getMobileCreateLabel(pathname, t.nav)}
                title={getMobileCreateLabel(pathname, t.nav)}
                onClick={(event) => {
                  if (getArchiveDetailPath(pathname)) {
                    event.preventDefault();
                    window.dispatchEvent(new Event("mobile-add-record-request"));
                  }
                }}
              >
                <UiIcon name="plus" size={16} /> {getMobileCreateLabel(pathname, t.nav)}
              </Link>
            ) : !user && shouldShowMobileLoginAction(pathname) ? (
              <Link href="/login" style={mobileLoginActionStyle}>
                {t.nav.login}
              </Link>
            ) : null}
          </div>
        </nav>

        <MobileBottomNav
          pathname={pathname}
          user={user}
          discoverTab={desktopDiscoverTab}
          labels={t.nav}
        />
      </>
    );
  }

  return (
    <nav style={getNavStyle(isCompact)}>
      <div style={getLeftGroupStyle(isCompact)}>
        <Link href="/" style={brandStyle}>
          {t.nav.brand}
        </Link>

        <div style={getNavItemsWrapStyle(isCompact)}>
          <NavItem
            href="/discover"
            active={isActive("/discover") && desktopDiscoverTab === "feed"}
            onClick={() => {
              setDesktopDiscoverTab("feed");
              window.dispatchEvent(
                new CustomEvent("discover-tab-change", { detail: "feed" }),
              );
            }}
          >
            {t.nav.discover}
          </NavItem>

          <NavItem
            href="/discover?tab=following"
            active={
              pathname === "/discover" && desktopDiscoverTab === "following"
            }
            onClick={() => {
              setDesktopDiscoverTab("following");
              window.dispatchEvent(
                new CustomEvent("discover-tab-change", {
                  detail: "following",
                }),
              );
            }}
          >
            {t.nav.following}
          </NavItem>

          <NavItem
            href={user ? "/archive" : "/login"}
            active={
              isActive("/archive") || pathname.startsWith("/experience-cards")
            }
          >
            {t.nav.personal_space}
          </NavItem>

          <NavItem href="/plant" active={isActive("/plant")}>
            {t.nav.guide}
          </NavItem>

          <NavItem href="/market" active={isActive("/market")}>
            {t.nav.market}
          </NavItem>
        </div>
      </div>

      {user ? (
        <div style={getUserAreaStyle(isCompact)}>
          <DesktopUtilityActions feedbackLabel={t.feedback} />

          <Link href="/notifications" style={notificationStyle} title={t.nav.notification}>
            <UiIcon name="bell" size={18} />
            {unreadCount > 0 ? (
              <span style={notificationBadgeStyle}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>

          {isAdmin ? (
            <Link
              href="/admin/memberships"
              style={adminLinkStyle(isActive("/admin"))}
              title={t.nav.manage_members}
            >
              {t.nav.admin}
            </Link>
          ) : null}

          <Link href="/profile" style={getProfileLinkStyle(isCompact)}>
            {username || t.nav.username_unset}
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            style={logoutButtonStyle}
          >
            {t.nav.logout}
          </button>
        </div>
      ) : (
        <div style={getGuestAreaStyle(isCompact)}>
          <DesktopUtilityActions feedbackLabel={t.feedback} />

          <Link href="/login" style={loginLinkStyle}>
            {t.nav.login}
          </Link>
          {pathname !== "/" ? (
            <Link href="/register" style={registerLinkStyle}>
              {t.nav.register}
            </Link>
          ) : null}
        </div>
      )}
    </nav>
  );
}

function DesktopUtilityActions({ feedbackLabel }: { feedbackLabel: string }) {
  return (
    <>
      <div style={desktopUtilityGroupStyle}>
        <Link href="/feedback" style={desktopFeedbackLinkStyle}>
          {feedbackLabel}
        </Link>
        <LanguageSwitcher compact />
      </div>
      <span aria-hidden="true" style={desktopUtilityDividerStyle} />
    </>
  );
}

function MobileBottomNav({
  pathname,
  user,
  discoverTab,
  labels,
}: {
  pathname: string;
  user: SupabaseUser | null;
  discoverTab: "feed" | "following";
  labels: TranslationDictionary["nav"];
}) {
  const items = [
    {
      label: labels.discover,
      icon: "home" as UiIconName,
      href: "/discover",
      active: pathname === "/discover" && discoverTab === "feed",
      onClick: () => {
        window.dispatchEvent(
          new CustomEvent("discover-tab-change", { detail: "feed" }),
        );
      },
    },
    {
      label: labels.following,
      icon: "follow" as UiIconName,
      href: user ? "/discover?tab=following" : "/login",
      active: pathname === "/discover" && discoverTab === "following",
      onClick: () => {
        if (!user) return;
        window.dispatchEvent(
          new CustomEvent("discover-tab-change", { detail: "following" }),
        );
      },
    },
    {
      label: labels.personal_space,
      icon: "project" as UiIconName,
      href: user ? "/archive" : "/login",
      active:
        isPathActive(pathname, "/archive") ||
        isPathActive(pathname, "/experience-cards"),
    },
    {
      label: labels.guide,
      icon: "sprout" as UiIconName,
      href: "/plant",
      active: isPathActive(pathname, "/plant"),
    },
    {
      label: labels.market,
      icon: "store" as UiIconName,
      href: "/market",
      active: isPathActive(pathname, "/market"),
    },
  ];

  return (
    <nav
      data-mobile-bottom-nav="true"
      style={mobileBottomNavStyle}
      aria-label={labels.mobile_navigation}
    >
      {items.map((item) => (
        <MobileBottomNavItem
          key={`${item.href}-${item.label}`}
          href={item.href}
          active={item.active}
          icon={item.icon}
          onClick={item.onClick}
        >
          {item.label}
        </MobileBottomNavItem>
      ))}
    </nav>
  );
}

function MobileBottomNavItem({
  href,
  active,
  badge,
  icon,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  badge?: string | null;
  icon: UiIconName;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={mobileBottomNavItemStyle(active)} onClick={onClick}>
      <span style={mobileBottomNavLabelStyle}>
        <UiIcon name={icon} size={17} strokeWidth={1.7} />
        {children}
        {badge ? <span style={mobileBottomBadgeStyle}>{badge}</span> : null}
      </span>
    </Link>
  );
}

function NavItem({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={navLinkStyle(active)} onClick={onClick}>
      {children}
    </Link>
  );
}

function isPathActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function getArchiveDetailPath(pathname: string) {
  const match = pathname.match(/^\/archive\/([^/]+)$/);
  const segment = match?.[1] || "";
  if (!segment || ["new", "plans", "interests"].includes(segment)) return null;
  return pathname;
}

function isMobileMePath(pathname: string) {
  return pathname === "/profile" || pathname.startsWith("/profile/");
}

function isMobileDiscoverIndexPath(pathname: string) {
  return pathname === "/discover";
}

function isMobilePlantPath(pathname: string) {
  return pathname === "/plant" || pathname.startsWith("/plant/");
}

function shouldShowMobileProfileEntry(pathname: string) {
  return ["/discover", "/archive", "/plant", "/market", "/profile"].includes(
    pathname,
  );
}

function shouldShowMobileCreateAction(pathname: string) {
  if (pathname === "/archive/new" || pathname === "/local/archive/new") return false;
  if (pathname.startsWith("/market")) return false;
  if (pathname === "/plant" || pathname.startsWith("/plant/")) return false;
  if (pathname.startsWith("/experience-cards")) return false;
  if (isMobileMePath(pathname)) return false;
  if (isMobileDiscoverIndexPath(pathname)) return false;
  return true;
}

function shouldShowMobileLoginAction(pathname: string) {
  return !pathname.startsWith("/login") && !pathname.startsWith("/register");
}

function getMobileCreateHref(pathname: string, hasUser: boolean) {
  if (!hasUser) return "/login";

  const archiveDetailPath = getArchiveDetailPath(pathname);
  if (archiveDetailPath) return `${archiveDetailPath}#add-record`;

  return "/archive/new";
}

function getMobileCreateLabel(pathname: string, labels: TranslationDictionary["nav"]) {
  return getArchiveDetailPath(pathname) ? labels.add_record : labels.new_project;
}

function getMobilePageTitle(pathname: string, labels: TranslationDictionary["nav"]) {
  if (pathname === "/archive") return labels.my_space;
  if (pathname === "/") return labels.brand;
  if (pathname.startsWith("/experience-cards")) return labels.my_experience_cards;
  if (pathname.startsWith("/discover")) return labels.discover;
  if (pathname.startsWith("/follow")) return labels.following;
  if (pathname.startsWith("/plant")) return labels.guide;
  if (pathname.startsWith("/profile")) return labels.me;
  if (pathname.startsWith("/notifications")) return labels.notification;
  if (pathname.startsWith("/membership")) return labels.cloud_membership;
  if (pathname.startsWith("/archive/new")) return labels.new_project;
  if (pathname.startsWith("/market")) return labels.market;
  if (pathname.startsWith("/login")) return labels.login;
  if (pathname.startsWith("/register")) return labels.register;
  return labels.brand;
}

function getNavStyle(compact: boolean): CSSProperties {
  return {
    position: "sticky",
    top: 0,
    zIndex: 100,
    display: "flex",
    flexDirection: compact ? "column" : "row",
    justifyContent: compact ? "flex-start" : "space-between",
    alignItems: compact ? "stretch" : "center",
    gap: compact ? 8 : 16,
    padding: compact ? "8px 12px" : "10px 16px",
    borderBottom: "1px solid #e4ece0",
    background: "rgba(255,255,255,0.96)",
    backdropFilter: "blur(10px)",
    boxSizing: "border-box",
  };
}

const mobileTopNavStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  minHeight: "calc(50px + var(--app-safe-area-top))",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "calc(8px + var(--app-safe-area-top)) 14px 8px",
  borderBottom: "1px solid #e4ece0",
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(10px)",
  boxSizing: "border-box",
};

const mobileProfileEntryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#1f2a1f",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const mobilePageTitleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#1f2a1f",
  fontSize: 17,
  fontWeight: 800,
  lineHeight: 1.2,
};

const mobileArchiveTitleTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  verticalAlign: "bottom",
};

const mobileArchiveTitleDotStyle: CSSProperties = {
  color: "#8a9685",
  fontWeight: 600,
};

const mobileArchiveTitleSystemStyle: CSSProperties = {
  color: "#53694d",
  fontWeight: 700,
};

const mobileArchiveTitleLinkStyle: CSSProperties = {
  ...mobileArchiveTitleSystemStyle,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

const mobileTopActionGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const mobileNotificationButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid #dfe8da",
  background: "#fff",
  color: "#52634e",
  textDecoration: "none",
  fontSize: 16,
  lineHeight: 1,
};

const mobileCreateButtonStyle: CSSProperties = {
  minWidth: 0,
  height: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid #cfe0c8",
  background: "#f3f9ef",
  color: "#2f6a31",
  textDecoration: "none",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 800,
  padding: "0 11px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const mobileSearchButtonStyle: CSSProperties = {
  ...mobileCreateButtonStyle,
  border: "1px solid #dfe8da",
  background: "#fff",
  color: "#40583a",
};

const mobilePlantMenuWrapStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  flexShrink: 0,
};

const mobilePlantButtonStyle: CSSProperties = {
  ...mobileSearchButtonStyle,
  padding: "0 10px",
};

const mobilePlantMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  zIndex: 140,
  width: 132,
  border: "1px solid #e6ebdf",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 14px 30px rgba(39, 58, 34, 0.16)",
  padding: 5,
};

const mobilePlantMenuItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: 34,
  borderRadius: 9,
  color: "#40583a",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 800,
  padding: "0 9px",
  whiteSpace: "nowrap",
};

const mobileMeMenuWrapStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  flexShrink: 0,
};

const mobileMeMoreButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid #dfe8da",
  background: "#fff",
  color: "#52634e",
  fontSize: 20,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const mobileMeMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  zIndex: 140,
  width: 112,
  border: "1px solid #e6ebdf",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 14px 30px rgba(39, 58, 34, 0.16)",
  padding: 5,
};

const mobileMeMenuItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  minHeight: 34,
  borderRadius: 9,
  color: "#40583a",
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "none",
  padding: "0 9px",
};

const mobileMeLogoutItemStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  border: "none",
  borderRadius: 9,
  background: "transparent",
  color: "#b23a2d",
  fontSize: 13,
  fontWeight: 800,
  textAlign: "left",
  padding: "0 9px",
  cursor: "pointer",
};

const mobileLoginActionStyle: CSSProperties = {
  height: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  border: "1px solid #dfe8da",
  background: "#fff",
  color: "#40583a",
  textDecoration: "none",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 800,
  padding: "0 12px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const mobileBottomNavStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1100,
  height: "calc(58px + var(--app-safe-area-bottom))",
  padding: "5px 8px calc(5px + var(--app-safe-area-bottom))",
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 4,
  borderTop: "1px solid #dfe8da",
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 -8px 22px rgba(40, 62, 34, 0.08)",
  boxSizing: "border-box",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  willChange: "transform",
  touchAction: "manipulation",
};

function mobileBottomNavItemStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: active ? "#2f6a31" : "#657160",
    background: active ? "#edf6e8" : "transparent",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: active ? 800 : 650,
    lineHeight: 1,
  };
}

const mobileBottomNavLabelStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  maxWidth: "100%",
  gap: 3,
  whiteSpace: "nowrap",
};

const mobileBottomBadgeStyle: CSSProperties = {
  position: "absolute",
  top: -5,
  right: -13,
  minWidth: 16,
  height: 16,
  borderRadius: 999,
  background: "#e85d3f",
  color: "#fff",
  fontSize: 10,
  lineHeight: "16px",
  textAlign: "center",
  fontWeight: 800,
  padding: "0 4px",
};

function getLeftGroupStyle(compact: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: compact ? "column" : "row",
    alignItems: compact ? "stretch" : "center",
    gap: compact ? 8 : 16,
    minWidth: 0,
    flex: compact ? "none" : 1,
  };
}

const brandStyle: CSSProperties = {
  textDecoration: "none",
  color: "#1f2a1f",
  fontWeight: 800,
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
  fontSize: 16,
};

function getNavItemsWrapStyle(compact: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: compact ? 3 : 4,
    minWidth: 0,
    width: compact ? "100%" : undefined,
    overflowX: "auto",
    scrollbarWidth: "none",
    paddingBottom: compact ? 2 : 0,
  };
}

function navLinkStyle(active: boolean): CSSProperties {
  return {
    textDecoration: "none",
    color: active ? "#1a1c1a" : "#40423f",
    background: active ? "#cbdac3" : "transparent",
    fontSize: 16,
    fontWeight: active ? 700 : 600,
    padding: "7px 11px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    lineHeight: 1.2,
  };
}

function getUserAreaStyle(compact: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: compact ? 8 : 10,
    fontSize: compact ? 12 : 13,
    justifyContent: compact ? "flex-start" : "flex-end",
    minWidth: 0,
    maxWidth: "100%",
    overflowX: compact ? "auto" : "visible",
    whiteSpace: "nowrap",
  };
}

const notificationStyle: CSSProperties = {
  position: "relative",
  textDecoration: "none",
  color: "#1f2a1f",
  fontSize: 17,
  lineHeight: 1,
  padding: "4px 5px",
  borderRadius: 999,
};

const desktopUtilityGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const desktopFeedbackLinkStyle: CSSProperties = {
  minHeight: 28,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 6px",
  color: "#4f6448",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const desktopUtilityDividerStyle: CSSProperties = {
  width: 1,
  height: 22,
  flexShrink: 0,
  margin: "0 2px",
  background: "#d9e1d5",
};

const notificationBadgeStyle: CSSProperties = {
  position: "absolute",
  top: -5,
  right: -8,
  minWidth: 16,
  height: 16,
  borderRadius: 999,
  background: "#e85d3f",
  color: "#fff",
  fontSize: 10,
  lineHeight: "16px",
  textAlign: "center",
  fontWeight: 700,
  padding: "0 4px",
};

function getProfileLinkStyle(compact: boolean): CSSProperties {
  return {
    textDecoration: "none",
    color: "#1f2a1f",
    fontWeight: 700,
    whiteSpace: "nowrap",
    maxWidth: compact ? 120 : undefined,
    overflow: compact ? "hidden" : undefined,
    textOverflow: compact ? "ellipsis" : undefined,
  };
}


function adminLinkStyle(active: boolean): CSSProperties {
  return {
    textDecoration: "none",
    color: active ? "#1a1c1a" : "#4d6447",
    background: active ? "#dbe8d3" : "#eef5ea",
    border: "1px solid #d7e3cf",
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}

const logoutButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
  color: "#c23a2b",
  fontSize: 13,
  whiteSpace: "nowrap",
};

function getGuestAreaStyle(compact: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    whiteSpace: "nowrap",
    justifyContent: compact ? "flex-start" : "flex-end",
  };
}

const loginLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "#40583a",
  fontWeight: 700,
};

const registerLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "#fff",
  background: "#4f7b45",
  padding: "8px 14px",
  borderRadius: 999,
  fontWeight: 700,
};
