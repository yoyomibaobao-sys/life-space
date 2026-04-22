"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getBehaviorTagLabel } from "@/lib/tag-labels";

const SEARCH_BATCH_SIZE = 120;

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
  system_name?: string | null;
  record_count?: number | null;
  archive_record_count?: number | null;
  view_count?: number | null;
  archive_view_count?: number | null;
  archive_status?: string | null;
  archive_ended_at?: string | null;
};

type FilterMode = "all" | "plant" | "system" | "help";
type SearchCategory = "all" | "plant" | "system";

type UserSection = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  user_location: string | null;
  latest_time: string;
  records: FeedItem[];
  total_project_count: number;
};

const filterOptions: { value: FilterMode; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "plant", label: "种植" },
  { value: "system", label: "配套设施" },
  { value: "help", label: "只看求助" },
];

const commonSearchTags = [
  "发芽",
  "开花",
  "结果",
  "叶片",
  "病害",
  "浇水",
  "施肥",
  "换盆",
  "修剪",
  "播种",
  "扦插",
  "移植",
  "堆肥",
  "育苗",
  "补光",
];

function categoryLabel(value?: string | null) {
  if (value === "plant") return "种植";
  if (value === "system") return "配套设施";
  return "项目";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function shortText(value?: string | null, maxLength = 42) {
  const text = (value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function getArchiveUserTitle(record: FeedItem) {
  return record.archive_title || "未命名项目";
}

function getArchiveSystemName(record: FeedItem) {
  const systemName =
    record.archive_category === "system"
      ? record.system_name || record.species_name_snapshot
      : record.species_name_snapshot || record.system_name;

  if (systemName) return systemName;

  return record.archive_category === "system" ? "配套设施" : "种植";
}

function getArchiveRecordCount(record: FeedItem) {
  const value = record.archive_record_count ?? record.record_count;

  if (typeof value === "number" && value >= 0) {
    return value;
  }

  return null;
}

function getArchiveViewCount(record: FeedItem) {
  const value = record.archive_view_count ?? record.view_count;

  if (typeof value === "number" && value >= 0) {
    return value;
  }

  return null;
}

function getArchiveLifecycleStatus(record: FeedItem) {
  return record.archive_status === "ended" ? "ended" : "active";
}

function HelpBadge() {
  return (
    <span
      style={{
        fontSize: 11,
        color: "#a65f45",
        background: "#fff5ee",
        border: "1px solid #efd8cc",
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontWeight: 600,
        letterSpacing: 0.5,
      }}
    >
      求助
    </span>
  );
}

function EndedBadge() {
  return (
    <span
      style={{
        fontSize: 11,
        color: "#7f7668",
        background: "#f6f2ec",
        border: "1px solid #e4d8ca",
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontWeight: 500,
        lineHeight: 1.35,
      }}
    >
      已结束
    </span>
  );
}

function CategoryBadge({ category }: { category?: string | null }) {
  const isSystem = category === "system";

  return (
    <span
      style={{
        fontSize: 11,
        color: isSystem ? "#7a6a2a" : "#2e7d32",
        background: isSystem ? "#fff9e8" : "#f0fff4",
        border: isSystem ? "1px solid #eadca8" : "1px solid #cae9ca",
        borderRadius: 999,
        padding: "1px 6px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        lineHeight: 1.35,
      }}
    >
      {categoryLabel(category)}
    </span>
  );
}

function RecordTagPill({
  record,
  tag,
  enableLink = false,
}: {
  record: FeedItem;
  tag: string;
  enableLink?: boolean;
}) {
  return (
    <span
      onClick={
        enableLink
          ? (e: MouseEvent<HTMLSpanElement>) => {
              e.preventDefault();
              e.stopPropagation();

              if (record.species_id) {
                window.location.href = `/discover/search?tag=${encodeURIComponent(
                  tag
                )}&species=${record.species_id}`;
                return;
              }

              window.location.href = `/discover/search?tag=${encodeURIComponent(
                tag
              )}`;
            }
          : undefined
      }
      style={{
        padding: "1px 6px",
        borderRadius: 999,
        border: "1px solid #e2e8df",
        background: "#fafafa",
        color: "#4CAF50",
        cursor: enableLink ? "pointer" : "default",
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontSize: 11,
        lineHeight: 1.35,
      }}
    >
      {getBehaviorTagLabel(tag)}
    </span>
  );
}

function ProjectCardRows({
  record,
  imageHeight,
  titleFontSize,
  noteMaxLength,
  enableTagLinks = false,
  showUsername = false,
}: {
  record: FeedItem;
  imageHeight: number;
  titleFontSize: number;
  noteMaxLength: number;
  enableTagLinks?: boolean;
  showUsername?: boolean;
}) {
  const isHelp = record.status_tag === "help";
  const lifecycleStatus = getArchiveLifecycleStatus(record);
  const archiveUserTitle = getArchiveUserTitle(record);
  const archiveSystemName = getArchiveSystemName(record);
  const archiveRecordCount = getArchiveRecordCount(record);
  const archiveViewCount = getArchiveViewCount(record);
  const commentCount =
    typeof record.comment_count === "number" ? record.comment_count : 0;
  const tags = Array.isArray(record.display_tags)
    ? record.display_tags.slice(0, 2)
    : [];
  const updateText = formatDate(record.record_time);
  const displayUsername = record.username || "用户";
  const statParts = [
    showUsername ? displayUsername : null,
    archiveRecordCount !== null ? `共 ${archiveRecordCount} 条记录` : null,
    archiveViewCount !== null ? `浏览 ${archiveViewCount} 次` : null,
    `${commentCount} 评论`,
  ].filter((item): item is string => Boolean(item));

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: imageHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          whiteSpace: "nowrap",
          lineHeight: 1.35,
        }}
      >
        <CategoryBadge category={record.archive_category} />

        {isHelp && <HelpBadge />}

        {lifecycleStatus === "ended" && <EndedBadge />}

        <span
          style={{
            fontSize: titleFontSize,
            fontWeight: 700,
            color: "#1f2d1f",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: "0 1 auto",
            maxWidth: "44%",
          }}
          title={archiveUserTitle}
        >
          {archiveUserTitle}
        </span>

        <span
          aria-hidden="true"
          style={{
            color: "#c7d0c3",
            flexShrink: 0,
            fontSize: Math.max(12, titleFontSize - 2),
          }}
        >
          ·
        </span>

        <span
          style={{
            color: record.archive_category === "system" ? "#8a742d" : "#5f7f58",
            fontSize: Math.max(12, titleFontSize - 2),
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: "0 1 auto",
            maxWidth: "30%",
          }}
          title={archiveSystemName}
        >
          {archiveSystemName}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          color: "#3f4f3f",
          fontSize: 13,
          lineHeight: 1.35,
          whiteSpace: "nowrap",
        }}
      >
        {tags.map((tag) => (
          <RecordTagPill
            key={tag}
            record={record}
            tag={tag}
            enableLink={enableTagLinks}
          />
        ))}

        <span
          style={{
            color: record.note ? "#3f4f3f" : "#9aa59a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {record.note
            ? shortText(record.note, noteMaxLength)
            : "这条记录没有文字内容"}
          {updateText ? (
            <span style={{ color: "#9aa59a" }}>　更新 {updateText}</span>
          ) : null}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          minWidth: 0,
          fontSize: 11,
          color: "#8a998a",
          lineHeight: 1.35,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {statParts.map((part, index) => (
          <span
            key={`${part}-${index}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minWidth: 0,
              flexShrink: index === 0 && showUsername ? 1 : 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={part}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {part}
            </span>
            {index < statParts.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  color: "#cbd4c8",
                  margin: "0 1px 0 5px",
                  flexShrink: 0,
                }}
              >
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function sanitizeOrSearchText(value: string) {
  return value.replace(/[(),]/g, " ").trim();
}

async function findSpeciesIdsByNameTerm(nameTerm: string) {
  const term = sanitizeOrSearchText(nameTerm);
  if (!term) return [];

  const ids = new Set<string>();

  const [speciesResult, i18nResult, aliasResult] = await Promise.all([
    supabase
      .from("plant_species")
      .select("id")
      .or(`common_name.ilike.%${term}%,scientific_name.ilike.%${term}%`)
      .limit(80),
    supabase
      .from("plant_species_i18n")
      .select("plant_id")
      .ilike("common_name", `%${term}%`)
      .limit(80),
    supabase
      .from("plant_species_aliases")
      .select("species_id")
      .or(`alias_name.ilike.%${term}%,normalized_name.ilike.%${term}%`)
      .limit(120),
  ]);

  if (speciesResult.error) {
    console.error("discover search species error:", speciesResult.error);
  }

  if (i18nResult.error) {
    console.error("discover search species i18n error:", i18nResult.error);
  }

  if (aliasResult.error) {
    console.error("discover search species aliases error:", aliasResult.error);
  }

  (speciesResult.data || []).forEach((row: any) => {
    if (row.id) ids.add(row.id);
  });

  (i18nResult.data || []).forEach((row: any) => {
    if (row.plant_id) ids.add(row.plant_id);
  });

  (aliasResult.data || []).forEach((row: any) => {
    if (row.species_id) ids.add(row.species_id);
  });

  return Array.from(ids);
}

async function findRecordIdsByTagTerm(tagTerm: string) {
  const term = sanitizeOrSearchText(tagTerm);
  if (!term) return [];

  const { data, error } = await supabase
    .from("record_tags")
    .select("record_id")
    .ilike("tag", `%${term}%`)
    .neq("is_active", false)
    .limit(300);

  if (error) {
    console.error("discover search record tags error:", error);
    return [];
  }

  const ids = new Set<string>();

  (data || []).forEach((row: any) => {
    if (row.record_id) ids.add(row.record_id);
  });

  return Array.from(ids);
}


async function enrichFeedItems(nextItems: FeedItem[]) {
  const recordIds = nextItems.map((item) => item.record_id);
  const userIds = Array.from(new Set(nextItems.map((item) => item.user_id)));

  const tagMap = new Map<string, string[]>();
  const locationMap = new Map<string, string | null>();

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

  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, location")
      .in("id", userIds);

    (profileRows || []).forEach((row: any) => {
      locationMap.set(row.id, row.location || null);
    });
  }

  return nextItems.map((item) => ({
    ...item,
    user_location:
      item.user_location || locationMap.get(item.user_id) || null,
    display_tags: tagMap.get(item.record_id) || [],
  }));
}


type SearchFilters = {
  region: string;
  category: SearchCategory;
  name: string;
  tag: string;
  content: string;
  helpOnly: boolean;
  speciesId?: string | null;
};

const emptyFilters: SearchFilters = {
  region: "",
  category: "all",
  name: "",
  tag: "",
  content: "",
  helpOnly: false,
  speciesId: null,
};

export default function DiscoverSearchPage() {
  const [searchRegion, setSearchRegion] = useState("");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>("all");
  const [searchName, setSearchName] = useState("");
  const [searchTag, setSearchTag] = useState("");
  const [searchContent, setSearchContent] = useState("");
  const [searchHelpOnly, setSearchHelpOnly] = useState(false);
  const [searchSpeciesId, setSearchSpeciesId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<FeedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasRun, setSearchHasRun] = useState(false);

  async function performSearch(filters: SearchFilters) {
    setSearchLoading(true);
    setSearchHasRun(true);

    const regionTerm = filters.region.trim();
    const nameTerm = sanitizeOrSearchText(filters.name);
    const tagTerm = sanitizeOrSearchText(filters.tag);
    const contentTerm = sanitizeOrSearchText(filters.content);

    const [matchedSpeciesIds, matchedTagRecordIds] = await Promise.all([
      nameTerm
        ? findSpeciesIdsByNameTerm(nameTerm)
        : Promise.resolve<string[]>([]),
      tagTerm
        ? findRecordIdsByTagTerm(tagTerm)
        : Promise.resolve<string[]>([]),
    ]);

    let userFilterIds: string[] | null = null;

    if (regionTerm) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .ilike("location", `%${regionTerm}%`)
        .limit(200);

      if (profileError) {
        console.error("discover search profile error:", profileError);
      }

      userFilterIds = (profileRows || []).map((row: any) => row.id);

      if (userFilterIds.length === 0) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }
    }

    if (tagTerm && matchedTagRecordIds.length === 0) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let query = supabase
      .from("discovery_feed_view")
      .select("*")
      .order("record_time", { ascending: false })
      .limit(SEARCH_BATCH_SIZE);

    if (filters.category === "plant") {
      query = query.eq("archive_category", "plant");
    }

    if (filters.category === "system") {
      query = query.eq("archive_category", "system");
    }

    if (filters.helpOnly) {
      query = query.eq("status_tag", "help");
    }

    if (filters.speciesId) {
      query = query.eq("species_id", filters.speciesId);
    }

    if (userFilterIds && userFilterIds.length > 0) {
      query = query.in("user_id", userFilterIds);
    }

    if (nameTerm) {
      const nameFilters = [
        `archive_title.ilike.%${nameTerm}%`,
        `species_name_snapshot.ilike.%${nameTerm}%`,
        `system_name.ilike.%${nameTerm}%`,
      ];

      if (matchedSpeciesIds.length > 0) {
        nameFilters.push(`species_id.in.(${matchedSpeciesIds.join(",")})`);
      }

      query = query.or(nameFilters.join(","));
    }

    if (tagTerm) {
      query = query.in("record_id", matchedTagRecordIds);
    }

    if (contentTerm) {
      query = query.ilike("note", `%${contentTerm}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("discover search error:", error);
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const enrichedItems = await enrichFeedItems((data || []) as FeedItem[]);
    setSearchResults(enrichedItems);
    setSearchLoading(false);
  }

  function currentFilters(): SearchFilters {
    return {
      region: searchRegion,
      category: searchCategory,
      name: searchName,
      tag: searchTag,
      content: searchContent,
      helpOnly: searchHelpOnly,
      speciesId: searchSpeciesId,
    };
  }

  function runSearch(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    performSearch(currentFilters());
  }

  function resetSearchFilters() {
    setSearchRegion("");
    setSearchCategory("all");
    setSearchName("");
    setSearchTag("");
    setSearchContent("");
    setSearchHelpOnly(false);
    setSearchSpeciesId(null);
    window.history.replaceState(null, "", "/discover/search");
    performSearch(emptyFilters);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const initialFilters: SearchFilters = {
      region: params.get("region") || "",
      category:
        params.get("category") === "plant" || params.get("category") === "system"
          ? (params.get("category") as SearchCategory)
          : "all",
      name: params.get("name") || "",
      tag: params.get("tag") || "",
      content: params.get("content") || "",
      helpOnly: params.get("help") === "1",
      speciesId: params.get("species"),
    };

    setSearchRegion(initialFilters.region);
    setSearchCategory(initialFilters.category);
    setSearchName(initialFilters.name);
    setSearchTag(initialFilters.tag);
    setSearchContent(initialFilters.content);
    setSearchHelpOnly(initialFilters.helpOnly);
    setSearchSpeciesId(initialFilters.speciesId || null);

    performSearch(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasCustomTag =
    searchTag.trim() && !commonSearchTags.includes(searchTag.trim());

  return (
    <main
      style={{
        padding: "10px 14px 14px",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1f2d1f" }}>
          搜索记录
        </div>

        <a
          href="/discover"
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: "#6f7f6f",
            fontSize: 13,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          ← 返回发现
        </a>
      </header>

      <form
        onSubmit={runSearch}
        style={{
          padding: 12,
          border: "1px solid #e5ece2",
          borderRadius: 16,
          background: "#fbfdf9",
          marginBottom: 14,
          boxShadow: "0 1px 8px rgba(0,0,0,0.025)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(118px, 1fr) minmax(96px, 0.8fr) minmax(130px, 1.1fr) minmax(108px, 0.9fr) minmax(150px, 1.25fr)",
            gap: 8,
            overflowX: "auto",
          }}
        >
          <label
            style={{
              fontSize: 12,
              color: "#6f7f6f",
              minWidth: 0,
            }}
          >
            地区
            <input
              value={searchRegion}
              onChange={(e) => setSearchRegion(e.target.value)}
              placeholder="国家 / 城市 / 地区"
              style={{
                width: "100%",
                marginTop: 4,
                padding: "9px 10px",
                borderRadius: 10,
                border: "1px solid #dfe8dc",
                background: "#fff",
                color: "#1f2d1f",
                boxSizing: "border-box",
                fontSize: 13,
              }}
            />
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#6f7f6f",
              minWidth: 0,
            }}
          >
            种类
            <select
              value={searchCategory}
              onChange={(e) =>
                setSearchCategory(e.target.value as SearchCategory)
              }
              style={{
                width: "100%",
                marginTop: 4,
                padding: "9px 10px",
                borderRadius: 10,
                border: "1px solid #dfe8dc",
                background: "#fff",
                color: "#1f2d1f",
                boxSizing: "border-box",
                fontSize: 13,
              }}
            >
              <option value="all">全部</option>
              <option value="plant">种植</option>
              <option value="system">配套设施</option>
            </select>
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#6f7f6f",
              minWidth: 0,
            }}
          >
            名称
            <input
              value={searchName}
              onChange={(e) => {
                setSearchName(e.target.value);
                if (searchSpeciesId) setSearchSpeciesId(null);
              }}
              placeholder="项目名 / 植物名"
              style={{
                width: "100%",
                marginTop: 4,
                padding: "9px 10px",
                borderRadius: 10,
                border: "1px solid #dfe8dc",
                background: "#fff",
                color: "#1f2d1f",
                boxSizing: "border-box",
                fontSize: 13,
              }}
            />
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#6f7f6f",
              minWidth: 0,
            }}
          >
            标签
            <select
              value={searchTag}
              onChange={(e) => setSearchTag(e.target.value)}
              style={{
                width: "100%",
                marginTop: 4,
                padding: "9px 10px",
                borderRadius: 10,
                border: "1px solid #dfe8dc",
                background: "#fff",
                color: "#1f2d1f",
                boxSizing: "border-box",
                fontSize: 13,
              }}
            >
              <option value="">全部标签</option>
              {hasCustomTag ? <option value={searchTag}>{searchTag}</option> : null}
              {commonSearchTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              fontSize: 12,
              color: "#6f7f6f",
              minWidth: 0,
            }}
          >
            内容
            <input
              value={searchContent}
              onChange={(e) => setSearchContent(e.target.value)}
              placeholder="记录内容"
              style={{
                width: "100%",
                marginTop: 4,
                padding: "9px 10px",
                borderRadius: 10,
                border: "1px solid #dfe8dc",
                background: "#fff",
                color: "#1f2d1f",
                boxSizing: "border-box",
                fontSize: 13,
              }}
            />
          </label>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "#374737",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={searchHelpOnly}
              onChange={(e) => setSearchHelpOnly(e.target.checked)}
            />
            只看求助
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={resetSearchFilters}
              style={{
                border: "1px solid #e1e8dd",
                background: "#fff",
                color: "#4d5d4d",
                borderRadius: 999,
                padding: "8px 13px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              重置
            </button>

            <button
              type="submit"
              style={{
                border: "1px solid #7eb87e",
                background: "#4CAF50",
                color: "#fff",
                borderRadius: 999,
                padding: "8px 15px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              搜索
            </button>
          </div>
        </div>
      </form>

      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 9,
            color: "#6f7f6f",
            fontSize: 12,
          }}
        >
          <span>全部记录</span>
          {searchHasRun && !searchLoading ? (
            <span>{searchResults.length} 条</span>
          ) : null}
        </div>

        {searchLoading ? (
          <div
            style={{
              padding: "22px 12px",
              textAlign: "center",
              color: "#8a998a",
              fontSize: 13,
            }}
          >
            搜索中...
          </div>
        ) : searchHasRun && searchResults.length === 0 ? (
          <div
            style={{
              padding: "28px 12px",
              textAlign: "center",
              color: "#8a998a",
              fontSize: 13,
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #edf2ea",
            }}
          >
            没有找到符合条件的公开记录
          </div>
        ) : (
          searchResults.map((record) => {
            const isHelp = record.status_tag === "help";

            return (
              <a
                key={record.record_id}
                href={`/archive/${record.archive_id}?record=${record.record_id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "#1f2d1f",
                  background: isHelp ? "#fffaf6" : "#fff",
                  border: isHelp
                    ? "1px solid #f0ddd4"
                    : "1px solid #e8eee5",
                  boxShadow: isHelp
                    ? "inset 0 0 0 1px rgba(166, 95, 69, 0.04)"
                    : "none",
                  borderRadius: 13,
                  padding: 9,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  {record.primary_image_url ? (
                    <img
                      src={record.primary_image_url}
                      alt={record.archive_title || "record image"}
                      style={{
                        width: 58,
                        height: 58,
                        objectFit: "cover",
                        borderRadius: 9,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 9,
                        flexShrink: 0,
                        background: "#f5f8f4",
                        color: "#9aaa9a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                      }}
                    >
                      {record.archive_category === "system" ? "🛠" : "🌿"}
                    </div>
                  )}

                  <ProjectCardRows
                    record={record}
                    imageHeight={58}
                    titleFontSize={14}
                    noteMaxLength={96}
                    showUsername
                  />
                </div>
              </a>
            );
          })
        )}
      </section>
    </main>
  );
}
