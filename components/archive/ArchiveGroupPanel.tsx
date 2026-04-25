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
}: Props) {
  if (visibleGroupTags.length > 0) {
    return (
      <section
        style={{
          marginBottom: 18,
          padding: "10px 14px",
          borderRadius: 16,
          background: "#fafbf8",
          border: "1px solid #edf0e8",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
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
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            padding: "6px 12px",
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
              gap: 4,
              marginRight: 4,
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
                padding: "6px 12px",
                fontSize: 15,
                cursor: "pointer",
                lineHeight: 1.3,
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
                fontSize: 13,
                padding: 0,
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
              padding: "5px 10px",
              cursor: "pointer",
              fontSize: 14,
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
          marginBottom: 18,
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
            padding: "5px 10px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          ＋ 新增分组
        </button>
      </section>
    );
  }

  return null;
}
