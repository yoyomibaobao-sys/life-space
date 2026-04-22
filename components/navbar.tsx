"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  // ===== 加载用户信息 =====
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        loadProfile(data.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user;

      setUser(currentUser || null);

      if (currentUser) {
        loadProfile(currentUser.id);
      } else {
        setUsername("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ===== 获取用户名 =====
  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();

    setUsername(data?.username || "");
  }

  // ===== 退出 =====
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ===== 当前高亮 =====
  function isActive(path: string) {
    return pathname.startsWith(path);
  }

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 20,
        padding: "16px 20px",
        borderBottom: "1px solid #eee",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 100,
        flexWrap: "wrap",
      }}
    >
      {/* ===== 左侧：品牌 + 主导航 ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          flexWrap: "wrap",
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
          }}
        >
          有时·耕作
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            flexWrap: "wrap",
          }}
        >
          <NavItem href="/archive" active={isActive("/archive")}>
            空间
          </NavItem>

          <NavItem href="/discover" active={isActive("/discover")}>
            发现
          </NavItem>

          <NavItem href="/plant" active={isActive("/plant")}>
            百科
          </NavItem>
        </div>
      </div>

      {/* ===== 右侧：用户状态 ===== */}
      {user ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={
              pathname === `/user/${user.id}`
                ? "/profile"
                : `/user/${user.id}`
            }
            style={{
              textDecoration: "none",
              color: "#000",
              fontWeight: 500,
            }}
          >
            {username || "未设置用户名"} ▾
          </Link>

          <div style={{ color: "#888" }}>{user.email}</div>

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
            }}
          >
            注册
          </Link>
        </div>
      )}
    </nav>
  );
}

// ===== 导航项 =====
function NavItem({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: active ? "#3f7d3d" : "#333",
        fontWeight: active ? 600 : 400,
        borderBottom: active ? "2px solid #3f7d3d" : "2px solid transparent",
        paddingBottom: 4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Link>
  );
}