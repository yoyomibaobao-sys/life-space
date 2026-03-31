"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function UserBar() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    async function getUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) return;

      setEmail(user.email || "");

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.log("profiles错误:", error.message);
      }

      setUsername(profile?.username || "");
    }

    getUser();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "20px",
        borderBottom: "1px solid #eee",
        padding: "10px 16px",
        alignItems: "center",
        background: "#fafafa",
      }}
    >
      {/* 左侧 */}
      <div>
        {/* ✅ 始终可点击 */}
        <Link
          href="/profile"
          style={{
            fontWeight: "600",
            color: username ? "#333" : "#bbb",
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          🙂 {username || "未设置用户名"}
        </Link>

        {/* 邮箱 */}
        {email && (
          <div style={{ fontSize: "12px", color: "#999" }}>
            {email}
          </div>
        )}
      </div>

      {/* 右侧 */}
      <button
        onClick={handleLogout}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#888",
        }}
      >
        登出
      </button>
    </div>
  );
}