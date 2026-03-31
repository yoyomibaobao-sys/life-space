"use client";

import { use } from "react";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import AddRecord from "./AddRecord";
import DeleteRecordButton from "./DeleteRecordButton";
import EditRecord from "@/components/EditRecord";
import Link from "next/link";

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
  const [viewer, setViewer] = useState<{
    images: string[];
    index: number;
  } | null>(null);

  // 加载数据（全部用 client supabase）
  useEffect(() => {
    async function load() {
      // 1) 档案
      const { data: archive } = await supabase
        .from("archives")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!archive) return;
      setArchive(archive);

      // 2) 记录
      const { data: recordsData } = await supabase
        .from("records")
        .select("*")
        .eq("archive_id", archive.id)
        .order("created_at", { ascending: false });

      const recs = recordsData ?? [];

      // 3) 媒体
      const recordIds = recs.map((r: any) => r.id);
      let mediaMap: Record<string, any[]> = {};

      if (recordIds.length > 0) {
        const { data: mediaRaw } = await supabase
          .from("media")
          .select("*")
          .in("record_id", recordIds);

        (mediaRaw ?? []).forEach((m: any) => {
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

  // 键盘左右切换 + ESC 关闭
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!viewer) return;
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") {
        setViewer((v) =>
          v
            ? {
                ...v,
                index: (v.index + 1) % v.images.length,
              }
            : v
        );
      }
      if (e.key === "ArrowLeft") {
        setViewer((v) =>
          v
            ? {
                ...v,
                index:
                  (v.index - 1 + v.images.length) % v.images.length,
              }
            : v
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  const title = archive?.title || "加载中…";

  return (
    <main
      style={{
        padding: "0 16px 24px",
        maxWidth: "560px",
        margin: "0 auto",
        animation: "fadeIn 0.35s ease",
      }}
    >
      {/* 顶部栏（固定） */}
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)",
          zIndex: 10,
          padding: "10px 0 8px",
          borderBottom: "1px solid #f3f3f3",
        }}
      >
        <Link
          href="/archive"
          style={{
            fontSize: 13,
            color: "#888",
            textDecoration: "none",
          }}
        >
          ← 返回
        </Link>

        <div
          style={{
            marginTop: 6,
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {title}
        </div>
      </div>

      {/* 添加记录 */}
      <div style={{ margin: "14px 0 22px" }}>
        <AddRecord archiveId={id} />
      </div>

      {/* 内容流 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {records.map((item: any) => (
          <div key={item.id}>
            {/* 时间 */}
            <div
              style={{
                fontSize: 12,
                color: "#aaa",
                marginBottom: 6,
              }}
            >
              {formatDate(item.created_at)}
            </div>

            {/* 图片（自适应网格） */}
            {item.media?.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    item.media.length > 1 ? "1fr 1fr" : "1fr",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {item.media.map((m: any, i: number) => (
  <div
    key={i}
    style={{
      position: "relative",
    }}
  >
    {/* 图片 */}
    <img
      src={m.url}
      onClick={() =>
        setViewer({
          images: item.media.map((x: any) => x.url),
          index: i,
        })
      }
      style={{
        width: "100%",
        borderRadius: 12,
        objectFit: "cover",
        aspectRatio: "4/3",
        cursor: "pointer",
        transition: "transform 0.15s ease",
      }}
      onMouseDown={(e) =>
        (e.currentTarget.style.transform = "scale(0.98)")
      }
      onMouseUp={(e) =>
        (e.currentTarget.style.transform = "scale(1)")
      }
    />

    {/* 删除按钮 */}
    <button
      onClick={async (e) => {
        e.stopPropagation();

        if (!confirm("删除这张图片？")) return;

        await supabase
          .from("media")
          .delete()
          .eq("id", m.id);

        window.location.reload();
      }}
      style={{
        position: "absolute",
        top: "6px",
        right: "6px",
        background: "rgba(0,0,0,0.5)",
        color: "#fff",
        border: "none",
        borderRadius: "50%",
        width: "24px",
        height: "24px",
        cursor: "pointer",
        fontSize: "14px",
      }}
    >
      ×
    </button>
  </div>
))}
</div>
 )}{/* ✅ 这一行必须补上 */}

            {/* 文本 */}
            {item.note?.trim() && (
              <div
                style={{
                  fontSize: 15,
                  lineHeight: 1.75,
                  color: "#222",
                  letterSpacing: 0.2,
                }}
              >
                {item.note}
              </div>
            )}

            {/* 操作（弱化） */}
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 10,
                fontSize: 12,
                color: "#bbb",
              }}
            >
              {false && <EditRecord id={item.id} initialText={item.note} />}
              <DeleteRecordButton id={item.id} />
            </div>
          </div>
        ))}
      </div>

      {/* 图片查看器（沉浸） */}
      {viewer && (
        <div
          onClick={() => setViewer(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <img
            src={viewer.images[viewer.index]}
            style={{
              maxWidth: "92%",
              maxHeight: "92%",
              borderRadius: 10,
            }}
          />

          {/* 左右点击区域 */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setViewer((v) =>
                v
                  ? {
                      ...v,
                      index:
                        (v.index - 1 + v.images.length) %
                        v.images.length,
                    }
                  : v
              );
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "40%",
            }}
          />
          <div
            onClick={(e) => {
              e.stopPropagation();
              setViewer((v) =>
                v
                  ? {
                      ...v,
                      index: (v.index + 1) % v.images.length,
                    }
                  : v
              );
            }}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: "40%",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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