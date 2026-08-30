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
import UiIcon from "@/components/ui/UiIcon";
import MobilePageHeader from "@/components/mobile/MobilePageHeader";
import {
  canCreateMembershipMarketPost,
  getCreateMarketPostBlockedText,
  getMarketPostQuotaLabel,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { getCompactCardLocation } from "@/lib/card-location";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { buildLoginHref } from "@/lib/auth-return";

type StatusFilter = "all" | MarketPostStatus;

type MarketPostDisplayRow = MarketPostRow & {
  display_cover_image_url?: string | null;
  display_cover_thumb_url?: string | null;
};

async function attachMarketPostDisplayUrls<T extends MarketPostRow>(rows: T[]) {
  const pairs = await resolveMediaDisplayPairs(
    supabase,
    rows.map((row) => ({
      url: row.cover_image_url,
      path: row.cover_image_path,
      thumb_url: row.cover_thumb_url,
      thumb_path: row.cover_thumb_path,
    }))
  );

  return rows.map((row, index) => ({
    ...row,
    display_cover_image_url: pairs[index]?.display_url || null,
    display_cover_thumb_url: pairs[index]?.display_thumb_url || null,
  }));
}

export default function MyMarketPostsPage() {
  const router = useRouter();
  const { language, t } = useLanguage();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [items, setItems] = useState<MarketPostDisplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push(buildLoginHref("/market/mine"));
        return;
      }

      setUser(user);

      const { data: membershipData, error: membershipError } = await supabase.rpc("get_my_membership");

      if (membershipError) {
        console.error("load membership error:", membershipError);
        setMembership(null);
      } else {
        setMembership(normalizeMembershipRpcResult(membershipData));
      }

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

    setItems(await attachMarketPostDisplayUrls((data || []) as MarketPostRow[]));
  }

  const marketBlocked = Boolean(user && !canCreateMembershipMarketPost(membership));

  return (
    <>
    <MobilePageHeader
      title={t.market.mine_title}
      fallbackHref="/market"
      ariaLabel={t.nav.back}
      right={
        <Link
          href={marketBlocked ? "/membership" : "/market/new"}
          style={{ ...(marketBlocked ? disabledPublishButtonStyle : publishButtonStyle), padding: "8px", fontSize: 13 }}
          title={marketBlocked ? getCreateMarketPostBlockedText(membership, language) : undefined}
        >
          {marketBlocked ? t.market.post_restricted : t.market.post_information}
        </Link>
      }
    />
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header className="mobile-app-desktop-only" style={headerStyle}>
          <div>
            <Link href="/market" className="mobile-app-desktop-only" style={backLinkStyle}>
              <UiIcon name="arrow-left" size={15} /> {t.market.back_to_market}
            </Link>
            <h1 style={titleStyle}>{t.market.mine_title}</h1>
          </div>

          {marketBlocked ? (
            <Link
              href="/membership"
              style={disabledPublishButtonStyle}
              title={getCreateMarketPostBlockedText(membership, language)}
            >
              {t.market.post_restricted}
            </Link>
          ) : (
            <Link href="/market/new" style={publishButtonStyle}>
              {t.market.post_information}
            </Link>
          )}
        </header>

        <section style={quotaPanelStyle(marketBlocked)}>
          <div>
            <div style={quotaTitleStyle}>{t.market.quota_title}</div>
            <div style={quotaTextStyle}>{getMarketPostQuotaLabel(membership, language)}</div>
          </div>

          {marketBlocked ? (
            <Link href="/membership" style={quotaLinkStyle}>
              {t.market.learn_membership}
            </Link>
          ) : null}
        </section>

        <section style={filterPanelStyle}>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            style={filterButtonStyle(statusFilter === "all")}
          >
            {t.market.all}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            style={filterButtonStyle(statusFilter === "active")}
          >
            {t.market.active}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ended")}
            style={filterButtonStyle(statusFilter === "ended")}
          >
            {t.market.ended}
          </button>
        </section>

        {loading ? (
          <section style={emptyStyle}>{t.market.loading}</section>
        ) : items.length === 0 ? (
          <section style={emptyStyle}>
            {statusFilter === "all" ? t.market.empty_mine : t.market.empty_mine_filtered}
          </section>
        ) : (
          <section style={listStyle}>
            {items.map((item) => {
              const location = getCompactCardLocation({ fallback: item.location_text });
              const timeText = formatMarketTime(item.created_at);

              return (
                <article key={item.id} style={cardStyle}>
                  <Link
                    href={`/market/${item.id}`}
                    style={cardOpenLinkStyle}
                    aria-label={`${t.market.view}：${item.title}`}
                  >
                    <span style={cardMediaStyle}>
                      {item.display_cover_thumb_url || item.display_cover_image_url ? (
                        <img
                          src={item.display_cover_thumb_url || item.display_cover_image_url || ""}
                          alt=""
                          style={cardImageStyle}
                          loading="lazy"
                        />
                      ) : (
                        <span style={cardImageFallbackStyle}>{t.market.name}</span>
                      )}
                    </span>

                    <span style={cardContentStyle}>
                      <span style={badgeRowStyle}>
                        <span style={typeBadgeStyle}>
                          {getMarketPostTypeLabel(item.post_type, language)}
                        </span>
                        <span style={categoryBadgeStyle}>
                          {getMarketItemCategoryLabel(item.item_category, language)}
                        </span>
                        {item.status === "ended" ? (
                          <span style={endedBadgeStyle}>{t.market.ended}</span>
                        ) : (
                          <span style={activeBadgeStyle}>{t.market.active}</span>
                        )}
                      </span>

                      <strong style={cardTitleStyle}>{item.title}</strong>

                      <span style={descriptionStyle}>
                        {item.description || ""}
                        {item.description ? <span aria-hidden="true"> · </span> : null}
                        <span style={timeStyle}>{timeText}</span>
                      </span>

                      <span style={metaStyle}>
                        {location || t.market.area_not_provided}
                      </span>
                    </span>
                  </Link>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
    </>
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
  alignItems: "flex-end",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
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
  fontSize: "clamp(23px, 6vw, 28px)",
  lineHeight: 1.15,
  color: "#1f2a1f",
  whiteSpace: "nowrap",
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

function quotaPanelStyle(blocked: boolean): CSSProperties {
  return {
    background: blocked ? "#fff8ea" : "#fff",
    border: blocked ? "1px solid #ead9b8" : "1px solid #e4ece0",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  };
}

const quotaTitleStyle: CSSProperties = {
  color: "#1f2a1f",
  fontWeight: 800,
  fontSize: 14,
  marginBottom: 4,
};

const quotaTextStyle: CSSProperties = {
  color: "#40583a",
  fontSize: 13,
  fontWeight: 700,
};

const quotaLinkStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#40583a",
  borderRadius: 999,
  padding: "7px 12px",
  fontSize: 13,
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
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 8,
  boxShadow: "0 7px 18px rgba(32, 56, 24, 0.035)",
};

const cardOpenLinkStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gridTemplateColumns: "98px minmax(0, 1fr)",
  gap: 10,
  color: "inherit",
  textDecoration: "none",
};

const cardMediaStyle: CSSProperties = {
  width: 98,
  height: 98,
  display: "block",
  overflow: "hidden",
  borderRadius: 13,
};

const cardImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "cover",
  background: "#f0f4ed",
  border: "1px solid #e4ece0",
  boxSizing: "border-box",
};

const cardImageFallbackStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  background: "#edf4e8",
  border: "1px solid #e4ece0",
  color: "#6f7b69",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 14,
  fontWeight: 700,
  boxSizing: "border-box",
};

const cardContentStyle: CSSProperties = {
  minWidth: 0,
  height: 98,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "nowrap",
  minWidth: 0,
};

const typeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  padding: "2px 6px",
  fontSize: 11,
  fontWeight: 700,
};

const categoryBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f5f3e8",
  color: "#7a6b35",
  padding: "2px 6px",
  fontSize: 11,
  fontWeight: 700,
};

const activeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  marginLeft: "auto",
  padding: "2px 6px",
  fontSize: 11,
  fontWeight: 700,
};

const endedBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f2f2f2",
  color: "#777",
  marginLeft: "auto",
  padding: "2px 6px",
  fontSize: 11,
  fontWeight: 700,
};

const cardTitleStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  color: "#1f2a1f",
  fontSize: 17,
  lineHeight: 1.22,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const descriptionStyle: CSSProperties = {
  minHeight: 31,
  display: "-webkit-box",
  overflow: "hidden",
  color: "#5f6a5b",
  fontSize: 12.5,
  lineHeight: 1.28,
  wordBreak: "break-word",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
};

const timeStyle: CSSProperties = {
  color: "#8a9585",
  whiteSpace: "nowrap",
};

const metaStyle: CSSProperties = {
  minWidth: 0,
  marginTop: "auto",
  overflow: "hidden",
  color: "#7b8676",
  fontSize: 12,
  lineHeight: 1.25,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};

const disabledPublishButtonStyle: CSSProperties = {
  ...publishButtonStyle,
  background: "#9aa398",
  cursor: "not-allowed",
};
