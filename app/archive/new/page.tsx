"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const categories = [
  { value: "植物", label: "🌱 植物" },
  { value: "宠物", label: "🐾 宠物" },
  { value: "日常", label: "📓 日常" },
  { value: "技能", label: "🎯 技能" },
  { value: "其他", label: "📦 其他" },
];

export default function NewArchive() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("植物");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u4e00-\u9fa5\-]+/g, ""); // ✅ 支持中文
  }

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

    const slug = generateSlug(title);

    const { error } = await supabase.from("archives").insert([
      {
        title: title.trim(),
        category,
        slug,
        user_id: user.id,
      },
    ]);

    setLoading(false);

    if (error) {
      alert("创建失败：" + error.message);
      return;
    }

    // ✅ 更顺滑跳转（不会整页刷新）
    router.push("/archive");
    router.refresh();
  }

  return (
    <main
      style={{
        padding: "30px 20px",
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <h2 style={{ marginBottom: 20 }}>创建档案</h2>

      <form onSubmit={handleCreate}>
        {/* 名称 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>名称</div>

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

        {/* 分类 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>类别</div>

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
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* 提交 */}
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