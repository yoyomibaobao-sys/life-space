"use client";

import type { SubTagItem } from "@/lib/archive-page-types";

type Props = {
  tag: SubTagItem;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export default function ArchiveSubTagChip({
  tag,
  active,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginRight: 3,
        marginBottom: 4,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onRename}
        style={{
          border: active ? "1px solid #2f6d2f" : "1px solid #dfe7d9",
          background: active ? "#2f6d2f" : "#fff",
          color: active ? "#fff" : "#374437",
          borderRadius: 999,
          padding: "7px 13px",
          fontSize: 15,
          fontWeight: active ? 700 : 500,
          cursor: "pointer",
          lineHeight: 1.3,
          boxShadow: active ? "0 6px 14px rgba(63,125,61,0.18)" : "none",
        }}
        title="双击可修改名称"
      >
        {tag.name}
      </button>

      <button
        type="button"
        onClick={onDelete}
        style={{
          border: "none",
          background: "transparent",
          color: "#b7b7b7",
          cursor: "pointer",
          fontSize: 13,
          padding: 0,
          lineHeight: 1,
        }}
        title="删除分类"
      >
        ×
      </button>
    </span>
  );
}
