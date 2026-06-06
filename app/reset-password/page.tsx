"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [saving, setSaving] = useState(false);
  const isSuccessMessage = message.includes("已更新");

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" || session) {
        setCanReset(true);
        setMessage("");
      }

      setCheckingSession(false);
    });

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        setCanReset(true);
        setMessage("");
        setCheckingSession(false);
        return;
      }

      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!mounted) return;

        if (!error && data.session) {
          window.history.replaceState(null, "", "/reset-password");
          setCanReset(true);
          setMessage("");
        } else {
          setCanReset(false);
          setMessage("重置链接无效或已过期");
        }

        setCheckingSession(false);
        return;
      } else {
        setCanReset(false);
        setMessage("请从重置邮件打开此页面");
      }

      setCheckingSession(false);
    }

    void checkSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleUpdate() {
    if (!canReset) {
      setMessage("请从重置邮件打开此页面");
      return;
    }

    const nextPassword = password.trim();
    const nextConfirmPassword = confirmPassword.trim();

    if (!nextPassword || !nextConfirmPassword) {
      setMessage("请输入并确认新密码");
      return;
    }

    if (nextPassword.length < 6) {
      setMessage("密码长度至少 6 位");
      return;
    }

    if (nextPassword !== nextConfirmPassword) {
      setMessage("两次输入的密码不一致");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });

      if (error) {
        setMessage("密码更新失败");
        return;
      }

      setMessage("密码已更新，请重新登录");

      setTimeout(() => {
        router.push("/login");
      }, 900);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: "40px 20px", maxWidth: 420, margin: "0 auto", color: "#1f2d1f" }}>
      <h2 style={{ marginBottom: 8 }}>重置密码</h2>
      <p style={{ marginTop: 0, marginBottom: 22, color: "#6f7f6f", fontSize: 14 }}>
        从重置邮件打开后，设置新密码。
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ fontSize: 13, color: "#536553" }}>
          新密码
          <div style={{ marginTop: 6 }}>
            <PasswordInput value={password} onChange={setPassword} placeholder="输入新密码" />
          </div>
        </label>

        <label style={{ fontSize: 13, color: "#536553" }}>
          确认新密码
          <div style={{ marginTop: 6 }}>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="再次输入新密码" />
          </div>
        </label>

        <button
          type="button"
          onClick={handleUpdate}
          disabled={checkingSession || saving || !canReset}
          style={{
            marginTop: 4,
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: checkingSession || saving || !canReset ? "#9aa59a" : "#111",
            color: "#fff",
            cursor: checkingSession || saving || !canReset ? "default" : "pointer",
            fontWeight: 700,
          }}
        >
          {checkingSession ? "确认链接中..." : saving ? "更新中..." : "更新密码"}
        </button>
      </div>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: isSuccessMessage ? "#f0fff4" : "#fff7f7",
            border: isSuccessMessage ? "1px solid #cae9ca" : "1px solid #e6c9c9",
            color: isSuccessMessage ? "#2e7d32" : "#8a4a4a",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}
    </main>
  );
}
