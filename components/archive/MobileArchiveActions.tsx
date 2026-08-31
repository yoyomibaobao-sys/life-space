"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
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

type PanelMode = "actions" | "taxonomy" | null;

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
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [selectedCategory, setSelectedCategory] = useState<ArchiveCategory>(category);
  const [selectedSubTagId, setSelectedSubTagId] = useState(subTagId || "");
  const [selectedGroupTagId, setSelectedGroupTagId] = useState(groupTagId || "");
  const moreLabel = language === "en" ? "More actions" : "更多操作";

  const availableSubTags = useMemo(
    () => subTags.filter((tag) => tag.category === selectedCategory),
    [selectedCategory, subTags],
  );
  const availableGroups = useMemo(
    () =>
      selectedSubTagId
        ? groupTags.filter((tag) => String(tag.sub_tag_id) === selectedSubTagId)
        : [],
    [groupTags, selectedSubTagId],
  );
  const selectedMaxDepth = categoryDepths[selectedCategory] || 3;

  function stopCardNavigation(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function openActions(event: MouseEvent<HTMLButtonElement>) {
    stopCardNavigation(event);
    setSelectedCategory(category);
    setSelectedSubTagId(subTagId || "");
    setSelectedGroupTagId(groupTagId || "");
    setPanelMode((current) => (current ? null : "actions"));
  }

  function run(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    stopCardNavigation(event);
    setPanelMode(null);
    action();
  }

  return (
    <div data-no-card-nav="true" onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={openActions}
        aria-label={moreLabel}
        aria-haspopup="menu"
        aria-expanded={Boolean(panelMode)}
        style={moreButtonStyle}
      >
        <UiIcon name="more" size={19} />
      </button>

      {panelMode ? (
        <AnchoredPanel
          anchorRef={buttonRef}
          ariaLabel={
            panelMode === "taxonomy"
              ? t.archive_workspace.edit_category_group
              : moreLabel
          }
          width={panelMode === "taxonomy" ? 286 : 214}
          onClose={() => setPanelMode(null)}
        >
          {panelMode === "actions" ? (
            <div role="menu" style={actionListStyle}>
              {allowTaxonomyEdit ? (
                <ActionButton
                  label={t.archive_workspace.edit_category_group}
                  onClick={(event) => {
                    stopCardNavigation(event);
                    setPanelMode("taxonomy");
                  }}
                  trailing={<UiIcon name="chevron-right" size={16} />}
                />
              ) : null}
              {onTogglePublic ? (
                <ActionButton
                  label={isPublic ? t.archive_workspace.set_private : t.archive_workspace.set_public}
                  onClick={(event) => run(event, onTogglePublic)}
                />
              ) : null}
              {onToggleEnded ? (
                <ActionButton
                  label={ended ? t.archive_workspace.restore : t.archive_workspace.end}
                  onClick={(event) => run(event, onToggleEnded)}
                />
              ) : null}
              {extraActions.filter((action) => !action.danger).map((action) => (
                <ActionButton
                  key={action.label}
                  label={action.label}
                  onClick={(event) => run(event, action.onClick)}
                />
              ))}
              {extraActions.filter((action) => action.danger).map((action) => (
                <ActionButton
                  key={action.label}
                  label={action.label}
                  danger
                  onClick={(event) => run(event, action.onClick)}
                />
              ))}
              {onMoveToTrash ? (
                <ActionButton
                  label={t.archive_workspace.move_to_trash}
                  danger
                  onClick={(event) => run(event, onMoveToTrash)}
                />
              ) : null}
            </div>
          ) : (
            <div style={taxonomyPanelStyle}>
              <div style={taxonomyHeaderStyle}>
                <button
                  type="button"
                  onClick={(event) => {
                    stopCardNavigation(event);
                    setPanelMode("actions");
                  }}
                  aria-label={moreLabel}
                  style={taxonomyBackButtonStyle}
                >
                  <UiIcon name="chevron-left" size={17} />
                </button>
                <strong>{t.archive_workspace.edit_category_group}</strong>
              </div>

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

              {selectedMaxDepth >= 2 && availableSubTags.length > 0 ? (
                <label style={fieldStyle}>
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
                </label>
              ) : null}

              {selectedMaxDepth >= 3 && selectedSubTagId && availableGroups.length > 0 ? (
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>{t.archive_workspace.group}</span>
                  <select
                    value={selectedGroupTagId}
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
                </label>
              ) : null}

              <button
                type="button"
                style={doneButtonStyle}
                onClick={(event) => {
                  stopCardNavigation(event);
                  setPanelMode(null);
                }}
              >
                {t.archive_workspace.save}
              </button>
            </div>
          )}
        </AnchoredPanel>
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger = false,
  trailing,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={danger ? dangerActionStyle : actionStyle}
    >
      <span>{label}</span>
      {trailing}
    </button>
  );
}

function AnchoredPanel({
  anchorRef,
  ariaLabel,
  width,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  ariaLabel: string;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = Math.min(width, viewportWidth - margin * 2);
      const left = Math.max(
        margin,
        Math.min(rect.right - panelWidth, viewportWidth - panelWidth - margin),
      );
      const below = viewportHeight - rect.bottom - margin - gap;
      const above = rect.top - margin - gap;
      const openBelow = below >= 170 || below >= above;

      setPosition({
        top: openBelow ? rect.bottom + gap : undefined,
        bottom: openBelow ? undefined : viewportHeight - rect.top + gap,
        left,
        width: panelWidth,
        maxHeight: Math.max(120, Math.min(viewportHeight * 0.68, openBelow ? below : above)),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, width]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!position || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      style={backdropStyle}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{ ...panelStyle, ...position }}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

const moreButtonStyle: CSSProperties = {
  flexShrink: 0,
  width: 34,
  height: 34,
  padding: 0,
  border: "1px solid #e3e9df",
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
  zIndex: 2300,
  background: "transparent",
  pointerEvents: "auto",
};

const panelStyle: CSSProperties = {
  position: "fixed",
  overflowY: "auto",
  overscrollBehavior: "contain",
  boxSizing: "border-box",
  padding: 5,
  border: "1px solid #dfe6da",
  borderRadius: 13,
  background: "#fff",
  boxShadow: "0 14px 34px rgba(28, 43, 27, 0.18)",
  pointerEvents: "auto",
};

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const actionStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "7px 9px",
  border: 0,
  borderRadius: 9,
  background: "transparent",
  color: "#30482f",
  textAlign: "left",
  fontSize: 14,
  fontWeight: 680,
  cursor: "pointer",
};

const dangerActionStyle: CSSProperties = {
  ...actionStyle,
  color: "#b95650",
};

const taxonomyPanelStyle: CSSProperties = {
  display: "grid",
  gap: 9,
  padding: 4,
};

const taxonomyHeaderStyle: CSSProperties = {
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#2d402d",
  fontSize: 14,
};

const taxonomyBackButtonStyle: CSSProperties = {
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: 0,
  borderRadius: 999,
  background: "#f5f8f2",
  color: "#5d6d59",
  cursor: "pointer",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const fieldLabelStyle: CSSProperties = {
  color: "#667363",
  fontSize: 12,
  fontWeight: 700,
};

const selectStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  border: "1px solid #dce5d8",
  borderRadius: 10,
  background: "#fbfcfa",
  color: "#263626",
  padding: "0 10px",
  fontSize: 14,
};

const doneButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  marginTop: 2,
  border: "none",
  borderRadius: 10,
  background: "#4f844b",
  color: "#fff",
  fontSize: 14,
  fontWeight: 750,
  cursor: "pointer",
};
