"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import { saveQuickCapture, type QuickCaptureTarget } from "@/lib/quick-capture";
import { MAX_RECORD_PHOTOS_PER_ADD } from "@/lib/record-photo-batches";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { useIsNativeApp } from "@/lib/capacitor/useIsNativeApp";

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
  const { language, t } = useLanguage();
  const isNativeApp = useIsNativeApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const isMarketPath = pathname === "/market" || pathname.startsWith("/market/");

  if (isMarketPath) {
    const publishLabel = language === "en" ? "Post" : "发布";
    return (
      <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
        <Link
          href="/market/new"
          aria-label={t.market.post_information}
          title={t.market.post_information}
          style={{
            minWidth: 44,
            marginTop: -12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            color: "#806128",
            textDecoration: "none",
            fontSize: 11,
            lineHeight: 1,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              border: "3px solid #fff",
              borderRadius: 999,
              background: "#8a6a32",
              boxShadow: "0 5px 14px rgba(104, 76, 30, 0.22)",
              color: "#fff",
            }}
          >
            <UiIcon name="plus" size={18} strokeWidth={2.2} />
          </span>
          {publishLabel}
        </Link>
      </div>
    );
  }

  async function handleCapture(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []).slice(
      0,
      MAX_RECORD_PHOTOS_PER_ADD,
    );
    event.target.value = "";
    if (selected.length === 0 || busy) return;
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
      {/* Forced capture can open a black camera surface in some Android
          browsers. Let the browser offer Camera or Photos; keep direct rear
          camera capture only inside the installed Android app. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={isNativeApp === true ? "environment" : undefined}
        onChange={handleCapture}
        style={{ display: "none" }}
      />
    </div>
  );
}
