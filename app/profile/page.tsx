"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const router = useRouter();

  // ✅ 初始化：获取用户 + 用户资料
  useEffect(() => {
    async function init() {
      setInitLoading(true);

      // 获取当前用户（稳定方式）
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      // 未登录处理
      if (userError || !user) {
        setInitLoading(false);
        router.push("/login");
        return;
      }

      setUserId(user.id);

      // 获取用户名
      const {
        data,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMsg("读取用户信息失败");
      } else {
        setUsername(data?.username || "");
      }

      setInitLoading(false);
    }

    init();
  }, [router]);

  // ✅ 保存用户名
  async function handleSave() {
    if (!userId) return;

    // 基础校验
    if (!username || username.trim().length < 2) {
      setErrorMsg("用户名至少2个字符");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          username: username.trim(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      // ✅ 成功后跳转 + 强制刷新（让 UserBar 同步）
      router.push("/");
      window.location.reload();
    }
  }

  // ✅ 加载状态
  if (initLoading) {
    return <div style={{ padding: 40 }}>加载中...</div>;
  }

  return (
    <div style={{ padding: "40px", maxWidth: "420px", margin: "0 auto" }}>
      <h2>个人资料</h2>

      {/* 错误提示 */}
      {errorMsg && (
        <div
          style={{
            background: "#ffecec",
            color: "#d8000c",
            padding: "10px",
            marginBottom: "15px",
            border: "1px solid #f5c2c2",
          }}
        >
          {errorMsg}
        </div>
      )}

      <div style={{ marginBottom: "20px" }}>
        <label>用户名</label>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="请输入用户名"
          maxLength={20}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "8px",
            border: "1px solid #ddd",
            borderRadius: "6px",
            outline: "none",
          }}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px",
          background: loading ? "#999" : "#111",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </div>
  );
}