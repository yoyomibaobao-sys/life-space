"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleUpdate() {
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

    const { error } = await supabase.auth.updateUser({ password: nextPassword });

    setSaving(false);

    if (error) {
      setMessage("修改失败：" + error.message);
      return;
    }

    setMessage("密码修改成功，请重新登录");

    setTimeout(() => {
      router.push("/login");
    }, 900);
  }

  return (
    <main style={{ padding: "40px 20px", maxWidth: 420, margin: "0 auto", color: "#1f2d1f" }}>
      <h2 style={{ marginBottom: 8 }}>重置密码</h2>
      <p style={{ marginTop: 0, marginBottom: 22, color: "#6f7f6f", fontSize: 14 }}>
        请输入新的登录密码，并再次确认。
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
          disabled={saving}
          style={{
            marginTop: 4,
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: saving ? "#9aa59a" : "#111",
            color: "#fff",
            cursor: saving ? "default" : "pointer",
            fontWeight: 700,
          }}
        >
          {saving ? "修改中..." : "确认修改"}
        </button>
      </div>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: message.includes("成功") ? "#f0fff4" : "#fff7f7",
            border: message.includes("成功") ? "1px solid #cae9ca" : "1px solid #e6c9c9",
            color: message.includes("成功") ? "#2e7d32" : "#8a4a4a",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}
    </main>
  );
}
