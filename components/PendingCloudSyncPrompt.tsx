"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import {
  deferPendingCloudSyncPrompt,
  listPendingCloudSyncSummaries,
  preparePendingCloudSyncQueue,
  type LocalArchiveOwnerContext,
  type PendingCloudSyncSummary,
} from "@/lib/local-offline-db";
import type { PendingCloudSyncProgress } from "@/lib/pending-cloud-sync";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function PendingCloudSyncPrompt() {
  const { t } = useLanguage();
  const copy = t.archive;
  const scanningRef = useRef(false);
  const [summary, setSummary] = useState<PendingCloudSyncSummary | null>(null);
  const [ownerContext, setOwnerContext] =
    useState<LocalArchiveOwnerContext | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PendingCloudSyncProgress | null>(null);
  const [error, setError] = useState("");

  const scan = useCallback(async () => {
    if (
      scanningRef.current ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    ) {
      return;
    }

    scanningRef.current = true;
    try {
      const { supabase } = await import("@/lib/supabase");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setOwnerContext(null);
        setSummary(null);
        return;
      }

      const owner = { userId: user.id, email: user.email || null };
      setOwnerContext(owner);
      await preparePendingCloudSyncQueue(owner);
      const summaries = await listPendingCloudSyncSummaries(owner);
      setSummary(summaries.find((item) => item.should_prompt) || null);
      setError("");
      setProgress(null);
    } catch {
      // A later reconnect or app start can safely scan the local queue again.
    } finally {
      scanningRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const handleOnline = () => void scan();
    window.addEventListener("online", handleOnline);
    void import("@/lib/supabase")
      .then(({ supabase }) => {
        if (cancelled) return;
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(() => {
          void scan();
        });
        unsubscribe = () => subscription.unsubscribe();
        void scan();
      })
      .catch(() => {
        // Offline startup keeps the local app available without cloud config.
      });

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      unsubscribe?.();
    };
  }, [scan]);

  async function defer() {
    if (!summary || !ownerContext || running) return;
    try {
      await deferPendingCloudSyncPrompt(summary.local_archive_id, ownerContext);
    } catch {
      // The queue may already have completed in another open tab.
    } finally {
      setSummary(null);
      setError("");
      setProgress(null);
    }
  }

  async function upload() {
    if (!summary || !ownerContext || running) return;
    if (!navigator.onLine) {
      setError(copy.pending_sync_offline);
      return;
    }

    setRunning(true);
    setError("");
    setProgress(null);
    const { syncPendingCloudArchive } = await import(
      "@/lib/pending-cloud-sync"
    );
    const result = await syncPendingCloudArchive({
      localArchiveId: summary.local_archive_id,
      ownerContext,
      onProgress: setProgress,
    });
    setRunning(false);

    if (result.success) {
      showToast(copy.pending_sync_success);
      setSummary(null);
      setProgress(null);
      window.setTimeout(() => void scan(), 0);
      return;
    }

    setError(result.error || copy.pending_sync_incomplete);
    const summaries = await listPendingCloudSyncSummaries(ownerContext).catch(
      () => []
    );
    setSummary(
      summaries.find(
        (item) => item.local_archive_id === summary.local_archive_id
      ) || summary
    );
  }

  const pendingParts = summary
    ? [
        summary.archive_update_pending ? copy.pending_sync_archive_item : null,
        summary.record_count > 0
          ? `${summary.record_count} ${copy.pending_sync_record_unit}`
          : null,
        summary.image_count > 0
          ? `${summary.image_count} ${copy.pending_sync_photo_unit}`
          : null,
      ].filter(Boolean)
    : [];
  const progressText = progress
    ? `${copy.pending_sync_progress} ${progress.completed}/${progress.total}`
    : "";

  return (
    <ConfirmDialog
      open={Boolean(summary)}
      title={copy.pending_sync_title}
      message={
        summary
          ? `${summary.title}\n${copy.pending_sync_intro}\n${pendingParts.join(" · ")}`
          : ""
      }
      confirmText={running ? copy.pending_sync_uploading : copy.pending_sync_now}
      cancelText={copy.pending_sync_later}
      confirmDisabled={running}
      cancelDisabled={running}
      onConfirm={upload}
      onClose={() => void defer()}
    >
      {progressText ? (
        <div style={{ color: "#52634f", fontSize: 13 }}>{progressText}</div>
      ) : null}
      {summary && summary.failed_record_count + summary.failed_image_count > 0 ? (
        <div style={{ color: "#8a5a36", fontSize: 13, marginTop: 6 }}>
          {copy.pending_sync_failed_hint}
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ color: "#a44848", fontSize: 13, marginTop: 6 }}>
          {error}
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
