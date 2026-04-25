"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

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

      if (data.session) {
        router.replace("/archive");
        return;
      }

      router.push(`/check-email?email=${encodeURIComponent(cleanEmail)}&type=signup`);
    } catch {
      setMessage("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 40, display: "flex", justifyContent: "center" }}>
      <div style={{ width: 320 }}>
        <h1>注册账号</h1>

        <form onSubmit={handleRegister}>
          <p>邮箱</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            autoComplete="email"
            style={{
              width: "100%",
              padding: 10,
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
              padding: 10,
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
              padding: 10,
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
