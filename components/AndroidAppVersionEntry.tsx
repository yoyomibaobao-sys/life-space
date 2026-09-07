"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import {
  ANDROID_RELEASE_MANIFEST_PATH,
  isAndroidReleaseManifest,
} from "@/lib/android-release";
import { useLanguage } from "@/lib/i18n/useLanguage";

type VersionState = "loading" | "latest" | "available" | "unavailable";

export default function AndroidAppVersionEntry() {
  const { t } = useLanguage();
  const [versionName, setVersionName] = useState("");
  const [availableVersion, setAvailableVersion] = useState("");
  const [state, setState] = useState<VersionState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadVersionState() {
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
        return;
      }

      try {
        const info = await App.getInfo();
        if (cancelled) return;
        setVersionName(info.version);

        const response = await fetch(ANDROID_RELEASE_MANIFEST_PATH, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Release metadata is unavailable.");
        const value: unknown = await response.json();
        if (!isAndroidReleaseManifest(value)) {
          throw new Error("Release metadata is invalid.");
        }

        const currentVersionCode = Number(info.build);
        if (
          Number.isSafeInteger(currentVersionCode) &&
          value.version_code > currentVersionCode
        ) {
          setAvailableVersion(value.version_name);
          setState("available");
          return;
        }
        setState("latest");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }

    void loadVersionState();
    return () => {
      cancelled = true;
    };
  }, []);

  const status = state === "available"
    ? t.app_update.available_version.replace("{version}", availableVersion)
    : state === "latest"
      ? t.app_update.latest_short
      : state === "unavailable"
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
