"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";

type MobileArchiveTitleInfo = {
  title: string;
  systemName: string;
  href: string | null;
} | null;

export default function Navbar() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [username, setUsername] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const unreadRequestSeq = useRef(0);

  const pathname = usePathname();
  const router = useRouter();
  const [isCompact, setIsCompact] = useState(false);
  const [mobileTitle, setMobileTitle] = useState("有时·耕作");
  const [mobileArchiveTitleInfo, setMobileArchiveTitleInfo] =
    useState<MobileArchiveTitleInfo>(null);
  const [mobileMeMenuOpen, setMobileMeMenuOpen] = useState(false);
  const [mobilePlantMenuOpen, setMobilePlantMenuOpen] = useState(false);
  const [desktopDiscoverTab, setDesktopDiscoverTab] = useState<
    "feed" | "following"
  >("feed");

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
    setMobileMeMenuOpen(false);
    setMobilePlantMenuOpen(false);

    async function loadMobileTitle() {
      if (!archiveDetailPath) {
        setMobileArchiveTitleInfo(null);
        setMobileTitle(getMobilePageTitle(pathname));
        return;
      }

      setMobileArchiveTitleInfo(null);
      setMobileTitle("项目");
      const archiveId = archiveDetailPath.split("/").pop();
      if (!archiveId) return;

      const { data } = await supabase
        .from("archives")
        .select("title, category, species_id, species_name_snapshot, system_name")
        .eq("id", archiveId)
        .maybeSingle();

      if (!cancelled) {
        const title = String(data?.title || "项目");
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

    void loadMobileTitle();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

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

  async function handleLogout() {
    await supabase.auth.signOut();
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
                : mobileTitle
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
              mobileTitle
            )}
          </div>

          <div style={mobileTopActionGroupStyle}>
            <Link
              href={user ? "/notifications" : "/login"}
              style={mobileNotificationButtonStyle}
              aria-label="通知"
              title="通知"
            >
              🔔
            </Link>

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
                搜索
              </button>
            ) : isMobileMarketPath(pathname) ? (
              <>
                <Link
                  href={user ? "/market/mine" : "/login"}
                  style={mobileMarketMineButtonStyle}
                >
                  我的发布
                </Link>
                <Link
                  href={user ? "/market/new" : "/login"}
                  style={mobileMarketPublishButtonStyle}
                >
                  发布信息
                </Link>
              </>
            ) : isMobilePlantPath(pathname) ? (
              <div style={mobilePlantMenuWrapStyle}>
                <button
                  type="button"
                  onClick={() => setMobilePlantMenuOpen((open) => !open)}
                  style={mobilePlantButtonStyle}
                >
                  我的植物
                </button>
                {mobilePlantMenuOpen ? (
                  <div style={mobilePlantMenuStyle}>
                    <Link
                      href={user ? "/archive/interests" : "/login"}
                      style={mobilePlantMenuItemStyle}
                    >
                      我收藏的植物
                    </Link>
                    <Link
                      href={user ? "/archive/plans" : "/login"}
                      style={mobilePlantMenuItemStyle}
                    >
                      种植计划
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : user && isMobileMePath(pathname) ? (
              <div style={mobileMeMenuWrapStyle}>
                <button
                  type="button"
                  onClick={() => setMobileMeMenuOpen((open) => !open)}
                  aria-label="更多账号操作"
                  style={mobileMeMoreButtonStyle}
                >
                  ⋯
                </button>
                {mobileMeMenuOpen ? (
                  <div style={mobileMeMenuStyle}>
                    <button
                      type="button"
                      onClick={handleLogout}
                      style={mobileMeLogoutItemStyle}
                    >
                      退出登录
                    </button>
                  </div>
                ) : null}
              </div>
            ) : user && shouldShowMobileCreateAction(pathname) ? (
              <Link
                href={getMobileCreateHref(pathname, true)}
                style={mobileCreateButtonStyle}
                aria-label={getMobileCreateLabel(pathname)}
                title={getMobileCreateLabel(pathname)}
                onClick={(event) => {
                  if (getArchiveDetailPath(pathname)) {
                    event.preventDefault();
                    window.dispatchEvent(new Event("mobile-add-record-request"));
                  }
                }}
              >
                ＋ {getMobileCreateLabel(pathname)}
              </Link>
            ) : !user && shouldShowMobileLoginAction(pathname) ? (
              <Link href="/login" style={mobileLoginActionStyle}>
                登录
              </Link>
            ) : null}
          </div>
        </nav>

        <MobileBottomNav
          pathname={pathname}
          user={user}
          unreadCount={unreadCount}
        />
      </>
    );
  }

  return (
    <nav style={getNavStyle(isCompact)}>
      <div style={getLeftGroupStyle(isCompact)}>
        <Link href="/" style={brandStyle}>
          有时·耕作
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
            发现
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
            关注
          </NavItem>

          <NavItem
            href={user ? "/archive" : "/login"}
            active={
              isActive("/archive") || pathname.startsWith("/experience-cards")
            }
          >
            个人空间
          </NavItem>

          <NavItem href="/market" active={isActive("/market")}>
            集市
          </NavItem>

          <NavItem href="/plant" active={isActive("/plant")}>
            指引
          </NavItem>
        </div>
      </div>

      {user ? (
        <div style={getUserAreaStyle(isCompact)}>
          <Link href="/notifications" style={notificationStyle} title="通知">
            🔔
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
              title="管理会员"
            >
              管理
            </Link>
          ) : null}

          <Link href="/profile" style={getProfileLinkStyle(isCompact)}>
            {username || "未设置用户名"}
          </Link>

          {!isCompact ? (
            <div style={emailStyle} title={user.email || ""}>
              {user.email}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleLogout}
            style={logoutButtonStyle}
          >
            退出
          </button>
        </div>
      ) : (
        <div style={getGuestAreaStyle(isCompact)}>
          <Link href="/login" style={loginLinkStyle}>
            登录
          </Link>

          <Link href="/register" style={registerLinkStyle}>
            注册
          </Link>
        </div>
      )}
    </nav>
  );
}

function MobileBottomNav({
  pathname,
  user,
  unreadCount,
}: {
  pathname: string;
  user: SupabaseUser | null;
  unreadCount: number;
}) {
  const items = [
    {
      label: "发现",
      href: "/discover",
      activePaths: ["/discover"],
    },
    {
      label: "集市",
      href: "/market",
      activePaths: ["/market"],
    },
    {
      label: "空间",
      href: user ? "/archive" : "/login",
      activePaths: ["/archive", "/experience-cards"],
    },
    {
      label: "指引",
      href: "/plant",
      activePaths: ["/plant"],
    },
    {
      label: "我",
      href: user ? "/profile" : "/login",
      activePaths: ["/profile", "/notifications", "/membership", "/admin", "/login", "/register"],
      badge: user && unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null,
    },
  ];

  return (
    <nav style={mobileBottomNavStyle} aria-label="手机端主导航">
      {items.map((item) => (
        <MobileBottomNavItem
          key={item.label}
          href={item.href}
          active={item.activePaths.some((path) => isPathActive(pathname, path))}
          badge={item.badge}
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
  children,
}: {
  href: string;
  active: boolean;
  badge?: string | null;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={mobileBottomNavItemStyle(active)}>
      <span style={mobileBottomNavLabelStyle}>
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

function isMobileMarketPath(pathname: string) {
  return pathname === "/market";
}

function isMobilePlantPath(pathname: string) {
  return pathname === "/plant" || pathname.startsWith("/plant/");
}

function shouldShowMobileCreateAction(pathname: string) {
  if (pathname === "/plant" || pathname.startsWith("/plant/")) return false;
  if (pathname.startsWith("/experience-cards")) return false;
  if (isMobileMePath(pathname)) return false;
  if (isMobileDiscoverIndexPath(pathname)) return false;
  if (isMobileMarketPath(pathname)) return false;
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

function getMobileCreateLabel(pathname: string) {
  return getArchiveDetailPath(pathname) ? "添加记录" : "新建项目";
}

function getMobilePageTitle(pathname: string) {
  if (pathname === "/" || pathname === "/archive") return "个人空间";
  if (pathname.startsWith("/experience-cards")) return "我的经验卡";
  if (pathname.startsWith("/discover")) return "发现";
  if (pathname.startsWith("/follow")) return "关注";
  if (pathname.startsWith("/plant")) return "指引";
  if (pathname.startsWith("/profile")) return "我";
  if (pathname.startsWith("/notifications")) return "通知";
  if (pathname.startsWith("/membership")) return "云空间";
  if (pathname.startsWith("/archive/new")) return "新建项目";
  if (pathname.startsWith("/market")) return "集市";
  if (pathname.startsWith("/login")) return "登录";
  if (pathname.startsWith("/register")) return "注册";
  return "有时·耕作";
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
  height: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 14px",
  borderBottom: "1px solid #e4ece0",
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(10px)",
  boxSizing: "border-box",
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
  gap: 8,
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

const mobileMarketMineButtonStyle: CSSProperties = {
  ...mobileSearchButtonStyle,
  padding: "0 9px",
};

const mobileMarketPublishButtonStyle: CSSProperties = {
  ...mobileCreateButtonStyle,
  padding: "0 9px",
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

const mobileLogoutButtonStyle: CSSProperties = {
  height: 34,
  borderRadius: 999,
  border: "1px solid #ead7d2",
  background: "#fff8f6",
  color: "#b23a2d",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 800,
  padding: "0 12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
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
  height: "calc(58px + env(safe-area-inset-bottom))",
  padding: "5px 8px calc(5px + env(safe-area-inset-bottom))",
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 4,
  borderTop: "1px solid #dfe8da",
  background: "rgba(255,255,255,0.98)",
  boxShadow: "0 -8px 22px rgba(40, 62, 34, 0.08)",
  boxSizing: "border-box",
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
    fontSize: 13,
    fontWeight: active ? 800 : 650,
    lineHeight: 1,
  };
}

const mobileBottomNavLabelStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
};

const mobileBottomBadgeStyle: CSSProperties = {
  position: "absolute",
  top: -13,
  right: -18,
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

const emailStyle: CSSProperties = {
  color: "#7b8676",
  maxWidth: 180,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

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
