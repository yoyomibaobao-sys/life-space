"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";

export default function Navbar() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [username, setUsername] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        void loadProfile(data.user.id);
        void loadUnreadCount(data.user.id);
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
      } else {
        setUsername("");
        setUnreadCount(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.id) {
      void loadUnreadCount(user.id);
    }
  }, [pathname, user?.id]);

  useEffect(() => {
    function handleNotificationChanged() {
      if (user?.id) {
        void loadUnreadCount(user.id);
      }
    }

    window.addEventListener("notifications-changed", handleNotificationChanged);

    return () => {
      window.removeEventListener("notifications-changed", handleNotificationChanged);
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

  async function loadUnreadCount(userId: string) {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("load unread notifications error:", error);
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
    <nav style={navStyle}>
      <div style={leftGroupStyle}>
        <Link href="/" style={brandStyle}>
          有时·耕作
        </Link>

        <div style={navItemsWrapStyle}>
          <NavItem href="/discover" active={isActive("/discover")}>
            发现
          </NavItem>

          <NavItem href="/follow" active={isActive("/follow")}>
            关注
          </NavItem>

          <NavItem href="/archive" active={isActive("/archive")}>
            空间
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
        <div style={userAreaStyle}>
          <Link href="/notifications" style={notificationStyle} title="通知">
            🔔
            {unreadCount > 0 ? (
              <span style={notificationBadgeStyle}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>

          <Link href="/profile" style={profileLinkStyle}>
            {username || "未设置用户名"}
          </Link>

          <div style={emailStyle} title={user.email || ""}>
            {user.email}
          </div>

          <button type="button" onClick={handleLogout} style={logoutButtonStyle}>
            退出
          </button>
        </div>
      ) : (
        <div style={guestAreaStyle}>
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

const navStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  padding: "10px 16px",
  borderBottom: "1px solid #e4ece0",
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(10px)",
  boxSizing: "border-box",
};

const leftGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  minWidth: 0,
  flex: 1,
};

const brandStyle: CSSProperties = {
  textDecoration: "none",
  color: "#1f2a1f",
  fontWeight: 800,
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
  fontSize: 16,
};

const navItemsWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  minWidth: 0,
  overflowX: "auto",
  scrollbarWidth: "none",
};

function navLinkStyle(active: boolean): CSSProperties {
  return {
    textDecoration: "none",
    color: active ? "#1a1c1a" : "#40423f",
    background: active ? "#cbdac3"  : "transparent",
    fontSize: 14,
    fontWeight: active ? 700 : 600,
    padding: "7px 11px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    lineHeight: 1.2,
  };
}

const userAreaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  justifyContent: "flex-end",
  minWidth: 0,
};

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

const profileLinkStyle: CSSProperties = {
  textDecoration: "none",
  color: "#1f2a1f",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

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

const guestAreaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 14,
  whiteSpace: "nowrap",
};

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
