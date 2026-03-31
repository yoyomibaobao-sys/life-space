"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function DiscoverPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<any>({});

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

        const archive = archives?.find(
          (a: any) => a.id === item.archive_id
        );

        map[uid].items.push({
          ...item,
          media: itemMedias,
          archiveTitle: archive?.title || "未命名",
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
  }, []);

  return (
    <main style={{ padding: "16px", maxWidth: "520px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "20px" }}>发现</h1>

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
              🙂 {group.username}
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
                        alignItems: "flex-start",
                        padding: "10px",
                        borderRadius: "10px",
                        background: "#fff",
                        border: "1px solid #f5f5f5",
                        transition: "all 0.15s ease",
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.transform = "scale(0.98)";
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      {/* 图片（有才显示） */}
                      {hasImage && (
                        <img
                          src={item.media[0].url}
                          style={{
                            width: "40px",
                            height: "40px",
                            objectFit: "cover",
                            borderRadius: "4px",
                            flexShrink: 0,
                          }}
                        />
                      )}

                      {/* 内容 */}
                      <div style={{ flex: 1 }}>
                        {/* 档案名 + 记录 */}
                        <div
                          style={{
                            fontSize: "15px",
                            lineHeight: "1.5",
                            color: "#222",
                          }}
                        >
                          <span style={{ fontWeight: "500" }}>
                            {item.archiveTitle}
                          </span>

                          {item.note?.trim() && (
                            <span style={{ color: "#666" }}>
                              {" · "}{item.note}
                            </span>
                          )}
                        </div>

                        {/* 时间 */}
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#999",
                            marginTop: "4px",
                          }}
                        >
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