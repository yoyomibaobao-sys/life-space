"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Category = "all" | "plant" | "system";

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("zh-CN");
}

function categoryLabel(category?: string | null) {
  if (category === "system") return "配套设施";
  return "种植";
}

function getMediaUrl(media: any) {
  return media?.file_url || media?.url || media?.path || "";
}

export default function UserSpacePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [username, setUsername] = useState("");
  const [archives, setArchives] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [subTags, setSubTags] = useState<any[]>([]);
  const [groupTags, setGroupTags] = useState<any[]>([]);

  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);

  const [isFollowing, setIsFollowing] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [cardProfile, setCardProfile] = useState<any>(null);

  const loadingRef = useRef(false);

  async function loadData() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const { data: profile } = await supabase
        .from("profiles")
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

      const safeArchives = archivesData || [];
      setArchives(safeArchives);

      const [{ data: subTagsData }, { data: groupTagsData }] = await Promise.all([
        supabase
          .from("sub_tags")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase.rpc("get_public_user_space_group_tags", {
          p_user_id: userId,
        }),
      ]);

      setSubTags(subTagsData || []);
      setGroupTags(groupTagsData || []);

      const archiveIds = safeArchives.map((a) => a.id);

      if (archiveIds.length === 0) {
        setRecords([]);
        return;
      }

      const { data: recs } = await supabase
        .from("records")
        .select("*, media(*)")
        .in("archive_id", archiveIds)
        .eq("visibility", "public")
        .order("record_time", { ascending: false });

      setRecords(recs || []);
    } finally {
      loadingRef.current = false;
    }
  }

  async function openCard() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const { count: followingCount } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId);

    const { count: followerCount } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId);

    setCardProfile({
      ...data,
      followingCount,
      followerCount,
    });

    if (user) {
      const { data: follow } = await supabase
        .from("follows")
        .select("*")
        .eq("follower_id", user.id)
        .eq("following_id", userId)
        .maybeSingle();

      setIsFollowing(!!follow);
    } else {
      setIsFollowing(false);
    }

    setShowCard(true);
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
    const map: Record<string, any> = {};

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

      if (record.primary_image_url) {
        map[record.archive_id] = record.primary_image_url;
        return;
      }

      if (record.media?.length > 0) {
        const url = getMediaUrl(record.media[0]);
        if (url) map[record.archive_id] = url;
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

  function selectSubTag(tag: any) {
    setActiveCategory(tag.category === "system" ? "system" : "plant");
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

          <button
            type="button"
            onClick={openCard}
            style={{
              border: "1px solid #dce8d8",
              background: "#f5faf3",
              color: "#4f7b45",
              borderRadius: 999,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            名片
          </button>
        </div>

        <Link
          href="/discover"
          style={{
            color: "#6b7b66",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          去发现 →
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

          <div style={categoryGroupStyle}>
            <button
              type="button"
              onClick={() => selectCategory("plant")}
              style={mainFilterStyle(activeCategory === "plant" && !activeSubTag)}
            >
              种植：
            </button>

            {visibleSubTags
              .filter((tag) => tag.category === "plant")
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

          <div style={categoryGroupStyle}>
            <button
              type="button"
              onClick={() => selectCategory("system")}
              style={mainFilterStyle(activeCategory === "system" && !activeSubTag)}
            >
              配套设施：
            </button>

            {visibleSubTags
              .filter((tag) => tag.category === "system")
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
            这里暂时没有公开项目。
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

            const metaItems = [
              subTagName,
              groupTagName,
              `共 ${stat?.count || archive.record_count || 0} 条记录`,
              `浏览 ${archive.view_count || 0} 次`,
            ].filter(Boolean);

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
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : archive.category === "system" ? (
                    "🛠"
                  ) : (
                    "🌱"
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
                    {latest?.note || "这个项目还没有公开记录"}
                    {latest?.record_time ? (
                      <span style={{ color: "#9a9f94" }}>
                        {" "}
                        · 更新 {formatDate(latest.record_time)}
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
                    {metaItems.join(" · ")}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {showCard && cardProfile && (
        <div
          onClick={() => setShowCard(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.36)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 280,
              background: "#fff",
              borderRadius: 18,
              padding: 22,
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            }}
          >
            {cardProfile.avatar_url ? (
              <img
                src={cardProfile.avatar_url}
                alt=""
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "#edf5e8",
                  color: "#6f8f62",
                  margin: "0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}
              >
                🌱
              </div>
            )}

            <div style={{ marginTop: 12, fontWeight: 650 }}>
              {cardProfile.username || "未设置用户名"}
            </div>

            <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
              Lv.{cardProfile.level || 1} · 🌸 {cardProfile.flower_count || 0}
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
              关注 {cardProfile.followingCount || 0} · 粉丝{" "}
              {cardProfile.followerCount || 0}
            </div>

            <button
              type="button"
              onClick={async () => {
                const {
                  data: { user },
                } = await supabase.auth.getUser();

                if (!user) {
                  router.push("/login");
                  return;
                }

                if (isFollowing) {
                  await supabase
                    .from("follows")
                    .delete()
                    .eq("follower_id", user.id)
                    .eq("following_id", userId);

                  setIsFollowing(false);
                } else {
                  await supabase.from("follows").insert([
                    {
                      follower_id: user.id,
                      following_id: userId,
                    },
                  ]);

                  setIsFollowing(true);
                }
              }}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                background: isFollowing ? "#f2f2f2" : "#4f7b45",
                color: isFollowing ? "#333" : "#fff",
                borderRadius: 999,
                cursor: "pointer",
                border: "none",
                fontSize: 14,
              }}
            >
              {isFollowing ? "已关注" : "关注"}
            </button>

            <div
              onClick={() => setShowCard(false)}
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "#999",
                cursor: "pointer",
              }}
            >
              关闭
            </div>
          </div>
        </div>
      )}
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
