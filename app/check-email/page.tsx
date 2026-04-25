"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CheckEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const email = useMemo(() => searchParams.get("email")?.trim() || "", [searchParams]);
  const type = searchParams.get("type") || "signup";

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSentTime, setLastSentTime] = useState(0);

  async function handleResend() {
    if (!email) {
      setMessage("缺少邮箱地址，请返回注册页重新提交");
      return;
    }

    const now = Date.now();
    if (now - lastSentTime < 30000) {
      setMessage("请稍后再试（30秒内只能发送一次）");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resend({
        type: type === "signup" ? "signup" : "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/archive`,
        },
      });

      if (error) {
        setMessage(`发送失败：${error.message}`);
        return;
      }

      setLastSentTime(now);
      setMessage("验证邮件已重新发送，请前往邮箱查看");
    } catch {
      setMessage("网络异常，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        padding: 40,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div style={{ width: 360, textAlign: "center" }}>
        <h1>请验证邮箱</h1>

        <p style={{ marginTop: 20, fontSize: 14, color: "#666", lineHeight: 1.8 }}>
          注册成功后，需要先前往邮箱点击验证链接，再进入系统。
        </p>

        {email && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "#f5f5f5",
              borderRadius: 8,
              fontSize: 14,
              color: "#333",
              wordBreak: "break-all",
            }}
          >
            当前邮箱：{email}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
          <button
            onClick={handleResend}
            disabled={loading}
            style={{
              padding: "10px 20px",
              background: "#4CAF50",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "处理中..." : "重新发送验证邮件"}
          </button>

          <button
            onClick={() => router.push("/login")}
            style={{
              padding: "10px 20px",
              background: "#fff",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            返回登录
          </button>

          <button
            onClick={() => router.push("/register")}
            style={{
              padding: "10px 20px",
              background: "#fff",
              color: "#333",
              border: "1px solid #ddd",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            返回注册
          </button>
        </div>

        {message && (
          <div
            style={{
              marginTop: 20,
              background: "#f5f5f5",
              padding: 12,
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1.6,
              textAlign: "left",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}
