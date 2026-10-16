import type { CSSProperties } from "react";
import type { MarketPostDisplayRow, MarketProfileBrief, MarketArchiveBrief } from "@/lib/market-feed";
import { formatMarketTime, getMarketItemCategoryLabel, getMarketPostTypeLabel } from "@/lib/market-types";
import { getCompactCardLocation } from "@/lib/card-location";

type Props = {
  item: MarketPostDisplayRow;
  profile?: MarketProfileBrief | null;
  archive?: MarketArchiveBrief | null;
  language: "zh" | "en";
  marketName: string;
  unsetUsername: string;
  notProvided: string;
};

export default function MobileMarketFeedCard({
  item, profile, archive, language, marketName, unsetUsername, notProvided,
}: Props) {
  const location = item.location_text ||
    [profile?.country_name, profile?.region_name, profile?.city_name].filter(Boolean).join(" · ");
  const cover = item.display_cover_thumb_url || item.display_cover_image_url;
  return (
    <>
      {cover ? (
        <img src={cover} alt="" style={imageStyle} loading="lazy" />
      ) : (
        <div style={fallbackStyle}>{marketName}</div>
      )}
      <div style={contentStyle}>
        <div style={headerStyle}>
          <div style={badgesStyle}>
            <span style={typeStyle}>{getMarketPostTypeLabel(item.post_type, language)}</span>
            <span style={categoryStyle}>{getMarketItemCategoryLabel(item.item_category, language)}</span>
          </div>
          <span style={timeStyle}>{formatMarketTime(item.created_at)}</span>
        </div>
        <h2 style={titleStyle}>{item.title}</h2>
        <div style={metaStyle}>
          <span>{getCompactCardLocation({ fallback: location }) || notProvided}</span>
          <span style={{ color: "#acb5a8", flexShrink: 0 }}>·</span>
          <span style={sourceStyle}>{profile?.username || unsetUsername}{archive?.title ? ` · ${archive.title}` : ""}</span>
        </div>
      </div>
    </>
  );
}

export const mobileMarketCardStyle: CSSProperties = {
  display: "grid", gridTemplateColumns: "88px minmax(0, 1fr)", gap: 8,
  textDecoration: "none", color: "inherit", background: "#fff",
  border: "1px solid #e4ece0", borderRadius: 14, padding: 7,
  alignItems: "start", boxShadow: "0 8px 20px rgba(32,56,24,0.04)",
};
export const mobileMarketListStyle: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 7,
};
const imageStyle: CSSProperties = {
  width: 88, height: 88, objectFit: "cover", borderRadius: 12,
  background: "#f0f4ed", border: "1px solid #e4ece0",
};
const fallbackStyle: CSSProperties = {
  width: 88, height: 88, borderRadius: 12, background: "#edf4e8",
  border: "1px solid #e4ece0", color: "#6f7b69", display: "flex",
  alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
};
const contentStyle: CSSProperties = {
  minWidth: 0, minHeight: 88, display: "flex", flexDirection: "column",
};
const headerStyle: CSSProperties = {
  display: "flex", justifyContent: "space-between", gap: 6,
  alignItems: "flex-start", flexWrap: "nowrap", marginBottom: 3,
};
const badgesStyle: CSSProperties = { display: "flex", gap: 4, minWidth: 0, overflow: "hidden", flexWrap: "nowrap" };
const typeStyle: CSSProperties = { borderRadius: 999, background: "#edf4e8", color: "#4f7b45", padding: "2px 6px", fontSize: 11, fontWeight: 700 };
const categoryStyle: CSSProperties = { borderRadius: 999, background: "#f5f3e8", color: "#7a6b35", padding: "2px 6px", fontSize: 11, fontWeight: 700 };
const timeStyle: CSSProperties = { color: "#8a9585", fontSize: 11, lineHeight: 1.25, whiteSpace: "nowrap" };
const titleStyle: CSSProperties = { margin: 0, color: "#1f2a1f", fontSize: 16, lineHeight: 1.25, fontWeight: 700, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
const metaStyle: CSSProperties = { minWidth: 0, display: "flex", alignItems: "center", gap: 4, marginTop: "auto", paddingTop: 4, color: "#778173", fontSize: 12, lineHeight: 1.25, overflow: "hidden", whiteSpace: "nowrap" };
const sourceStyle: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
