"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getBehaviorTagLabel } from "@/lib/tag-labels";

const RECORD_BATCH_SIZE = 80;

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

function DefaultUserAvatar({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #edf7e8 0%, #dfeedd 100%)",
        color: "#3f7d3d",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(15, Math.round(size * 0.55)),
        flexShrink: 0,
        border: "1px solid #dbe8d5",
      }}
    >
      🌱
    </span>
  );
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

function ProjectNameLine({
  record,
  fontSize = 15,
  marginBottom = 6,
}: {
  record: FeedItem;
  fontSize?: number;
  marginBottom?: number;
}) {
  const archiveUserTitle = getArchiveUserTitle(record);
  const archiveSystemName = getArchiveSystemName(record);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
        marginBottom,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight: 700,
          color: "#1f2d1f",
          lineHeight: 1.35,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          flex: "1 1 auto",
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
          fontSize: Math.max(12, fontSize - 2),
        }}
      >
        ·
      </span>

      <span
        style={{
          color: record.archive_category === "system" ? "#8a742d" : "#5f7f58",
          background: record.archive_category === "system" ? "#fffaf0" : "#f5f9f2",
          border:
            record.archive_category === "system"
              ? "1px solid #eadfba"
              : "1px solid #e3eadf",
          borderRadius: 999,
          padding: "1px 7px",
          fontSize: Math.max(11, fontSize - 3),
          lineHeight: 1.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          maxWidth: "42%",
          flex: "0 1 auto",
        }}
        title={archiveSystemName}
      >
        {archiveSystemName}
      </span>
    </div>
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
        total_project_count: orderedRecords.length,
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

  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const sections = useMemo(() => buildUserSections(items), [items]);
  const helpStreamItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(b.record_time).getTime() -
          new Date(a.record_time).getTime()
      ),
    [items]
  );

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
              发现大家的种植故事
            </div>
            <div style={{ fontSize: 13, color: "#6f7f6f", marginTop: 4 }}>
              看看不同环境下，植物如何被照顾、等待，也慢慢生长。
            </div>
          </div>
        </div>

        <a
          href="/discover/search"
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
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          🔍 搜索地区、种类、名称、内容、标签或求助记录
        </a>
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

      {filterMode === "help" ? (
        <div>
          {helpStreamItems.map((record) => {
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
                        background: "#f5f8f4",
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
          })}
        </div>
      ) : (
        <>
      {sections.map((section) => {
        const isSectionExpanded = expandedUserIds.includes(section.user_id);
        const visibleRecords = isSectionExpanded
          ? section.records
          : section.records.slice(0, 2);
        const hiddenCount = Math.max(section.records.length - 2, 0);
        const hasMoreProjectsInSpace = section.total_project_count > 4;

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
                <DefaultUserAvatar />
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
                      padding: isHelp ? "10px 8px" : "10px 0",
                      background: isHelp
                        ? "linear-gradient(90deg, #fffaf6 0%, rgba(255,250,246,0.25) 100%)"
                        : "transparent",
                      borderRadius: isHelp ? 10 : 0,
                      boxShadow: isHelp
                        ? "inset 0 0 0 1px #f0ddd4"
                        : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      {record.primary_image_url ? (
                        <img
                          src={record.primary_image_url}
                          alt={record.archive_title || "record image"}
                          style={{
                            width: 62,
                            height: 62,
                            objectFit: "cover",
                            borderRadius: 11,
                            flexShrink: 0,
                            background: "#f5f8f4",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 62,
                            height: 62,
                            borderRadius: 11,
                            flexShrink: 0,
                            background:
                              record.archive_category === "system"
                                ? "#fff9e8"
                                : "#f4f9f1",
                            color:
                              record.archive_category === "system"
                                ? "#9a7d2f"
                                : "#5f8f55",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 22,
                            border:
                              record.archive_category === "system"
                                ? "1px solid #efe1af"
                                : "1px solid #dfeadb",
                          }}
                        >
                          {record.archive_category === "system" ? "🛠" : "🌿"}
                        </div>
                      )}

                      <ProjectCardRows
                        record={record}
                        imageHeight={62}
                        titleFontSize={15}
                        noteMaxLength={88}
                        enableTagLinks
                      />
                    </div>
                  </a>
                );
              })}

              {isSectionExpanded && hasMoreProjectsInSpace && (
                <div
                  style={{
                    borderTop: "1px solid #f0f2ef",
                    padding: "10px 0 8px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      color: "#8a998a",
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    这里只展示最近 4 个种植项目，更多内容可以进入他的空间慢慢看。
                  </span>

                  <button
                    type="button"
                    onClick={() => goUser(section.user_id)}
                    style={{
                      border: "1px solid #d9e6d0",
                      background: "#eef5e8",
                      color: "#496b3f",
                      borderRadius: 999,
                      padding: "5px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    进入他的空间
                  </button>
                </div>
              )}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => toggleUserSection(section.user_id)}
                  style={{
                    width: "100%",
                    border: "none",
                    borderTop:
                      isSectionExpanded && hasMoreProjectsInSpace
                        ? "none"
                        : "1px solid #f0f2ef",
                    background: "transparent",
                    color: "#4CAF50",
                    cursor: "pointer",
                    padding: "7px 0 3px 0",
                    fontSize: 12,
                    textAlign: "center",
                  }}
                >
                  {isSectionExpanded
                    ? "收起 ▲"
                    : `展开更多 ${hiddenCount} 个项目 ▼`}
                </button>
              )}
            </div>
          </section>
        );
      })}

        </>
      )}
      {!loading &&
        (filterMode === "help"
          ? helpStreamItems.length === 0
          : sections.length === 0) && (
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

      <div ref={loaderRef} style={{ height: 44, textAlign: "center" }}>
        {loading ? (
          <span style={{ color: "#8a998a", fontSize: 13 }}>加载中...</span>
        ) : hasMore ? (
          ""
        ) : filterMode === "help" ? (
          helpStreamItems.length > 0 ? (
            <span style={{ color: "#aaa", fontSize: 12 }}>没有更多了</span>
          ) : (
            ""
          )
        ) : sections.length > 0 ? (
          <span style={{ color: "#aaa", fontSize: 12 }}>没有更多了</span>
        ) : (
          ""
        )}
      </div>
    </main>
  );
}
