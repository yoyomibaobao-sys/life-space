"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { trackAnalyticsEvent } from "@/lib/analytics-events";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getErrorMessage(message: string) {
  const text = message.toLowerCase();

  if (text.includes("already registered") || text.includes("been registered")) {
    return "该邮箱已注册，请直接登录";
  }

  if (text.includes("password")) {
    return "注册失败：密码至少需要 6 位";
  }

  return `注册失败：${message}`;
}

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage("请输入邮箱和密码");
      return;
    }

    if (!isEmail(cleanEmail)) {
      setMessage("请输入正确的邮箱地址");
      return;
    }

    if (password.length < 6) {
      setMessage("密码至少需要 6 位");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/archive`,
        },
      });

      if (error) {
        setMessage(getErrorMessage(error.message));
        return;
      }

      const identities = data.user?.identities ?? [];
      if (data.user && identities.length === 0) {
        setMessage("该邮箱已注册，请直接登录");
        return;
      }

      void trackAnalyticsEvent("register");

      if (data.session) {
        router.replace("/archive");
        return;
      }

      router.push(`/check-email?email=${encodeURIComponent(cleanEmail)}&type=signup`);
    } catch {
      setMessage("当前网络不稳定，暂时无法注册。你可以先本地记录，稍后再登录绑定账号。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: "32px 20px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <h1 style={{ marginBottom: 10 }}>注册账号</h1>

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
          注册后可以继续本地离线使用。开通云空间后，记录可同步、备份、多设备使用；上传云空间不等于公开。
        </div>

        <form onSubmit={handleRegister}>
          <p>邮箱</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            autoComplete="email"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 6,
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />

          <p style={{ marginTop: 16 }}>密码</p>
          <PasswordInput value={password} onChange={setPassword} />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              marginTop: 20,
              background: "#4CAF50",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
          {loading ? "处理中..." : "注册"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push("/local/archive")}
          style={{
            width: "100%",
            marginTop: 12,
            padding: 12,
            border: "1px solid #dfe8da",
            background: "#f6faf3",
            borderRadius: 6,
            fontSize: 14,
            color: "#496b3f",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          先本地使用
        </button>

        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            marginTop: 12,
            padding: 0,
            border: "none",
            background: "transparent",
            fontSize: 12,
            color: "#4CAF50",
            cursor: "pointer",
          }}
        >
          已有账号？去登录
        </button>

        {message && (
          <div
            style={{
              marginTop: 20,
              background: "#f5f5f5",
              padding: 12,
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
