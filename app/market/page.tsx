"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import {
  formatMarketTime,
  getMarketItemCategoryOptions,
  getMarketItemCategoryLabel,
  getMarketPostTypeOptions,
  getMarketPostTypeLabel,
  type MarketItemCategory,
  type MarketPostRow,
  type MarketPostType,
} from "@/lib/market-types";
import { PUBLIC_PROFILE_SELECT } from "@/lib/domain-types";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { useLanguage } from "@/lib/i18n/useLanguage";
import MobileContentTopBar from "@/components/mobile/MobileContentTopBar";

type ProfileBrief = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
};

type ArchiveBrief = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

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
    display_cover_thumb_url:
      pairs[index]?.display_thumb_url || null,
  }));
}

export default function MarketPage() {
  const { language, t } = useLanguage();
  const [items, setItems] = useState<MarketPostDisplayRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileBrief>>(new Map());
  const [archives, setArchives] = useState<Map<string, ArchiveBrief>>(new Map());
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | MarketPostType>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<"all" | MarketItemCategory>("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [contentFilter, setContentFilter] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    function updateViewportMode() {
      setIsMobileViewport(window.innerWidth < 760);
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  useEffect(() => {
    async function loadMarketPosts() {
      setLoading(true);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setCurrentUserId(user?.id || null);

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

        const rows = await attachMarketPostDisplayUrls((data || []) as MarketPostRow[]);
        setItems(rows);

        const userIds = Array.from(new Set(rows.map((item) => item.user_id)));
        const archiveIds = Array.from(
          new Set(rows.map((item) => item.archive_id).filter(Boolean))
        ) as string[];

        const [profilesResult, archivesResult] = await Promise.all([
          userIds.length
            ? supabase
                .from("public_profiles")
                .select(PUBLIC_PROFILE_SELECT)
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
    locationFilter.trim() !== "" ||
    contentFilter.trim() !== "";
  const mobileFilterCount =
    Number(categoryFilter !== "all") +
    Number(locationFilter.trim() !== "") +
    Number(contentFilter.trim() !== "");

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
      addOption(buildLocationText(profile));
    });

    return Array.from(optionSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [items, profiles]);

  const visibleItems = useMemo(() => {
    const locationKeyword = locationFilter.trim().toLowerCase();
    const contentKeyword = contentFilter.trim().toLowerCase();

    if (!locationKeyword && !contentKeyword) return items;

    return items.filter((item) => {
      const profile = profiles.get(item.user_id);
      const archive = item.archive_id ? archives.get(item.archive_id) : null;

      const searchableLocationText = [
        item.location_text,
        profile?.country_name,
        profile?.region_name,
        profile?.city_name,
        buildLocationText(profile),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const searchableContentText = [
        item.title,
        item.description,
        profile?.username,
        archive?.title,
        archive?.system_name,
        archive?.species_name_snapshot,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!locationKeyword || searchableLocationText.includes(locationKeyword)) &&
        (!contentKeyword || searchableContentText.includes(contentKeyword))
      );
    });
  }, [items, profiles, archives, locationFilter, contentFilter]);

  return (
    <>
      {isMobileViewport ? (
        <MobileContentTopBar
          ariaLabel={t.market.type}
          items={[
            { key: "all", label: t.market.all, active: typeFilter === "all", onClick: () => setTypeFilter("all") },
            ...getMarketPostTypeOptions(language).map((item) => ({
              key: item.value,
              label: item.label,
              active: typeFilter === item.value,
              onClick: () => setTypeFilter(item.value),
            })),
          ]}
        />
      ) : null}
      <main style={isMobileViewport ? mobilePageStyle : pageStyle}>
      <div style={shellStyle}>
        <header style={isMobileViewport ? mobileHeaderStyle : headerStyle}>
          {isMobileViewport ? (
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((open) => !open)}
              aria-expanded={mobileFiltersOpen}
              style={mobileFilterToggleStyle}
            >
              {mobileFiltersOpen ? t.market.hide_filters : t.market.show_filters}
              {mobileFilterCount > 0 ? ` (${mobileFilterCount})` : ""}
            </button>
          ) : (
            <div>
              <div style={marketIntroStyle}>{t.market.intro_title}</div>
              <div style={marketSubIntroStyle}>
                {t.market.intro_subtitle}
              </div>
            </div>
          )}

          {currentUserId ? (
            <div style={headerActionStyle}>
              <Link
                href="/market/mine"
                style={isMobileViewport ? mobileMineButtonStyle : mineButtonStyle}
              >
                {t.market.my_posts}
              </Link>
            </div>
          ) : null}
        </header>

        {isMobileViewport ? (
          mobileFiltersOpen ? (
            <MobileMarketFilters
              categoryFilter={categoryFilter}
              locationFilter={locationFilter}
              contentFilter={contentFilter}
              locationOptions={locationOptions}
              onCategoryChange={setCategoryFilter}
              onLocationChange={setLocationFilter}
              onContentChange={setContentFilter}
            />
          ) : null
        ) : (
          <section style={filterPanelStyle}>
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>{t.market.type}</span>
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                style={filterButtonStyle(typeFilter === "all")}
              >
                {t.market.all}
              </button>

              {getMarketPostTypeOptions(language).map((item) => (
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
              <span style={filterLabelStyle}>{t.market.category}</span>
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                style={filterButtonStyle(categoryFilter === "all")}
              >
                {t.market.all}
              </button>

              {getMarketItemCategoryOptions(language).map((item) => (
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
              <span style={filterLabelStyle}>{t.market.area}</span>
              <input
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                placeholder={t.market.area_placeholder}
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
        )}

        {loading ? (
          <section style={emptyStyle}>{t.market.loading}</section>
        ) : visibleItems.length === 0 ? (
          <section style={emptyStyle}>
            {hasFilter ? t.market.empty_filtered : t.market.empty}
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
              const publisherName = profile?.username || t.market.unset_username;

              return (
                <Link key={item.id} href={`/market/${item.id}`} style={cardStyle}>
                  {item.display_cover_thumb_url || item.display_cover_image_url ? (
                    <img
                      src={
                        item.display_cover_thumb_url ||
                        item.display_cover_image_url ||
                        ""
                      }
                      alt=""
                      style={cardImageStyle}
                      loading="lazy"
                    />
                  ) : (
                    <div style={cardImageFallbackStyle}>{t.market.name}</div>
                  )}

                  <div style={cardContentStyle}>
                    <div style={cardHeaderStyle}>
                      <div style={badgeRowStyle}>
                        <span style={typeBadgeStyle}>
                          {getMarketPostTypeLabel(item.post_type, language)}
                        </span>
                        <span style={categoryBadgeStyle}>
                          {getMarketItemCategoryLabel(item.item_category, language)}
                        </span>
                      </div>

                      <span style={timeStyle}>
                        {formatMarketTime(item.created_at)}
                      </span>
                    </div>

                    <h2 style={cardTitleStyle}>{item.title}</h2>

                    {!isMobileViewport && item.description ? (
                      <p style={descriptionStyle}>{item.description}</p>
                    ) : null}

                    {isMobileViewport ? (
                      <div style={mobileCardMetaStyle}>
                        <span>{locationText || t.market.not_provided}</span>
                        <span style={mobileCardMetaDividerStyle}>·</span>
                        <span style={mobileCardSourceStyle}>
                          {publisherName}{archiveTitle ? ` · ${archiveTitle}` : ""}
                        </span>
                      </div>
                    ) : <div style={infoGridStyle}>
                      <div style={infoLineStyle}>
                        <span style={infoLabelStyle}>{t.market.location}</span>
                        <span style={infoValueStyle}>{locationText || t.market.not_provided}</span>
                      </div>
                      <div style={infoLineStyle}>
                        <span style={infoLabelStyle}>{t.market.source}</span>
                        <span style={{ ...infoValueStyle, ...sourceValueStyle }}>
                          <span style={sourceUserStyle}>{publisherName}</span>
                          <span style={sourceDividerStyle}>·</span>
                          {archiveTitle ? (
                            <span style={sourceArchiveStyle}>{archiveTitle}</span>
                          ) : (
                            <span style={sourceMissingStyle}>{t.market.no_linked_record}</span>
                          )}
                          {systemName ? (
                            <>
                              <span style={sourceDividerStyle}>·</span>
                              <span style={sourceSystemStyle}>{systemName}</span>
                            </>
                          ) : null}
                        </span>
                      </div>
                    </div>}
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
      </main>
    </>
  );
}

function MobileMarketFilters({
  categoryFilter,
  locationFilter,
  contentFilter,
  locationOptions,
  onCategoryChange,
  onLocationChange,
  onContentChange,
}: {
  categoryFilter: "all" | MarketItemCategory;
  locationFilter: string;
  contentFilter: string;
  locationOptions: string[];
  onCategoryChange: (value: "all" | MarketItemCategory) => void;
  onLocationChange: (value: string) => void;
  onContentChange: (value: string) => void;
}) {
  const { language, t } = useLanguage();

  return (
    <section style={mobileFilterPanelStyle}>
      <div style={mobileFilterTopGridStyle}>
        <label style={mobileFilterFieldStyle} aria-label={t.market.category}>
          <select
            value={categoryFilter}
            onChange={(event) => onCategoryChange(event.target.value as "all" | MarketItemCategory)}
            style={mobileFilterControlStyle}
          >
            <option value="all">{t.market.all_categories}</option>
            {getMarketItemCategoryOptions(language).map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label style={mobileFilterFieldStyle} aria-label={t.market.area}>
          <input
            value={locationFilter}
            onChange={(event) => onLocationChange(event.target.value)}
            placeholder={t.market.area_short_placeholder}
            list="market-location-options"
            style={mobileFilterControlStyle}
          />
        </label>

        <label style={mobileFilterContentFieldStyle} aria-label={t.market.content}>
          <input
            value={contentFilter}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder={t.market.content_placeholder}
            style={mobileFilterControlStyle}
          />
        </label>
      </div>

      <datalist id="market-location-options">
        {locationOptions.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
    </section>
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

  return "";
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "16px 14px 36px",
};

const mobilePageStyle: CSSProperties = {
  ...pageStyle,
  padding: "9px 8px 28px",
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

const mobileHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
};

const marketIntroStyle: CSSProperties = {
  color: "#1f2a1f",
  fontSize: 18,
  fontWeight: 700,
};

const marketSubIntroStyle: CSSProperties = {
  marginTop: 3,
  color: "#7b8676",
  fontSize: 13,
  lineHeight: 1.45,
};

const headerActionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  flexShrink: 0,
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

const mobileMineButtonStyle: CSSProperties = {
  ...mineButtonStyle,
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 11px",
  fontSize: 14,
};

const mobileFilterToggleStyle: CSSProperties = {
  minHeight: 34,
  border: "1px solid #d7e2d2",
  borderRadius: 999,
  background: "#fff",
  color: "#40583a",
  padding: "6px 11px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const filterPanelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 14,
  padding: 10,
  display: "grid",
  gap: 10,
  marginBottom: 12,
};

const mobileFilterPanelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 14,
  padding: 8,
  display: "grid",
  gap: 8,
  marginBottom: 10,
  overflowX: "visible",
};

const mobileFilterTopGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 5,
  alignItems: "end",
};

const mobileFilterFieldStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
};

const mobileFilterContentFieldStyle: CSSProperties = {
  ...mobileFilterFieldStyle,
};

const mobileFilterControlStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 36,
  border: "1px solid #dfe8da",
  borderRadius: 9,
  background: "#fff",
  color: "#40583a",
  padding: "0 7px",
  fontSize: 13,
  boxSizing: "border-box",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 7,
};

const cardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px minmax(0, 1fr)",
  gap: 8,
  textDecoration: "none",
  color: "inherit",
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 14,
  padding: 7,
  alignItems: "start",
  boxShadow: "0 8px 20px rgba(32,56,24,0.04)",
};

const cardImageStyle: CSSProperties = {
  width: "88px",
  height: "88px",
  objectFit: "cover",
  borderRadius: 12,
  background: "#f0f4ed",
  border: "1px solid #e4ece0",
};

const cardImageFallbackStyle: CSSProperties = {
  width: "88px",
  height: "88px",
  borderRadius: 12,
  background: "#edf4e8",
  border: "1px solid #e4ece0",
  color: "#6f7b69",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
};

const cardContentStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 88,
  display: "flex",
  flexDirection: "column",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 6,
  alignItems: "flex-start",
  flexWrap: "nowrap",
  marginBottom: 3,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  minWidth: 0,
  overflow: "hidden",
  flexWrap: "nowrap",
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

const timeStyle: CSSProperties = {
  color: "#8a9585",
  fontSize: 11,
  lineHeight: 1.25,
  whiteSpace: "nowrap",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 16,
  lineHeight: 1.25,
  fontWeight: 700,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const descriptionStyle: CSSProperties = {
  margin: "3px 0 0",
  color: "#5f6a5b",
  fontSize: 13,
  lineHeight: 1.35,
  display: "-webkit-box",
  WebkitLineClamp: 1,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: 1,
  marginTop: "auto",
  paddingTop: 3,
};

const mobileCardMetaStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginTop: "auto",
  paddingTop: 4,
  color: "#778173",
  fontSize: 12,
  lineHeight: 1.25,
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const mobileCardMetaDividerStyle: CSSProperties = {
  color: "#acb5a8",
  flexShrink: 0,
};

const mobileCardSourceStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const infoLineStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: 4,
  alignItems: "baseline",
  color: "#6b7665",
  fontSize: 12,
  lineHeight: 1.25,
};

const infoLabelStyle: CSSProperties = {
  color: "#8a9585",
  fontWeight: 700,
};

const infoValueStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sourceValueStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 3,
  flexWrap: "nowrap",
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const sourceUserStyle: CSSProperties = {
  color: "#7b8676",
  fontSize: 12,
  fontWeight: 600,
};

const sourceArchiveStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#2f3a2f",
  fontSize: 12,
  fontWeight: 700,
};

const sourceSystemStyle: CSSProperties = {
  color: "#4f7b45",
  fontSize: 12,
  fontWeight: 700,
  background: "#edf4e8",
  borderRadius: 999,
  padding: "1px 6px",
};

const sourceMissingStyle: CSSProperties = {
  color: "#9aa398",
  fontSize: 12,
};

const sourceDividerStyle: CSSProperties = {
  color: "#c1cbbb",
  fontSize: 12,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};
