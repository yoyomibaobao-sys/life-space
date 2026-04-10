"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 20;

export default function DiscoverPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<any>({});

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  async function goUser(userId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id === userId) {
      window.location.href = "/archive";
    } else {
      window.location.href = `/user/${userId}`;
    }
  }

  async function load(pageIndex = 0) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: records } = await supabase
      .from("records")
      .select("*")
      .order("record_time", { ascending: false })
      .range(from, to);

    const { data: medias } = await supabase.from("media").select("*");
    const { data: archives } = await supabase.from("archives").select("*");
    const { data: profiles } = await supabase.from("profiles").select("*");

    // ⭐核心修复：全部转成 map（避免错配）
    const archiveMap: any = {};
    archives?.forEach((a) => {
      archiveMap[a.id] = a;
    });

    const profileMap: any = {};
    profiles?.forEach((p) => {
      profileMap[p.id] = p;
    });

    const mediaMap: any = {};
    medias?.forEach((m) => {
      if (!mediaMap[m.record_id]) mediaMap[m.record_id] = [];
      mediaMap[m.record_id].push(m);
    });

    const getTime = (r: any) =>
      new Date(r.record_time || r.created_at).getTime();

    const userMap: any = {};

    records?.forEach((r: any) => {
      const archive = archiveMap[r.archive_id];
      if (!archive) return;

      const uid = archive.user_id;

      if (!userMap[uid]) {
        userMap[uid] = {
          user_id: uid,
          username: profileMap[uid]?.username || "用户",
          archivesMap: {},
          countMap: {},
        };
      }

      const group = userMap[uid];

      // ⭐统计记录数
      if (!group.countMap[r.archive_id]) {
        group.countMap[r.archive_id] = 0;
      }
      group.countMap[r.archive_id]++;

      const current = group.archivesMap[r.archive_id];

      // ⭐每个档案只保留最新记录
      if (!current || getTime(r) > getTime(current)) {
        group.archivesMap[r.archive_id] = r;
      }
    });

    const newGroups = Object.values(userMap).map((g: any) => {
      let items = Object.values(g.archivesMap);

      items.sort((a: any, b: any) => getTime(b) - getTime(a));

      items = items.slice(0, 4);

      items = items.map((item: any) => {
        const archive = archiveMap[item.archive_id];

        return {
          ...item,
          media: mediaMap[item.id] || [],
          archiveTitle: archive?.title,
          count: g.countMap[item.archive_id],
        };
      });

      return {
        ...g,
        items,
        latestTime: getTime(items[0]),
      };
    });

    setGroups((prev) => {
      const map: any = {};

      [...prev, ...newGroups].forEach((g: any) => {
        if (!map[g.user_id]) {
          map[g.user_id] = g;
        } else {
          const merged = [...map[g.user_id].items, ...g.items];

          const unique: any = {};
          merged.forEach((item) => {
            if (
              !unique[item.archive_id] ||
              getTime(item) >
                getTime(unique[item.archive_id])
            ) {
              unique[item.archive_id] = item;
            }
          });

          map[g.user_id].items = Object.values(unique);
        }
      });

      const arr = Object.values(map);
      arr.sort((a: any, b: any) => b.latestTime - a.latestTime);

      return arr;
    });

    setLoading(false);
    loadingRef.current = false;
  }

  useEffect(() => {
    setGroups([]);
    setPage(0);
    load(0);
  }, []);

  useEffect(() => {
    if (!loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) {
          const nextPage = page + 1;
          setPage(nextPage);
          load(nextPage);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(loaderRef.current);

    return () => observer.disconnect();
  }, [page]);

  return (
    <main style={{ padding: 14 }}>
      {groups.map((group: any) => {
        const isOpen = expanded[group.user_id];

        const displayItems = isOpen
          ? group.items
          : group.items.slice(0, 2);

        return (
          <div key={group.user_id} style={{ marginBottom: 18 }}>
            {/* 用户名 */}
            <div style={{ marginBottom: 6, fontWeight: 600 }}>
              <span
                onClick={() => goUser(group.user_id)}
                style={{ cursor: "pointer" }}
              >
                {group.username}
              </span>
            </div>

            {/* 卡片 */}
            {displayItems.map((item: any) => (
              <a
                key={item.id}
                href={`/archive/${item.archive_id}?record=${item.id}`}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: 10,
                  marginBottom: 8,
                  background: "#fff",
                  borderRadius: 10,
                  border: "1px solid #eee",
                  textDecoration: "none",
                  color: "#000",
                }}
              >
                {/* 图片 */}
                {item.media?.[0]?.url ? (
                  <img
                    src={item.media[0].url}
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: "cover",
                      borderRadius: 6,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      background: "#eee",
                      borderRadius: 6,
                    }}
                  />
                )}

                {/* 文本 */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15 }}>
                    {item.archiveTitle}：{item.note}
                  </div>

                  <div style={{ fontSize: 11, color: "#999" }}>
                    {new Date(item.record_time).toLocaleDateString()} · 共
                    {item.count}条记录
                  </div>
                </div>
              </a>
            ))}

            {/* 展开 */}
            {group.items.length > 2 && (
              <div
                onClick={() =>
                  setExpanded({
                    ...expanded,
                    [group.user_id]: !isOpen,
                  })
                }
                style={{
                  fontSize: 12,
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                {isOpen ? "收起" : "展开"}
              </div>
            )}
          </div>
        );
      })}

      <div ref={loaderRef} style={{ height: 40, textAlign: "center" }}>
        {loading ? "加载中..." : ""}
      </div>
    </main>
  );
}