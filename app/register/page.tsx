"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleRegister(e: any) {
    e.preventDefault();

    if (!email || !password) {
      setMessage("请输入邮箱和密码");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      // ✅ 1. 尝试登录（判断是否已注册）
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!loginError || !loginError.message.includes("Invalid login credentials")) {
        setMessage("该邮箱已注册，请直接登录");
        setLoading(false);
        return;
      }

      // ✅ 2. 注册新用户
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/archive`,
        },
      });

      if (error) {
        setMessage("注册失败：" + error.message);
        setLoading(false);
        return;
      }

      // ✅ 成功
      setMessage("注册成功，请前往邮箱验证");

    } catch (err) {
      setMessage("网络异常，请稍后再试");
    }

    setLoading(false);
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
            style={{ width: "100%", padding: 10 }}
          />

          <p style={{ marginTop: 16 }}>密码</p>

          <PasswordInput
            value={password}
            onChange={setPassword}
          />

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
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "处理中..." : "注册"}
          </button>
        </form>

        <div
          onClick={() => router.push("/login")}
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#4CAF50",
            cursor: "pointer",
          }}
        >
          已有账号？去登录
        </div>

        {message && (
          <div
            style={{
              marginTop: 20,
              background: "#f5f5f5",
              padding: 10,
              borderRadius: 6,
            }}
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}