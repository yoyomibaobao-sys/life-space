"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";
import { type MediaItem } from "@/lib/domain-types";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import {
  type ArchiveCategory,
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";

type Category = "all" | ArchiveCategory;

type UserSpaceArchive = {
  id: string;
  title: string | null;
  category: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
  sub_tag_id: string | null;
  group_tag_id: string | null;
  status: string | null;
  record_count: number | null;
  view_count: number | null;
};

type UserSpaceRecord = {
  id: string;
  archive_id: string;
  note: string | null;
  record_time: string;
  primary_image_url: string | null;
  display_primary_image_url?: string | null;
  status?: string | null;
  status_tag?: string | null;
  media?: MediaItem[];
};

type UserSpaceSubTag = {
  id: string;
  name: string | null;
  category: string | null;
};

type UserSpaceGroupTag = {
  id: string;
  name: string | null;
  sub_tag_id: string | null;
};

type ArchiveFollowIdRow = {
  archive_id: string;
};

type UserSpaceArchiveStats = {
  count: number;
  latest: UserSpaceRecord;
  hasHelp: boolean;
};

function categoryLabel(category?: string | null) {
  return getArchiveCategoryLabel(category);
}

function getMediaUrl(media?: MediaItem | null) {
  return media?.display_url || "";
}

function getMediaPreviewUrl(media?: MediaItem | null) {
  return media?.display_thumb_url || getMediaUrl(media);
}

export default function UserSpacePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [username, setUsername] = useState("");
  const [archives, setArchives] = useState<UserSpaceArchive[]>([]);
  const [records, setRecords] = useState<UserSpaceRecord[]>([]);
  const [subTags, setSubTags] = useState<UserSpaceSubTag[]>([]);
  const [groupTags, setGroupTags] = useState<UserSpaceGroupTag[]>([]);

  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);

  const [followedArchiveIds, setFollowedArchiveIds] = useState<string[]>([]);

  const loadingRef = useRef(false);

  async function loadData() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const { data: profile } = await supabase
        .from("public_profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

      setUsername(profile?.username || "");

      const { data: archivesData } = await supabase
        .from("archives")
        .select("*")
        .eq("user_id", userId)
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      const safeArchives = (archivesData || []) as UserSpaceArchive[];
      setArchives(safeArchives);

      const archiveIds = safeArchives.map((a) => a.id);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [subTagResult, groupTagResult, recordsResult, followsResult] =
        await Promise.all([
          supabase
            .from("sub_tags")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true }),
          supabase.rpc("get_public_user_space_group_tags", {
            p_user_id: userId,
          }),
          archiveIds.length === 0
            ? Promise.resolve({ data: [] as UserSpaceRecord[] })
            : supabase
                .from("records")
                .select("*, media(*)")
                .in("archive_id", archiveIds)
                .eq("visibility", "public")
                .order("record_time", { ascending: false }),
          user?.id && archiveIds.length > 0
            ? supabase
                .from("archive_follows")
                .select("archive_id")
                .eq("user_id", user.id)
                .in("archive_id", archiveIds)
            : Promise.resolve({ data: [] as ArchiveFollowIdRow[] }),
        ]);

      setSubTags((subTagResult.data || []) as UserSpaceSubTag[]);
      setGroupTags((groupTagResult.data || []) as UserSpaceGroupTag[]);
      setRecords(
        await attachRecordMediaDisplayUrls(
          (recordsResult.data || []) as UserSpaceRecord[]
        )
      );
      setFollowedArchiveIds(
        ((followsResult.data || []) as ArchiveFollowIdRow[]).map(
          (row) => row.archive_id
        )
      );
    } finally {
      loadingRef.current = false;
    }
  }

  async function attachRecordMediaDisplayUrls(
    nextRecords: UserSpaceRecord[]
  ): Promise<UserSpaceRecord[]> {
    const allMedia = nextRecords.flatMap((record) => record.media || []);
    const primarySourceCount = nextRecords.length;
    const displayPairs = await resolveMediaDisplayPairs(supabase, [
      ...nextRecords.map((record) => ({ url: record.primary_image_url })),
      ...allMedia,
    ]);
    const primaryPairs = displayPairs.slice(0, primarySourceCount);
    const displayMedia = allMedia.map((media, index) => ({
      ...media,
      ...displayPairs[primarySourceCount + index],
    }));
    const recordsWithDisplayPrimary = nextRecords.map((record, index) => ({
      ...record,
      display_primary_image_url:
        primaryPairs[index]?.display_url || null,
    }));

    let mediaIndex = 0;

    return recordsWithDisplayPrimary.map((record) => {
      const mediaCount = record.media?.length || 0;
      const media = displayMedia.slice(mediaIndex, mediaIndex + mediaCount);
      mediaIndex += mediaCount;
      return { ...record, media };
    });
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const publicArchiveIds = useMemo(
    () => new Set(archives.map((a) => a.id)),
    [archives]
  );

  const visibleSubTags = useMemo(() => {
    return subTags.filter((tag) =>
      archives.some((archive) => archive.sub_tag_id === tag.id)
    );
  }, [archives, subTags]);

  const visibleGroupTags = useMemo(() => {
    if (!activeSubTag) return [];

    return groupTags.filter((tag) => {
      if (tag.sub_tag_id !== activeSubTag) return false;

      return archives.some(
        (archive) =>
          archive.sub_tag_id === activeSubTag &&
          archive.group_tag_id === tag.id &&
          publicArchiveIds.has(archive.id)
      );
    });
  }, [activeSubTag, archives, groupTags, publicArchiveIds]);

  const statsMap = useMemo(() => {
    const map: Record<string, UserSpaceArchiveStats> = {};

    records.forEach((record) => {
      if (!map[record.archive_id]) {
        map[record.archive_id] = {
          count: 0,
          latest: record,
          hasHelp: false,
        };
      }

      map[record.archive_id].count += 1;

      if (record.status_tag === "help" || record.status === "help") {
        map[record.archive_id].hasHelp = true;
      }

      if (
        new Date(record.record_time).getTime() >
        new Date(map[record.archive_id].latest.record_time).getTime()
      ) {
        map[record.archive_id].latest = record;
      }
    });

    return map;
  }, [records]);

  const coverMap = useMemo(() => {
    const map: Record<string, string> = {};

    records.forEach((record) => {
      if (map[record.archive_id]) return;

      const media = record.media || [];
      if (media.length > 0) {
        const primaryMedia = media.find(
          (media) => media.url && record.primary_image_url && media.url === record.primary_image_url
        );
        const previewUrl = getMediaPreviewUrl(primaryMedia || media[0]);
        if (previewUrl) {
          map[record.archive_id] = previewUrl;
          return;
        }
      }

      if (record.display_primary_image_url) {
        map[record.archive_id] = record.display_primary_image_url;
      }
    });

    return map;
  }, [records]);

  const filteredArchives = useMemo(() => {
    return archives.filter((archive) => {
      if (activeCategory !== "all" && archive.category !== activeCategory) {
        return false;
      }

      if (activeSubTag && archive.sub_tag_id !== activeSubTag) {
        return false;
      }

      if (activeGroupTag && archive.group_tag_id !== activeGroupTag) {
        return false;
      }

      return true;
    });
  }, [archives, activeCategory, activeSubTag, activeGroupTag]);

  function selectCategory(category: Category) {
    setActiveCategory(category);
    setActiveSubTag(null);
    setActiveGroupTag(null);
  }

  function selectSubTag(tag: UserSpaceSubTag) {
    setActiveCategory((tag.category || "plant") as ArchiveCategory);
    setActiveSubTag(tag.id);
    setActiveGroupTag(null);
  }

  function selectGroupTag(tagId: string) {
    setActiveGroupTag((current) => (current === tagId ? null : tagId));
  }

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "20px 16px 48px",
      }}
    >
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              color: "#1f2a1f",
              fontWeight: 650,
            }}
          >
            {username ? `${username} · 空间` : "用户空间"}
          </h1>

          <Link
            href={`/user/${userId}/profile`}
            style={{
              border: "1px solid #dce8d8",
              background: "#f5faf3",
              color: "#4f7b45",
              borderRadius: 999,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            用户资料
          </Link>
        </div>

        <Link
          href="/discover"
          style={{
            color: "#6b7b66",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          <UiIcon name="arrow-left" size={15} /> 返回发现
        </Link>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #edf1e8",
          borderRadius: 16,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            rowGap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => selectCategory("all")}
            style={mainFilterStyle(activeCategory === "all")}
          >
            全部
          </button>

          {[
            "plant",
            "system",
            "insect_fish",
            "other",
          ].map((category) => (
            <div key={category} style={categoryGroupStyle}>
              <button
                type="button"
                onClick={() => selectCategory(category as ArchiveCategory)}
                style={mainFilterStyle(
                  activeCategory === category && !activeSubTag
                )}
              >
                {categoryLabel(category)}：
              </button>

              {visibleSubTags
                .filter((tag) => tag.category === category)
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => selectSubTag(tag)}
                    style={subFilterStyle(activeSubTag === tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
            </div>
          ))}
        </div>

        {activeSubTag && visibleGroupTags.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px dashed #edf1e8",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveGroupTag(null)}
              style={{
                border: "none",
                background: "transparent",
                color: activeGroupTag ? "#4f7b45" : "#777",
                fontSize: 14,
                cursor: "pointer",
                padding: 0,
              }}
            >
              分组：
            </button>

            {visibleGroupTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => selectGroupTag(tag.id)}
                style={groupFilterStyle(activeGroupTag === tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        {filteredArchives.length === 0 ? (
          <div
            style={{
              border: "1px solid #edf1e8",
              borderRadius: 16,
              padding: 28,
              textAlign: "center",
              color: "#8b9487",
              background: "#fff",
            }}
          >
            还没有公开项目
          </div>
        ) : (
          filteredArchives.map((archive) => {
            const stat = statsMap[archive.id];
            const latest = stat?.latest;
            const cover = coverMap[archive.id];
            const subTagName =
              subTags.find((tag) => tag.id === archive.sub_tag_id)?.name ||
              "未细分";
            const groupTagName =
              groupTags.find((tag) => tag.id === archive.group_tag_id)?.name ||
              "";
            const isEnded = archive.status === "ended";
            const hasHelp = stat?.hasHelp;

            const metaItems = [subTagName, groupTagName].filter(Boolean);

            return (
              <article
                key={archive.id}
                onClick={() => router.push(`/archive/${archive.id}`)}
                style={{
                  display: "flex",
                  gap: 12,
                  border: "1px solid #e4eadf",
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 12,
                  background: isEnded ? "#fbfbf8" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    flex: "0 0 96px",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9aaa9a",
                    fontSize: 28,
                  }}
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <UiIcon name={getArchiveCategoryIcon(archive.category)} size={22} />
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 96,
                    display: "grid",
                    gridTemplateRows: "1fr 1fr 1fr",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <span style={typeBadgeStyle}>{categoryLabel(archive.category)}</span>

                    {hasHelp && <span style={helpBadgeStyle}>求助</span>}

                    {isEnded && <span style={endedBadgeStyle}>已结束</span>}

                    {followedArchiveIds.includes(archive.id) && (
                      <span style={followedBadgeStyle}>已关注</span>
                    )}

                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: 650,
                        color: "#263326",
                      }}
                    >
                      {archive.title} · {archive.system_name || archive.species_name_snapshot || "未填写"}
                    </span>
                  </div>

                  <div
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#5f6b5c",
                      fontSize: 14,
                    }}
                  >
                    {latest?.note || "还没有公开记录"}
                    {latest?.record_time ? (
                      <span style={{ color: "#9a9f94" }}>
                        <span aria-hidden="true"> · </span>
                        <CompactActivityTime value={latest.record_time} />
                      </span>
                    ) : null}
                  </div>

                  <div
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#90998c",
                      fontSize: 13,
                    }}
                  >
                    {metaItems.length ? `${metaItems.join(" · ")} · ` : null}
                    <ProjectMetaLine
                      recordCount={stat?.count || archive.record_count || 0}
                      viewCount={archive.view_count || 0}
                    />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}

const categoryGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

function mainFilterStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid #b9d5ae" : "1px solid transparent",
    background: active ? "#edf6e9" : "transparent",
    color: active ? "#3f7d3d" : "#3d463b",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: active ? 650 : 550,
  };
}

function subFilterStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid #4f8f46" : "1px solid #e1e9dc",
    background: active ? "#4f8f46" : "#f7faf5",
    color: active ? "#fff" : "#4f5d4a",
    borderRadius: 999,
    padding: "5px 10px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 650 : 450,
  };
}

function groupFilterStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid #6b8f62" : "1px solid #e4eadf",
    background: active ? "#eef6ea" : "#fff",
    color: active ? "#3f7d3d" : "#596456",
    borderRadius: 999,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 650 : 450,
  };
}

const typeBadgeStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#eef5e8",
  color: "#4f7b45",
  fontSize: 12,
  fontWeight: 600,
};

const helpBadgeStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#fff4e8",
  color: "#a76524",
  fontSize: 12,
  fontWeight: 650,
};

const endedBadgeStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#f0f0ec",
  color: "#77756b",
  fontSize: 12,
  fontWeight: 550,
};

const followedBadgeStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#eef4ff",
  color: "#4b6bb0",
  fontSize: 12,
  fontWeight: 600,
};
