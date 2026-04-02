"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AddRecord from "./AddRecord";
import DeleteRecordButton from "./DeleteRecordButton";
import EditRecord from "@/components/EditRecord";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ArchiveDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return <Content id={id} />;
}

function Content({ id }: { id: string }) {
  const [archive, setArchive] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [me, setMe] = useState<string | null>(null);

  const router = useRouter();

  // 👤 当前用户
  useEffect(() => {
    async function getMe() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setMe(session?.user?.id || null);
    }

    getMe();
  }, []);

  // 📦 数据
  useEffect(() => {
    async function load() {
      const { data: archive } = await supabase
        .from("archives")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!archive) return;
      setArchive(archive);

      const { data: recordsData } = await supabase
        .from("records")
        .select("*")
        .eq("archive_id", archive.id)
        .order("created_at", { ascending: false });

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
      }));

      setRecords(final);
    }

    load();
  }, [id]);

 // ⭐ 等数据加载完再渲染（必须加）
if (!archive || me === null) {
  return <div style={{ padding: 20 }}>加载中...</div>;
}
  // ✅ 权限判断
  const isOwner = me === archive.user_id;

  // ✅ 分类格式化
  function formatCategory(category: string) {
    switch (category) {
      case "植物":
        return "🌱 植物";
      case "宠物":
        return "🐾 宠物";
      case "日常":
        return "📓 日常";
      case "技能":
        return "🎯 技能";
      default:
        return "📦 其他";
    }
  }

  return (
    <main style={{ padding: "16px", maxWidth: "560px", margin: "0 auto" }}>
      <Link href="/archive">← 返回</Link>

      {/* 👤 页面身份 */}
      <div style={{ fontSize: 12, color: "#999", marginTop: 10 }}>
        {isOwner ? "我的养成" : "TA的养成"}
      </div>

      {/* 🌱 分类 */}
      <div style={{ color: "#666", marginTop: 6 }}>
        {archive?.category && formatCategory(archive.category)}
      </div>

      {/* 标题 */}
      <h1 style={{ marginTop: 4 }}>{archive?.title}</h1>

      {/* 添加记录 */}
      {isOwner && <AddRecord archiveId={archive.id} />}

      {/* 记录列表 */}
      {records.map((item: any) => (
        <div key={item.id} style={{ marginBottom: 24 }}>
          {/* 时间 */}
          <div style={{ fontSize: 12, color: "#aaa" }}>
            {formatDate(item.created_at)}
          </div>

          {/* 图片 */}
          {item.media?.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {item.media.map((m: any, i: number) => (
                <div key={i} style={{ position: "relative" }}>
                  <img
                    src={m.url}
                    style={{ width: "100%", borderRadius: 10 }}
                  />

                  {/* 删除图片 */}
                  {isOwner && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await supabase
                          .from("media")
                          .delete()
                          .eq("id", m.id);

                        router.refresh(); // ✅ 替代 reload
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
            <EditRecord
              key={`${item.id}-${isOwner}`}
              id={item.id}
              initialText={item.note}
              readOnly={!isOwner}
            />

            {isOwner && <DeleteRecordButton id={item.id} />}
          </div>
        </div>
      ))}
    </main>
  );
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString("zh-CN") +
    " " +
    date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}