"use client";

import type { SortMode } from "@/lib/archive-page-types";

type Props = {
  searchKeyword: string;
  sortMode: SortMode;
  onSearchKeywordChange: (value: string) => void;
  onSortModeChange: (value: SortMode) => void;
  onCreateArchive: () => void;
};

export default function ArchiveToolbar({
  searchKeyword,
  sortMode,
  onSearchKeywordChange,
  onSortModeChange,
  onCreateArchive,
}: Props) {
  return (
    <section
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 14,
      }}
    >
      <button
        type="button"
        onClick={onCreateArchive}
        style={{
          padding: "10px 16px",
          borderRadius: 999,
          border: "1px solid #cfe3c8",
          background: "#3f7d3d",
          color: "#fff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        新建项目
      </button>

      <input
        value={searchKeyword}
        onChange={(event) => onSearchKeywordChange(event.target.value)}
        placeholder="搜索我的项目"
        style={{
          flex: "0 1 240px",
          width: 240,
          maxWidth: "100%",
          border: "1px solid #dfe7d9",
          borderRadius: 999,
          padding: "10px 14px",
          fontSize: 14,
          outline: "none",
          background: "#fff",
        }}
      />

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "#777",
          fontSize: 14,
        }}
      >
        排序：
        <select
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as SortMode)}
          style={{
            border: "1px solid #dfe7d9",
            borderRadius: 999,
            padding: "9px 12px",
            fontSize: 14,
            background: "#fff",
            color: "#3d4a3d",
            cursor: "pointer",
          }}
        >
          <option value="created">新建顺序</option>
          <option value="name">按名字</option>
          <option value="updated">最近更新</option>
        </select>
      </label>
    </section>
  );
}
