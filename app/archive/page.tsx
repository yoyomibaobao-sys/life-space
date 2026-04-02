"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ✅ 分类统一（中文）
const categories = [
  { key: "植物", label: "🌱 植物" },
  { key: "宠物", label: "🐾 宠物" },
  { key: "日常", label: "📓 日常" },
  { key: "技能", label: "🎯 技能" },
  { key: "其他", label: "📦 其他" },
];

export default function ArchivePage() {
  const [archives, setArchives] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("植物"); // ✅ 默认分类
  const router = useRouter();

  async function loadData() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;

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
      <h1>我的养成档案</h1>

      {/* 分类 */}
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
        .filter((item) => (item.category || "其他") === activeCategory)
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

            <p style={{ color: "#888", fontSize: "14px" }}>
              {item.category || "📦 其他"}
            </p>

            <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
              {/* 改名称 */}
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

              {/* 改分类 */}
              <select
                value={item.category || "其他"}
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

              {/* 删除 */}
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