"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import {
  checkAndroidUpdate, getAndroidUpdateSnapshot, getAndroidUpdateServerSnapshot,
  subscribeAndroidUpdates,
} from "@/lib/android-app-update";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function AndroidAppVersionEntry() {
  const { t } = useLanguage();
  const update = useSyncExternalStore(subscribeAndroidUpdates, getAndroidUpdateSnapshot, getAndroidUpdateServerSnapshot);
  useEffect(() => { void checkAndroidUpdate(); }, []);
  const versionName = update.currentVersion?.versionName || "";
  const availableVersion = update.release?.version_name || "";
  const state = update.status;

  const status = state === "available"
    ? t.app_update.available_version.replace("{version}", availableVersion)
    : state === "latest"
      ? t.app_update.latest_short
      : state === "failed"
        ? t.app_update.check_now
        : t.app_update.reading_version;

  return (
    <Link href="/app-update" style={entryStyle}>
      <span style={copyStyle}>
        <strong style={titleStyle}>{t.app_update.version_setting}</strong>
        <span style={detailStyle}>
          {versionName ? `${versionName} · ${status}` : status}
        </span>
      </span>
      <span style={state === "available" ? availableStyle : arrowStyle}>
        {state === "available" ? t.app_update.update_action : null}
        <UiIcon name="arrow-right" size={17} />
      </span>
    </Link>
  );
}

const entryStyle: CSSProperties = {
  minHeight: 58,
  padding: "11px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  border: "1px solid #e1e9dd",
  borderRadius: 14,
  background: "#fff",
  color: "#334c32",
  textDecoration: "none",
  boxSizing: "border-box",
};

const copyStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 4,
};

const titleStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.35,
};

const detailStyle: CSSProperties = {
  color: "#748070",
  fontSize: 12,
  lineHeight: 1.45,
};

const arrowStyle: CSSProperties = {
  display: "inline-flex",
  color: "#6f7e6a",
};

const availableStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "#3e7a3c",
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
