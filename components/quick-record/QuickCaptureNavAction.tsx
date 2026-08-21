"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import { saveQuickCapture, type QuickCaptureTarget } from "@/lib/quick-capture";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function QuickCaptureNavAction({
  pathname,
  cloudArchiveId,
  localArchiveId,
}: {
  pathname: string;
  cloudArchiveId?: string | null;
  localArchiveId?: string | null;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCapture(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    if (!selected || busy) return;
    setBusy(true);

    try {
      const targetType: QuickCaptureTarget = cloudArchiveId
        ? "cloud"
        : localArchiveId
          ? "local"
          : null;
      const archiveId = cloudArchiveId || localArchiveId || null;
      // The record editor performs the required standardisation when saving.
      // Keeping the original blob here makes the camera return immediate.
      const capture = await saveQuickCapture(selected, {
        sourcePath: pathname,
        targetType,
        archiveId,
      });

      if (targetType === "cloud" && archiveId) {
        router.push(`/archive/${archiveId}?quickCapture=${capture.id}#add-record`);
      } else if (targetType === "local" && archiveId) {
        router.push(`/local/archive/${archiveId}?quickCapture=${capture.id}#add-record`);
      } else {
        router.push(`/quick-record?capture=${capture.id}`);
      }
    } catch {
      showToast(t.quick_record.capture_failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={t.quick_record.take_photo}
        title={t.quick_record.take_photo}
        style={{
          width: 48,
          height: 48,
          marginTop: -16,
          display: "grid",
          placeItems: "center",
          border: "3px solid #fff",
          borderRadius: 999,
          background: busy ? "#8aa087" : "#527b50",
          boxShadow: "0 5px 14px rgba(46, 79, 43, 0.24)",
          color: "#fff",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        <UiIcon name="plus" size={25} strokeWidth={2.2} />
      </button>
      {busy ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            background: "rgba(249, 251, 247, 0.82)",
            backdropFilter: "blur(3px)",
            color: "#355a34",
            fontSize: 15,
            fontWeight: 750,
          }}
        >
          {t.quick_record.processing_photo}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        style={{ display: "none" }}
      />
    </div>
  );
}
