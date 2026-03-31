"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");

  // ✅ 获取当前用户信息
  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setUsername(data.username || "");
      }
    }

    loadProfile();
  }, []);

  // ✅ 保存用户名
  async function handleSave() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", user.id);

    if (error) {
      setMessage("保存失败：" + error.message);
      return;
    }

    setMessage("保存成功");
  }

  return (
    <main style={{ padding: "40px" }}>
      <h1>用户信息</h1>

      <p>用户名</p>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{ padding: "8px", width: "300px" }}
      />

      <br /><br />

      <button onClick={handleSave}>保存</button>

      {message && (
        <div style={{ marginTop: "20px" }}>{message}</div>
      )}
    </main>
  );
}