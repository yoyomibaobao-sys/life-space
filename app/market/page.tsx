"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import {
  MARKET_ITEM_CATEGORY_OPTIONS,
  MARKET_POST_TYPE_OPTIONS,
  formatMarketTime,
  getMarketItemCategoryLabel,
  getMarketPostTypeLabel,
  type MarketItemCategory,
  type MarketPostRow,
  type MarketPostType,
} from "@/lib/market-types";

type ProfileBrief = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
  location: string | null;
};

type ArchiveBrief = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

export default function MarketPage() {
  const [items, setItems] = useState<MarketPostRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileBrief>>(new Map());
  const [archives, setArchives] = useState<Map<string, ArchiveBrief>>(new Map());
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<"all" | MarketPostType>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<"all" | MarketItemCategory>("all");
  const [locationFilter, setLocationFilter] = useState("");

  useEffect(() => {
    async function loadMarketPosts() {
      setLoading(true);

      try {
        let query = supabase
          .from("market_posts")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(80);

        if (typeFilter !== "all") {
          query = query.eq("post_type", typeFilter);
        }

        if (categoryFilter !== "all") {
          query = query.eq("item_category", categoryFilter);
        }

        const { data, error } = await query;

        if (error) {
          console.error("load market posts error:", error);
          setItems([]);
          setProfiles(new Map());
          setArchives(new Map());
          return;
        }

        const rows = (data || []) as MarketPostRow[];
        setItems(rows);

        const userIds = Array.from(new Set(rows.map((item) => item.user_id)));
        const archiveIds = Array.from(
          new Set(rows.map((item) => item.archive_id).filter(Boolean))
        ) as string[];

        const [profilesResult, archivesResult] = await Promise.all([
          userIds.length
            ? supabase
                .from("profiles")
                .select(
                  "id, username, avatar_url, country_name, region_name, city_name, location"
                )
                .in("id", userIds)
            : Promise.resolve({ data: [], error: null }),

          archiveIds.length
            ? supabase
                .from("archives")
                .select("id, title, system_name, species_name_snapshot")
                .in("id", archiveIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (profilesResult.error) {
          console.error("load market profiles error:", profilesResult.error);
        }

        if (archivesResult.error) {
          console.error("load market archives error:", archivesResult.error);
        }

        const profileMap = new Map(
          ((profilesResult.data || []) as ProfileBrief[]).map((profile) => [
            profile.id,
            profile,
          ])
        );

        const archiveMap = new Map(
          ((archivesResult.data || []) as ArchiveBrief[]).map((archive) => [
            archive.id,
            archive,
          ])
        );

        setProfiles(profileMap);
        setArchives(archiveMap);
      } catch (err) {
        console.error("market page unexpected error:", err);
        setItems([]);
        setProfiles(new Map());
        setArchives(new Map());
      } finally {
        setLoading(false);
      }
    }

    void loadMarketPosts();
  }, [typeFilter, categoryFilter]);

  const hasFilter =
    typeFilter !== "all" ||
    categoryFilter !== "all" ||
    locationFilter.trim() !== "";

  const locationOptions = useMemo(() => {
    const optionSet = new Set<string>();

    function addOption(value?: string | null) {
      const text = String(value || "").trim();
      if (!text) return;

      optionSet.add(text);

      text
        .split(/[·,，/｜|]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => optionSet.add(part));
    }

    items.forEach((item) => {
      const profile = profiles.get(item.user_id);

      addOption(item.location_text);
      addOption(profile?.country_name);
      addOption(profile?.region_name);
      addOption(profile?.city_name);
      addOption(profile?.location);
      addOption(buildLocationText(profile));
    });

    return Array.from(optionSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [items, profiles]);

  const visibleItems = useMemo(() => {
    const keyword = locationFilter.trim().toLowerCase();

    if (!keyword) return items;

    return items.filter((item) => {
      const profile = profiles.get(item.user_id);

      const searchableLocationText = [
        item.location_text,
        profile?.country_name,
        profile?.region_name,
        profile?.city_name,
        profile?.location,
        buildLocationText(profile),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableLocationText.includes(keyword);
    });
  }, [items, profiles, locationFilter]);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div style={marketIntroStyle}>交换与求购</div>

          <div style={headerActionStyle}>
            <Link href="/market/mine" style={mineButtonStyle}>
              我的发布
            </Link>

            <Link href="/market/new" style={publishButtonStyle}>
              发布信息
            </Link>
          </div>
        </header>

        <section style={filterPanelStyle}>
          <div style={filterGroupStyle}>
            <span style={filterLabelStyle}>类型</span>
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              style={filterButtonStyle(typeFilter === "all")}
            >
              全部
            </button>

            {MARKET_POST_TYPE_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTypeFilter(item.value)}
                style={filterButtonStyle(typeFilter === item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={filterGroupStyle}>
            <span style={filterLabelStyle}>类别</span>
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              style={filterButtonStyle(categoryFilter === "all")}
            >
              全部
            </button>

            {MARKET_ITEM_CATEGORY_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategoryFilter(item.value)}
                style={filterButtonStyle(categoryFilter === item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={filterGroupStyle}>
            <span style={filterLabelStyle}>地区</span>
            <input
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              placeholder="输入或选择地区"
              list="market-location-options"
              style={locationInputStyle}
            />

            <datalist id="market-location-options">
              {locationOptions.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </div>
        </section>

        {loading ? (
          <section style={emptyStyle}>加载中...</section>
        ) : visibleItems.length === 0 ? (
          <section style={emptyStyle}>
            {hasFilter ? "当前筛选下还没有集市信息" : "还没有集市信息"}
          </section>
        ) : (
          <section style={listStyle}>
            {visibleItems.map((item) => {
              const profile = profiles.get(item.user_id);
              const archive = item.archive_id
                ? archives.get(item.archive_id)
                : null;

              const locationText = item.location_text || buildLocationText(profile);
              const archiveTitle = archive?.title || "";
              const systemName =
                archive?.system_name || archive?.species_name_snapshot || "";

              return (
                <Link key={item.id} href={`/market/${item.id}`} style={cardStyle}>
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
                      </div>

                      <span style={timeStyle}>
                        {formatMarketTime(item.created_at)}
                      </span>
                    </div>

                    <h2 style={cardTitleStyle}>{item.title}</h2>

                    {item.description ? (
                      <p style={descriptionStyle}>{item.description}</p>
                    ) : null}

                    <div style={metaStyle}>
                      <span>{profile?.username || "未设置用户名"}</span>
                      {locationText ? <span> · {locationText}</span> : null}
                      {archiveTitle ? <span> · 来自：{archiveTitle}</span> : null}
                      {systemName ? <span> · {systemName}</span> : null}
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

function buildLocationText(profile?: ProfileBrief | null) {
  if (!profile) return "";

  const parts = [
    profile.country_name,
    profile.region_name,
    profile.city_name,
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" · ");

  return profile.location || "";
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "16px 14px 36px",
};

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1040,
  margin: "0 auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap",
};

const marketIntroStyle: CSSProperties = {
  color: "#1f2a1f",
  fontSize: 18,
  fontWeight: 700,
};

const headerActionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const mineButtonStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#40583a",
  borderRadius: 999,
  padding: "9px 15px",
  fontSize: 14,
  fontWeight: 700,
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

const filterPanelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
  display: "grid",
  gap: 10,
  marginBottom: 12,
};

const filterGroupStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const filterLabelStyle: CSSProperties = {
  color: "#6f7b69",
  fontSize: 13,
  fontWeight: 700,
};

const locationInputStyle: CSSProperties = {
  minWidth: 220,
  flex: 1,
  border: "1px solid #dfe8da",
  borderRadius: 999,
  padding: "7px 12px",
  fontSize: 13,
  outline: "none",
  color: "#40583a",
  background: "#fff",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const cardStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  textDecoration: "none",
  color: "inherit",
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
  alignItems: "flex-start",
  boxShadow: "0 8px 20px rgba(32,56,24,0.04)",
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

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};
