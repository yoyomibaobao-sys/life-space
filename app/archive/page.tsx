"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ✅ 新分类
const categories = [
  { key: "花", label: "🌸 花" },
  { key: "蔬菜", label: "🥬 蔬菜" },
  { key: "果树", label: "🍊 果树" },
  { key: "多肉", label: "🌵 多肉" },
  { key: "香草", label: "🌿 香草" },
  { key: "观叶", label: "🪴 观叶" },
  { key: "其他", label: "📦 其他" },
  { key: "技能", label: "🎯 技能" },
];

export default function ArchivePage() {
  const [archives, setArchives] = useState<any[]>([]);
  const [groupTags, setGroupTags] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("花");
  const [activeTag, setActiveTag] = useState<string | null>(null);

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

    // 档案
    const { data } = await supabase
      .from("archives")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setArchives(data || []);

    // ⭐ 标签
    const { data: tags } = await supabase
      .from("group_tags")
      .select("*")
      .eq("user_id", user.id)
      .eq("category", activeCategory);

    setGroupTags(tags || []);

    // ⭐ 记录（关键）
    const { data: recs } = await supabase
      .from("records")
      .select("*")
      .eq("user_id", user.id)
      .order("record_time", { ascending: false });

    setRecords(recs || []);
  }

  useEffect(() => {
    loadData();
  }, [activeCategory]);

  // ⭐ 统计
  const statsMap: any = {};

  records.forEach((r: any) => {
    if (!statsMap[r.archive_id]) {
      statsMap[r.archive_id] = {
        count: 0,
        latest: r,
      };
    }

    statsMap[r.archive_id].count++;

    if (
      new Date(r.record_time) >
      new Date(statsMap[r.archive_id].latest.record_time)
    ) {
      statsMap[r.archive_id].latest = r;
    }
  });

  return (
    <main style={{ padding: "20px" }}>
      <h1>我的植物</h1>

      {/* 分类 */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          overflowX: "auto",
          marginBottom: "12px",
        }}
      >
        {categories.map((c) => (
          <div
            key={c.key}
            onClick={() => {
              setActiveCategory(c.key);
              setActiveTag(null);
            }}
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

      {/* 分组标签 */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          marginBottom: 16,
        }}
      >
        <div
          onClick={() => setActiveTag(null)}
          style={{
            padding: "6px 12px",
            borderRadius: 16,
            background: activeTag === null ? "#333" : "#eee",
            color: activeTag === null ? "#fff" : "#333",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          全部
        </div>

        {groupTags.map((tag) => (
          <div
            key={tag.id}
            onClick={() => setActiveTag(tag.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
              background:
                activeTag === tag.id ? "#333" : "#eee",
              color:
                activeTag === tag.id ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {tag.name}
          </div>
        ))}

        {/* 新建标签 */}
        <div
          onClick={async () => {
            const name = prompt("标签名称");
            if (!name) return;

            const {
              data: { session },
            } = await supabase.auth.getSession();

            const user = session?.user;
            if (!user) return;

            const { data } = await supabase
              .from("group_tags")
              .insert([
                {
                  user_id: user.id,
                  name,
                  category: activeCategory,
                },
              ])
              .select()
              .single();

            if (data) {
              setGroupTags((prev) => [...prev, data]);
            }
          }}
          style={{
            padding: "6px 12px",
            borderRadius: 16,
            background: "#ddd",
            cursor: "pointer",
          }}
        >
          ＋
        </div>
      </div>

      {/* 新建 */}
      <div style={{ marginBottom: "20px" }}>
        <Link href="/archive/new">+ 新建档案</Link>
      </div>

      {/* 列表 */}
      {archives
        .filter((item) => {
          const tagOk =
            !activeTag || item.group_tag_id === activeTag;
          return tagOk;
        })
        .map((item) => {
          const stat = statsMap[item.id];
          const latest = stat?.latest;

          return (
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
                <h3 style={{ cursor: "pointer" }}>
                  {item.title}
                </h3>
              </Link>

              {/* 分类 */}
              <p style={{ color: "#888", fontSize: "14px" }}>
                {item.category || "其他"}
              </p>

              {/* ⭐ 新增信息 */}
              {stat && (
                <>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    共{stat.count}条记录
                  </div>

                  <div style={{ fontSize: 13, color: "#666" }}>
                    {new Date(
                      latest.record_time
                    ).toLocaleDateString()}{" "}
                    {latest.note}
                  </div>
                </>
              )}

              {/* 操作区 */}
              <div
                style={{
                  marginTop: "10px",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                {/* 改名称 */}
                <button
                  onClick={async () => {
                    const newName = prompt(
                      "修改名称",
                      item.title
                    );
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

                {/* 分类 */}
                <select
                  value={item.category || ""}
                  onChange={async (e) => {
                    await supabase
                      .from("archives")
                      .update({
                        category: e.target.value,
                      })
                      .eq("id", item.id);

                    loadData();
                  }}
                >
                  <option value="">未分类</option>
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {/* 分组标签 */}
                <select
                  value={item.group_tag_id || ""}
                  onChange={async (e) => {
                    await supabase
                      .from("archives")
                      .update({
                        group_tag_id:
                          e.target.value || null,
                      })
                      .eq("id", item.id);

                    loadData();
                  }}
                >
                  <option value="">分组</option>

                  {groupTags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
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
          );
        })}
    </main>
  );
}