"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function ArchivePage() {
  const [isFollowing, setIsFollowing] = useState(false);
  const [showCard, setShowCard] = useState(false);
const [cardProfile, setCardProfile] = useState<any>(null);
  const [username, setUsername] = useState("");
  const params = useParams();
  const userId = params.id as string;

  const [archives, setArchives] = useState<any[]>([]);
  const [groupTags, setGroupTags] = useState<any[]>([]);
  const [subTags, setSubTags] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);

  const [activeCategory, setActiveCategory] = useState("全部");
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);

  const router = useRouter();
  async function openCard() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  // 用户信息
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
    // ⭐关注数（我关注了多少人）
const { count: followingCount } = await supabase
  .from("follows")
  .select("*", { count: "exact", head: true })
  .eq("follower_id", userId);

// ⭐粉丝数（多少人关注我）
const { count: followerCount } = await supabase
  .from("follows")
  .select("*", { count: "exact", head: true })
  .eq("following_id", userId);

setCardProfile({
  ...data,
  followingCount,
  followerCount,
});

  // ⭐判断是否已关注
  const { data: follow } = await supabase
    .from("follows")
    .select("*")
    .eq("follower_id", user.id)
    .eq("following_id", userId)
    .maybeSingle();

  setIsFollowing(!!follow);

  setShowCard(true);
}

 // ===== tag 类型判断 =====
function isSubTag(tag: any) {
  return !tag.sub_tag_id;
}

function isGroupTag(tag: any) {
  return !!tag.sub_tag_id;
}
const loadingRef = useRef(false);
 async function loadData() {
  if (loadingRef.current) return;
loadingRef.current = true;

  try {
    const { data: profile } = await supabase
  .from("profiles")
  .select("username")
  .eq("id", userId)
  .single();

if (profile) {
  setUsername(profile.username);
}
    
 // 1️⃣ 先拿 archives
const { data: archivesData } = await supabase
  .from("archives")
  .select("*")
  .eq("user_id", userId)
  .eq("is_public", true)
  .order("created_at", { ascending: false });

const safeArchives = archivesData || [];
setArchives(safeArchives);

// 2️⃣ 再拿 tags
const { data: groupTagsData } = await supabase
  .from("group_tags")
  .select("*")
  .eq("user_id", userId);

const { data: subTagsData } = await supabase
  .from("sub_tags")
  .select("*")
  .eq("user_id", userId);

setGroupTags(groupTagsData || []);
setSubTags(subTagsData || []);

// 3️⃣ 再拿 records
const archiveIds = safeArchives.map((a) => a.id);

if (archiveIds.length > 0) {
  const { data: recs } = await supabase
    .from("records")
    .select("*, media(*)")
    .in("archive_id", archiveIds)
    .order("record_time", { ascending: false });

  setRecords(recs || []);
}

setArchives(archivesData || []);
setGroupTags(groupTagsData || []);
setSubTags(subTagsData || []); // ⭐就在这里加

  } finally {
    loadingRef.current = false;
  }
}

  useEffect(() => {
  let isMounted = true;

  async function safeLoad() {
    try {
      if (!isMounted) return;
      await loadData();
    } catch (err) {
      console.error("loadData error:", err);
    }
  }

  safeLoad();

  return () => {
    isMounted = false;
  };
}, []);
  // ===== 统计 =====
  const statsMap: any = {};
  records.forEach((r: any) => {
    if (!statsMap[r.archive_id]) {
      statsMap[r.archive_id] = {
        count: 0,
        latest: r,
      };
    }

    statsMap[r.archive_id].count++;

    if (
      new Date(r.record_time) >
      new Date(statsMap[r.archive_id].latest.record_time)
    ) {
      statsMap[r.archive_id].latest = r;
    }
  });

  // ===== 封面 =====
  const coverMap: any = {};
  records.forEach((r: any) => {
    if (!coverMap[r.archive_id] && r.media?.length > 0) {
      const m = r.media[0];
      coverMap[r.archive_id] =
        m.file_url || m.url || m.path || "";
    }
  });

  return (
    <main style={{ padding: 14 }}>
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  }}
>
 <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 18,
    fontWeight: 600,
    minHeight: 24,
  }}
>
  {/* 标题 */}
  <div>
    {username ? `${username} · 空间` : ""}
  </div>
<span
  onClick={(e) => {
    e.stopPropagation();
    openCard();
  }}
  style={{
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 12,
    background: "#e0f2f1",
    color: "#4CAF50",
    cursor: "pointer",
  }}
>
  名片
</span>
  
</div>

  <div
    onClick={() => router.push("/discover")}
    style={{
      fontSize: 14,
      color: "#666",
      cursor: "pointer",
    }}
  >
    去发现 →
  </div>
</div>

{/* ===== 分类 + 子分类（同一行） ===== */}
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 12,
  }}
>
  {/* ===== 全部 ===== */}
  <div
    onClick={() => {
      setActiveCategory("全部");
      setActiveSubTag(null);
      setActiveGroupTag(null);
    }}
    style={{
      cursor: "pointer",
      fontWeight: activeCategory === "全部" ? 600 : 400,
    }}
  >
    全部
  </div>

  {/* ===== 植物 ===== */}
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <div
      onClick={() => {
        setActiveCategory("植物");
        setActiveSubTag(null);
        setActiveGroupTag(null);
      }}
      style={{
        cursor: "pointer",
        fontWeight: activeCategory === "植物" ? 600 : 400,
      }}
    >
      🌿 植物：
    </div>

    {subTags
  .filter((t) => t.category === "植物")
  .map((t) => (
        <div
          key={t.id}
          style={{ display: "flex", alignItems: "center", gap: 2 }}
        >
          {/* 子分类 */}
          <div
            onClick={() => {
              setActiveCategory("植物");
              setActiveSubTag(t.id);
              setActiveGroupTag(null);
            }}
            onDoubleClick={async () => {
              const name = prompt("修改名称", t.name);
              if (!name) return;

           await supabase
  .from("sub_tags")
  .update({ name })
  .eq("id", t.id);

              setSubTags((prev) =>
  prev.map((x) =>
    x.id === t.id ? { ...x, name } : x
  )
);
            }}
            style={{
              padding: "2px 8px",
              borderRadius: 12,
              background:
                activeSubTag === t.id ? "#333" : "#eee",
              color:
                activeSubTag === t.id ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: 11, // ⭐ 子分类更小
            }}
          >
            {t.name}
          </div>

          {/* 删除 */}
          <span
            onClick={async () => {
              if (!confirm("删除后归入植物，确认？")) return;

              await supabase
                .from("archives")
                .update({ sub_tag_id: null })
                .eq("sub_tag_id", t.id);

              await supabase
                .from("sub_tags")
                .delete()
                .eq("id", t.id);

              setSubTags((prev) =>
  prev.filter((x) => x.id !== t.id)
);
            }}
            style={{
              fontSize: 10,
              color: "#bbb",
              cursor: "pointer",
            }}
          >
            ×
          </span>
        </div>
      ))}

    {/* 新增 */}
    <div
      onClick={async () => {
        const name = prompt("新增植物子分类");
        if (!name) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user;
if (!user) return;
        const { data } = await supabase
          .from("sub_tags")  
          .insert([
            {
              user_id: user.id,
              name,
              category: "植物",
            },
          ])
          .select()
          .single();

        if (data) {
          setSubTags((prev) => [...prev, data]);
        }
      }}
      style={{
        color: "#4CAF50",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      ＋
    </div>
  </div>

  {/* ===== 设施 ===== */}
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <div
      onClick={() => {
        setActiveCategory("设施");
        setActiveSubTag(null);
        setActiveGroupTag(null);
      }}
      style={{
        cursor: "pointer",
        fontWeight: activeCategory === "设施" ? 600 : 400,
      }}
    >
      🛠 设施：
    </div>

    {subTags
  .filter((t) => t.category === "设施")
  .map((t) => (
    <div
      key={t.id}
      style={{ display: "flex", alignItems: "center", gap: 2 }}
    >
      <div
        onClick={() => {
          setActiveCategory("设施");
          setActiveSubTag(t.id);
          setActiveGroupTag(null);
        }}
        onDoubleClick={async () => {
          const name = prompt("修改名称", t.name);
          if (!name) return;

         await supabase
  .from("sub_tags")
  .update({ name })
  .eq("id", t.id);

         setSubTags((prev) =>
  prev.map((x) =>
    x.id === t.id ? { ...x, name } : x
  )
);
        }}
        style={{
          padding: "2px 8px",
          borderRadius: 12,
          background:
            activeSubTag === t.id ? "#333" : "#eee",
          color:
            activeSubTag === t.id ? "#fff" : "#333",
          cursor: "pointer",
          fontSize: 11,
        }}
      >
        {t.name}
      </div>

      {/* 删除 */}
      <span
        onClick={async () => {
          if (!confirm("删除后归入设施，确认？")) return;

          await supabase
            .from("archives")
            .update({ sub_tag_id: null })
            .eq("sub_tag_id", t.id);

          await supabase
            .from("sub_tags")
            .delete()
            .eq("id", t.id);

          setSubTags((prev) =>
  prev.filter((x) => x.id !== t.id)
);
        }}
        style={{
          fontSize: 10,
          color: "#bbb",
          cursor: "pointer",
        }}
      >
        ×
      </span>
    </div>
  ))}

    <div
      onClick={async () => {
        const name = prompt("新增设施子分类");
        if (!name) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user;
if (!user) return;
        const { data } = await supabase
          .from("sub_tags")
          .insert([
            {
              user_id: user.id,
              name,
              category: "设施",
            },
          ])
          .select()
          .single();

        if (data) {
          setSubTags((prev) => [...prev, data]);
        }
      }}
      style={{
        color: "#4CAF50",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      ＋
    </div>
  </div>
</div>

     {/* ===== 分组（完整版） ===== */}
<div style={{ marginBottom: 16 }}>
  <span style={{ fontSize: 12, color: "#666", marginRight: 6 }}>
    分组：
  </span>

  {/* 分组列表 */}
  {activeSubTag &&
    groupTags
      .filter((t) => t.sub_tag_id === activeSubTag && t.sub_tag_id)
      .map((t) => (
        <span
          key={t.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            marginRight: 6,
          }}
        >
          {/* 分组名 */}
          <span
            onClick={() => {
              if (activeGroupTag === t.id) {
                setActiveGroupTag(null);
              } else {
                setActiveGroupTag(t.id);
              }
            }}
            onDoubleClick={async () => {
              const name = prompt("修改分组名称", t.name);
              if (!name) return;

              await supabase
                .from("group_tags")
                .update({ name })
                .eq("id", t.id);

              setGroupTags((prev) =>
                prev.map((x) =>
                  x.id === t.id ? { ...x, name } : x
                )
              );
            }}
            style={{
              padding: "2px 8px",
              borderRadius: 12,
              background:
                activeGroupTag === t.id ? "#333" : "#eee",
              color:
                activeGroupTag === t.id ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {t.name}
          </span>

          {/* 删除 */}
          <span
            onClick={async () => {
              if (!confirm("删除该分组？")) return;

              // ① 清空档案分组
              await supabase
                .from("archives")
                .update({ group_tag_id: null })
                .eq("group_tag_id", t.id);

              // ② 删除分组
              await supabase
                .from("group_tags")
                .delete()
                .eq("id", t.id);

              // ③ 更新UI
              setGroupTags((prev) =>
                prev.filter((x) => x.id !== t.id)
              );
            }}
            style={{
              fontSize: 10,
              color: "#bbb",
              cursor: "pointer",
              marginLeft: 2,
            }}
          >
            ×
          </span>
        </span>
      ))}

  {/* 新增分组 */}
  {activeSubTag && (
    <span
      onClick={async () => {
        const name = prompt("新增分组");
        if (!name) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user;
if (!user) return;
        const { data } = await supabase
          .from("group_tags")
          .insert([
            {
              user_id: user.id,
              name,
              sub_tag_id: activeSubTag, // ⭐关键
            },
          ])
          .select()
          .single();

        if (data) {
          setGroupTags((prev) => [...prev, data]);
        }
      }}
      style={{
        color: "#4CAF50",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      ＋
    </span>
  )}
</div>
<div style={{ marginBottom: 20 }}>
</div>
{/* ===== 卡片 ===== */}
{archives
  .filter((item) => {
   const tag = groupTags.find(t => t.id === item.group_tag_id);

// ===== 分类过滤（改成基于 archive.category）=====
if (activeCategory !== "全部") {
  if (item.category !== activeCategory) return false;
}

// ✅ 先 group（优先级最高）
if (activeGroupTag) {
  if (item.group_tag_id !== activeGroupTag) return false;
}

// ✅ 再 subTag
if (activeSubTag) {
  if (item.sub_tag_id !== activeSubTag) return false;
}

return true;
  })
  .map((item) => {
    const stat = statsMap[item.id];
    const latest = stat?.latest;
    const cover = coverMap[item.id];

    const days = Math.floor(
      (Date.now() - new Date(item.created_at).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    return (
      <div
        key={item.id}
        onClick={() => router.push(`/archive/${item.id}`)}
        style={{
          display: "flex",
          cursor: "pointer",
          gap: 12,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          background: "#fff",
        }}
      >
        {/* ===== 图片 ===== */}
        <div style={{ width: 100, height: 100 }}>
          {cover ? (
            <img
              src={cover}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: 8,
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#eee",
                borderRadius: 8,
              }}
            />
          )}
        </div>

        {/* ===== 右侧 ===== */}
        <div style={{ flex: 1 }}>
          {/* ===== 标题 ===== */}
          <div style={{ fontWeight: 600 }}>
            <span
          
              style={{ cursor: "pointer" }}
            >
              {item.title}
            </span>

            {" · "}

            <span
               style={{ cursor: "pointer", color: "#666" }}
            >
              {item.system_name || "未填写"}
            </span>
            {/* ===== 分类信息 ===== */}

          </div>
<div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
  {item.category || "未分类"}
  {" · "}
  {subTags.find(t => t.id === item.sub_tag_id)?.name || "未细分"}
  {" · "}
  {groupTags.find(g => g.id === item.group_tag_id)?.name || "未分组"}
</div>
          {/* ===== 时间 + 状态 ===== */}
          {latest && (
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              {new Date(
                latest.record_time
              ).toLocaleDateString("zh-CN")}{" "}
              {latest.status === "help" && "❗"}
              {latest.status === "ok" && "✅"}
              {latest.status === "problem" && "⚠️"}
              {" "}
              {latest.note}
            </div>
          )}


          {/* ===== 统计 ===== */}
          <div
            style={{
              fontSize: 12,
              color: "#999",
              marginTop: 6,
            }}
          >
            已创建 {days} 天 · 共{stat?.count || 0}条记录 · 浏览0 · 关注0
          </div>

                  </div>
      </div>
    );
  })}
    {showCard && cardProfile && (
  <div
    onClick={() => setShowCard(false)}
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 260,
        background: "#fff",
        borderRadius: 12,
        padding: 20,
        textAlign: "center",
      }}
    >
      {/* 头像 */}
      {cardProfile.avatar_url ? (
        <img
          src={cardProfile.avatar_url}
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#eee",
            margin: "0 auto",
          }}
        />
      )}

      {/* 用户名 */}
      <div style={{ marginTop: 10, fontWeight: 600 }}>
        {cardProfile.username || "未设置用户名"}
      </div>

      {/* 等级 */}
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Lv.{cardProfile.level || 1}
      </div>

      {/* 花朵 */}
      <div style={{ marginTop: 6 }}>
        🌸 {cardProfile.flower_count || 0}
        <div style={{ marginTop: 6, fontSize: 12 }}>
  关注 {cardProfile.followingCount || 0} · 粉丝 {cardProfile.followerCount || 0}
</div>
        <div
  onClick={async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

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
    marginTop: 12,
    padding: "6px 12px",
    background: isFollowing ? "#eee" : "#4CAF50",
    color: isFollowing ? "#333" : "#fff",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  }}
>
  {isFollowing ? "已关注" : "关注"}
</div>
      </div>

      {/* 关闭 */}
      <div
        onClick={() => setShowCard(false)}
        style={{
          marginTop: 12,
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