"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getBehaviorTagLabel } from "@/lib/tag-labels";

const RECORD_BATCH_SIZE = 80;
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
};

const filterOptions: { value: FilterMode; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "plant", label: "植物" },
  { value: "system", label: "配套设施" },
  { value: "help", label: "仅求助" },
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
  if (value === "plant") return "植物";
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

function buildUserSections(items: FeedItem[]): UserSection[] {
  const userMap = new Map<
    string,
    {
      user_id: string;
      username: string;
      avatar_url: string | null;
      user_location: string | null;
      latest_time: string;
      archiveMap: Map<string, FeedItem>;
    }
  >();

  const sortedItems = [...items].sort(
    (a, b) =>
      new Date(b.record_time).getTime() - new Date(a.record_time).getTime()
  );

  sortedItems.forEach((item) => {
    if (!item.user_id || !item.archive_id) return;

    const current = userMap.get(item.user_id) || {
      user_id: item.user_id,
      username: item.username || "用户",
      avatar_url: item.avatar_url || null,
      user_location: item.user_location || null,
      latest_time: item.record_time,
      archiveMap: new Map<string, FeedItem>(),
    };

    current.username = item.username || current.username || "用户";
    current.avatar_url = item.avatar_url || current.avatar_url || null;
    current.user_location =
      item.user_location || current.user_location || null;

    if (
      new Date(item.record_time).getTime() >
      new Date(current.latest_time).getTime()
    ) {
      current.latest_time = item.record_time;
    }

    // 每个项目只取一条最新公开记录。items 已按 record_time 降序排列，
    // 第一次遇到这个 archive_id 时，就是该项目最新记录。
    if (!current.archiveMap.has(item.archive_id)) {
      current.archiveMap.set(item.archive_id, item);
    }

    userMap.set(item.user_id, current);
  });

  return Array.from(userMap.values())
    .map((user) => {
      const records = Array.from(user.archiveMap.values()).sort(
        (a, b) =>
          new Date(b.record_time).getTime() -
          new Date(a.record_time).getTime()
      );

      const first = records[0];
      const helpRecord = records.find(
        (record) =>
          record.status_tag === "help" &&
          (!first || record.record_id !== first.record_id)
      );

      let orderedRecords = records;

      // 默认发现页里，如果用户有求助记录，把最新求助优先放到第 2 条。
      if (first && helpRecord) {
        orderedRecords = [
          first,
          helpRecord,
          ...records.filter(
            (record) =>
              record.record_id !== first.record_id &&
              record.record_id !== helpRecord.record_id
          ),
        ];
      }

      return {
        user_id: user.user_id,
        username: user.username,
        avatar_url: user.avatar_url,
        user_location: user.user_location,
        latest_time: user.latest_time,
        records: orderedRecords.slice(0, 4),
      };
    })
    .filter((section) => section.records.length > 0)
    .sort(
      (a, b) =>
        new Date(b.latest_time).getTime() - new Date(a.latest_time).getTime()
    );
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

export default function DiscoverPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [hasMore, setHasMore] = useState(true);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchRegion, setSearchRegion] = useState("");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>("all");
  const [searchName, setSearchName] = useState("");
  const [searchContent, setSearchContent] = useState("");
  const [searchHelpOnly, setSearchHelpOnly] = useState(false);
  const [searchResults, setSearchResults] = useState<FeedItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasRun, setSearchHasRun] = useState(false);

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const sections = useMemo(() => buildUserSections(items), [items]);

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

  function toggleUserSection(userId: string) {
    setExpandedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  async function load(pageIndex = 0, mode: FilterMode = filterMode) {
    if (loadingRef.current) return;
    if (!hasMore && pageIndex !== 0) return;

    loadingRef.current = true;
    setLoading(true);

    const from = pageIndex * RECORD_BATCH_SIZE;
    const to = from + RECORD_BATCH_SIZE - 1;

    let query = supabase
      .from("discovery_feed_view")
      .select("*")
      .order("record_time", { ascending: false })
      .range(from, to);

    if (mode === "plant") {
      query = query.eq("archive_category", "plant");
    }

    if (mode === "system") {
      query = query.eq("archive_category", "system");
    }

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
    const enrichedItems = await enrichFeedItems(nextItems);

    if (pageIndex === 0) {
      setItems(enrichedItems);
      setExpandedUserIds([]);
    } else {
      setItems((prev) => {
        const merged = [...prev, ...enrichedItems];
        const map = new Map<string, FeedItem>();

        merged.forEach((item) => {
          map.set(item.record_id, item);
        });

        return Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.record_time).getTime() -
            new Date(a.record_time).getTime()
        );
      });
    }

    setHasMore(nextItems.length >= RECORD_BATCH_SIZE);
    setLoading(false);
    loadingRef.current = false;
  }

  function changeFilter(mode: FilterMode) {
    if (mode === filterMode) return;

    setFilterMode(mode);
    setItems([]);
    setPage(0);
    setHasMore(true);
    setExpandedUserIds([]);
    load(0, mode);
  }

  async function runSearch(event?: { preventDefault: () => void }) {
    event?.preventDefault();

    setSearchLoading(true);
    setSearchHasRun(true);

    const regionTerm = searchRegion.trim();
    const nameTerm = sanitizeOrSearchText(searchName);
    const contentTerm = sanitizeOrSearchText(searchContent);
    const [matchedSpeciesIds, matchedTagRecordIds] = await Promise.all([
      nameTerm
        ? findSpeciesIdsByNameTerm(nameTerm)
        : Promise.resolve<string[]>([]),
      contentTerm
        ? findRecordIdsByTagTerm(contentTerm)
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

    let query = supabase
      .from("discovery_feed_view")
      .select("*")
      .order("record_time", { ascending: false })
      .limit(SEARCH_BATCH_SIZE);

    if (searchCategory === "plant") {
      query = query.eq("archive_category", "plant");
    }

    if (searchCategory === "system") {
      query = query.eq("archive_category", "system");
    }

    if (searchHelpOnly) {
      query = query.eq("status_tag", "help");
    }

    if (userFilterIds && userFilterIds.length > 0) {
      query = query.in("user_id", userFilterIds);
    }

    if (nameTerm) {
      const nameFilters = [
        `archive_title.ilike.%${nameTerm}%`,
        `species_name_snapshot.ilike.%${nameTerm}%`,
      ];

      if (matchedSpeciesIds.length > 0) {
        nameFilters.push(`species_id.in.(${matchedSpeciesIds.join(",")})`);
      }

      query = query.or(nameFilters.join(","));
    }

    if (contentTerm) {
      const contentFilters = [`note.ilike.%${contentTerm}%`];

      if (matchedTagRecordIds.length > 0) {
        contentFilters.push(`record_id.in.(${matchedTagRecordIds.join(",")})`);
      }

      query = query.or(contentFilters.join(","));
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

  function openSearchWindow() {
    setSearchOpen(true);

    if (!searchHasRun) {
      runSearch();
    }
  }

  function resetSearchFilters() {
    setSearchRegion("");
    setSearchCategory("all");
    setSearchName("");
    setSearchContent("");
    setSearchHelpOnly(false);
    setSearchResults([]);
    setSearchHasRun(false);
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

  const activeFilterLabel =
    filterOptions.find((item) => item.value === filterMode)?.label || "全部";

  return (
    <main
      style={{
        padding: 14,
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1f2d1f" }}>
              耕作星球
            </div>
            <div style={{ fontSize: 13, color: "#6f7f6f", marginTop: 4 }}>
              看看大家都在种什么
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openSearchWindow}
          style={{
            width: "100%",
            display: "block",
            textAlign: "left",
            color: "#6f7f6f",
            background: "#fff",
            border: "1px solid #e6ece3",
            borderRadius: 999,
            padding: "10px 14px",
            fontSize: 14,
            boxShadow: "0 1px 8px rgba(0,0,0,0.03)",
            cursor: "pointer",
          }}
        >
          🔍 搜索地区、种类、名称、内容、标签或求助记录
        </button>
      </header>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {filterOptions.map((option) => {
          const active = filterMode === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => changeFilter(option.value)}
              style={{
                padding: "8px 13px",
                borderRadius: 999,
                border: active ? "1px solid #8bc58b" : "1px solid #e2e8df",
                background: active ? "#f0fff4" : "#fff",
                color: active ? "#2e7d32" : "#314131",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontSize: 13,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {sections.map((section) => {
        const isSectionExpanded = expandedUserIds.includes(section.user_id);
        const visibleRecords = isSectionExpanded
          ? section.records
          : section.records.slice(0, 2);
        const hiddenCount = Math.max(section.records.length - 2, 0);

        return (
          <section
            key={section.user_id}
            style={{
              marginBottom: 10,
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e8eee5",
              overflow: "hidden",
              boxShadow: "0 1px 8px rgba(0,0,0,0.025)",
            }}
          >
            <button
              type="button"
              onClick={() => goUser(section.user_id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "none",
                borderBottom: "1px solid #f1f4ef",
                background: "#fff",
                padding: "9px 10px",
                cursor: "pointer",
                color: "#1f2d1f",
                textAlign: "left",
                minWidth: 0,
              }}
            >
              {section.avatar_url ? (
                <img
                  src={section.avatar_url}
                  alt={section.username}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "#f0f6ee",
                    color: "#4c6f4c",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {(section.username || "用").slice(0, 1)}
                </span>
              )}

              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  minWidth: 0,
                  fontSize: 12,
                  color: "#8a998a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1f2d1f",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 150,
                  }}
                >
                  {section.username || "用户"}
                </span>
                {section.user_location ? (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    · {section.user_location}
                  </span>
                ) : null}
                <span>· 更新 {formatDate(section.latest_time)}</span>
              </span>
            </button>

            <div style={{ padding: "2px 10px 6px 10px" }}>
              {visibleRecords.map((record, index) => {
                const isHelp = record.status_tag === "help";

                return (
                  <a
                    key={record.record_id}
                    href={`/archive/${record.archive_id}?record=${record.record_id}`}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      color: "#1f2d1f",
                      borderTop: index === 0 ? "none" : "1px solid #f0f2ef",
                      padding: "8px 0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                      }}
                    >
                      {record.primary_image_url ? (
                        <img
                          src={record.primary_image_url}
                          alt={record.archive_title || "record image"}
                          style={{
                            width: 54,
                            height: 54,
                            objectFit: "cover",
                            borderRadius: 9,
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 54,
                            height: 54,
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

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            minWidth: 0,
                            marginBottom: 3,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color:
                                record.archive_category === "system"
                                  ? "#7a6a2a"
                                  : "#2e7d32",
                              background:
                                record.archive_category === "system"
                                  ? "#fff9e8"
                                  : "#f0fff4",
                              border:
                                record.archive_category === "system"
                                  ? "1px solid #eadca8"
                                  : "1px solid #cae9ca",
                              borderRadius: 999,
                              padding: "1px 6px",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {categoryLabel(record.archive_category)}
                          </span>

                          {isHelp && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#8a4a4a",
                                background: "#fff7f7",
                                border: "1px solid #e6c9c9",
                                borderRadius: 999,
                                padding: "1px 6px",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              求助
                            </span>
                          )}

                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                          >
                            {record.archive_title}
                          </span>

                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 11,
                              color: "#9aa59a",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {formatDate(record.record_time)}
                          </span>
                        </div>

                        {record.note ? (
                          <div
                            style={{
                              fontSize: 13,
                              lineHeight: 1.45,
                              color: "#3f4f3f",
                              wordBreak: "break-word",
                            }}
                          >
                            {shortText(record.note, 66)}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#9aa59a" }}>
                            这条记录没有文字内容
                          </div>
                        )}

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                            marginTop: 4,
                            fontSize: 11,
                            color: "#9aa59a",
                          }}
                        >
                          {record.species_name_snapshot ? (
                            <span style={{ color: "#4CAF50" }}>
                              {record.species_name_snapshot}
                            </span>
                          ) : null}

                          {Array.isArray(record.display_tags) &&
                            record.display_tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                onClick={(e) => {
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
                                }}
                                style={{
                                  padding: "1px 5px",
                                  borderRadius: 999,
                                  border: "1px solid #e2e8df",
                                  background: "#fafafa",
                                  color: "#4CAF50",
                                  cursor: "pointer",
                                }}
                              >
                                {getBehaviorTagLabel(tag)}
                              </span>
                            ))}

                          <span style={{ marginLeft: "auto" }}>
                            {typeof record.media_count === "number" &&
                            record.media_count > 0
                              ? `${record.media_count} 图`
                              : ""}
                            {typeof record.comment_count === "number" &&
                            record.comment_count > 0
                              ? `${record.media_count > 0 ? " · " : ""}${record.comment_count} 评论`
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => toggleUserSection(section.user_id)}
                  style={{
                    width: "100%",
                    border: "none",
                    borderTop: "1px solid #f0f2ef",
                    background: "transparent",
                    color: "#4CAF50",
                    cursor: "pointer",
                    padding: "7px 0 3px 0",
                    fontSize: 12,
                    textAlign: "center",
                  }}
                >
                  {isSectionExpanded
                    ? "收起"
                    : `还有 ${hiddenCount} 条记录，展开`}
                </button>
              )}
            </div>
          </section>
        );
      })}

      {!loading && sections.length === 0 && (
        <div
          style={{
            padding: "34px 16px",
            textAlign: "center",
            color: "#768476",
            fontSize: 14,
            background: "#fff",
            border: "1px solid #edf2ea",
            borderRadius: 16,
          }}
        >
          {filterMode === "help"
            ? "暂时没有公开的求助记录"
            : `还没有${activeFilterLabel === "全部" ? "" : activeFilterLabel}公开项目记录`}
          <div style={{ marginTop: 8, fontSize: 12, color: "#9aa59a" }}>
            当用户主动公开项目和记录后，会出现在这里。
          </div>
        </div>
      )}

      {searchOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(31,45,31,0.28)",
            padding: 12,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            overflowY: "auto",
          }}
          onClick={() => setSearchOpen(false)}
        >
          <section
            style={{
              width: "100%",
              maxWidth: 760,
              marginTop: 18,
              marginBottom: 32,
              background: "#f8fbf6",
              borderRadius: 18,
              border: "1px solid #dfe8dc",
              boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "13px 14px",
                borderBottom: "1px solid #e5ece2",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#1f2d1f" }}>
                  搜索公开记录
                </div>
                <div style={{ fontSize: 12, color: "#7f8f7f", marginTop: 2 }}>
                  按记录展开，不按用户合并
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                style={{
                  border: "1px solid #e2e8df",
                  background: "#fff",
                  color: "#4a5a4a",
                  borderRadius: 999,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                关闭
              </button>
            </div>

            <form
              onSubmit={runSearch}
              style={{
                padding: 12,
                borderBottom: "1px solid #e5ece2",
                background: "#fbfdf9",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                  gap: 8,
                }}
              >
                <label style={{ fontSize: 12, color: "#6f7f6f" }}>
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

                <label style={{ fontSize: 12, color: "#6f7f6f" }}>
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
                    <option value="plant">植物</option>
                    <option value="system">配套设施</option>
                  </select>
                </label>

                <label style={{ fontSize: 12, color: "#6f7f6f" }}>
                  名称
                  <input
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    placeholder="项目名 / 植物名 / 别名"
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

                <label style={{ fontSize: 12, color: "#6f7f6f" }}>
                  内容 / 标签
                  <input
                    value={searchContent}
                    onChange={(e) => setSearchContent(e.target.value)}
                    placeholder="记录内容或标签"
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
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 10,
                  fontSize: 12,
                  color: "#7a8a7a",
                }}
              >
                <span style={{ flexShrink: 0 }}>常用：</span>
                {commonSearchTags.map((tag) => {
                  const active = searchContent.trim() === tag;

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSearchContent(tag)}
                      style={{
                        border: active
                          ? "1px solid #8bc58b"
                          : "1px solid #e1e8dd",
                        background: active ? "#f0fff4" : "#fff",
                        color: active ? "#2e7d32" : "#4d5d4d",
                        borderRadius: 999,
                        padding: "4px 8px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
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
                  ! 求助
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

            <div style={{ padding: 12 }}>
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
                <span>全量公开记录流</span>
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
                        background: "#fff",
                        border: "1px solid #e8eee5",
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

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              marginBottom: 4,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                color:
                                  record.archive_category === "system"
                                    ? "#7a6a2a"
                                    : "#2e7d32",
                                background:
                                  record.archive_category === "system"
                                    ? "#fff9e8"
                                    : "#f0fff4",
                                border:
                                  record.archive_category === "system"
                                    ? "1px solid #eadca8"
                                    : "1px solid #cae9ca",
                                borderRadius: 999,
                                padding: "1px 6px",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              {categoryLabel(record.archive_category)}
                            </span>

                            {isHelp && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#8a4a4a",
                                  background: "#fff7f7",
                                  border: "1px solid #e6c9c9",
                                  borderRadius: 999,
                                  padding: "1px 6px",
                                  whiteSpace: "nowrap",
                                  flexShrink: 0,
                                }}
                              >
                                求助
                              </span>
                            )}

                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                              }}
                            >
                              {record.archive_title}
                            </span>

                            <span
                              style={{
                                marginLeft: "auto",
                                fontSize: 11,
                                color: "#9aa59a",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              {formatDate(record.record_time)}
                            </span>
                          </div>

                          <div
                            style={{
                              fontSize: 13,
                              color: "#3f4f3f",
                              lineHeight: 1.45,
                              wordBreak: "break-word",
                            }}
                          >
                            {record.note
                              ? shortText(record.note, 96)
                              : "这条记录没有文字内容"}
                          </div>

                          <div
                            style={{
                              marginTop: 5,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexWrap: "wrap",
                              fontSize: 11,
                              color: "#9aa59a",
                            }}
                          >
                            <span>{record.username || "用户"}</span>
                            {record.user_location ? (
                              <span>· {record.user_location}</span>
                            ) : null}
                            {record.species_name_snapshot ? (
                              <span style={{ color: "#4CAF50" }}>
                                · {record.species_name_snapshot}
                              </span>
                            ) : null}

                            {Array.isArray(record.display_tags) &&
                              record.display_tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  style={{
                                    padding: "1px 5px",
                                    borderRadius: 999,
                                    border: "1px solid #e2e8df",
                                    background: "#fafafa",
                                    color: "#4CAF50",
                                  }}
                                >
                                  {getBehaviorTagLabel(tag)}
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      <div ref={loaderRef} style={{ height: 44, textAlign: "center" }}>
        {loading ? (
          <span style={{ color: "#8a998a", fontSize: 13 }}>加载中...</span>
        ) : hasMore ? (
          ""
        ) : sections.length > 0 ? (
          <span style={{ color: "#aaa", fontSize: 12 }}>没有更多了</span>
        ) : (
          ""
        )}
      </div>
    </main>
  );
}
