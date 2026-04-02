"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import EditRecord from "@/components/EditRecord";
import DeleteRecordButton from "@/app/archive/[id]/DeleteRecordButton";

const categories = ["全部", "植物", "宠物", "日常", "技能", "其他"];

export default function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content userId={id} />;
}

function Content({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [archiveMap, setArchiveMap] = useState<any>({});
  const [me, setMe] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("全部");

  // 当前用户
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setMe(data.session?.user?.id || null);
    });
  }, []);

  const isOwner = me === userId;

  // 数据加载
  useEffect(() => {
    async function load() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      setUser(profile);

      const { data: archives } = await supabase
        .from("archives")
        .select("*");

      const map = Object.fromEntries(
        (archives || []).map((a: any) => [a.id, a])
      );
      setArchiveMap(map);

      const { data: recs } = await supabase
        .from("records")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!recs) return;

      // media
      const ids = recs.map((r) => r.id);
      const { data: media } = await supabase
        .from("media")
        .select("*")
        .in("record_id", ids);

      const mediaMap: any = {};
      media?.forEach((m) => {
        if (!mediaMap[m.record_id]) mediaMap[m.record_id] = [];
        mediaMap[m.record_id].push(m);
      });

      const final = recs.map((r) => ({
        ...r,
        media: mediaMap[r.id] || [],
      }));

      setRecords(final);
    }

    load();
  }, [userId]);

  // ⭐ 分类筛选
  const filtered = records.filter((item) => {
    if (activeCategory === "全部") return true;
    const archive = archiveMap[item.archive_id];
    return archive?.category === activeCategory;
  });

  return (
    <main style={{ padding: 16, maxWidth: 520, margin: "0 auto" }}>
      <Link href="/discover">← 返回</Link>

      {/* 用户信息 */}
      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 18 }}>
          🙂 {user?.username || "用户"}
        </div>
      </div>

      {/* ⭐ 分类标签（你要的效果） */}
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          marginBottom: 20,
        }}
      >
        {categories.map((c) => (
          <div
            key={c}
            onClick={() => setActiveCategory(c)}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              background: activeCategory === c ? "#4CAF50" : "#f5f5f5",
              color: activeCategory === c ? "#fff" : "#555",
              cursor: "pointer",
              fontSize: 14,
              whiteSpace: "nowrap",
              transition: "all 0.2s ease",
            }}
          >
            {c}
          </div>
        ))}
      </div>

      {/* 内容流（统一成发现页风格） */}
      <div>
        {filtered.map((item: any) => {
          const archive = archiveMap[item.archive_id];
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
                  gap: 10,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #f5f5f5",
                  marginBottom: 12,
                }}
              >
                {/* 图片 */}
                {hasImage && (
                  <img
                    src={item.media[0].url}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 6,
                      objectFit: "cover",
                    }}
                  />
                )}

                {/* 内容 */}
                <div style={{ flex: 1 }}>
                  {/* 档案名 */}
                  <div style={{ fontWeight: 500 }}>
                    {archive?.title}
                  </div>

                  {/* 分类 */}
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {formatCategory(archive?.category)}
                  </div>

                  {/* 文本 */}
                  <EditRecord
                    id={item.id}
                    initialText={item.note}
                    readOnly={!isOwner}
                  />

                  {/* 时间 */}
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {new Date(item.created_at).toLocaleString()}
                  </div>

                  {/* 删除 */}
                  {isOwner && (
                    <DeleteRecordButton id={item.id} />
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

// 分类格式
function formatCategory(category: string) {
  switch (category) {
    case "植物":
      return "🌱 植物";
    case "宠物":
      return "🐾 宠物";
    case "日常":
      return "📓 日常";
    case "技能":
      return "🎯 技能";
    default:
      return "📦 其他";
  }
}