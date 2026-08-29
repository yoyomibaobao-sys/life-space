"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { GroupTagItem, SubTagItem } from "@/lib/archive-page-types";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  type ArchiveCategoryDepths,
} from "@/lib/archive-category-settings";

type Props = {
  category: ArchiveCategory;
  subTagId?: string | null;
  groupTagId?: string | null;
  subTags: SubTagItem[];
  groupTags: GroupTagItem[];
  categoryDepths?: ArchiveCategoryDepths;
  ended?: boolean;
  isPublic?: boolean;
  allowTaxonomyEdit?: boolean;
  onChangeCategory: (value: string) => void;
  onChangeGroup: (value: string) => void;
  onToggleEnded?: () => void;
  onTogglePublic?: () => void;
  onMoveToTrash?: () => void;
  extraActions?: Array<{
    label: string;
    onClick: () => void;
    danger?: boolean;
  }>;
};

export default function MobileArchiveActions({
  category,
  subTagId,
  groupTagId,
  subTags,
  groupTags,
  categoryDepths = DEFAULT_ARCHIVE_CATEGORY_DEPTHS,
  ended,
  isPublic,
  allowTaxonomyEdit = true,
  onChangeCategory,
  onChangeGroup,
  onToggleEnded,
  onTogglePublic,
  onMoveToTrash,
  extraActions = [],
}: Props) {
  const { language, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ArchiveCategory>(category);
  const [selectedSubTagId, setSelectedSubTagId] = useState(subTagId || "");
  const [selectedGroupTagId, setSelectedGroupTagId] = useState(groupTagId || "");
  const moreTitle = language === "en" ? "More" : "更多";

  const availableSubTags = useMemo(
    () => subTags.filter((tag) => tag.category === selectedCategory),
    [selectedCategory, subTags]
  );
  const availableGroups = useMemo(
    () =>
      selectedSubTagId
        ? groupTags.filter((tag) => String(tag.sub_tag_id) === selectedSubTagId)
        : [],
    [groupTags, selectedSubTagId]
  );
  const selectedMaxDepth = categoryDepths[selectedCategory] || 3;

  function run(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <div data-no-card-nav="true" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedCategory(category);
          setSelectedSubTagId(subTagId || "");
          setSelectedGroupTagId(groupTagId || "");
          setMenuOpen(true);
        }}
        aria-label={moreTitle}
        style={moreButtonStyle}
      >
        <UiIcon name="more" size={20} />
      </button>

      {menuOpen ? (
        <Sheet onClose={() => setMenuOpen(false)} title={moreTitle}>
          {allowTaxonomyEdit ? (
            <button
              type="button"
              style={sheetRowStyle}
              onClick={() => {
                setMenuOpen(false);
                setTaxonomyOpen(true);
              }}
            >
              <span>{t.archive_workspace.edit_category_group}</span>
              <UiIcon name="arrow-right" size={18} />
            </button>
          ) : null}
          {onTogglePublic ? (
            <button type="button" style={sheetRowStyle} onClick={() => run(onTogglePublic)}>
              {isPublic ? t.archive_workspace.set_private : t.archive_workspace.set_public}
            </button>
          ) : null}
          {onToggleEnded ? (
            <button type="button" style={sheetRowStyle} onClick={() => run(onToggleEnded)}>
              {ended ? t.archive_workspace.restore : t.archive_workspace.end}
            </button>
          ) : null}
          {extraActions.filter((action) => !action.danger).map((action) => (
            <button
              key={action.label}
              type="button"
              style={sheetRowStyle}
              onClick={() => run(action.onClick)}
            >
              {action.label}
            </button>
          ))}
          {extraActions.filter((action) => action.danger).map((action) => (
            <button
              key={action.label}
              type="button"
              style={dangerRowStyle}
              onClick={() => run(action.onClick)}
            >
              {action.label}
            </button>
          ))}
          {onMoveToTrash ? (
            <button type="button" style={dangerRowStyle} onClick={() => run(onMoveToTrash)}>
              {t.archive_workspace.move_to_trash}
            </button>
          ) : null}
        </Sheet>
      ) : null}

      {allowTaxonomyEdit && taxonomyOpen ? (
        <Sheet onClose={() => setTaxonomyOpen(false)} title={t.archive_workspace.edit_category_group}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>{t.archive_workspace.main_category}</span>
            <select
              value={selectedCategory}
              onChange={(event) => {
                const nextCategory = event.target.value as ArchiveCategory;
                setSelectedCategory(nextCategory);
                setSelectedSubTagId("");
                setSelectedGroupTagId("");
                onChangeCategory(nextCategory);
              }}
              style={selectStyle}
            >
              {archiveCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {getArchiveCategoryLabel(option.value, language)}
                </option>
              ))}
            </select>
          </label>

          {selectedMaxDepth >= 2 ? <label style={fieldStyle}>
            <span style={fieldLabelStyle}>{t.archive_workspace.subcategory}</span>
            <select
              value={selectedSubTagId}
              onChange={(event) => {
                const nextSubTagId = event.target.value;
                setSelectedSubTagId(nextSubTagId);
                setSelectedGroupTagId("");
                onChangeCategory(nextSubTagId || selectedCategory);
              }}
              style={selectStyle}
            >
              <option value="">{t.archive_workspace.all_subcategories}</option>
              {availableSubTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label> : null}

          {selectedMaxDepth >= 3 ? <label style={fieldStyle}>
            <span style={fieldLabelStyle}>{t.archive_workspace.group}</span>
            <select
              value={selectedGroupTagId}
              disabled={!selectedSubTagId || availableGroups.length === 0}
              onChange={(event) => {
                const nextGroupTagId = event.target.value;
                setSelectedGroupTagId(nextGroupTagId);
                onChangeGroup(nextGroupTagId);
              }}
              style={{ ...selectStyle, opacity: !selectedSubTagId ? 0.55 : 1 }}
            >
              <option value="">{t.archive_workspace.ungrouped}</option>
              {availableGroups.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label> : null}

          <button type="button" style={doneButtonStyle} onClick={() => setTaxonomyOpen(false)}>
            {t.archive_workspace.save}
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div style={backdropStyle} onClick={onClose} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        style={sheetStyle}
      >
        <div style={sheetHeaderStyle}>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} aria-label="关闭" style={closeButtonStyle}>
            <UiIcon name="close" size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

const moreButtonStyle: CSSProperties = {
  flexShrink: 0,
  width: 42,
  height: 42,
  border: "1px solid #e5eadf",
  borderRadius: 999,
  background: "#fff",
  color: "#667066",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  touchAction: "manipulation",
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2200,
  display: "flex",
  alignItems: "flex-end",
  background: "rgba(25, 35, 24, 0.32)",
  pointerEvents: "auto",
  touchAction: "none",
};

const sheetStyle: CSSProperties = {
  width: "100%",
  maxHeight: "82dvh",
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "10px 14px calc(18px + var(--app-safe-area-bottom))",
  borderRadius: "20px 20px 0 0",
  background: "#fff",
  boxShadow: "0 -18px 44px rgba(31, 45, 31, 0.18)",
  touchAction: "pan-y",
  pointerEvents: "auto",
};

const sheetHeaderStyle: CSSProperties = {
  minHeight: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: "1px solid #edf0e9",
  color: "#263626",
  fontSize: 17,
};

const closeButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  border: "none",
  borderRadius: 999,
  background: "#f5f7f2",
  color: "#5f6d5c",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  touchAction: "manipulation",
};

const sheetRowStyle: CSSProperties = {
  width: "100%",
  minHeight: 54,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  border: "none",
  borderBottom: "1px solid #edf0e9",
  background: "transparent",
  color: "#30482f",
  padding: "0 4px",
  textAlign: "left",
  fontSize: 16,
  fontWeight: 650,
};

const dangerRowStyle: CSSProperties = {
  ...sheetRowStyle,
  color: "#bd554f",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 14,
};

const fieldLabelStyle: CSSProperties = {
  color: "#5f6d5c",
  fontSize: 14,
  fontWeight: 700,
};

const selectStyle: CSSProperties = {
  width: "100%",
  minHeight: 50,
  border: "1px solid #dce5d8",
  borderRadius: 13,
  background: "#fbfcfa",
  color: "#263626",
  padding: "0 13px",
  fontSize: 16,
};

const doneButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 50,
  marginTop: 18,
  border: "none",
  borderRadius: 14,
  background: "#4f844b",
  color: "#fff",
  fontSize: 16,
  fontWeight: 750,
};
