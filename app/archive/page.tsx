"use client";

import UserBar from "@/components/UserBar";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const categories = [
  { key: "plant", label: "🌱 植物" },
  { key: "pet", label: "🐾 宠物" },
  { key: "daily", label: "📓 日常" },
  { key: "skill", label: "🎯 技能" },
  { key: "other", label: "📦 其他" },
];

export default function ArchivePage() {
  const [archives, setArchives] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("plant");
  const router = useRouter();

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data } = await supabase
      .from("archives")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setArchives(data || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <main style={{ padding: "20px" }}>
      <UserBar />
<div style={{ marginBottom: "20px" }}>
  <a href="/profile">👉 我的信息</a>
</div>
      <h1>我的养成档案</h1>
      

      {/* ✅ 分类卡片 */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          overflowX: "auto",
          marginBottom: "20px",
        }}
      >
        {categories.map((c) => (
          <div
            key={c.key}
            onClick={() => setActiveCategory(c.key)}
            style={{
              padding: "10px 16px",
              borderRadius: "20px",
              background:
                activeCategory === c.key ? "#4CAF50" : "#eee",
              color: activeCategory === c.key ? "#fff" : "#333",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </div>
        ))}
      </div>

      {/* 新建 */}
      <div style={{ marginBottom: "20px" }}>
        <Link href="/archive/new">+ 新建档案</Link>
      </div>

      {/* 列表 */}
      {archives
        .filter((item) => (item.category || "other") === activeCategory)
        .map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "12px",
              padding: "18px",
              marginBottom: "12px",
              background: "#fff",
            }}
          >
            <Link href={`/archive/${item.id}`}>
              <h3 style={{ cursor: "pointer" }}>{item.title}</h3>
            </Link>

            {/* 分类显示 */}
            <p style={{ color: "#888", fontSize: "14px" }}>
              {formatCategory(item.category)}
            </p>

            {/* 操作区 */}
            <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
              {/* ✏️ 修改名称 */}
              <button
                onClick={async () => {
                  const newName = prompt("修改名称", item.title);
                  if (!newName) return;

                  await supabase
                    .from("archives")
                    .update({ title: newName })
                    .eq("id", item.id);

                  loadData();
                }}
              >
                ✏️
              </button>

              {/* 📁 下拉分类 */}
              <select
                value={item.category || "other"}
                onChange={async (e) => {
                  await supabase
                    .from("archives")
                    .update({ category: e.target.value })
                    .eq("id", item.id);

                  loadData();
                }}
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>

              {/* 🗑️ 删除 */}
              <button
                onClick={async () => {
                  if (!confirm("确定删除？")) return;

                  await supabase
                    .from("archives")
                    .delete()
                    .eq("id", item.id);

                  loadData();
                }}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
    </main>
  );
}

function formatCategory(category: string) {
  switch (category) {
    case "plant":
      return "🌱 植物";
    case "pet":
      return "🐾 宠物";
    case "daily":
      return "📓 日常";
    case "skill":
      return "🎯 技能";
    default:
      return "📦 其他";
  }
}