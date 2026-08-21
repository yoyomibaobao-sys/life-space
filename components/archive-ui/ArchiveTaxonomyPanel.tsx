"use client";

import { useState, type CSSProperties } from "react";
import {
  archiveCategoryOptions,
  getArchiveCategoryDescription,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";

export type ArchiveTaxonomyChip = {
  id: string;
  label: string;
};

type Props = {
  activeCategory: ArchiveCategory | null;
  activeSubcategoryId: string | null;
  activeGroupId: string | null;
  subcategories: ArchiveTaxonomyChip[];
  groups: ArchiveTaxonomyChip[];
  mobileMode?: boolean;
  showCategoryRow?: boolean;
  showSubcategoryRow?: boolean;
  showGroupRow?: boolean;
  onReset: () => void;
  onSelectCategory: (category: ArchiveCategory) => void;
  onResetSubcategory: () => void;
  onSelectSubcategory: (chip: ArchiveTaxonomyChip) => void;
  onRenameSubcategory?: (chip: ArchiveTaxonomyChip) => void;
  onDeleteSubcategory?: (chip: ArchiveTaxonomyChip) => void;
  onCreateSubcategory?: (category: ArchiveCategory) => void;
  onResetGroup: () => void;
  onSelectGroup: (chip: ArchiveTaxonomyChip) => void;
  onRenameGroup?: (chip: ArchiveTaxonomyChip) => void;
  onDeleteGroup?: (chip: ArchiveTaxonomyChip) => void;
  onCreateGroup?: () => void;
};

export default function ArchiveTaxonomyPanel({
  activeCategory,
  activeSubcategoryId,
  activeGroupId,
  subcategories,
  groups,
  mobileMode = false,
  showCategoryRow = true,
  showSubcategoryRow = true,
  showGroupRow = true,
  onReset,
  onSelectCategory,
  onResetSubcategory,
  onSelectSubcategory,
  onRenameSubcategory,
  onDeleteSubcategory,
  onCreateSubcategory,
  onResetGroup,
  onSelectGroup,
  onRenameGroup,
  onDeleteGroup,
  onCreateGroup,
}: Props) {
  const { language, t } = useLanguage();
  const compact = mobileMode;
  const [renameMode, setRenameMode] = useState(false);
  const canManage = Boolean(
    onCreateSubcategory ||
      onRenameSubcategory ||
      onDeleteSubcategory ||
      onCreateGroup ||
      onRenameGroup ||
      onDeleteGroup
  );

  return (
    <section style={panelStyle(compact)}>
      {compact && showCategoryRow && canManage ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          {canManage ? (
            <button type="button" onClick={() => setRenameMode((open) => !open)} style={manageButtonStyle}>
              {renameMode ? t.archive_workspace.done : t.archive_workspace.edit}
            </button>
          ) : null}
        </div>
      ) : null}
      {showCategoryRow ? (
        <div style={categoryRowStyle(compact)}>
          <button type="button" onClick={onReset} style={pillStyle(!activeCategory, compact)}>
            {t.archive_workspace.all}
          </button>
          {archiveCategoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelectCategory(option.value)}
              style={pillStyle(activeCategory === option.value && !activeSubcategoryId, compact)}
              title={getArchiveCategoryDescription(option.value, language)}
            >
              {getArchiveCategoryLabel(option.value, language)}
            </button>
          ))}
        </div>
      ) : null}

      {showCategoryRow && activeCategory && showSubcategoryRow ? (
        <div style={separatorStyle} />
      ) : null}

      {activeCategory && showSubcategoryRow ? (
        <div style={rowStyle(compact)}>
          <button
            type="button"
            onClick={onResetSubcategory}
            style={pillStyle(!activeSubcategoryId, compact)}
            title={t.archive_workspace.show_all_category}
          >
            {t.archive_workspace.subcategory_prefix}
          </button>

          {subcategories.map((chip) => (
            <TaxonomyChipButton
              key={chip.id}
              chip={chip}
              active={activeSubcategoryId === chip.id}
              compact={compact}
              onSelect={() => onSelectSubcategory(chip)}
              onRename={renameMode && onRenameSubcategory ? () => onRenameSubcategory(chip) : undefined}
              onDelete={onDeleteSubcategory ? () => onDeleteSubcategory(chip) : undefined}
            />
          ))}

          {onCreateSubcategory ? (
            <button
              type="button"
              onClick={() => onCreateSubcategory(activeCategory)}
              style={addButtonStyle(compact)}
              title={t.archive_workspace.add_subcategory}
            >
              +
            </button>
          ) : null}
        </div>
      ) : null}

      {activeCategory && activeSubcategoryId && showGroupRow ? (
        <>
          <div style={separatorStyle} />
          <div style={rowStyle(compact)}>
            <button
              type="button"
              onClick={onResetGroup}
              style={pillStyle(!activeGroupId, compact)}
              title={t.archive_workspace.show_all_groups}
            >
              {t.archive_workspace.group_prefix}
            </button>

            {groups.map((chip) => (
              <TaxonomyChipButton
                key={chip.id}
                chip={chip}
                active={activeGroupId === chip.id}
                compact={compact}
                onSelect={() => onSelectGroup(chip)}
                onRename={renameMode && onRenameGroup ? () => onRenameGroup(chip) : undefined}
                onDelete={onDeleteGroup ? () => onDeleteGroup(chip) : undefined}
              />
            ))}

            {onCreateGroup ? (
              <button
                type="button"
                onClick={onCreateGroup}
                style={addButtonStyle(compact)}
                title={t.archive_workspace.add_group}
              >
                +
              </button>
            ) : null}
          </div>
        </>
      ) : null}

    </section>
  );
}

function TaxonomyChipButton({
  chip,
  active,
  compact,
  onSelect,
  onRename,
  onDelete,
}: {
  chip: ArchiveTaxonomyChip;
  active: boolean;
  compact: boolean;
  onSelect: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useLanguage();

  return (
    <span style={chipWrapperStyle(compact)}>
      <button
        type="button"
        onClick={onSelect}
        style={chipButtonStyle(active, compact)}
      >
        {chip.label}
      </button>

      {onRename ? (
        <button
          type="button"
          onClick={onRename}
          style={renameButtonStyle(compact)}
          title={t.archive_workspace.edit}
          aria-label={`${t.archive_workspace.edit} ${chip.label}`}
        >
          {t.archive_workspace.edit}
        </button>
      ) : null}

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          style={deleteButtonStyle(compact)}
          title={t.archive_workspace.delete}
        >
          x
        </button>
      ) : null}
    </span>
  );
}

function panelStyle(compact: boolean): CSSProperties {
  return {
    marginBottom: compact ? 10 : 18,
    padding: compact ? "7px 8px" : "12px 14px",
    border: "1px solid #edf0e8",
    borderRadius: compact ? 12 : 16,
    background: "#fff",
  };
}

function rowStyle(compact: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: compact ? 5 : 8,
    flexWrap: "wrap",
    paddingBottom: compact ? 2 : undefined,
  };
}

function categoryRowStyle(compact: boolean): CSSProperties {
  if (!compact) return rowStyle(false);
  return {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 5,
  };
}

const separatorStyle: CSSProperties = {
  height: 1,
  background: "#edf0e8",
  margin: "10px 0",
};

function pillStyle(active: boolean, compact: boolean): CSSProperties {
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
    minHeight: compact ? 43 : undefined,
    whiteSpace: compact ? "normal" : "nowrap",
    flex: compact ? "1 1 auto" : undefined,
    textAlign: "center",
  };
}

const manageButtonStyle: CSSProperties = {
  minHeight: 34,
  border: "1px solid #dce6d8",
  borderRadius: 999,
  background: "#fff",
  color: "#476745",
  padding: "0 12px",
  fontSize: 13,
  fontWeight: 700,
};

function renameButtonStyle(compact: boolean): CSSProperties {
  return {
    border: "1px solid #cfe0ca",
    borderRadius: 999,
    background: "#f2f8ef",
    color: "#3f6f3d",
    padding: compact ? "3px 7px" : "4px 8px",
    fontSize: compact ? 11 : 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

const managerStyle: CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid #e7ece3",
};

const managerSectionHeaderStyle: CSSProperties = {
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "#30462f",
};

const managerAddButtonStyle: CSSProperties = {
  minHeight: 38,
  border: "1px solid #cfe0ca",
  borderRadius: 10,
  background: "#f6faf3",
  color: "#3d713b",
  padding: "0 11px",
  fontSize: 13,
  fontWeight: 700,
};

const managerRowStyle: CSSProperties = {
  minHeight: 50,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  alignItems: "center",
  gap: 6,
  borderTop: "1px solid #edf0e9",
};

const managerNameButtonStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 44,
  border: "none",
  background: "transparent",
  color: "#334533",
  textAlign: "left",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 15,
};

const managerActionStyle: CSSProperties = {
  minHeight: 38,
  border: "none",
  borderRadius: 9,
  background: "#f4f7f1",
  color: "#4d684a",
  padding: "0 10px",
  fontSize: 13,
};

const managerDeleteStyle: CSSProperties = {
  ...managerActionStyle,
  color: "#b45d58",
};

const managerHintStyle: CSSProperties = {
  margin: "8px 0",
  color: "#7d8878",
  fontSize: 13,
};

function chipWrapperStyle(compact: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: compact ? 2 : 4,
    marginRight: compact ? 1 : 3,
    marginBottom: compact ? 2 : 4,
    flex: compact ? "0 0 auto" : undefined,
  };
}

function chipButtonStyle(active: boolean, compact: boolean): CSSProperties {
  return {
    border: active ? "1px solid #2f6d2f" : "1px solid #dfe7d9",
    background: active ? "#2f6d2f" : "#fff",
    color: active ? "#fff" : "#374437",
    borderRadius: 999,
    padding: compact ? "5px 9px" : "7px 13px",
    fontSize: compact ? 13 : 15,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    lineHeight: compact ? 1.15 : 1.3,
    whiteSpace: "nowrap",
    boxShadow: active ? "0 6px 14px rgba(63,125,61,0.18)" : "none",
  };
}

function deleteButtonStyle(compact: boolean): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: "#b7b7b7",
    cursor: "pointer",
    fontSize: compact ? 12 : 13,
    padding: compact ? "2px 1px" : 0,
    lineHeight: 1,
  };
}

function addButtonStyle(compact: boolean): CSSProperties {
  return {
    border: "1px dashed #cbdcc2",
    background: "#fbfdf9",
    color: "#4CAF50",
    borderRadius: 999,
    padding: compact ? "4px 8px" : "5px 10px",
    cursor: "pointer",
    fontSize: compact ? 13 : 14,
    lineHeight: compact ? 1.15 : 1.3,
  };
}
