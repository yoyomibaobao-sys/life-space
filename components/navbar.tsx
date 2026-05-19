"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";

export default function Navbar() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [username, setUsername] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const unreadRequestSeq = useRef(0);

  const pathname = usePathname();
  const router = useRouter();
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    function updateCompact() {
      setIsCompact(window.innerWidth < 760);
    }

    updateCompact();
    window.addEventListener("resize", updateCompact);

    return () => window.removeEventListener("resize", updateCompact);
  }, []);

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

  return (
    <nav style={getNavStyle(isCompact)}>
      <div style={getLeftGroupStyle(isCompact)}>
        <Link href="/" style={brandStyle}>
          有时·耕作
        </Link>

        <div style={getNavItemsWrapStyle(isCompact)}>
          <NavItem href="/discover" active={isActive("/discover")}>
            发现
          </NavItem>

          <NavItem href="/follow" active={isActive("/follow")}>
            我的关注
          </NavItem>

          <NavItem
            href={user ? "/archive" : "/login"}
            active={isActive("/archive")}
          >
            本人空间
          </NavItem>

          <NavItem href="/market" active={isActive("/market")}>
            集市
          </NavItem>

          <NavItem href="/plant" active={isActive("/plant")}>
            百科
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

function NavItem({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} style={navLinkStyle(active)}>
      {children}
    </Link>
  );
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
