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
import { buildLoginHref } from "@/lib/auth-return";
import { formatPreciseDateTime } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n/useLanguage";
import type { TranslationDictionary } from "@/lib/i18n";

type LoadOptions = {
  silent?: boolean;
};

export default function CloudTrashPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const trashT = t.profile.trash_page;
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
          setRefreshError(trashT.state_update_failed);
        } else {
          setItems([]);
          setError(trashT.load_failed);
        }
      } else {
        setItems(result.items);
        setError("");
        setRefreshError("");
      }

      if (!options.silent) setLoading(false);
    },
    [trashT],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function init() {
      const userResult = await supabase.auth.getUser();
      if (controller.signal.aborted) return;

      if (userResult.error || !userResult.data.user) {
        router.replace(buildLoginHref("/profile/trash"));
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
      showToast(trashT.restore_failed);
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
        ? trashT.photo_restored
        : trashT.restored,
    );
  }

  async function confirmPurge() {
    if (!purgeTarget || actionBusy) return;

    const entryId = purgeTarget.trashEntryId;
    setActionKey(`purge:${entryId}`);
    const result = await purgeCloudTrashItem(entryId);

    if (!result.ok) {
      setActionKey(null);
      showToast(trashT.purge_start_failed);
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
    showToast(trashT.purge_started);
    await loadTrash(undefined, { silent: true });
  }

  async function retryPurge(item: CloudTrashItem) {
    if (actionBusy || item.status !== "failed" || !item.canRetry) return;

    setActionKey(`retry:${item.trashEntryId}`);
    const result = await retryCloudTrashItem(item.trashEntryId);

    if (!result.ok) {
      setActionKey(null);
      showToast(trashT.purge_incomplete);
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
    showToast(trashT.restarted);
    await loadTrash(undefined, { silent: true });
  }

  async function confirmEmptyTrash() {
    if (actionBusy) return;

    setActionKey("empty");
    const result = await emptyCloudTrash();

    if (!result.ok) {
      setActionKey(null);
      showToast(trashT.empty_start_failed);
      return;
    }

    setEmptyConfirmOpen(false);
    setActionKey(null);
    if (result.action === "empty") {
      showToast(trashT.emptied);
    } else if (result.morePending) {
      showToast(trashT.partially_remaining);
    } else if (result.failed > 0) {
      showToast(trashT.partially_failed);
    } else {
      showToast(trashT.empty_started);
    }
    await loadTrash(undefined, { silent: true });
  }

  return (
    <main style={pageStyle}>
      <div style={topRowStyle}>
        <div>
          <div style={eyebrowStyle}>{trashT.cloud_content}</div>
          <h1 style={titleStyle}>{trashT.title}</h1>
        </div>
        <div style={topActionsStyle}>
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={() => setEmptyConfirmOpen(true)}
              disabled={actionBusy}
              style={emptyButtonStyle}
            >
              {trashT.empty_trash}
            </button>
          ) : null}
          <Link href="/profile" style={backLinkStyle}>
            {trashT.back}
          </Link>
        </div>
      </div>

      <section style={noticeStyle}>
        <strong>{trashT.capacity_notice}</strong>
        <span>{trashT.recover_notice}</span>
      </section>

      {refreshError && items.length > 0 ? (
        <div style={refreshErrorStyle} role="status">
          <span>{refreshError.trim()}</span>
          <button
            type="button"
            onClick={() => void loadTrash(undefined, { silent: true })}
            style={inlineRefreshButtonStyle}
          >
            {trashT.refresh}
          </button>
        </div>
      ) : null}

      {loading ? (
        <section style={stateStyle}>{trashT.loading}</section>
      ) : error ? (
        <section style={stateStyle}>
          <p style={stateTextStyle}>{error}</p>
          <button
            type="button"
            onClick={() => void loadTrash()}
            style={retryButtonStyle}
          >
            {trashT.reload}
          </button>
        </section>
      ) : items.length === 0 ? (
        <section style={stateStyle}>{trashT.empty}</section>
      ) : (
        <section style={listStyle} aria-label={trashT.list_aria}>
          {items.map((item) => {
            const itemBusy = actionKey?.endsWith(item.trashEntryId) === true;
            return (
              <article key={item.trashEntryId} style={itemStyle}>
                <div style={previewStyle}>
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={`${item.title}${trashT.preview_suffix}`}
                      loading="lazy"
                      style={previewImageStyle}
                    />
                  ) : (
                    <span style={previewPlaceholderStyle} aria-hidden="true">
                      {getTrashTypeLabel(item.type, trashT)}
                    </span>
                  )}
                </div>
                <div style={itemContentStyle}>
                  <div style={itemMetaRowStyle}>
                    <span style={typeChipStyle}>{getTrashTypeLabel(item.type, trashT)}</span>
                    <time dateTime={item.deletedAt} style={deletedTimeStyle}>
                      {formatDeletedAt(item.deletedAt, trashT)}
                    </time>
                    {item.status === "purging" ? (
                      <span style={processingChipStyle}>{trashT.purging}</span>
                    ) : item.status === "failed" ? (
                      <span style={failedChipStyle}>{trashT.purge_failed}</span>
                    ) : null}
                  </div>
                  <h2 style={itemTitleStyle}>{item.title}</h2>
                  {item.parentTitle ? (
                    <div style={parentTitleStyle}>{trashT.original_project}{item.parentTitle}</div>
                  ) : null}
                  {item.recordCount > 0 || item.mediaCount > 0 ? (
                    <div style={countStyle}>
                      {item.recordCount > 0 ? `${trashT.record_prefix} ${item.recordCount}${trashT.item_suffix}` : null}
                      {item.recordCount > 0 && item.mediaCount > 0 ? " · " : null}
                      {item.mediaCount > 0 ? `${trashT.photo_prefix} ${item.mediaCount}${trashT.photo_suffix}` : null}
                    </div>
                  ) : null}
                  {item.status === "failed" ? (
                    <div style={failedMessageStyle}>
                      {item.canRetry
                        ? trashT.retry_delete
                        : trashT.delayed_delete}
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
                        {trashT.restore}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurgeTarget(item)}
                        disabled={actionBusy}
                        style={purgeButtonStyle}
                      >
                        {trashT.purge}
                      </button>
                    </>
                  ) : item.status === "purging" ? (
                    <span style={processingTextStyle}>{trashT.processing}</span>
                  ) : item.canRetry ? (
                    <button
                      type="button"
                      onClick={() => void retryPurge(item)}
                      disabled={actionBusy}
                      style={retryPurgeButtonStyle}
                    >
                      {itemBusy ? trashT.retrying : trashT.retry}
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
        title={`${trashT.restore_title_prefix}${restoreTarget ? getTrashTypeLabel(restoreTarget.type, trashT) : trashT.content}`}
        message={
          restoreTarget?.type === "media"
            ? trashT.restore_photo_message
            : trashT.restore_message
        }
        confirmText={actionKey?.startsWith("restore:") ? trashT.restoring : trashT.restore}
        cancelText={trashT.cancel}
        confirmDisabled={actionBusy}
        cancelDisabled={actionBusy}
        onClose={() => {
          if (!actionBusy) setRestoreTarget(null);
        }}
        onConfirm={confirmRestore}
      />

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        title={trashT.purge_title}
        message={purgeTarget ? getPurgeConfirmMessage(purgeTarget.type, trashT) : trashT.purge_fallback}
        confirmText={actionKey?.startsWith("purge:") ? trashT.processing : trashT.purge}
        cancelText={trashT.cancel}
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
        title={trashT.empty_title}
        message={trashT.empty_message}
        confirmText={actionKey === "empty" ? trashT.processing : trashT.empty_trash}
        cancelText={trashT.cancel}
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

type TrashTranslations = TranslationDictionary["profile"]["trash_page"];

function getTrashTypeLabel(
  type: CloudTrashItem["type"],
  translations: TrashTranslations
) {
  if (type === "archive") return translations.project;
  if (type === "record") return translations.record;
  return translations.photo;
}

function getPurgeConfirmMessage(
  type: CloudTrashItem["type"],
  translations: TrashTranslations
) {
  if (type === "archive") {
    return translations.project_purge_message;
  }
  if (type === "record") {
    return translations.record_purge_message;
  }
  return translations.purge_fallback;
}

function formatDeletedAt(value: string, translations: TrashTranslations) {
  const text = formatPreciseDateTime(value);
  return text ? `${text} ${translations.moved_suffix}` : translations.unknown_delete_time;
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
