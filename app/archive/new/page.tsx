"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function NewArchive() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("植物");

  const [systemName, setSystemName] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);

  const router = useRouter();

  async function handleCreate(e: any) {
    e.preventDefault();

    if (loading) return;

    if (!title.trim()) {
      alert("请输入名称");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("未登录");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("archives")
      .insert([
        {
          title: title.trim(),
          category,
          system_name: systemName || null,
          source: source || null,
          note: note || null,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    setLoading(false);

    if (error) {
      alert("创建失败：" + error.message);
      return;
    }

    // ✅ 创建后加档案页
    router.push("/archive");
  }

  return (
    <main
      style={{
        padding: "30px 20px",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <h2 style={{ marginBottom: 20 }}>新建项目</h2>

      <form onSubmit={handleCreate}>
        {/* ===== 名称 ===== */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            名称 *
          </div>

          <input
            placeholder="例如：阳台迷迭香"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              padding: "10px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 14,
            }}
          />
        </div>

        {/* ===== 种类 ===== */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            种类 *
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "10px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 14,
              background: "#fff",
            }}
          >
            <option value="植物">🌿 植物</option>
            <option value="设施">🛠 设施</option>
          </select>
        </div>

        {/* ===== 系统名 ===== */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            系统名（选填）
          </div>

          <input
            placeholder="例如：迷迭香"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            style={{
              padding: "8px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 13,
            }}
          />
        </div>

        {/* ===== 来源 ===== */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            来源（选填）
          </div>

          <input
            placeholder="例如：市场购买 / 朋友分享"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{
              padding: "8px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 13,
            }}
          />
        </div>

        {/* ===== 备注 ===== */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            备注（选填）
          </div>

          <textarea
            placeholder="简单记录一下背景..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              padding: "8px",
              width: "100%",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: 13,
              minHeight: 60,
            }}
          />
        </div>

        {/* ===== 提交 ===== */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: loading ? "#999" : "#4CAF50",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {loading ? "创建中..." : "创建"}
        </button>
      </form>
    </main>
  );
}