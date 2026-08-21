import {
  type ArchiveCategory,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";
import type { Category, UserSpaceTag } from "@/lib/user-space-types";
import {
  groupFilterStyle,
  mainFilterStyle,
  subFilterStyle,
} from "@/components/user-space/UserSpaceShared";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  activeCategory: Category;
  activeSubTag: string | null;
  activeGroupTag: string | null;
  visibleSubTags: UserSpaceTag[];
  visibleGroupTags: UserSpaceTag[];
  visibleCategories: string[];
  onSelectCategory: (category: Category) => void;
  onSelectSubTag: (tag: UserSpaceTag) => void;
  onSelectGroupTag: (tagId: string) => void;
  onClearGroupTag: () => void;
};

export default function UserSpaceFilters({
  activeCategory,
  activeSubTag,
  activeGroupTag,
  visibleSubTags,
  visibleGroupTags,
  visibleCategories,
  onSelectCategory,
  onSelectSubTag,
  onSelectGroupTag,
  onClearGroupTag,
}: Props) {
  const { language, t } = useLanguage();
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #edf1e8",
        borderRadius: 16,
        padding: 8,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 5,
        }}
      >
        <button
          type="button"
          onClick={() => onSelectCategory("all")}
          style={mainFilterStyle(activeCategory === "all")}
        >
          {t.profile.space.all}
        </button>

        {["plant", "system", "insect_fish", "other"].filter((category) =>
          visibleCategories.includes(category)
        ).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onSelectCategory(category as ArchiveCategory)}
            style={mainFilterStyle(activeCategory === category && !activeSubTag)}
          >
            {getArchiveCategoryLabel(category, language)}
          </button>
        ))}
      </div>

      {activeCategory !== "all" ? (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid #edf1e8" }}>
          {visibleSubTags
            .filter((tag) => tag.category === activeCategory)
            .map((tag) => (
              <button key={tag.id} type="button" onClick={() => onSelectSubTag(tag)} style={subFilterStyle(activeSubTag === tag.id)}>
                {tag.name}
              </button>
            ))}
        </div>
      ) : null}

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
            {t.profile.space.group_prefix}
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
