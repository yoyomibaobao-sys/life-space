"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [message, setMessage] = useState("");

  // ✅ 登录（保留密码登录方式）
  async function handleLogin(e: any) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // 🔥 核心：区分“未验证邮箱”的情况
      if (error.message.includes("Invalid login credentials")) {
        setMessage("登录失败，请确认邮箱已完成验证（请检查邮件）");
      } else {
        setMessage("登录失败：" + error.message);
      }
      return;
    }

    setMessage("登录成功");
    setLoggedIn(true);
  }

  // ✅ 注册（提示改正确）
  async function handleRegister(e: any) {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage("注册失败：" + error.message);
      return;
    }

    // 🔥 改成正确引导
    setMessage("注册成功，请前往邮箱完成验证后再登录");
  }

  return (
    <main style={{ padding: "40px" }}>
      <h1>登录 / 注册</h1>

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

        {/* 登录按钮 */}
        <button type="submit" style={{ marginRight: "10px" }}>
          登录
        </button>

        {/* 注册按钮 */}
        <button
          type="button"
          onClick={handleRegister}
          style={{
            background: "#888",
            color: "#fff",
            border: "none",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          注册
        </button>
      </form>

      {/* ✅ 页面提示（替代 alert） */}
      {message && (
        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            background: "#f5f5f5",
            borderRadius: "6px",
            color: "#333",
          }}
        >
          {message}
        </div>
      )}

      {/* 登录成功入口 */}
      {loggedIn && (
        <div style={{ marginTop: "20px" }}>
          <a href="/archive">👉 进入我的养成档案</a>
        </div>
      )}
    </main>
  );
}