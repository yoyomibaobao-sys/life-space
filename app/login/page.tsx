"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  async function handleLogin(e: any) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("登录失败：" + error.message);
      return;
    }

    alert("登录成功");
    setLoggedIn(true); // ✅ 标记已登录
  }

  return (
    <main style={{ padding: "40px" }}>
      <h1>登录</h1>

      <form onSubmit={handleLogin}>
        <p>邮箱</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "8px", width: "300px" }}
        />

        <p>密码</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "8px", width: "300px" }}
        />

        <br /><br />

        <button type="submit">登录</button>
      </form>

      {/* ✅ 登录成功后显示入口 */}
      {loggedIn && (
        <div style={{ marginTop: "20px" }}>
          <a href="/archive">👉 进入我的养成档案</a>
        </div>
      )}
    </main>
  );
}