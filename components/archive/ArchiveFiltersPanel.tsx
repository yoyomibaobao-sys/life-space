"use client";

import {
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { SubTagItem } from "@/lib/archive-page-types";
import ArchiveSubTagChip from "@/components/archive/ArchiveSubTagChip";

type Props = {
  activeCategory: ArchiveCategory | null;
  activeSubTag: string | null;
  visibleGroupTagCount: number;
  plantSubTags: SubTagItem[];
  methodFacilitySubTags: SubTagItem[];
  insectFishSubTags: SubTagItem[];
  otherSubTags: SubTagItem[];
  mobileMode?: boolean;
  onReset: () => void;
  onSelectCategory: (category: ArchiveCategory) => void;
  onSelectSubTag: (category: ArchiveCategory, id: string) => void;
  onRenameSubTag: (tag: SubTagItem) => void;
  onDeleteSubTag: (tag: SubTagItem) => void;
  onCreateSubTag: (category: ArchiveCategory) => void;
};

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
};

const mobileRowStyle = {
  ...rowStyle,
  gap: 5,
};

function pillStyle(active: boolean, compact = false) {
  return {
    border: active ? "1px solid #3f7d3d" : "1px solid #cfe3c8",
    background: active ? "#3f7d3d" : "#f8fbf5",
    color: active ? "#fff" : "#335033",
    borderRadius: 999,
    padding: compact ? "5px 9px" : "7px 14px",
    fontSize: compact ? 13 : 15,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: compact ? 1.15 : 1.3,
  };
}

export default function ArchiveFiltersPanel({
  activeCategory,
  activeSubTag,
  visibleGroupTagCount,
  plantSubTags,
  methodFacilitySubTags,
  insectFishSubTags,
  otherSubTags,
  mobileMode = false,
  onReset,
  onSelectCategory,
  onSelectSubTag,
  onRenameSubTag,
  onDeleteSubTag,
  onCreateSubTag,
}: Props) {
  const groups = [
    { category: "plant" as const, tags: plantSubTags },
    { category: "system" as const, tags: methodFacilitySubTags },
    { category: "insect_fish" as const, tags: insectFishSubTags },
    { category: "other" as const, tags: otherSubTags },
  ];

  const currentGroup = activeCategory
    ? groups.find((group) => group.category === activeCategory) || null
    : null;

  if (mobileMode && !currentGroup) return null;

  return (
    <section
      style={{
        marginBottom: mobileMode ? (visibleGroupTagCount > 0 ? 6 : 10) : visibleGroupTagCount > 0 ? 8 : 18,
        padding: mobileMode ? "7px 8px" : "12px 14px",
        border: "1px solid #edf0e8",
        borderRadius: mobileMode ? 12 : 16,
        background: "#fff",
      }}
    >
      {!mobileMode ? (
        <div style={rowStyle}>
          <button type="button" onClick={onReset} style={pillStyle(!activeCategory && !activeSubTag)}>
            全部
          </button>

          {groups.map(({ category }) => (
            <button
              key={category}
              type="button"
              onClick={() => onSelectCategory(category)}
              style={pillStyle(activeCategory === category && !activeSubTag)}
            >
              {getArchiveCategoryLabel(category)}
            </button>
          ))}
        </div>
      ) : null}

      {!mobileMode && currentGroup ? (
        <div
          style={{
            height: 1,
            background: "#edf0e8",
            margin: "12px 0 10px",
          }}
        />
      ) : null}

      {currentGroup ? (
      <>
        {mobileMode ? <div style={mobileFilterLabelStyle}>子分类</div> : null}
        <div style={mobileMode ? mobileRowStyle : rowStyle}>
          <button
            type="button"
            onClick={() => onSelectCategory(currentGroup.category)}
            style={pillStyle(!activeSubTag, mobileMode)}
            title="点击显示当前大类下全部项目"
          >
            {mobileMode ? "全部子分类" : "子分类："}
          </button>

          {currentGroup.tags.map((tag) => (
            <ArchiveSubTagChip
              key={tag.id}
              tag={tag}
              active={activeSubTag === tag.id}
              onSelect={() => onSelectSubTag(tag.category, tag.id)}
              onRename={() => onRenameSubTag(tag)}
              onDelete={() => onDeleteSubTag(tag)}
              compact={mobileMode}
            />
          ))}

          <button
            type="button"
            onClick={() => onCreateSubTag(currentGroup.category)}
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
            title="新增子分类"
          >
            ＋
          </button>
        </div>
      </>
      ) : null}
    </section>
  );
}

const mobileFilterLabelStyle = {
  margin: "0 2px 5px",
  color: "#7a8675",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.2,
};
