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
  onReset: () => void;
  onSelectCategory: (category: ArchiveCategory) => void;
  onSelectSubTag: (category: ArchiveCategory, id: string) => void;
  onRenameSubTag: (tag: SubTagItem) => void;
  onDeleteSubTag: (tag: SubTagItem) => void;
  onCreateSubTag: (category: ArchiveCategory) => void;
};

export default function ArchiveFiltersPanel({
  activeCategory,
  activeSubTag,
  visibleGroupTagCount,
  plantSubTags,
  methodFacilitySubTags,
  insectFishSubTags,
  otherSubTags,
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

  return (
    <section
      style={{
        marginBottom: visibleGroupTagCount > 0 ? 8 : 18,
        padding: "12px 14px",
        border: "1px solid #edf0e8",
        borderRadius: 16,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onReset}
          style={{
            border:
              activeCategory || activeSubTag
                ? "1px solid #cfe3c8"
                : "1px solid #3f7d3d",
            background: activeCategory || activeSubTag ? "#f8fbf5" : "#3f7d3d",
            color: activeCategory || activeSubTag ? "#335033" : "#fff",
            borderRadius: 999,
            padding: "7px 14px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          全部
        </button>

        {groups.map(({ category, tags }, index) => (
          <div
            key={category}
            style={{
              display: "inline-flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 4,
              marginLeft: index === 0 ? 0 : 8,
            }}
          >
            <button
              type="button"
              onClick={() => onSelectCategory(category)}
              style={{
                border:
                  activeCategory === category && !activeSubTag
                    ? "1px solid #3f7d3d"
                    : "1px solid #cfe3c8",
                background:
                  activeCategory === category && !activeSubTag ? "#dff2da" : "#f4faf1",
                color:
                  activeCategory === category && !activeSubTag ? "#235d24" : "#3f633a",
                borderRadius: 999,
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              {getArchiveCategoryLabel(category)}：
            </button>

            {tags.map((tag) => (
              <ArchiveSubTagChip
                key={tag.id}
                tag={tag}
                active={activeSubTag === tag.id}
                onSelect={() => onSelectSubTag(tag.category, tag.id)}
                onRename={() => onRenameSubTag(tag)}
                onDelete={() => onDeleteSubTag(tag)}
              />
            ))}

            <button
              type="button"
              onClick={() => onCreateSubTag(category)}
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
          </div>
        ))}
      </div>
    </section>
  );
}
