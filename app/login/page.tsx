"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ===== ⭐ 自动填充邮箱 =====
  useEffect(() => {
    const savedEmail = localStorage.getItem("remember_email");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  // ===== 登录 =====
  async function handleLogin(e: any) {
    e.preventDefault();

    if (!email || !password) {
      setMessage("请输入邮箱和密码");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setMessage("登录失败：可能未验证邮箱或密码错误");
      } else {
        setMessage("登录失败：" + error.message);
      }
      return;
    }

    // ⭐ 记住邮箱
    if (remember) {
      localStorage.setItem("remember_email", email);
    } else {
      localStorage.removeItem("remember_email");
    }

    router.push("/archive");
  }

  // ===== 注册（升级版）=====
  async function handleRegister() {
    if (!email || !password) {
      setMessage("请输入邮箱和密码");
      return;
    }

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/archive`,
      },
    });

    setLoading(false);

    // ❗优先判断错误
    if (error) {
      if (
        error.message.includes("already registered") ||
        error.message.includes("User already registered")
      ) {
        setMessage("该邮箱已注册，请直接登录或找回密码");
        return;
      }

      setMessage("注册失败：" + error.message);
      return;
    }

    // ❗fallback判断（防Supabase不报错）
    if (data?.user && data.user.email_confirmed_at) {
      setMessage("该邮箱已注册，请直接登录");
      return;
    }

    setMessage("注册成功，请前往邮箱验证后再登录");
  }

  // ===== 找回密码 =====
  async function handleResetPassword() {
    if (!email) {
      setMessage("请输入邮箱");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setMessage("发送失败：" + error.message);
      return;
    }

    setMessage("已发送重置密码邮件，请前往邮箱查看");
  }

  return (
    <main
      style={{
        padding: "40px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: 320 }}>
        <h1 style={{ marginBottom: 20 }}>登录 / 注册</h1>

        <form onSubmit={handleLogin}>
          {/* 邮箱 */}
          <p>邮箱</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            style={{
              padding: "10px",
              width: "100%",
              borderRadius: "6px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />

          {/* 密码 */}
          <p style={{ marginTop: 16 }}>密码</p>

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              style={{
                padding: "10px 36px 10px 10px",
                width: "100%",
                borderRadius: "6px",
                border: "1px solid #ccc",
                boxSizing: "border-box",
              }}
            />

            <span
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                fontSize: 16,
                color: "#666",
              }}
            >
              {showPassword ? "🙈" : "👁"}
            </span>
          </div>

          {/* ⭐ 记住账号 */}
          <div style={{ marginTop: 10, fontSize: 12 }}>
            <label style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              记住邮箱
            </label>
          </div>

          {/* 登录 */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "none",
              background: "#4CAF50",
              color: "#fff",
              marginTop: 20,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "处理中..." : "登录"}
          </button>

          {/* 注册 */}
          <button
            type="button"
            onClick={handleRegister}
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #ddd",
              background: "#fafafa",
              marginTop: 10,
              cursor: "pointer",
              color: "#333",
              fontWeight: 500,
            }}
          >
            注册账号
          </button>

          {/* 忘记密码 */}
          <div
            onClick={handleResetPassword}
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "#4CAF50",
              cursor: "pointer",
              textAlign: "right",
            }}
          >
            忘记密码？
          </div>
        </form>

        {/* 提示 */}
        {message && (
          <div
            style={{
              marginTop: 20,
              padding: 12,
              background: "#f5f5f5",
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}