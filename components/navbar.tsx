"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  // ===== 加载用户信息 =====
  useEffect(() => {
    // 初始化
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        loadProfile(data.user.id);
      }
    });

    // 监听登录状态变化（关键）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;

      setUser(user || null);

      if (user) {
        loadProfile(user.id);
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
        padding: "16px 20px",
        borderBottom: "1px solid #eee",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* ===== 左侧导航 ===== */}
      <div style={{ display: "flex", gap: 24 }}>
        <NavItem href="/discover" active={isActive("/discover")}>
          社区发现
        </NavItem>

        <NavItem href="/archive" active={isActive("/archive")}>
          空间
        </NavItem>

        <NavItem href="/exchange" active={isActive("/exchange")}>
          集市
        </NavItem>
      </div>

      {/* ===== 右侧用户 ===== */}
      {user && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
          }}
        >
          {/* 用户名 → 进入空间 */}
          <Link
            href={`/user/${user.id}`}
            style={{
              textDecoration: "none",
              color: "#000",
              fontWeight: 500,
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