"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// ✅ 分类统一
const categories = ["全部", "植物", "宠物", "日常", "技能", "其他"];

export default function DiscoverPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<any>({});
  const [activeCategory, setActiveCategory] = useState("全部"); // ⭐ 新增

  useEffect(() => {
    async function load() {
      const { data: records } = await supabase
        .from("records")
        .select("*")
        .order("created_at", { ascending: false });

      if (!records) return;

      const { data: medias } = await supabase
        .from("media")
        .select("*");

      const { data: archives } = await supabase
        .from("archives")
        .select("*");

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*");

      const map: any = {};

      records.forEach((item: any) => {
        const archive = archives?.find(
          (a: any) => a.id === item.archive_id
        );

        // ⭐ 分类过滤（核心）
        if (
          activeCategory !== "全部" &&
          archive?.category !== activeCategory
        ) {
          return;
        }

        const uid = item.user_id;

        if (!map[uid]) {
          const profile = profiles?.find((p: any) => p.id === uid);

          map[uid] = {
            user_id: uid,
            username: profile?.username || "用户",
            items: [],
          };
        }

        const itemMedias = medias?.filter(
          (m: any) => m.record_id === item.id
        );

        map[uid].items.push({
          ...item,
          media: itemMedias,
          archiveTitle: archive?.title || "未命名",
          category: archive?.category, // ⭐ 带上分类
        });
      });

      const result = Object.values(map).map((group: any) => ({
        ...group,
        items: group.items.slice(0, 5),
        latest: group.items[0]?.created_at,
      }));

      result.sort(
        (a: any, b: any) =>
          new Date(b.latest).getTime() -
          new Date(a.latest).getTime()
      );

      setGroups(result);
    }

    load();
  }, [activeCategory]); // ⭐ 分类变化重新加载

  return (
    <main style={{ padding: "16px", maxWidth: "520px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "16px" }}>发现</h1>

      {/* ⭐ 分类条 */}
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          marginBottom: "20px",
        }}
      >
        {categories.map((c) => (
          <div
            key={c}
            onClick={() => setActiveCategory(c)}
            style={{
              padding: "6px 12px",
              borderRadius: 16,
              background: activeCategory === c ? "#4CAF50" : "#eee",
              color: activeCategory === c ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            {c}
          </div>
        ))}
      </div>

      {groups.map((group: any) => {
        const isOpen = expanded[group.user_id];
        const visibleItems = isOpen
          ? group.items
          : group.items.slice(0, 3);

        return (
          <div
            key={group.user_id}
            style={{
              marginBottom: "28px",
              paddingBottom: "18px",
            }}
          >
            {/* 用户名 */}
            <div
              style={{
                marginBottom: "12px",
                fontWeight: "600",
                fontSize: "16px",
              }}
            >
              <Link href={`/user/${group.user_id}`}>
                🙂 {group.username}
              </Link>
            </div>

            {/* 列表 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {visibleItems.map((item: any) => {
                const hasImage = item.media?.[0]?.url;

                return (
                  <Link
                    key={item.id}
                    href={`/archive/${item.archive_id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        padding: "10px",
                        borderRadius: "10px",
                        background: "#fff",
                        border: "1px solid #f5f5f5",
                      }}
                    >
                      {hasImage && (
                        <img
                          src={item.media[0].url}
                          style={{
                            width: "40px",
                            height: "40px",
                            objectFit: "cover",
                            borderRadius: "4px",
                          }}
                        />
                      )}

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "15px" }}>
                          <span style={{ fontWeight: "500" }}>
                            {item.archiveTitle}
                          </span>
                        </div>

                        {/* ⭐ 分类显示 */}
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {item.category}
                        </div>

                        <div style={{ fontSize: "12px", color: "#999" }}>
                          {new Date(item.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* 展开 */}
            {group.items.length > 3 && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "#888",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setExpanded((prev: any) => ({
                    ...prev,
                    [group.user_id]: !prev[group.user_id],
                  }))
                }
              >
                {isOpen ? "收起" : "展开更多"}
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}