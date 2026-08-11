"use client";

import type { CSSProperties } from "react";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { ArchiveCategoryFilterValue } from "@/components/archive-ui/types";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  activeCategory: ArchiveCategoryFilterValue;
  counts: Record<ArchiveCategory, number>;
  totalCount: number;
  onSelect: (category: ArchiveCategoryFilterValue) => void;
  label?: string;
  mobileMode?: boolean;
};

export default function ArchiveCategoryTabs({
  activeCategory,
  counts,
  totalCount,
  onSelect,
  label,
  mobileMode = false,
}: Props) {
  const { language, t } = useLanguage();
  const tabs: Array<{ value: ArchiveCategoryFilterValue; label: string; count: number }> = [
    { value: null, label: t.archive_workspace.all, count: totalCount },
    ...archiveCategoryOptions.map((option) => ({
      value: option.value,
      label: getArchiveCategoryLabel(option.value, language),
      count: counts[option.value] || 0,
    })),
  ];

  return (
    <section
      style={mobileMode ? mobileWrapStyle : wrapStyle}
      aria-label={t.archive_workspace.project_categories_aria}
    >
      <span style={labelStyle}>{label || t.archive_workspace.main_category}</span>
      {tabs.map((tab) => {
        const active = activeCategory === tab.value;

        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => onSelect(tab.value)}
            style={tabButtonStyle(active, mobileMode)}
          >
            {tab.label}（{tab.count}）
          </button>
        );
      })}
    </section>
  );
}

const wrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const mobileWrapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto repeat(5, minmax(0, 1fr))",
  gap: 6,
  padding: 4,
  border: "1px solid #e2ecd9",
  borderRadius: 16,
  background: "#fff",
};

const labelStyle: CSSProperties = {
  alignSelf: "center",
  color: "#7a8675",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.2,
  paddingLeft: 4,
  whiteSpace: "nowrap",
};

function tabButtonStyle(active: boolean, mobileMode: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: mobileMode ? 38 : 32,
    border: mobileMode ? "none" : active ? "1px solid #9fc796" : "1px solid #dfe7d9",
    borderRadius: mobileMode ? 12 : 999,
    background: active ? "#e3f1dd" : mobileMode ? "transparent" : "#fff",
    color: active ? "#2f6a31" : "#61705d",
    fontSize: mobileMode ? 13 : 13,
    fontWeight: active ? 800 : 700,
    whiteSpace: "normal",
    wordBreak: "keep-all",
    lineHeight: mobileMode ? 1.15 : 1.25,
    padding: mobileMode ? "6px 4px" : "5px 10px",
    cursor: "pointer",
  };
}
