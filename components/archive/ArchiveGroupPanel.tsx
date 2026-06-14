"use client";

import type { GroupTagItem } from "@/lib/archive-page-types";

type Props = {
  activeGroupTag: string | null;
  activeSubTag: string | null;
  visibleGroupTags: GroupTagItem[];
  onReset: () => void;
  onToggleGroupTag: (id: string) => void;
  onRenameGroupTag: (tag: GroupTagItem) => void;
  onDeleteGroupTag: (tag: GroupTagItem) => void;
  onCreateGroupTag: () => void;
  mobileMode?: boolean;
};

export default function ArchiveGroupPanel({
  activeGroupTag,
  activeSubTag,
  visibleGroupTags,
  onReset,
  onToggleGroupTag,
  onRenameGroupTag,
  onDeleteGroupTag,
  onCreateGroupTag,
  mobileMode = false,
}: Props) {
  if (visibleGroupTags.length > 0) {
    return (
      <section
        style={{
          marginBottom: mobileMode ? 10 : 18,
          padding: mobileMode ? "7px 8px" : "10px 14px",
          borderRadius: mobileMode ? 12 : 16,
          background: "#fafbf8",
          border: "1px solid #edf0e8",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: mobileMode ? 5 : 8,
        }}
      >
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReset}
          style={{
            border: activeGroupTag ? "1px solid #cfe3c8" : "1px solid #3f7d3d",
            background: activeGroupTag ? "#f4faf1" : "#dff2da",
            color: "#2f6d2f",
            borderRadius: 999,
            fontSize: mobileMode ? 13 : 15,
            fontWeight: 700,
            cursor: "pointer",
            padding: mobileMode ? "5px 9px" : "6px 12px",
            lineHeight: mobileMode ? 1.15 : 1.3,
          }}
          title="点击显示当前分类下全部项目"
        >
          分组：
        </button>

        {visibleGroupTags.map((tag) => (
          <span
            key={tag.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: mobileMode ? 2 : 4,
              marginRight: mobileMode ? 1 : 4,
            }}
          >
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onToggleGroupTag(tag.id)}
              onDoubleClick={() => onRenameGroupTag(tag)}
              style={{
                border:
                  activeGroupTag === tag.id
                    ? "1px solid #3f7d3d"
                    : "1px solid #e1e8dc",
                background: activeGroupTag === tag.id ? "#3f7d3d" : "#fff",
                color: activeGroupTag === tag.id ? "#fff" : "#374437",
                borderRadius: 999,
                padding: mobileMode ? "5px 9px" : "6px 12px",
                fontSize: mobileMode ? 13 : 15,
                cursor: "pointer",
                lineHeight: mobileMode ? 1.15 : 1.3,
              }}
              title="双击可修改名称"
            >
              {tag.name}
            </button>

            <button
              type="button"
              onClick={() => onDeleteGroupTag(tag)}
              style={{
                border: "none",
                background: "transparent",
                color: "#b7b7b7",
                cursor: "pointer",
                fontSize: mobileMode ? 12 : 13,
                padding: mobileMode ? "2px 1px" : 0,
                lineHeight: 1,
              }}
              title="删除分组"
            >
              ×
            </button>
          </span>
        ))}

        {activeSubTag && (
          <button
            type="button"
            onClick={onCreateGroupTag}
            style={{
              border: "1px dashed #cbdcc2",
              background: "#fbfdf9",
              color: "#4CAF50",
              borderRadius: 999,
              padding: mobileMode ? "4px 8px" : "5px 10px",
              cursor: "pointer",
              fontSize: mobileMode ? 13 : 14,
              lineHeight: mobileMode ? 1.15 : 1.3,
            }}
          >
            ＋
          </button>
        )}
      </section>
    );
  }

  if (activeSubTag) {
    return (
      <section
        style={{
          marginBottom: mobileMode ? 10 : 18,
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <button
          type="button"
          onClick={onCreateGroupTag}
          style={{
            border: "1px dashed #d9e6d0",
            background: "#fbfdf9",
            color: "#6f9b63",
            borderRadius: 999,
            padding: mobileMode ? "4px 8px" : "5px 10px",
            cursor: "pointer",
            fontSize: mobileMode ? 12 : 13,
            lineHeight: mobileMode ? 1.15 : 1.3,
          }}
        >
          ＋ 新增分组
        </button>
      </section>
    );
  }

  return null;
}
