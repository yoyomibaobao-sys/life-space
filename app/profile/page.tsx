"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function getUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) return;

      setUserId(user.id);

      // 读取已有用户名
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      setUsername(data?.username || "");
    }

    getUser();
  }, []);

  async function handleSave() {
    if (!userId) return;

    setLoading(true);

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      username: username,
    });

    setLoading(false);

    if (error) {
      alert("保存失败：" + error.message);
    } else {
      alert("保存成功！");
      router.push("/"); // 返回首页（或你想去的页面）
    }
  }

  return (
    <div style={{ padding: "40px", maxWidth: "400px", margin: "0 auto" }}>
      <h2>个人资料</h2>

      <div style={{ marginBottom: "20px" }}>
        <label>用户名</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="请输入用户名"
          style={{
            width: "100%",
            padding: "8px",
            marginTop: "8px",
            border: "1px solid #ddd",
          }}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        style={{
          width: "100%",
          padding: "10px",
          background: "#333",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </div>
  );
}