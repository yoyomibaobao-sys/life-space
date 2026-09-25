"use client";

import type { CSSProperties } from "react";

export type ArchiveDetailTabKey = "records" | "profile" | "experience";

export default function ArchiveDetailTabBar({
  active,
  labels,
  experienceCount,
  language,
  ariaLabel,
  onChange,
}: {
  active: ArchiveDetailTabKey;
  labels: {
    records: string;
    profile: string;
    experience: string;
  };
  experienceCount?: number;
  language: "zh" | "en";
  ariaLabel: string;
  onChange: (tab: ArchiveDetailTabKey) => void;
}) {
  const experienceLabel =
    typeof experienceCount === "number"
      ? language === "en"
        ? `${labels.experience} (${experienceCount})`
        : `${labels.experience}（${experienceCount}）`
      : labels.experience;

  return (
    <nav style={archiveDetailTabWrapStyle} aria-label={ariaLabel}>
      <button
        type="button"
        onClick={() => onChange("records")}
        style={archiveDetailTabButtonStyle(active === "records")}
      >
        {labels.records}
      </button>
      <button
        type="button"
        onClick={() => onChange("profile")}
        style={archiveDetailTabButtonStyle(active === "profile")}
      >
        {labels.profile}
      </button>
      <button
        type="button"
        onClick={() => onChange("experience")}
        style={archiveDetailTabButtonStyle(active === "experience")}
      >
        {experienceLabel}
      </button>
    </nav>
  );
}

export const archiveDetailTabWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
  marginBottom: 8,
  padding: 4,
  border: "1px solid #e2ecd9",
  borderRadius: 16,
  background: "#fff",
};

export function archiveDetailTabButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 42,
    border: "none",
    borderRadius: 12,
    color: active ? "#2f6a31" : "#40583a",
    background: active ? "#e3f1dd" : "transparent",
    fontSize: "clamp(14px, 3.6vw, 16px)",
    fontWeight: 800,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}
