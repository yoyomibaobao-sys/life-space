"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ✅ 初始化
  useEffect(() => {
    async function init() {
      setInitLoading(true);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setErrorMsg("读取用户信息失败");
      } else {
        setProfile(data);
        setUsername(data?.username || "");
      }

      setInitLoading(false);
    }

    init();
  }, [router]);

  // ✅ 保存用户名
  async function handleSave() {
    if (!user) return;

    if (!username || username.trim().length < 2) {
      setErrorMsg("用户名至少2个字符");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase
      .from("profiles")
      .update({
        username: username.trim(),
      })
      .eq("id", user.id);

    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setProfile({ ...profile, username });
    }
  }

  // ✅ 上传头像
  async function handleUpload(e: any) {
    const file = e.target.files[0];
    if (!file || !user) return;

    setUploading(true);

    const filePath = `${user.id}/${Date.now()}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, file);

    if (error) {
      setErrorMsg("上传失败");
      setUploading(false);
      return;
    }

    const { data } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const url = data.publicUrl;

    await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);

    setProfile({ ...profile, avatar_url: url });

    setUploading(false);
  }

  // ✅ 加载保护
  if (initLoading || !user || !profile) {
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

      {/* ===== 头像 ===== */}
      <div style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 10 }}>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "#eee",
              }}
            />
          )}
        </div>

        <input type="file" onChange={handleUpload} />
        {uploading && <div>上传中...</div>}
      </div>

      {/* ===== 用户信息 ===== */}
      <div style={{ marginTop: 20 }}>
        <div>
          <strong>邮箱：</strong> {user.email}
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>用户名：</strong>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              marginLeft: 10,
              padding: "4px 8px",
            }}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>地区：</strong> {profile.location || "未设置"}
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>等级：</strong> Lv.{profile.level || 1}
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>花朵：</strong> 🌸 {profile.flower_count || 0}
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>浏览：</strong> 👁 {profile.view_count || 0}
        </div>
      </div>

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px",
          marginTop: 20,
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