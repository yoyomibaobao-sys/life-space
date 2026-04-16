"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ArchivePage() {
 const router = useRouter();
 const [showCard, setShowCard] = useState(false);
const [cardProfile, setCardProfile] = useState<any>(null);
const [ready, setReady] = useState(false); 
const [archives, setArchives] = useState<any[]>([]);
const [groupTags, setGroupTags] = useState<any[]>([]);
const [subTags, setSubTags] = useState<any[]>([]); // ⭐加在这里
const [records, setRecords] = useState<any[]>([]);

  const [activeCategory, setActiveCategory] = useState("全部");
  const [activeSubTag, setActiveSubTag] = useState<string | null>(null);
  const [activeGroupTag, setActiveGroupTag] = useState<string | null>(null);

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
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;
    if (!user) {
      router.push("/login");
      return;
    }

  const [
  { data: archivesData },
  { data: groupTagsData },
  { data: subTagsData },
  { data: recs },
] = await Promise.all([
  supabase
    .from("archives")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }),

  supabase
    .from("group_tags")
    .select("*")
    .eq("user_id", user.id),

  supabase
    .from("sub_tags") // ⭐新增
    .select("*")
    .eq("user_id", user.id),

  supabase
    .from("records")
    .select("*, media(*)")
    .eq("user_id", user.id)
    .order("record_time", { ascending: false }),
]);

setArchives(archivesData || []);
setGroupTags(groupTagsData || []);
setSubTags(subTagsData || []); // ⭐就在这里加
setRecords(recs || []);
  } finally {
    loadingRef.current = false;
  }
}
async function openCard() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id) // ⭐改这里
    .single();

  setCardProfile(data);
  setShowCard(true);
}
  useEffect(() => {
  let isMounted = true;

  async function safeLoad() {
    try {
      // ✅ 第一步：检查用户
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.push("/login");
        return;
      }

      if (!user.email_confirmed_at) {
        router.push("/check-email");
        return;
      }

      // ✅ 第二步：加载数据
      if (!isMounted) return;
      await loadData();

      // ✅ 第三步：允许渲染
      setReady(true);
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
if (!ready) return null;
  return (
    <main style={{ padding: 14 }}>
      <h2 style={{ marginBottom: 14 }}>我 · 空间</h2>

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
  <button
    onClick={() => router.push("/archive/new")}
    style={{
      padding: "10px 16px",
      borderRadius: 10,
      border: "1px dashed #4CAF50",
      background: "#f9fff9",
      color: "#4CAF50",
      cursor: "pointer",
      fontSize: 14,
    }}
  >
    ＋ 新建项目
  </button>
</div>
{/* ===== 卡片 ===== */}
{archives
  .filter((item) => {
  // ===== 1️⃣ group（最高优先级）=====
  if (activeGroupTag) {
    return item.group_tag_id === activeGroupTag;
  }

  // ===== 2️⃣ subTag =====
  if (activeSubTag) {
    return item.sub_tag_id === activeSubTag;
  }

  // ===== 3️⃣ category =====
  if (activeCategory !== "全部") {
    return item.category === activeCategory;
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
              onClick={async (e) => {
                e.stopPropagation();
                const name = prompt("修改名称", item.title);
                if (!name) return;

                await supabase
                  .from("archives")
                  .update({ title: name })
                  .eq("id", item.id);

                loadData();
              }}
              style={{ cursor: "pointer" }}
            >
              {item.title}
            </span>

            {" · "}

            <span
              onClick={async (e) => {
                e.stopPropagation();
                const name = prompt("修改系统名", item.system_name || "");
                if (name === null) return;

                await supabase
                  .from("archives")
                  .update({ system_name: name })
                  .eq("id", item.id);

                loadData();
              }}
              style={{ cursor: "pointer", color: "#666" }}
            >
              {item.system_name || "未填写"}
            </span>
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

          {/* ===== 操作行 ===== */}
          <div
            onClick={(e) => e.stopPropagation()} 
            style={{
              marginTop: 6,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12,
              alignItems: "center",
            }}
          >
            {/* 👁 可见性 */}
            <span
              title={item.is_public ? "公开" : "私密"}
              onClick={async (e) => {
                e.stopPropagation();
                const newValue = !item.is_public;

                await supabase
                  .from("archives")
                  .update({ is_public: newValue })
                  .eq("id", item.id);

                setArchives((prev) =>
                  prev.map((a) =>
                    a.id === item.id
                      ? { ...a, is_public: newValue }
                      : a
                  )
                );
              }}
              style={{
                cursor: "pointer",
                opacity: item.is_public ? 1 : 0.3,
              }}
            >
              👁
            </span>

            {/* 种类 */}
            <select
              onClick={(e) => e.stopPropagation()}
            value={item.sub_tag_id || item.category || ""}
             onChange={async (e) => {
  e.stopPropagation();

  const value = e.target.value;

  // 选一级分类
  if (value === "植物" || value === "设施") {
    await supabase
      .from("archives")
      .update({
        category: value,
        group_tag_id: null,
      })
      .eq("id", item.id);

    setArchives((prev) =>
      prev.map((a) =>
        a.id === item.id
          ? { ...a, category: value, group_tag_id: null }
          : a
      )
    );

    return;
  }

  // 选子分类 / 分组
 const sub = subTags.find((t) => String(t.id) === value);
if (!sub) return;

await supabase
  .from("archives")
  .update({
    category: sub.category,
    sub_tag_id: sub.id,
    group_tag_id: null,
  })
    .eq("id", item.id);

setArchives((prev) =>
  prev.map((a) =>
    a.id === item.id
      ? {
          ...a,
          category: sub.category,
          sub_tag_id: sub.id,
          group_tag_id: null,
        }
      : a
    )
  );
}}
            >
             <option value="植物">🌿 植物</option>

{subTags
  .filter((t) => t.category === "植物")
  .map((t) => (
    <option key={t.id} value={t.id}>
      └ {t.name}
    </option>
  ))}

<option value="设施">🛠 设施</option>

{subTags
  .filter((t) => t.category === "设施")
  .map((t) => (
    <option key={t.id} value={t.id}>
      └ {t.name}
    </option>
  ))}
            </select>

            {/* 分组 */}
           <select
  onClick={(e) => e.stopPropagation()}
  value={item.group_tag_id || ""}
  onChange={async (e) => {
    e.stopPropagation();
    const value = e.target.value;

    await supabase
      .from("archives")
      .update({
        group_tag_id: value || null,
      })
      .eq("id", item.id);

    setArchives((prev) =>
      prev.map((a) =>
        a.id === item.id
          ? { ...a, group_tag_id: value || null }
          : a
      )
    );
  }}
>
  <option value="">未分组</option>

  {groupTags
    .filter((g) => g.sub_tag_id === item.sub_tag_id) // ⭐核心
    .map((g) => (
      <option key={g.id} value={g.id}>
        {g.name}
      </option>
    ))}
</select>
          </div>

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

          {/* 删除 */}
          <div
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm("确定删除？")) return;

              await supabase
                .from("archives")
                .delete()
                .eq("id", item.id);

              loadData();
            }}
            style={{
              fontSize: 12,
              color: "red",
              marginTop: 4,
              cursor: "pointer",
            }}
          >
            删除
          </div>
        </div>
      </div>
    );
  })}
    </main>
  );
}