"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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
        loadProfile(data.user.id);
        loadUnreadCount(data.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null;

      setUser(currentUser);

      if (currentUser) {
        loadProfile(currentUser.id);
        loadUnreadCount(currentUser.id);
      } else {
        setUsername("");
        setUnreadCount(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadUnreadCount(user.id);
    }
  }, [pathname, user?.id]);

useEffect(() => {
  function handleNotificationChanged() {
    if (user?.id) {
      loadUnreadCount(user.id);
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
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 20,
        padding: "14px 20px",
        borderBottom: "1px solid #eee",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 100,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <Link
          href="/"
          style={{
            textDecoration: "none",
            color: "#1f2a1f",
            fontWeight: 700,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            fontSize: 16,
          }}
        >
          有时·耕作
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <NavItem href="/discover" active={isActive("/discover")}>
            发现
          </NavItem>

          <NavItem href="/follow" active={isActive("/follow")}>
            关注
          </NavItem>

          <NavItem href="/archive" active={isActive("/archive")}>
            空间
          </NavItem>

          <NavItem href="/plant" active={isActive("/plant")}>
            百科
          </NavItem>
        </div>
      </div>

      {user ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 13,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href="/notifications"
            style={{
              position: "relative",
              textDecoration: "none",
              color: "#1f2a1f",
              fontSize: 18,
              lineHeight: 1,
              padding: "3px 5px",
            }}
            title="通知"
          >
            🔔
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
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
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>

          <Link
            href="/profile"
            style={{
              textDecoration: "none",
              color: "#000",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {username || "未设置用户名"}
          </Link>

          <div
            style={{
              color: "#888",
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={user.email || ""}
          >
            {user.email}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              color: "#f44336",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            退出
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 14,
          }}
        >
          <Link
            href="/login"
            style={{
              textDecoration: "none",
              color: "#496b3f",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            登录
          </Link>

          <Link
            href="/register"
            style={{
              textDecoration: "none",
              color: "#fff",
              background: "#3f7d3d",
              padding: "8px 14px",
              borderRadius: 999,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
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
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: active ? "#3f7d3d" : "#333",
        fontWeight: active ? 600 : 500,
        borderBottom: active ? "2px solid #3f7d3d" : "2px solid transparent",
        paddingBottom: 4,
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}
    >
      {children}
    </Link>
  );
}