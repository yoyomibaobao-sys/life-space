"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { GroupTagItem, SubTagItem } from "@/lib/archive-page-types";
import { useLanguage } from "@/lib/i18n/useLanguage";
import UiIcon from "@/components/ui/UiIcon";

type Props = {
  category: ArchiveCategory;
  subTagId?: string | null;
  groupTagId?: string | null;
  subTags: SubTagItem[];
  groupTags: GroupTagItem[];
  maxDepth: number;
  onChangeCategory: (value: string) => void;
  onChangeGroup: (value: string) => void;
};

export default function MobileArchiveTaxonomyInline({
  category,
  subTagId,
  groupTagId,
  subTags,
  groupTags,
  maxDepth,
  onChangeCategory,
  onChangeGroup,
}: Props) {
  const { language, t } = useLanguage();
  const availableSubTags = subTags.filter((tag) => tag.category === category);
  const selectedSubTag = availableSubTags.find((tag) => tag.id === subTagId) || null;
  const availableGroups = selectedSubTag
    ? groupTags.filter((tag) => String(tag.sub_tag_id) === selectedSubTag.id)
    : [];
  const selectedGroup = availableGroups.find((tag) => tag.id === groupTagId) || null;

  return (
    <span style={language === "en" ? { ...rowStyle, flexWrap: "wrap", gap: "2px 6px" } : rowStyle} data-no-card-nav="true">
      <InlineSelect
        naturalWordWrap={language === "en"}
        label={getArchiveCategoryLabel(category, language)}
        ariaLabel={t.archive_workspace.main_category}
        value={category}
        onChange={onChangeCategory}
        options={archiveCategoryOptions.map((option) => ({
          value: option.value,
          label: getArchiveCategoryLabel(option.value, language),
        }))}
      />

      {maxDepth >= 2 && availableSubTags.length > 0 ? (
        <InlineSelect
          naturalWordWrap={language === "en"}
          label={selectedSubTag?.name || t.archive_workspace.subcategory}
          ariaLabel={t.archive_workspace.subcategory}
          sectionLabel={t.archive_workspace.subcategory}
          value={selectedSubTag?.id || ""}
          onChange={(value) => onChangeCategory(value || category)}
          options={[
            { value: "", label: t.archive_workspace.ungrouped },
            ...availableSubTags.map((tag) => ({ value: tag.id, label: tag.name })),
          ]}
        />
      ) : null}
      {maxDepth >= 3 && selectedSubTag && availableGroups.length > 0 ? (
        <InlineSelect
          naturalWordWrap={language === "en"}
          label={selectedGroup?.name || t.archive_workspace.group}
          ariaLabel={t.archive_workspace.group}
          sectionLabel={t.archive_workspace.group}
          value={selectedGroup?.id || ""}
          onChange={onChangeGroup}
          options={[
            { value: "", label: t.archive_workspace.ungrouped },
            ...availableGroups.map((tag) => ({ value: tag.id, label: tag.name })),
          ]}
        />
      ) : null}
    </span>
  );
}

function InlineSelect({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  sectionLabel,
  naturalWordWrap = false,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  naturalWordWrap?: boolean;
  sectionLabel?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(228, Math.max(150, rect.width + 28));
      const left = Math.max(
        margin,
        Math.min(rect.left, viewportWidth - width - margin),
      );
      const below = viewportHeight - rect.bottom - margin - gap;
      const above = rect.top - margin - gap;
      const openBelow = below >= 132 || below >= above;
      const maxHeight = Math.max(96, Math.min(240, openBelow ? below : above));
      const top = openBelow
        ? rect.bottom + gap
        : Math.max(margin, rect.top - gap - maxHeight);

      setPanelPosition({ top, left, width, maxHeight });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function stopCardNavigation(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          stopCardNavigation(event);
          setOpen((current) => !current);
        }}
        style={naturalWordWrap ? { ...selectWrapStyle, maxWidth: "100%" } : selectWrapStyle}
      >
        <span style={naturalWordWrap ? { ...selectLabelStyle, overflowWrap: "break-word" } : selectLabelStyle}>{label}</span>
        <UiIcon name="chevron-down" size={12} strokeWidth={1.9} />
      </button>

      {open && panelPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              role="presentation"
              style={popoverBackdropStyle}
              onClick={(event) => {
                stopCardNavigation(event);
                setOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-label={ariaLabel}
                style={{
                  ...popoverStyle,
                  top: panelPosition.top,
                  left: panelPosition.left,
                  width: panelPosition.width,
                  maxHeight: panelPosition.maxHeight,
                }}
                onClick={stopCardNavigation}
              >
                  <div role="listbox" aria-label={sectionLabel || ariaLabel}>
                    {sectionLabel ? <div style={sectionHeadingStyle}>{sectionLabel}</div> : null}
                    {options.map((option) => {
                      const selected = option.value === value;
                      return (
                        <button
                          key={`${option.value}:${option.label}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          style={popoverOptionStyle(selected)}
                          onClick={(event) => {
                            stopCardNavigation(event);
                            setOpen(false);
                            buttonRef.current?.focus({ preventScroll: true });
                            if (!selected) onChange(option.value);
                          }}
                        >
                          <span>{option.label}</span>
                          {selected ? <UiIcon name="check" size={15} strokeWidth={2} /> : null}
                        </button>
                      );
                    })}
                  </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const rowStyle: CSSProperties = {
  minWidth: 0,
  width: "auto",
  flex: "1 1 auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  maxWidth: "100%",
};

const selectWrapStyle: CSSProperties = {
  flex: "0 1 auto",
  minWidth: 0,
  minHeight: 32,
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  padding: "2px",
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: "#536a50",
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.3,
  cursor: "pointer",
  touchAction: "manipulation",
};

const selectLabelStyle: CSSProperties = {
  minWidth: 0,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  textAlign: "left",
};

const sectionHeadingStyle: CSSProperties = {
  padding: "6px 9px 3px",
  color: "#71806d",
  fontSize: 12,
  fontWeight: 650,
};

const popoverBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2300,
  background: "transparent",
};

const popoverStyle: CSSProperties = {
  position: "fixed",
  display: "grid",
  gap: 3,
  overflowY: "auto",
  overscrollBehavior: "contain",
  boxSizing: "border-box",
  padding: 5,
  border: "1px solid #dfe7da",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 12px 30px rgba(30, 48, 29, 0.16)",
};

function popoverOptionStyle(selected: boolean): CSSProperties {
  return {
    width: "100%",
    minHeight: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "7px 9px",
    border: selected ? "1px solid #b9d4b3" : "1px solid transparent",
    borderRadius: 9,
    background: selected ? "#f1f8ee" : "transparent",
    color: selected ? "#315f34" : "#344534",
    textAlign: "left",
    fontSize: 13.5,
    fontWeight: selected ? 750 : 600,
    cursor: "pointer",
  };
};
