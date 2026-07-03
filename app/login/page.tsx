"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

function getLoginErrorMessage(message: string) {
  const text = message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "邮箱或密码不正确；刚注册请先确认邮箱";
  }

  if (text.includes("email not confirmed")) {
    return "邮箱未确认，请查找来自“有时·耕作”的邮件";
  }

  return `登录失败：${message}`;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSentTime, setLastSentTime] = useState(0);

  useEffect(() => {
    const savedEmail = localStorage.getItem("remember_email");
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage("请输入邮箱和密码");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setMessage(getLoginErrorMessage(error.message));
        return;
      }

      if (remember) {
        localStorage.setItem("remember_email", cleanEmail);
      } else {
        localStorage.removeItem("remember_email");
      }

      router.replace("/archive");
    } catch {
      setMessage("当前网络不稳定，暂时无法注册或登录。你可以先本地记录，稍后再登录绑定账号。");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    const now = Date.now();

    if (now - lastSentTime < 30000) {
      setMessage("30 秒后再试");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("请输入邮箱");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setMessage(`发送失败：${error.message}`);
        return;
      }

      setLastSentTime(now);
      setMessage("重置邮件已发送，请查找来自“有时·耕作”的邮件");
    } catch {
      setMessage("网络异常");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        padding: "32px 20px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 320 }}>
        <h1 style={{ marginBottom: 10 }}>登录</h1>

        <div
          style={{
            marginBottom: 20,
            padding: 12,
            borderRadius: 12,
            background: "#f6faf3",
            border: "1px solid #e1ecd9",
            color: "#5f6f58",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          登录后进入我的项目。注册是推荐路径；如果当前网络不稳定，也可以先本地使用，稍后绑定账号。
        </div>

        <form onSubmit={handleLogin}>
          <p>邮箱</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            autoComplete="email"
            style={{
              padding: "12px",
              width: "100%",
              borderRadius: "6px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />

          <p style={{ marginTop: 16 }}>密码</p>
          <PasswordInput value={password} onChange={setPassword} />

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

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
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

          <button
            type="button"
            onClick={() => router.push("/register")}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
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

          <button
            type="button"
            onClick={() => router.push("/local/archive")}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #dfe8da",
              background: "#f6faf3",
              marginTop: 10,
              cursor: "pointer",
              color: "#496b3f",
              fontWeight: 500,
            }}
          >
            先本地使用
          </button>

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

        {message && (
          <div
            style={{
              marginTop: 20,
              padding: 12,
              background: "#f5f5f5",
              borderRadius: 6,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}
