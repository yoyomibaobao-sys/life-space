"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import {
  fetchCloudTrash,
  restoreCloudTrashItem,
  type CloudTrashItem,
} from "@/lib/cloud-trash";
import { supabase } from "@/lib/supabase";

export default function CloudTrashPage() {
  const router = useRouter();
  const [items, setItems] = useState<CloudTrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<CloudTrashItem | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadTrash = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    const result = await fetchCloudTrash(signal);
    if (signal?.aborted) return;

    if (!result.ok) {
      setItems([]);
      setError("暂时无法读取回收站，请稍后重试。");
    } else {
      setItems(result.items);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function init() {
      const userResult = await supabase.auth.getUser();
      if (controller.signal.aborted) return;

      if (userResult.error || !userResult.data.user) {
        router.replace("/login");
        return;
      }

      await loadTrash(controller.signal);
    }

    void init();
    return () => controller.abort();
  }, [loadTrash, router]);

  async function confirmRestore() {
    if (!restoreTarget || restoringId) return;

    setRestoringId(restoreTarget.id);
    const restored = await restoreCloudTrashItem(
      restoreTarget.type,
      restoreTarget.id,
    );

    if (!restored) {
      setRestoringId(null);
      showToast("恢复失败，请稍后重试");
      return;
    }

    const restoredType = restoreTarget.type;
    const restoredId = restoreTarget.id;
    setItems((current) => current.filter((item) => item.id !== restoredId));
    setRestoreTarget(null);
    setRestoringId(null);
    showToast(
      restoredType === "media"
        ? "照片已恢复。"
        : "已恢复。评论、点赞等互动信息不会恢复。",
    );
  }

  return (
    <main style={pageStyle}>
      <div style={topRowStyle}>
        <div>
          <div style={eyebrowStyle}>云端内容</div>
          <h1 style={titleStyle}>回收站</h1>
        </div>
        <Link href="/profile" style={backLinkStyle}>
          返回我的空间
        </Link>
      </div>

      <section style={noticeStyle}>
        <strong>回收站内容不会自动删除，并会继续占用云空间。</strong>
        <span>永久删除和清空功能将在后续完善；当前内容会一直保留。</span>
      </section>

      {loading ? (
        <section style={stateStyle}>正在读取回收站...</section>
      ) : error ? (
        <section style={stateStyle}>
          <p style={stateTextStyle}>{error}</p>
          <button type="button" onClick={() => void loadTrash()} style={retryButtonStyle}>
            重新读取
          </button>
        </section>
      ) : items.length === 0 ? (
        <section style={stateStyle}>回收站还是空的。</section>
      ) : (
        <section style={listStyle} aria-label="云端回收站内容">
          {items.map((item) => (
            <article key={`${item.type}:${item.id}`} style={itemStyle}>
              <div style={itemContentStyle}>
                <div style={itemMetaRowStyle}>
                  <span style={typeChipStyle}>{getTypeLabel(item.type)}</span>
                  <time dateTime={item.deletedAt} style={deletedTimeStyle}>
                    {formatDeletedAt(item.deletedAt)}
                  </time>
                </div>
                <h2 style={itemTitleStyle}>{item.title}</h2>
                {item.parentTitle ? (
                  <div style={parentTitleStyle}>原项目：{item.parentTitle}</div>
                ) : null}
                {item.recordCount > 0 || item.mediaCount > 0 ? (
                  <div style={countStyle}>
                    {item.recordCount > 0 ? `记录 ${item.recordCount} 条` : null}
                    {item.recordCount > 0 && item.mediaCount > 0 ? " · " : null}
                    {item.mediaCount > 0 ? `照片 ${item.mediaCount} 张` : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setRestoreTarget(item)}
                disabled={Boolean(restoringId)}
                style={restoreButtonStyle}
              >
                恢复
              </button>
            </article>
          ))}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title={`恢复${restoreTarget ? getTypeLabel(restoreTarget.type) : "内容"}`}
        message={
          restoreTarget?.type === "media"
            ? "确定将这张照片恢复到原记录吗？"
            : "确定恢复这项内容吗？之前清理的评论、点赞等互动信息不会恢复。"
        }
        confirmText={restoringId ? "恢复中..." : "恢复"}
        cancelText="取消"
        confirmDisabled={Boolean(restoringId)}
        cancelDisabled={Boolean(restoringId)}
        onClose={() => {
          if (!restoringId) setRestoreTarget(null);
        }}
        onConfirm={confirmRestore}
      />
    </main>
  );
}

function getTypeLabel(type: CloudTrashItem["type"]) {
  if (type === "archive") return "项目";
  if (type === "record") return "记录";
  return "照片";
}

function formatDeletedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "删除时间未知";

  return `${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} 移入`;
}

const pageStyle: CSSProperties = {
  maxWidth: 860,
  margin: "0 auto",
  padding: "20px 14px 48px",
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = { color: "#6a7d63", fontSize: 13 };
const titleStyle: CSSProperties = { margin: "4px 0 0", color: "#1f2a1f", fontSize: 27 };
const backLinkStyle: CSSProperties = { color: "#4e6948", fontSize: 14 };

const noticeStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  marginTop: 18,
  padding: "12px 14px",
  border: "1px solid #dce8d7",
  borderRadius: 12,
  background: "#f7fbf5",
  color: "#53634f",
  fontSize: 13,
  lineHeight: 1.65,
};

const stateStyle: CSSProperties = {
  marginTop: 16,
  padding: "28px 18px",
  border: "1px dashed #d7e2d2",
  borderRadius: 14,
  background: "#fff",
  color: "#71806d",
  textAlign: "center",
};

const stateTextStyle: CSSProperties = { margin: 0 };
const retryButtonStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid #cadbc5",
  borderRadius: 9,
  background: "#f6fbf3",
  color: "#365f32",
  padding: "8px 12px",
  cursor: "pointer",
};

const listStyle: CSSProperties = { display: "grid", gap: 10, marginTop: 16 };
const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: 14,
  border: "1px solid #e1e9dd",
  borderRadius: 14,
  background: "#fff",
};
const itemContentStyle: CSSProperties = { minWidth: 0, flex: 1 };
const itemMetaRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const typeChipStyle: CSSProperties = {
  border: "1px solid #d3e3ce",
  borderRadius: 999,
  background: "#f3f9f0",
  color: "#43663d",
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 700,
};
const deletedTimeStyle: CSSProperties = { color: "#899386", fontSize: 12 };
const itemTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#263326",
  fontSize: 17,
  lineHeight: 1.4,
  overflowWrap: "anywhere",
};
const parentTitleStyle: CSSProperties = { marginTop: 5, color: "#687365", fontSize: 13 };
const countStyle: CSSProperties = { marginTop: 5, color: "#7b8677", fontSize: 12 };
const restoreButtonStyle: CSSProperties = {
  flexShrink: 0,
  border: "1px solid #bcd5b5",
  borderRadius: 10,
  background: "#f3faf0",
  color: "#356731",
  padding: "8px 13px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
