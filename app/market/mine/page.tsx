"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  formatMarketTime,
  getMarketItemCategoryLabel,
  getMarketPostTypeLabel,
  type MarketPostRow,
  type MarketPostStatus,
} from "@/lib/market-types";
import type { SupabaseUser } from "@/lib/domain-types";

type StatusFilter = "all" | MarketPostStatus;

export default function MyMarketPostsPage() {
  const router = useRouter();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [items, setItems] = useState<MarketPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push("/login");
        return;
      }

      setUser(user);
      await loadItems(user.id);
      setLoading(false);
    }

    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, statusFilter]);

  async function loadItems(userId: string) {
    let query = supabase
      .from("market_posts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("load my market posts error:", error);
      setItems([]);
      return;
    }

    setItems((data || []) as MarketPostRow[]);
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <Link href="/market" style={backLinkStyle}>
              ← 返回集市
            </Link>
            <h1 style={titleStyle}>我的集市发布</h1>
            <p style={subtitleStyle}>
              管理你发布过的交换、赠送、转让和求购信息。
            </p>
          </div>

          <Link href="/market/new" style={publishButtonStyle}>
            发布信息
          </Link>
        </header>

        <section style={filterPanelStyle}>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            style={filterButtonStyle(statusFilter === "all")}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            style={filterButtonStyle(statusFilter === "active")}
          >
            进行中
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ended")}
            style={filterButtonStyle(statusFilter === "ended")}
          >
            已结束
          </button>
        </section>

        {loading ? (
          <section style={emptyStyle}>加载中...</section>
        ) : items.length === 0 ? (
          <section style={emptyStyle}>
            {statusFilter === "all"
              ? "你还没有发布过集市信息。"
              : "当前筛选下没有集市信息。"}
          </section>
        ) : (
          <section style={listStyle}>
            {items.map((item) => (
              <article key={item.id} style={cardStyle}>
                {item.cover_image_url ? (
                  <img src={item.cover_image_url} alt="" style={cardImageStyle} />
                ) : (
                  <div style={cardImageFallbackStyle}>集市</div>
                )}

                <div style={cardContentStyle}>
                  <div style={cardTopStyle}>
                    <div style={badgeRowStyle}>
                      <span style={typeBadgeStyle}>
                        {getMarketPostTypeLabel(item.post_type)}
                      </span>
                      <span style={categoryBadgeStyle}>
                        {getMarketItemCategoryLabel(item.item_category)}
                      </span>
                      {item.status === "ended" ? (
                        <span style={endedBadgeStyle}>已结束</span>
                      ) : (
                        <span style={activeBadgeStyle}>进行中</span>
                      )}
                    </div>

                    <span style={timeStyle}>{formatMarketTime(item.created_at)}</span>
                  </div>

                  <h2 style={cardTitleStyle}>{item.title}</h2>

                  {item.description ? (
                    <p style={descriptionStyle}>{item.description}</p>
                  ) : null}

                  <div style={metaStyle}>
                    {item.location_text ? item.location_text : "未填写地区"}
                    {Number(item.view_count || 0) > 0
                      ? ` · 浏览 ${Number(item.view_count || 0)}`
                      : ""}
                  </div>

                  <div style={actionRowStyle}>
                    <Link href={`/market/${item.id}`} style={secondaryLinkStyle}>
                      查看
                    </Link>
                    <Link href={`/market/${item.id}/edit`} style={secondaryLinkStyle}>
                      编辑
                    </Link>
                  </div>
                </div>
              </article>
            ))}
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
  maxWidth: 960,
  margin: "0 auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
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
  fontSize: 28,
  color: "#1f2a1f",
};

const subtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#6f7b69",
  fontSize: 14,
  lineHeight: 1.6,
};

const publishButtonStyle: CSSProperties = {
  textDecoration: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "9px 15px",
  fontSize: 14,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const filterPanelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

function filterButtonStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid #4f7b45" : "1px solid #dfe8da",
    background: active ? "#4f7b45" : "#fff",
    color: active ? "#fff" : "#4f5d49",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
  };
}

const listStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const cardStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
};

const cardImageStyle: CSSProperties = {
  width: 96,
  height: 96,
  objectFit: "cover",
  borderRadius: 13,
  background: "#f0f4ed",
  border: "1px solid #e4ece0",
  flexShrink: 0,
};

const cardImageFallbackStyle: CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: 13,
  background: "#edf4e8",
  border: "1px solid #e4ece0",
  color: "#6f7b69",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  flexShrink: 0,
};

const cardContentStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
};

const cardTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginBottom: 8,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const typeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const categoryBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f5f3e8",
  color: "#7a6b35",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const activeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const endedBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f2f2f2",
  color: "#777",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const timeStyle: CSSProperties = {
  color: "#8a9585",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 17,
};

const descriptionStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#5f6a5b",
  fontSize: 14,
  lineHeight: 1.6,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const metaStyle: CSSProperties = {
  marginTop: 9,
  color: "#7b8676",
  fontSize: 13,
  lineHeight: 1.5,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};

const secondaryLinkStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#40583a",
  borderRadius: 999,
  padding: "6px 11px",
  fontSize: 13,
  fontWeight: 700,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};