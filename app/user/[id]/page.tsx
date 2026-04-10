"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const categories = [
  "全部",
  "花",
  "蔬菜",
  "果树",
  "多肉",
  "香草",
  "观叶",
  "其他",
  "技能",
];

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
  const [archives, setArchives] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("全部");

  useEffect(() => {
    async function load() {
      // ✅ 用户信息
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .single();

      setUser(profile);

      // ✅ 该用户的档案
      const { data: archivesData } = await supabase
        .from("archives")
        .select("*")
        .eq("user_id", userId);

      const safeArchives = archivesData || [];
      setArchives(safeArchives);

      // ✅ ⭐关键：用 archive_id 查 records
      const archiveIds = safeArchives.map((a) => a.id);

      let recs: any[] = [];

      if (archiveIds.length > 0) {
        const { data } = await supabase
          .from("records")
          .select("*")
          .in("archive_id", archiveIds)
          .order("record_time", { ascending: false });

        recs = data || [];
      }

      // ✅ 图片
      const ids = recs.map((r) => r.id);

      let mediaMap: any = {};

      if (ids.length > 0) {
        const { data: media } = await supabase
          .from("media")
          .select("*")
          .in("record_id", ids);

        media?.forEach((m) => {
          if (!mediaMap[m.record_id]) mediaMap[m.record_id] = [];
          mediaMap[m.record_id].push(m);
        });
      }

      const final = recs.map((r) => ({
        ...r,
        media: mediaMap[r.id] || [],
      }));

      setRecords(final);
    }

    load();
  }, [userId]);

  // ✅ 每个档案的最新记录
  const latestMap: any = {};

  records.forEach((r: any) => {
    const prev = latestMap[r.archive_id];
    if (
      !prev ||
      new Date(r.record_time) > new Date(prev.record_time)
    ) {
      latestMap[r.archive_id] = r;
    }
  });

  return (
    <main style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
      {/* 顶部 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={{ margin: 0 }}>
          {user?.username || "用户"}的植物
        </h1>

        <Link href="/discover" style={{ fontSize: 14, color: "#666" }}>
          返回发现页 →
        </Link>
      </div>

      {/* 分类 */}
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
              padding: "8px 14px",
              borderRadius: 20,
              background:
                activeCategory === c ? "#4CAF50" : "#eee",
              color: activeCategory === c ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {c}
          </div>
        ))}
      </div>

      {/* 档案列表 */}
      <div>
        {archives
          .filter((a: any) => {
            if (activeCategory === "全部") return true;

            if (!a.category) return activeCategory === "其他";

            return a.category === activeCategory;
          })
          .map((a: any) => {
            const latest = latestMap[a.id];
            const image = latest?.media?.[0]?.url;

            return (
              <Link
                key={a.id}
                href={`/archive/${a.id}`}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  borderBottom: "1px solid #eee",
                  textDecoration: "none",
                  color: "#000",
                  alignItems: "center",
                }}
              >
                {/* 图片 */}
                {image ? (
                  <img
                    src={image}
                    style={{
                      width: 60,
                      height: 60,
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      background: "#eee",
                      borderRadius: 8,
                    }}
                  />
                )}

                {/* 文字 */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {a.title || "未命名"}
                  </div>

                  {latest && (
                    <div style={{ fontSize: 13, color: "#666" }}>
                      {latest.note}
                    </div>
                  )}

                  {latest && (
                    <div style={{ fontSize: 11, color: "#999" }}>
                      {new Date(
                        latest.record_time
                      ).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
      </div>
    </main>
  );
}