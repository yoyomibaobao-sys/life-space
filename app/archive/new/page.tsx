"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NewArchive() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("plant"); // ✅ 默认值更安全

  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, ""); // ✅ 防止特殊字符
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
        category,
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

        {/* ✅ 类别下拉 */}
        <p>类别</p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ padding: "8px", width: "200px" }}
        >
          <option value="plant">🌱 植物</option>
          <option value="pet">🐾 宠物</option>
          <option value="daily">📓 日常</option>
          <option value="skill">🎯 技能</option>
          <option value="other">📦 其他</option>
        </select>

        <br /><br />

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