"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getBehaviorTagLabel } from "@/lib/tag-labels";

const PAGE_SIZE = 20;

type FeedItem = {
  record_id: string;
  archive_id: string;
  user_id: string;
  note: string | null;
  record_time: string;
  visibility?: string | null;
  status_tag: string | null;
  primary_image_url: string | null;
  comment_count: number;
  media_count: number;
  archive_title: string;
  archive_category: string | null;
  species_id: string | null;
  species_name_snapshot?: string | null;
  archive_is_public?: boolean | null;
  username: string | null;
  avatar_url: string | null;
  user_location?: string | null;
  profile_is_public?: boolean | null;
  display_tags?: string[];
};

type FilterMode = "all" | "help";

export default function DiscoverPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [hasMore, setHasMore] = useState(true);

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

  async function load(pageIndex = 0, mode: FilterMode = filterMode) {
    if (loadingRef.current) return;
    if (!hasMore && pageIndex !== 0) return;

    loadingRef.current = true;
    setLoading(true);

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("discovery_feed_view")
      .select("*")
      .order("record_time", { ascending: false })
      .range(from, to);

    if (mode === "help") {
      query = query.eq("status_tag", "help");
    }

    const { data, error } = await query;

    if (error) {
      console.error("discover load error:", error);
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    const nextItems = (data || []) as FeedItem[];

const recordIds = nextItems.map((item) => item.record_id);

const tagMap = new Map<string, string[]>();

if (recordIds.length > 0) {
  const { data: tagRows } = await supabase
    .from("record_tags")
    .select("record_id, tag, tag_type, is_active")
    .in("record_id", recordIds)
    .eq("tag_type", "behavior")
    .neq("is_active", false);

  (tagRows || []).forEach((row: any) => {
    const prev = tagMap.get(row.record_id) || [];
    if (!prev.includes(row.tag)) {
      prev.push(row.tag);
    }
    tagMap.set(row.record_id, prev);
  });
}

const enrichedItems = nextItems.map((item) => ({
  ...item,
  display_tags: tagMap.get(item.record_id) || [],
}));

if (pageIndex === 0) {
  setItems(enrichedItems);
} else {
  setItems((prev) => {
    const merged = [...prev, ...enrichedItems];
    const map = new Map<string, FeedItem>();

    merged.forEach((item) => {
      map.set(item.record_id, item);
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.record_time).getTime() - new Date(a.record_time).getTime()
    );
  });
}

    if (nextItems.length < PAGE_SIZE) {
      setHasMore(false);
    } else {
      setHasMore(true);
    }

    setLoading(false);
    loadingRef.current = false;
  }

  function changeFilter(mode: FilterMode) {
    if (mode === filterMode) return;

    setFilterMode(mode);
    setItems([]);
    setPage(0);
    setHasMore(true);
    load(0, mode);
  }

  useEffect(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    load(0, filterMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loadingRef.current &&
          hasMore &&
          items.length > 0
        ) {
          const nextPage = page + 1;
          setPage(nextPage);
          load(nextPage, filterMode);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(loaderRef.current);

    return () => observer.disconnect();
  }, [page, hasMore, items.length, filterMode]);

  return (
    <main style={{ padding: 14 }}>
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  }}
>
  <div style={{ fontSize: 18, fontWeight: 600 }}>
    耕作星球
  </div>

  <a
    href="/discover/search"
    style={{
      fontSize: 13,
      color: "#4CAF50",
      textDecoration: "none",
      border: "1px solid #4CAF50",
      padding: "4px 10px",
      borderRadius: 999,
    }}
  >
    🔍 搜索记录
  </a>
</div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => changeFilter("all")}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: filterMode === "all" ? "#f3f3f3" : "#fff",
            cursor: "pointer",
          }}
        >
          全部
        </button>

        <button
          onClick={() => changeFilter("help")}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: filterMode === "help" ? "#f3f3f3" : "#fff",
            cursor: "pointer",
          }}
        >
          仅求助
        </button>
      </div>

      {items.map((item) => (
        <div
          key={item.record_id}
          style={{
            marginBottom: 12,
            background: "#fff",
            borderRadius: 10,
            border: item.status_tag === "help" ? "1px solid #e6c9c9" : "1px solid #eee",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 10px 0 10px" }}>
            <div
              style={{
                marginBottom: 6,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                onClick={() => goUser(item.user_id)}
                style={{ cursor: "pointer" }}
              >
                {item.username || "用户"}
              </span>

              {item.status_tag === "help" && (
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: 1,
                    padding: "4px 6px",
                    borderRadius: 999,
                    border: "1px solid #e6c9c9",
                    background: "#fff7f7",
                  }}
                >
                  求助
                </span>
              )}
            </div>
          </div>

          <a
            href={`/archive/${item.archive_id}?record=${item.record_id}`}
            style={{
              display: "flex",
              gap: 8,
              padding: 10,
              textDecoration: "none",
              color: "#000",
            }}
          >
            {item.primary_image_url ? (
              <img
                src={item.primary_image_url}
                alt={item.archive_title || "record image"}
                style={{
                  width: 56,
                  height: 56,
                  objectFit: "cover",
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              />
            ) : null}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: 1.4, wordBreak: "break-word" }}>
  {item.archive_title}
  {item.species_name_snapshot ? (
    <span
      style={{
        marginLeft: 6,
        fontSize: 12,
        color: "#4CAF50",
      }}
    >
      · 🌿 {item.species_name_snapshot}
    </span>
  ) : null}
  {item.note ? `：${item.note}` : ""}
</div>

              <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                {new Date(item.record_time).toLocaleDateString()}
                {typeof item.comment_count === "number"
                  ? ` · ${item.comment_count}评论`
                  : ""}
                {typeof item.media_count === "number"
                  ? ` · ${item.media_count}图`
                  : ""}
              </div>
              {Array.isArray(item.display_tags) && item.display_tags.length > 0 && (
  <div
    style={{
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginTop: 6,
    }}
  >
    {item.display_tags.map((tag) => (
      <span
        key={tag}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          if (item.species_id) {
            window.location.href = `/discover/search?tag=${encodeURIComponent(
              tag
            )}&species=${item.species_id}`;
            return;
          }

          window.location.href = `/discover/search?tag=${encodeURIComponent(
            tag
          )}`;
        }}
        style={{
          fontSize: 12,
          padding: "2px 6px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "#fafafa",
          color: "#4CAF50",
          cursor: "pointer",
        }}
      >
        {getBehaviorTagLabel(tag)}
      </span>
    ))}
  </div>
)}
            </div>
          </a>
        </div>
      ))}

      {!loading && items.length === 0 && (
        <div
          style={{
            padding: "24px 12px",
            textAlign: "center",
            color: "#888",
            fontSize: 14,
          }}
        >
          {filterMode === "help" ? "还没有求助记录" : "还没有公开记录"}
        </div>
      )}

      <div ref={loaderRef} style={{ height: 40, textAlign: "center" }}>
        {loading ? "加载中..." : hasMore ? "" : "没有更多了"}
      </div>
    </main>
  );
}