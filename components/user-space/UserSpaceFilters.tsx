import {
  type ArchiveCategory,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type { Category, UserSpaceTag } from "@/lib/user-space-types";
import {
  categoryGroupStyle,
  groupFilterStyle,
  mainFilterStyle,
  subFilterStyle,
} from "@/components/user-space/UserSpaceShared";

type Props = {
  activeCategory: Category;
  activeSubTag: string | null;
  activeGroupTag: string | null;
  visibleSubTags: UserSpaceTag[];
  visibleGroupTags: UserSpaceTag[];
  onSelectCategory: (category: Category) => void;
  onSelectSubTag: (tag: UserSpaceTag) => void;
  onSelectGroupTag: (tagId: string) => void;
  onClearGroupTag: () => void;
};

function categoryLabel(category?: string | null) {
  return getArchiveCategoryLabel(category);
}

export default function UserSpaceFilters({
  activeCategory,
  activeSubTag,
  activeGroupTag,
  visibleSubTags,
  visibleGroupTags,
  onSelectCategory,
  onSelectSubTag,
  onSelectGroupTag,
  onClearGroupTag,
}: Props) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #edf1e8",
        borderRadius: 16,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          rowGap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => onSelectCategory("all")}
          style={mainFilterStyle(activeCategory === "all")}
        >
          全部
        </button>

        {["plant", "system", "insect_fish", "other"].map((category) => (
          <div key={category} style={categoryGroupStyle}>
            <button
              type="button"
              onClick={() => onSelectCategory(category as ArchiveCategory)}
              style={mainFilterStyle(activeCategory === category && !activeSubTag)}
            >
              {categoryLabel(category)}：
            </button>

            {visibleSubTags
              .filter((tag) => tag.category === category)
              .map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onSelectSubTag(tag)}
                  style={subFilterStyle(activeSubTag === tag.id)}
                >
                  {tag.name}
                </button>
              ))}
          </div>
        ))}
      </div>

      {activeSubTag && visibleGroupTags.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px dashed #edf1e8",
          }}
        >
          <button
            type="button"
            onClick={onClearGroupTag}
            style={{
              border: "none",
              background: "transparent",
              color: activeGroupTag ? "#4f7b45" : "#777",
              fontSize: 14,
              cursor: "pointer",
              padding: 0,
            }}
          >
            分组：
          </button>

          {visibleGroupTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onSelectGroupTag(tag.id)}
              style={groupFilterStyle(activeGroupTag === tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
