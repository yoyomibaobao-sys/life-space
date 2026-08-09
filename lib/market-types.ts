import { formatCardDate } from "@/lib/date-time";

export type MarketPostType = "offer" | "exchange" | "gift" | "wanted";

export type MarketItemCategory =
  | "seed"
  | "seedling"
  | "cutting"
  | "potted"
  | "fruit"
  | "aquatic_plant"
  | "fish_shrimp"
  | "insect"
  | "tool_facility"
  | "other";

export type MarketPostStatus = "active" | "ended";

export type MarketPostRow = {
  id: string;
  user_id: string;
  archive_id: string | null;
  source_record_id: string | null;
  title: string;
  description: string | null;
  post_type: MarketPostType;
  item_category: MarketItemCategory;
  location_text: string | null;
  external_url?: string | null;
  external_label?: string | null;
  cover_image_url: string | null;
  cover_image_path: string | null;
  cover_thumb_url?: string | null;
  cover_thumb_path?: string | null;
  cover_upload_reservation_id?: string | null;
  status: MarketPostStatus;
  view_count: number | null;
  created_at: string;
  updated_at: string | null;
  ended_at: string | null;
};

export const MARKET_POST_TYPE_OPTIONS: {
  value: MarketPostType;
  label: string;
}[] = [
  { value: "offer", label: "出让" },
  { value: "exchange", label: "交换" },
  { value: "gift", label: "赠送" },
  { value: "wanted", label: "求购" },
];

export const MARKET_ITEM_CATEGORY_OPTIONS: {
  value: MarketItemCategory;
  label: string;
}[] = [
  { value: "seed", label: "种子" },
  { value: "seedling", label: "苗" },
  { value: "cutting", label: "枝条" },
  { value: "potted", label: "盆栽" },
  { value: "fruit", label: "果实" },
  { value: "aquatic_plant", label: "水草" },
  { value: "fish_shrimp", label: "鱼虾" },
  { value: "insect", label: "昆虫" },
  { value: "tool_facility", label: "工具 / 设施" },
  { value: "other", label: "其他" },
];

export function getMarketPostTypeLabel(value?: string | null) {
  return (
    MARKET_POST_TYPE_OPTIONS.find((item) => item.value === value)?.label || "集市"
  );
}

export function getMarketItemCategoryLabel(value?: string | null) {
  return (
    MARKET_ITEM_CATEGORY_OPTIONS.find((item) => item.value === value)?.label ||
    "其他"
  );
}

export function formatMarketTime(value?: string | null) {
  return formatCardDate(value);
}
