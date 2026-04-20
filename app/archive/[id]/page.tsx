"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AddRecord from "./AddRecord";
import DeleteRecordButton from "./DeleteRecordButton";
import EditRecord from "@/components/EditRecord";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStatusTagLabel, getBehaviorTagLabel } from "@/lib/tag-labels";
import TagList from "@/components/TagList";
import { showToast } from "@/components/Toast";
export default function ArchiveDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  if (id === "new") {
    return null;
  }

  return <Content id={id} />;
}

function Content({ id }: { id: string }) {
  const [archive, setArchive] = useState<any>(null);
  const [species, setSpecies] = useState<any>(null);
  const [tempRange, setTempRange] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [username, setUsername] = useState("用户");
  const [sameTagCounts, setSameTagCounts] = useState<Record<string, number>>({});

  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");

  const startTime =
    records.length > 0
      ? records[records.length - 1].record_time
      : archive?.created_at;

  function getDayNumber(start: string, current: string) {
    const startDate = new Date(start).getTime();
    const currentDate = new Date(current).getTime();
    const diff = currentDate - startDate;
    return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  }

  useEffect(() => {
    async function getMe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setMe(session?.user?.id ?? null);
    }

    getMe();
  }, []);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUserId = session?.user?.id ?? null;
      setMe(currentUserId);

      const { data: archiveData } = await supabase
        .from("archives")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!archiveData) return;

      const isOwnerView = currentUserId === archiveData.user_id;

      setArchive(archiveData);

      if (!archiveData.is_public && !isOwnerView) {
        setRecords([]);
        return;
      }

      if (archiveData.species_id) {
        const { data: speciesData } = await supabase
          .from("plant_species")
          .select("*")
          .eq("id", archiveData.species_id)
          .maybeSingle();

        setSpecies(speciesData);

        const { data: tempData } = await supabase
          .from("plant_temperature_ranges")
          .select("*")
          .eq("species_id", archiveData.species_id)
          .maybeSingle();

        setTempRange(tempData);
      } else {
        setSpecies(null);
        setTempRange(null);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", archiveData.user_id)
        .maybeSingle();

      setUsername(profile?.username || "用户");

      let recordsQuery = supabase
        .from("records")
        .select(`
          *,
          record_tags (
            tag,
            tag_type,
            source,
            is_active
          )
        `)
        .eq("archive_id", archiveData.id)
        .order("record_time", { ascending: false });

      if (!isOwnerView) {
        recordsQuery = recordsQuery.eq("visibility", "public");
      }

      const { data: recordsData } = await recordsQuery;

      const recs = recordsData ?? [];
      const recordIds = recs.map((r: any) => r.id);
      const mediaMap: Record<string, any[]> = {};

      if (recordIds.length > 0) {
        const { data: mediaRaw } = await supabase
          .from("media")
          .select("*")
          .in("record_id", recordIds);

        mediaRaw?.forEach((m: any) => {
          if (!mediaMap[m.record_id]) mediaMap[m.record_id] = [];
          mediaMap[m.record_id].push(m);
        });
      }

  const final = recs.map((r: any) => {
  const behaviorTags =
    r.record_tags
      ?.filter(
        (t: any) =>
          t.tag_type === "behavior" &&
          t.is_active !== false
      )
      .map((t: any) => t.tag) || [];

  const displayTags = Array.from(new Set(behaviorTags));

  const userBehaviorTags =
    r.record_tags
      ?.filter(
        (t: any) =>
          t.tag_type === "behavior" &&
          t.source === "user" &&
          t.is_active !== false
      )
      .map((t: any) => t.tag) || [];

  return {
    ...r,
    media: mediaMap[r.id] || [],
    parsed_actions: displayTags,
    user_behavior_tags: userBehaviorTags,
    display_tags: displayTags,
  };
});

      setRecords(final);
    }

    load();
  }, [id]);

  useEffect(() => {
    async function loadSameTagCounts() {
      const visibleTags = Array.from(
        new Set(
          records.flatMap((record: any) =>
            Array.isArray(record.display_tags) ? record.display_tags : []
          )
        )
      );

      if (visibleTags.length === 0) {
        setSameTagCounts({});
        return;
      }

      if (!archive?.species_id && !archive?.species_name_snapshot) {
        setSameTagCounts({});
        return;
      }

      let relatedQuery = supabase
        .from("records")
        .select(`
          id,
          record_tags (
            tag,
            tag_type,
            is_active
          ),
          archives!inner (
            id,
            species_id,
            species_name_snapshot,
            is_public
          )
        `)
        .eq("visibility", "public")
        .eq("archives.is_public", true);

      if (archive.species_id) {
        relatedQuery = relatedQuery.eq("archives.species_id", archive.species_id);
      } else if (archive.species_name_snapshot) {
        relatedQuery = relatedQuery.eq(
          "archives.species_name_snapshot",
          archive.species_name_snapshot
        );
      }

      const { data, error } = await relatedQuery;

      if (error) {
        console.error("same tag counts load error:", error);
        setSameTagCounts({});
        return;
      }

      const wantedTags = new Set(visibleTags);
      const nextCounts: Record<string, number> = Object.fromEntries(
        visibleTags.map((tag) => [tag, 0])
      );

      (data || []).forEach((record: any) => {
        const recordTags = Array.from(
          new Set(
            (record.record_tags || [])
              .filter(
                (tagRow: any) =>
                  tagRow.tag_type === "behavior" &&
                  tagRow.is_active !== false &&
                  wantedTags.has(tagRow.tag)
              )
              .map((tagRow: any) => tagRow.tag)
          )
        );

        recordTags.forEach((tag) => {
          nextCounts[tag] = (nextCounts[tag] || 0) + 1;
        });
      });

      setSameTagCounts(nextCounts);
    }

    loadSameTagCounts();
  }, [records, archive?.species_id, archive?.species_name_snapshot]);


  if (!archive || me === undefined) {
    return <div style={{ padding: 20 }}>加载中...</div>;
  }

  const isOwner = me === archive.user_id;
  const mode = isOwner ? modeParam || "owner" : "viewer";
  const archiveDisplayName =
  archive?.species_name_snapshot ||
  species?.common_name ||
  species?.scientific_name ||
  "未命名";

  if (!isOwner && !archive.is_public) {
    return (
      <main style={{ padding: "16px", maxWidth: "560px", margin: "0 auto" }}>
        <Link href="/discover" style={{ fontSize: 14, color: "#666" }}>
          ← 返回发现页
        </Link>

        <div
          style={{
            marginTop: 24,
            padding: 20,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fff",
            color: "#666",
          }}
        >
          该档案为私密，仅档案主人可见。
        </div>
      </main>
    );
  }

function getSameTagCount(tag: string) {
  return sameTagCounts[tag] ?? 0;
}

function updateRecordTagState(
  recordId: string,
  tag: string,
  action: "add" | "remove"
) {
  setRecords((prev) =>
    prev.map((r: any) => {
      if (r.id !== recordId) return r;

      const displayTags = Array.isArray(r.display_tags) ? r.display_tags : [];
      const userTags = Array.isArray(r.user_behavior_tags)
        ? r.user_behavior_tags
        : [];

      if (action === "add") {
        return {
          ...r,
          display_tags: Array.from(new Set([...displayTags, tag])),
          parsed_actions: Array.from(new Set([...displayTags, tag])),
          user_behavior_tags: Array.from(new Set([...userTags, tag])),
        };
      }

      return {
        ...r,
        display_tags: displayTags.filter((t: string) => t !== tag),
        parsed_actions: displayTags.filter((t: string) => t !== tag),
        user_behavior_tags: userTags.filter((t: string) => t !== tag),
      };
    })
  );
}

async function toggleHelpStatus(recordId: string, currentStatus: string | null) {
  const nextStatus = currentStatus === "help" ? null : "help";

  const { error } = await supabase
    .from("records")
    .update({ status_tag: nextStatus })
    .eq("id", recordId);

  if (error) {
    showToast("更新求助状态失败");
    return;
  }

  setRecords((prev) =>
    prev.map((r: any) =>
      r.id === recordId ? { ...r, status_tag: nextStatus } : r
    )
  );

  showToast(nextStatus === "help" ? "已标记为求助" : "已取消求助");
}
  return (
    <main style={{ padding: "16px", maxWidth: "560px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>{mode === "owner" ? "我的「" : `${username}的「`}</span>

            <span
              onClick={() => router.push(`/archive/${archive.id}`)}
              style={{
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {archive.title}
            </span>

            <span>」的生长记录</span>

          {species?.id ? (
            <Link
              href={`/plant/${species.id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                marginLeft: 8,
                fontSize: 13,
                color: "#4CAF50",
                textDecoration: "underline",
              }}
            >
              🌿 {archiveDisplayName}
            </Link>
          ) : (
            <span
              style={{
                marginLeft: 8,
                fontSize: 13,
                color: "#4CAF50",
              }}
            >
              🌿 {archiveDisplayName}
            </span>
          )}
          </div>

          {mode === "viewer" && (
            <Link
              href={`/user/${archive.user_id}`}
              style={{
                fontSize: 12,
                color: "#4CAF50",
                textDecoration: "none",
                border: "1px solid #4CAF50",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              TA的空间 →
            </Link>
          )}
        </div>

        {mode === "owner" ? (
          <Link href="/archive" style={{ fontSize: 14, color: "#666" }}>
            ← 我的空间主页
          </Link>
        ) : (
          <Link href="/discover" style={{ fontSize: 14, color: "#666" }}>
            发现页 →
          </Link>
        )}
      </div>

         {tempRange && (
        <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
          🌡 适宜温度：
          {tempRange.optimal_growth_temp
            ? `${tempRange.optimal_growth_temp}℃`
            : "暂无数据"}
        </div>
      )}

      {mode === "owner" && (
        <AddRecord archiveId={archive.id} archiveIsPublic={archive.is_public} placeholder="增加记录" />
      )}

      <div style={{ position: "relative", paddingLeft: 20 }}>
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 0,
            bottom: 0,
            width: 2,
            background: "#eee",
          }}
        />

        {records.map((item: any) => (
          <div
            key={item.id}
            style={{
              position: "relative",
              marginBottom: 24,
              paddingLeft: 10,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: -14,
                top: 6,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#4CAF50",
              }}
            />

            {archive && records.length > 0 && startTime && (
              <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>
                第 {getDayNumber(startTime, item.record_time)} 天 ·{" "}
                {new Date(item.record_time).toLocaleDateString("zh-CN")}
              </div>
            )}

            <div
              style={{
                background: "#fff",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #eee",
              }}
            >
              {item.media?.length > 0 && (
                <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                  {item.media.map((m: any, i: number) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img
                        src={m.url}
                        style={{ width: "100%", borderRadius: 8 }}
                      />

                      {mode === "owner" && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await supabase.from("media").delete().eq("id", m.id);
                            router.refresh();
                          }}
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {item.status_tag && getStatusTagLabel(item.status_tag) && (
                    <span
                      style={{
                        fontSize: 12,
                        lineHeight: 1,
                        padding: "4px 6px",
                        borderRadius: 999,
                        border: "1px solid #e6c9c9",
                        background: "#fff7f7",
                        display: "inline-block",
                      }}
                    >
                      {getStatusTagLabel(item.status_tag)}
                    </span>
                  )}

                  <EditRecord
                    key={`${item.id}-${mode}`}
                    id={item.id}
                    initialText={item.note}
                    readOnly={mode !== "owner"}
                  />
                </div>

                {mode === "owner" && (
                  <div style={{ marginTop: 6 }}>
                    {archive.is_public ? (
                      <select
                        value={item.visibility || "public"}
                        onChange={async (e) => {
                          await supabase
                            .from("records")
                            .update({ visibility: e.target.value })
                            .eq("id", item.id);

                          setRecords((prev) =>
                            prev.map((r) =>
                              r.id === item.id
                                ? { ...r, visibility: e.target.value }
                                : r
                            )
                          );
                        }}
                        style={{ fontSize: 12 }}
                      >
                        <option value="public">公开记录</option>
                        <option value="private">仅自己可见</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 12, color: "#888" }}>
                        档案私密，记录仅自己可见
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleHelpStatus(item.id, item.status_tag)}
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        background: item.status_tag === "help" ? "#fff7f7" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {item.status_tag === "help" ? "取消求助" : "标记为求助"}
                    </button>
                  </div>
                )}

                <TagList
                  tags={item.display_tags}
                  editable={mode === "owner"}
                  recordId={item.id}
                  userTags={item.user_behavior_tags}
                  onChange={(tag) => updateRecordTagState(item.id, tag, "remove")}
                />

                {mode === "owner" && (
                  <div style={{ marginTop: 6 }}>
                    <select
                      onChange={async (e) => {
                        const newTag = e.target.value;
                        e.target.value = "";
                        if (!newTag) return;

                        const existingTags = Array.isArray(item.display_tags)
                          ? item.display_tags
                          : [];

                        if (existingTags.includes(newTag)) return;

                        const { error } = await supabase.from("record_tags").insert([
                          {
                            record_id: item.id,
                            tag: newTag,
                            tag_type: "behavior",
                            source: "user",
                            is_active: true,
                          },
                        ]);

                        if (error) {
                          showToast("添加标签失败");
                          return;
                        }

                        updateRecordTagState(item.id, newTag, "add");
                        showToast("已添加标签");
                      }}
                      defaultValue=""
                      style={{ fontSize: 12 }}
                    >
                      <option value="">+ 添加标签</option>
<option value="扦插">扦插</option>
<option value="播种">播种</option>
<option value="发芽">发芽</option>
<option value="修剪">修剪</option>
<option value="施肥">施肥</option>
<option value="浇水">浇水</option>
<option value="换盆">换盆</option>
<option value="开花">开花</option>
<option value="病害">病害</option>
                    </select>
                  </div>
                )}

             {Array.isArray(item.display_tags) && item.display_tags.length > 0 && (
  <div style={{ marginTop: 6 }}>
    <span style={{ fontSize: 12, color: "#999", marginRight: 6 }}>
      同类记录：
    </span>

    {item.display_tags.map((tag: string) => {
      const sameCount = getSameTagCount(tag);

      return (
        <span
          key={tag}
          onClick={() => {
            const encodedTag = encodeURIComponent(tag);

            if (species?.id) {
              window.location.href = `/discover/search?tag=${encodedTag}&species=${species.id}`;
              return;
            }

            if (archive?.species_name_snapshot) {
              window.location.href = `/discover/search?tag=${encodedTag}&name=${encodeURIComponent(
                archive.species_name_snapshot
              )}`;
              return;
            }

            alert("无法定位该植物");
          }}
          style={{
            fontSize: 12,
            color: "#4CAF50",
            cursor: "pointer",
            marginRight: 10,
          }}
        >
          {getBehaviorTagLabel(tag)}（{sameCount}） →
        </span>
      );
    })}
  </div>
)}

                {mode === "owner" && <DeleteRecordButton id={item.id} />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}