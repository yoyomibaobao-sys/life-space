"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleUpdate() {
    if (!password) {
      setMessage("请输入新密码");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage("修改失败：" + error.message);
      return;
    }

    setMessage("密码修改成功，请重新登录");

    setTimeout(() => {
      router.push("/login");
    }, 1500);
  }

  return (
    <main style={{ padding: 40 }}>
      <h2>重置密码</h2>

      <input
        type="password"
        placeholder="输入新密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 10, width: 300 }}
      />

      <br /><br />

      <button onClick={handleUpdate}>确认修改</button>

      {message && <div style={{ marginTop: 10 }}>{message}</div>}
    </main>
  );
}