"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  clearRecentArchiveBrowseItems,
  getRecentArchiveBrowseItems,
  type RecentArchiveBrowseItem,
} from "@/lib/recent-browse";
import { getArchiveCategoryLabel } from "@/lib/archive-categories";
import type { SupabaseUser } from "@/lib/domain-types";

type RecentArchiveRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  category: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  is_public: boolean | null;
  record_count: number | null;
  view_count: number | null;
  cover_image_url: string | null;
};

export default function RecentBrowsePage() {
  const router = useRouter();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [items, setItems] = useState<RecentArchiveRow[]>([]);
  const [localItems, setLocalItems] = useState<RecentArchiveBrowseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const recentItems = getRecentArchiveBrowseItems();
      setLocalItems(recentItems);

      const ids = recentItems.map((item) => item.id);

      if (ids.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("archives")
        .select(
          "id, user_id, title, category, system_name, species_name_snapshot, is_public, record_count, view_count, cover_image_url"
        )
        .in("id", ids);

      if (error) {
        console.error("load recent browse archives error:", error);
        setItems([]);
        setLoading(false);
        return;
      }

      const rows = (data || []) as RecentArchiveRow[];
      const rowMap = new Map(rows.map((row) => [row.id, row]));

      const sortedRows = ids
        .map((id) => rowMap.get(id))
        .filter(Boolean) as RecentArchiveRow[];

      setItems(sortedRows);
      setLoading(false);
    }

    void init();
  }, [router]);

  const fallbackMap = useMemo(() => {
    return new Map(localItems.map((item) => [item.id, item]));
  }, [localItems]);

  function handleClear() {
    clearRecentArchiveBrowseItems();
    setItems([]);
    setLocalItems([]);
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={topBarStyle}>
          <div>
            <Link href="/profile" style={backLinkStyle}>
              ← 返回个人资料
            </Link>
            <h1 style={titleStyle}>最近浏览</h1>
            <div style={subtitleStyle}>最近访问过的项目记录页</div>
          </div>

          {items.length > 0 && (
            <button type="button" onClick={handleClear} style={clearButtonStyle}>
              清空
            </button>
          )}
        </div>

        {loading ? (
          <section style={emptyStyle}>加载中...</section>
        ) : items.length === 0 ? (
          <section style={emptyStyle}>还没有最近浏览的项目</section>
        ) : (
          <section style={listStyle}>
            {items.map((item) => {
              const fallback = fallbackMap.get(item.id);
              const title = item.title || fallback?.title || "未命名项目";
              const systemName =
                item.system_name ||
                item.species_name_snapshot ||
                fallback?.systemName ||
                "";

              return (
                <Link
                  key={item.id}
                  href={`/archive/${item.id}`}
                  style={cardStyle}
                >
                  {item.cover_image_url ? (
                    <img
                      src={item.cover_image_url}
                      alt={title}
                      style={coverStyle}
                    />
                  ) : (
                    <div style={coverPlaceholderStyle}>
                      {getArchiveCategoryLabel(item.category)}
                    </div>
                  )}

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={firstLineStyle}>
                      <span style={categoryStyle}>
                        {getArchiveCategoryLabel(item.category)}
                      </span>
                      <span style={titleTextStyle}>{title}</span>
                    </div>

                    {systemName && (
                      <div style={systemNameStyle}>{systemName}</div>
                    )}

                    <div style={metaStyle}>
                      记录 {Number(item.record_count || 0)} 条 · 浏览{" "}
                      {Number(item.view_count || 0)} 次
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "18px 12px 36px",
};

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 880,
  margin: "0 auto",
};

const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const backLinkStyle: CSSProperties = {
  display: "inline-block",
  color: "#587050",
  textDecoration: "none",
  fontSize: 14,
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  color: "#1f2a1f",
};

const subtitleStyle: CSSProperties = {
  marginTop: 6,
  color: "#6f7b69",
  fontSize: 14,
};

const clearButtonStyle: CSSProperties = {
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#607356",
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const cardStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
  textDecoration: "none",
  color: "inherit",
};

const coverStyle: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 14,
  objectFit: "cover",
  flex: "0 0 auto",
  background: "#edf2e8",
};

const coverPlaceholderStyle: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 14,
  flex: "0 0 auto",
  background: "#edf2e8",
  color: "#6b7b66",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
};

const firstLineStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  minWidth: 0,
};

const categoryStyle: CSSProperties = {
  color: "#607356",
  fontSize: 13,
  fontWeight: 700,
  flex: "0 0 auto",
};

const titleTextStyle: CSSProperties = {
  color: "#1f2a1f",
  fontSize: 16,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const systemNameStyle: CSSProperties = {
  marginTop: 4,
  color: "#5f6a5b",
  fontSize: 14,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaStyle: CSSProperties = {
  marginTop: 5,
  color: "#8a9585",
  fontSize: 13,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};