"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// ✅ 分类统一配置（后面所有页面都可以复用）
const categories = [
  { value: "植物", label: "🌱 植物" },
  { value: "宠物", label: "🐾 宠物" },
  { value: "日常", label: "📓 日常" },
  { value: "技能", label: "🎯 技能" },
  { value: "其他", label: "📦 其他" },
];

export default function NewArchive() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("植物"); // ✅ 默认分类

  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, "");
  }

  async function handleCreate(e: any) {
    e.preventDefault();

    if (!title.trim()) {
      alert("请输入名称");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("未登录");
      return;
    }

    const slug = generateSlug(title);

    const { error } = await supabase.from("archives").insert([
      {
        title: title.trim(),
        category, // ✅ 直接存中文（统一）
        slug,
        user_id: user.id,
      },
    ]);

    if (error) {
      console.log(error);
      alert("创建失败：" + error.message);
      return;
    }

    alert("创建成功");

    // ✅ 跳转更优（比 window.location 更干净）
    window.location.href = "/archive";
  }

  return (
    <main style={{ padding: "40px" }}>
      <h1>创建档案</h1>

      <form onSubmit={handleCreate}>
        {/* 名称 */}
        <p>名称</p>
        <input
          placeholder="例如：阳台迷迭香"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: "8px", width: "250px" }}
        />

        <br /><br />

        {/* 分类 */}
        <p>类别</p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ padding: "8px", width: "200px" }}
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <br /><br />

        {/* 提交 */}
        <button
          type="submit"
          style={{
            padding: "8px 16px",
            background: "#4CAF50",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          创建
        </button>
      </form>
    </main>
  );
}