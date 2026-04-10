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
  return <Content id={id} />;
}

function Content({ id }: { id: string }) {
  const [archive, setArchive] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [username, setUsername] = useState("用户");

  const router = useRouter();
  const searchParams = useSearchParams();

  const modeParam = searchParams.get("mode");

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", archive.user_id)
        .maybeSingle();

      setUsername(profile?.username || "用户");

      const { data: recordsData } = await supabase
        .from("records")
        .select("*")
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
      }));

      setRecords(final);
    }

    load();
  }, [id]);

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
    <div style={{ fontWeight: 600 }}>
      {mode === "owner"
        ? `我的「${archive.title}」的生长记录`
        : `${username}的「${archive.title}」`}
    </div>

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
        去TA的档案 →
      </Link>
    )}
  </div>

  {/* 右侧：返回 */}
  {mode === "owner" ? (
    <Link href="/archive" style={{ fontSize: 14, color: "#666" }}>
      ← 返回我的档案
    </Link>
  ) : (
    <Link href="/discover" style={{ fontSize: 14, color: "#666" }}>
      去发现页 →
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

            {/* 时间 */}
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>
              {new Date(item.record_time).toLocaleDateString("zh-CN")}
            </div>

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
                <EditRecord
                  key={`${item.id}-${mode}`}
                  id={item.id}
                  initialText={item.note}
                  readOnly={mode !== "owner"}
                />

                {mode === "owner" && (
                  <DeleteRecordButton id={item.id} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}