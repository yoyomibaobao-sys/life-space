"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AddRecord from "./AddRecord";
import DeleteRecordButton from "./DeleteRecordButton";
import EditRecord from "@/components/EditRecord";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";


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
  const [relatedOpen, setRelatedOpen] = useState(false);
const [relatedTag, setRelatedTag] = useState<string | null>(null);
const [relatedList, setRelatedList] = useState<any[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [username, setUsername] = useState("用户");

  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  // ⭐ 计算起始时间（最早记录）
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

      setMe(session?.user?.id || null);
    }
    getMe();
  }, []);

  useEffect(() => {
    async function load() {
      const { data: archive } = await supabase
        .from("archives")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!archive) return;
      setArchive(archive);
// ⭐ 查询植物百科
if (archive.species_id) {
  const { data: speciesData } = await supabase
    .from("plant_species")
    .select("*")
    .eq("id", archive.species_id)
    .maybeSingle();

  setSpecies(speciesData);

  // ⭐ 查询温度范围
  const { data: tempData } = await supabase
    .from("plant_temperature_ranges")
    .select("*")
    .eq("species_id", archive.species_id)
    .maybeSingle();

  setTempRange(tempData);
}
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", archive.user_id)
        .maybeSingle();

      setUsername(profile?.username || "用户");

const { data: recordsData } = await supabase
  .from("records")
  .select(`
    *,
  archives ( species_id ),
  record_tags ( tag )
`)
  .eq("archive_id", archive.id)
  .order("record_time", { ascending: false });

      const recs = recordsData ?? [];

      const recordIds = recs.map((r: any) => r.id);
      let mediaMap: any = {};

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

const final = recs.map((r: any) => ({
  ...r,
  media: mediaMap[r.id] || [],
  tags: r.record_tags?.map((t: any) => t.tag) || [],
}));

      setRecords(final);
    }

    load();
  }, [id]);

useEffect(() => {
  if (!relatedOpen || !relatedTag || !species?.id) return;

  async function loadRelated() {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data } = await supabase
      .from("records")
      .select(`
         *,
  archives ( species_id ),
  record_tags ( tag )
`)
      .eq("record_tags.tag", relatedTag)
      .eq("archives.species_id", species.id)
      .gte("record_time", threeDaysAgo)
      .limit(5);

    setRelatedList(data || []);
  }

  loadRelated();
}, [relatedOpen, relatedTag, species]);

  if (!archive || me === null) {
    return <div style={{ padding: 20 }}>加载中...</div>;
  }

  const isOwner = me === archive.user_id;
  const mode = modeParam || (isOwner ? "owner" : "viewer");

  return (
    <main style={{ padding: "16px", maxWidth: "560px", margin: "0 auto" }}>
      
      {/* 顶部 */}
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  }}
>
  
  {/* 左侧：标题 + 去档案 */}
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    
    {/* 标题 */}
    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
  
  {/* 前半段 */}
  <span>
    {mode === "owner" ? "我的「" : `${username}的「`}
  </span>

  {/* ⭐ 项目名（可点） */}
  <span
    onClick={() => router.push(`/archive/${archive.id}`)}
    style={{
      cursor: "pointer",
      textDecoration: "underline",
    }}
  >
    {archive.title}
  </span>

  {/* 后半段 */}
  <span>」的生长记录</span>

  {/* ⭐ 系统名（可点） */}
  {species && (
    <span
      onClick={() => router.push(`/plant/${species.id}`)}
      style={{
        marginLeft: 8,
        fontSize: 13,
        color: "#4CAF50",
        cursor: "pointer",
      }}
    >
      🌿 {species.common_name || species.scientific_name}
    </span>
  )}
</div>
{/* ⭐ 系统信息 */}
{species && (
  <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
    🌿 {species.common_name || species.scientific_name}
  </div>
)}

{tempRange && (
  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
    🌡 适宜温度：
    {tempRange.optimal_growth_temp
      ? `${tempRange.optimal_growth_temp}℃`
      : "暂无数据"}
  </div>
)}
    {/* 👉 新增按钮（只在浏览他人时出现） */}
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

  {/* 右侧：返回 */}
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

      {/* 添加记录（仅自己） */}
      {mode === "owner" && (
        <AddRecord archiveId={archive.id} placeholder="增加记录" />
      )}

      {/* 时间轴 */}
      <div style={{ position: "relative", paddingLeft: 20 }}>
        
        {/* 竖线 */}
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
            {/* 圆点 */}
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

           {/* 时间 + 第X天 */}
{archive && records.length > 0 && (
  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>
    第 {getDayNumber(startTime, item.record_time)} 天 ·{" "}
    {new Date(item.record_time).toLocaleDateString("zh-CN")}
  </div>
)}

            {/* 内容块 */}
            <div
              style={{
                background: "#fff",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #eee",
              }}
            >
              {/* 图片 */}
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
                            await supabase
                              .from("media")
                              .delete()
                              .eq("id", m.id);
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

              {/* 文本 */}
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
  {/* 状态 */}
  <span>
    {item.status === "help" && "❗"}
    {item.status === "ok" && "✅"}
    {item.status === "problem" && "⚠️"}
  </span>

  {/* 文本 */}
  <EditRecord
    key={`${item.id}-${mode}`}
    id={item.id}
    initialText={item.note}
    readOnly={mode !== "owner"}
  />
</div>

{/* 标签（放在记录后） */}
{item.tags && item.tags.length > 0 && (
  <div
    style={{
      marginTop: 6,
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
    }}
  >
    {item.tags.map((tag: string, i: number) => (
  <span
    key={i}
    style={{
      fontSize: 12,
      padding: "2px 6px",
      background: "#f6fff6",
      border: "1px solid #4CAF50",
      borderRadius: 6,
      color: "#2e7d32",
      display: "flex",
      alignItems: "center",
      gap: 4,
    }}
  >
    {tag}

    {mode === "owner" && (
      <span
        onClick={async () => {
          // 删除标签
          await supabase
            .from("record_tags")
            .delete()
            .eq("record_id", item.id)
            .eq("tag", tag);

          router.refresh();
        }}
        style={{
          cursor: "pointer",
          fontSize: 12,
          color: "#999",
        }}
      >
        ×
      </span>
    )}
  </span>
))}
  </div>
)}
{/* ⭐ 添加标签（只给自己） */}
{mode === "owner" && (
  <div style={{ marginTop: 6 }}>
    <select
      onChange={async (e) => {
        const newTag = e.target.value;
        if (!newTag) return;

        // ❗防重复
        if (item.tags.includes(newTag)) return;

        await supabase.from("record_tags").insert([
          {
            record_id: item.id,
            tag: newTag,
          },
        ]);

        router.refresh();
      }}
      defaultValue=""
      style={{ fontSize: 12 }}
    >
      <option value="">+ 添加标签</option>
      {[
        "扦插",
        "播种",
        "发芽",
        "生长",
        "开花",
        "结果",
        "修剪",
        "施肥",
        "浇水",
        "换盆",
        "病害",
      ].map((tag) => (
        <option key={tag} value={tag}>
          {tag}
        </option>
      ))}
    </select>
  </div>
)}

{/* ⭐ 每个标签一个“查看相同记录” */}
<div style={{ marginTop: 6 }}>
  <span style={{ fontSize: 12, color: "#999", marginRight: 6 }}>
    相关记录：
  </span>

  {item.tags.map((tag: string) => (
    <span
      key={tag}
      onClick={() => {
  window.location.href = `/discover/search?tag=${tag}&species=${species?.id}`;
}}
      style={{
        fontSize: 12,
        color: "#4CAF50",
        cursor: "pointer",
        marginRight: 10,
      }}
    >
      {tag} →
    </span>
  ))}
</div>
                {mode === "owner" && (
                  <DeleteRecordButton id={item.id} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {relatedOpen && (
  <div
    onClick={() => setRelatedOpen(false)}
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "flex-end",
      zIndex: 1000,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        background: "#fff",
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        padding: 16,
        maxHeight: "60%",
        overflowY: "auto",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 10 }}>
        相同「{relatedTag}」记录
      </div>

      {relatedList.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999" }}>
          暂无相关记录
        </div>
      ) : (
        relatedList.map((r: any) => (
          <div
            key={r.id}
            onClick={() => {
              window.location.href = `/archive/${r.archive_id}`;
            }}
            style={{
              padding: "10px 0",
              borderBottom: "1px solid #eee",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 14 }}>{r.note}</div>

            <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
              {new Date(r.record_time).toLocaleDateString("zh-CN")}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)}
    </main>
  );
}