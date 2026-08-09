"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import {
  emptyCloudTrash,
  fetchCloudTrash,
  purgeCloudTrashItem,
  restoreCloudTrashItem,
  retryCloudTrashItem,
  type CloudTrashItem,
} from "@/lib/cloud-trash";
import { supabase } from "@/lib/supabase";
import { formatPreciseDateTime } from "@/lib/date-time";

type LoadOptions = {
  silent?: boolean;
};

export default function CloudTrashPage() {
  const router = useRouter();
  const loadSequence = useRef(0);
  const [items, setItems] = useState<CloudTrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<CloudTrashItem | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<CloudTrashItem | null>(null);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const activeCount = useMemo(
    () => items.filter((item) => item.status === "active").length,
    [items],
  );
  const hasPurgingItems = items.some((item) => item.status === "purging");
  const actionBusy = actionKey !== null;

  const loadTrash = useCallback(
    async (signal?: AbortSignal, options: LoadOptions = {}) => {
      const sequence = loadSequence.current + 1;
      loadSequence.current = sequence;

      if (!options.silent) {
        setLoading(true);
        setError("");
      }

      const result = await fetchCloudTrash(signal);
      if (signal?.aborted || sequence !== loadSequence.current) return;

      if (!result.ok) {
        if (options.silent) {
          setRefreshError("状态更新失败，请手动刷新。");
        } else {
          setItems([]);
          setError("暂时无法读取回收站，请稍后重试。");
        }
      } else {
        setItems(result.items);
        setError("");
        setRefreshError("");
      }

      if (!options.silent) setLoading(false);
    },
    [],
  );

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

  useEffect(() => {
    if (!hasPurgingItems) return;

    let controller: AbortController | null = null;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      void loadTrash(controller.signal, { silent: true });
    };
    const interval = window.setInterval(refresh, 4_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasPurgingItems, loadTrash]);

  async function confirmRestore() {
    if (!restoreTarget || actionBusy) return;

    const key = `restore:${restoreTarget.trashEntryId}`;
    setActionKey(key);
    const restored = await restoreCloudTrashItem(
      restoreTarget.type,
      restoreTarget.id,
    );

    if (!restored) {
      setActionKey(null);
      showToast("恢复失败，请稍后重试");
      return;
    }

    const restoredType = restoreTarget.type;
    const restoredEntryId = restoreTarget.trashEntryId;
    setItems((current) =>
      current.filter((item) => item.trashEntryId !== restoredEntryId),
    );
    setRestoreTarget(null);
    setActionKey(null);
    showToast(
      restoredType === "media"
        ? "照片已恢复。"
        : "已恢复。评论、点赞等互动信息不会恢复。",
    );
  }

  async function confirmPurge() {
    if (!purgeTarget || actionBusy) return;

    const entryId = purgeTarget.trashEntryId;
    setActionKey(`purge:${entryId}`);
    const result = await purgeCloudTrashItem(entryId);

    if (!result.ok) {
      setActionKey(null);
      showToast("永久删除未能开始，请稍后重试");
      if (result.status === 409 || result.status === 404) {
        await loadTrash(undefined, { silent: true });
      }
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.trashEntryId === entryId
          ? { ...item, status: "purging", canRetry: false }
          : item,
      ),
    );
    setPurgeTarget(null);
    setActionKey(null);
    showToast("已开始永久删除，正在后台处理。");
    await loadTrash(undefined, { silent: true });
  }

  async function retryPurge(item: CloudTrashItem) {
    if (actionBusy || item.status !== "failed" || !item.canRetry) return;

    setActionKey(`retry:${item.trashEntryId}`);
    const result = await retryCloudTrashItem(item.trashEntryId);

    if (!result.ok) {
      setActionKey(null);
      showToast("删除未完成，请稍后重试。");
      await loadTrash(undefined, { silent: true });
      return;
    }

    setItems((current) =>
      current.map((currentItem) =>
        currentItem.trashEntryId === item.trashEntryId
          ? { ...currentItem, status: "purging", canRetry: false }
          : currentItem,
      ),
    );
    setActionKey(null);
    showToast("已重新开始处理。");
    await loadTrash(undefined, { silent: true });
  }

  async function confirmEmptyTrash() {
    if (actionBusy) return;

    setActionKey("empty");
    const result = await emptyCloudTrash();

    if (!result.ok) {
      setActionKey(null);
      showToast("清空回收站未能开始，请稍后重试");
      return;
    }

    setEmptyConfirmOpen(false);
    setActionKey(null);
    if (result.action === "empty") {
      showToast("回收站已清空。");
    } else if (result.morePending) {
      showToast("已完成本次受理，回收站仍有内容，请再次清空。");
    } else if (result.failed > 0) {
      showToast("已完成部分受理，部分内容未能处理，请稍后重试清空。");
    } else {
      showToast("已开始清空，正在后台处理。");
    }
    await loadTrash(undefined, { silent: true });
  }

  return (
    <main style={pageStyle}>
      <div style={topRowStyle}>
        <div>
          <div style={eyebrowStyle}>云端内容</div>
          <h1 style={titleStyle}>回收站</h1>
        </div>
        <div style={topActionsStyle}>
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={() => setEmptyConfirmOpen(true)}
              disabled={actionBusy}
              style={emptyButtonStyle}
            >
              清空回收站
            </button>
          ) : null}
          <Link href="/profile" style={backLinkStyle}>
            返回我的空间
          </Link>
        </div>
      </div>

      <section style={noticeStyle}>
        <strong>回收站内容会继续占用云空间。</strong>
        <span>恢复后可继续使用；永久删除受理后无法恢复，并会在后台安全处理。</span>
      </section>

      {refreshError && items.length > 0 ? (
        <div style={refreshErrorStyle} role="status">
          <span>{refreshError.trim()}</span>
          <button
            type="button"
            onClick={() => void loadTrash(undefined, { silent: true })}
            style={inlineRefreshButtonStyle}
          >
            刷新
          </button>
        </div>
      ) : null}

      {loading ? (
        <section style={stateStyle}>正在读取回收站...</section>
      ) : error ? (
        <section style={stateStyle}>
          <p style={stateTextStyle}>{error}</p>
          <button
            type="button"
            onClick={() => void loadTrash()}
            style={retryButtonStyle}
          >
            重新读取
          </button>
        </section>
      ) : items.length === 0 ? (
        <section style={stateStyle}>回收站还是空的。</section>
      ) : (
        <section style={listStyle} aria-label="云端回收站内容">
          {items.map((item) => {
            const itemBusy = actionKey?.endsWith(item.trashEntryId) === true;
            return (
              <article key={item.trashEntryId} style={itemStyle}>
                <div style={previewStyle}>
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={`${item.title}预览`}
                      loading="lazy"
                      style={previewImageStyle}
                    />
                  ) : (
                    <span style={previewPlaceholderStyle} aria-hidden="true">
                      {item.type === "archive" ? "项目" : item.type === "record" ? "记录" : "照片"}
                    </span>
                  )}
                </div>
                <div style={itemContentStyle}>
                  <div style={itemMetaRowStyle}>
                    <span style={typeChipStyle}>{getTypeLabel(item.type)}</span>
                    <time dateTime={item.deletedAt} style={deletedTimeStyle}>
                      {formatDeletedAt(item.deletedAt)}
                    </time>
                    {item.status === "purging" ? (
                      <span style={processingChipStyle}>正在永久删除</span>
                    ) : item.status === "failed" ? (
                      <span style={failedChipStyle}>永久删除失败</span>
                    ) : null}
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
                  {item.status === "failed" ? (
                    <div style={failedMessageStyle}>
                      {item.canRetry
                        ? "删除未完成，请重试。"
                        : "删除未完成，需要稍后处理。"}
                    </div>
                  ) : null}
                </div>
                <div style={itemActionsStyle}>
                  {item.status === "active" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setRestoreTarget(item)}
                        disabled={actionBusy}
                        style={restoreButtonStyle}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurgeTarget(item)}
                        disabled={actionBusy}
                        style={purgeButtonStyle}
                      >
                        永久删除
                      </button>
                    </>
                  ) : item.status === "purging" ? (
                    <span style={processingTextStyle}>处理中...</span>
                  ) : item.canRetry ? (
                    <button
                      type="button"
                      onClick={() => void retryPurge(item)}
                      disabled={actionBusy}
                      style={retryPurgeButtonStyle}
                    >
                      {itemBusy ? "重试中..." : "重试"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
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
        confirmText={actionKey?.startsWith("restore:") ? "恢复中..." : "恢复"}
        cancelText="取消"
        confirmDisabled={actionBusy}
        cancelDisabled={actionBusy}
        onClose={() => {
          if (!actionBusy) setRestoreTarget(null);
        }}
        onConfirm={confirmRestore}
      />

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        title="确定永久删除？"
        message={purgeTarget ? getPurgeConfirmMessage(purgeTarget.type) : "删除后无法恢复。"}
        confirmText={actionKey?.startsWith("purge:") ? "处理中..." : "永久删除"}
        cancelText="取消"
        danger
        confirmDisabled={actionBusy}
        cancelDisabled={actionBusy}
        onClose={() => {
          if (!actionBusy) setPurgeTarget(null);
        }}
        onConfirm={confirmPurge}
      />

      <ConfirmDialog
        open={emptyConfirmOpen}
        title="确定清空回收站？"
        message="回收站中的所有内容将被永久删除，删除后无法恢复。"
        confirmText={actionKey === "empty" ? "处理中..." : "清空回收站"}
        cancelText="取消"
        danger
        confirmDisabled={actionBusy}
        cancelDisabled={actionBusy}
        onClose={() => {
          if (!actionBusy) setEmptyConfirmOpen(false);
        }}
        onConfirm={confirmEmptyTrash}
      />
    </main>
  );
}

function getTypeLabel(type: CloudTrashItem["type"]) {
  if (type === "archive") return "项目";
  if (type === "record") return "记录";
  return "照片";
}

function getPurgeConfirmMessage(type: CloudTrashItem["type"]) {
  if (type === "archive") {
    return "项目中的记录和照片也会一起永久删除，删除后无法恢复。";
  }
  if (type === "record") {
    return "这条记录及其中的照片将被永久删除，删除后无法恢复。";
  }
  return "删除后无法恢复。";
}

function formatDeletedAt(value: string) {
  const text = formatPreciseDateTime(value);
  return text ? `${text} 移入` : "删除时间未知";
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
const topActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};
const eyebrowStyle: CSSProperties = { color: "#6a7d63", fontSize: 13 };
const titleStyle: CSSProperties = { margin: "4px 0 0", color: "#1f2a1f", fontSize: 27 };
const backLinkStyle: CSSProperties = { color: "#4e6948", fontSize: 14 };
const emptyButtonStyle: CSSProperties = {
  border: "1px solid #d8a9a9",
  borderRadius: 9,
  background: "#fffafa",
  color: "#a04444",
  padding: "7px 11px",
  fontSize: 13,
  cursor: "pointer",
};
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
const refreshErrorStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 12,
  color: "#8a5d2d",
  fontSize: 13,
};
const inlineRefreshButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#496b43",
  textDecoration: "underline",
  cursor: "pointer",
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
  flexWrap: "wrap",
};
const previewStyle: CSSProperties = {
  width: 92,
  height: 76,
  flex: "0 0 92px",
  overflow: "hidden",
  borderRadius: 10,
  background: "linear-gradient(145deg, #eef4eb, #f7f3e8)",
};
const previewImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "cover",
};
const previewPlaceholderStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "flex-end",
  padding: 9,
  boxSizing: "border-box",
  color: "#778572",
  fontSize: 12,
  fontWeight: 800,
};
const itemContentStyle: CSSProperties = { minWidth: 180, flex: "1 1 320px" };
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
const processingChipStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f1f4ef",
  color: "#647161",
  padding: "2px 8px",
  fontSize: 12,
};
const failedChipStyle: CSSProperties = {
  borderRadius: 999,
  background: "#fff3f1",
  color: "#a04b43",
  padding: "2px 8px",
  fontSize: 12,
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
const failedMessageStyle: CSSProperties = { marginTop: 6, color: "#95605a", fontSize: 12 };
const itemActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  flexShrink: 0,
  marginLeft: "auto",
};
const restoreButtonStyle: CSSProperties = {
  border: "1px solid #bcd5b5",
  borderRadius: 9,
  background: "#f3faf0",
  color: "#356731",
  padding: "8px 12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const purgeButtonStyle: CSSProperties = {
  border: "1px solid #dfb3b3",
  borderRadius: 9,
  background: "#fffafa",
  color: "#a04444",
  padding: "8px 12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const retryPurgeButtonStyle: CSSProperties = {
  border: "1px solid #d5b6ae",
  borderRadius: 9,
  background: "#fff8f5",
  color: "#934d42",
  padding: "8px 12px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};
const processingTextStyle: CSSProperties = { color: "#768174", fontSize: 13 };
