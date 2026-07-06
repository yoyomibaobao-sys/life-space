"use client";

import type { CSSProperties, ReactNode } from "react";
import ArchiveToolbar from "@/components/archive/ArchiveToolbar";
import type { ArchiveCategory } from "@/lib/archive-categories";

type SourceOption<T extends string> = {
  value: T;
  label: string;
  count: number;
};

type Props<T extends string> = {
  statsText?: ReactNode;
  sourceOptions: Array<SourceOption<T>>;
  activeSource: T;
  onSelectSource: (source: T) => void;
  onCreateArchive: (category: ArchiveCategory) => void;
  createDisabled?: boolean;
  createDisabledTitle?: string;
  createDisabledHref?: string;
  filtersSlot?: ReactNode;
  noticeSlot?: ReactNode;
  children: ReactNode;
};

export default function ArchiveWorkspaceTemplate<T extends string>({
  statsText,
  sourceOptions,
  activeSource,
  onSelectSource,
  onCreateArchive,
  createDisabled,
  createDisabledTitle,
  createDisabledHref,
  filtersSlot,
  noticeSlot,
  children,
}: Props<T>) {
  return (
    <>
      {statsText ? <div style={statsStyle}>{statsText}</div> : null}

      <section style={sourceSwitchStyle}>
        {sourceOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelectSource(item.value)}
            style={sourceButtonStyle(activeSource === item.value)}
          >
            {item.label} {item.count}
          </button>
        ))}
      </section>

      <ArchiveToolbar
        onCreateArchive={onCreateArchive}
        createDisabled={createDisabled}
        createDisabledTitle={createDisabledTitle}
        createDisabledHref={createDisabledHref}
      />

      {filtersSlot}
      {noticeSlot}

      <section style={projectListStyle}>{children}</section>
    </>
  );
}

const statsStyle: CSSProperties = {
  fontSize: 14,
  color: "#6f7b6a",
  marginBottom: 18,
};

const sourceSwitchStyle: CSSProperties = {
  margin: "0 0 12px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

function sourceButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: active ? "1px solid #9fc796" : "1px solid #dfe7d9",
    background: active ? "#eef7e8" : "#fff",
    color: active ? "#2f6a2c" : "#5d6957",
    fontSize: 13,
    fontWeight: active ? 800 : 700,
    cursor: "pointer",
  };
}

const projectListStyle: CSSProperties = {
  marginTop: 0,
};
