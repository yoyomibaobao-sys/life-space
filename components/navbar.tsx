"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setUser(user);

      // ✅ 从 profiles 读取用户名
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      setUsername(data?.username || "");
    }

    load();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function isActive(path: string) {
    return pathname.startsWith(path);
  }

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px",
        borderBottom: "1px solid #eee",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* 左侧导航 */}
      <div style={{ display: "flex", gap: 24 }}>
        <NavItem href="/discover" active={isActive("/discover")}>
          社区发现
        </NavItem>

        <NavItem href="/archive" active={isActive("/archive")}>
          植物
        </NavItem>

        <NavItem href="/exchange" active={isActive("/exchange")}>
          集市
        </NavItem>
      </div>

      {/* 右侧用户 */}
      {user && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
          }}
        >
          {/* 用户名（点击进入 profile） */}
          <Link
            href="/profile"
            style={{
              textDecoration: "none",
              color: "#000",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
             {username || "未设置用户名"}
          </Link>

          {/* 邮箱 */}
          <div style={{ color: "#888" }}>{user.email}</div>

          {/* 退出 */}
          <div
            onClick={handleLogout}
            style={{
              cursor: "pointer",
              color: "#f44336",
            }}
          >
            退出
          </div>
        </div>
      )}
    </nav>
  );
}

// 导航项组件（高亮）
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
        color: active ? "#4CAF50" : "#333",
        fontWeight: active ? 600 : 400,
        borderBottom: active ? "2px solid #4CAF50" : "none",
        paddingBottom: 4,
      }}
    >
      {children}
    </Link>
  );
}