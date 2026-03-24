"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function DiscoverPage() {
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("records")
        .select("*, media(*), archives(*)")
        .eq("visibility", "community")
        .order("photo_time", { ascending: false });

      if (!data) return;

      // ✅ 按 user 分组
      const map: any = {};

      data.forEach((item) => {
        const uid = item.user_id;

        if (!map[uid]) {
          map[uid] = [];
        }

        map[uid].push(item);
      });

      // ✅ 转成数组 + 每人取前5条
      const result = Object.keys(map).map((uid) => ({
        user_id: uid,
        items: map[uid].slice(0, 5),
        latest: map[uid][0].photo_time || map[uid][0].created_at,
      }));

      // ✅ 按最新时间排序（用户排序）
      result.sort(
        (a, b) =>
          new Date(b.latest).getTime() -
          new Date(a.latest).getTime()
      );

      setGroups(result);
    }

    load();
  }, []);

  return (
    <main style={{ padding: "20px" }}>
      <h1>发现</h1>

      {groups.map((group) => (
        <div
          key={group.user_id}
          style={{
            marginBottom: "30px",
            borderBottom: "1px solid #eee",
            paddingBottom: "20px",
          }}
        >
          {/* 用户块 */}
          <div style={{ marginBottom: "10px", color: "#666" }}>
            用户：{group.user_id.slice(0, 6)}
          </div>

          {/* 最近3~5条记录 */}
          <div style={{ display: "flex", gap: "10px" }}>
            {group.items.map((item: any) => (
              <Link
                key={item.id}
                href={`/archive/${item.archive_id}`}
              >
                <div
                  style={{
                    width: "120px",
                    cursor: "pointer",
                  }}
                >
                  {/* 图片优先 */}
                  {item.media?.[0]?.url ? (
                    <img
                      src={item.media[0].url}
                      style={{
                        width: "120px",
                        height: "120px",
                        objectFit: "cover",
                        borderRadius: "6px",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "120px",
                        height: "120px",
                        background: "#f5f5f5",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        color: "#999",
                      }}
                    >
                      无图片
                    </div>
                  )}

                  {/* 简短文字 */}
                  <p
                    style={{
                      fontSize: "12px",
                      marginTop: "5px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.note}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}