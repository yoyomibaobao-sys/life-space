"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
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

type TaxonomyKind = "subcategory" | "group";

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
  onRenameSubcategory?: (
    chip: ArchiveTaxonomyChip,
    nextName?: string
  ) => void | Promise<void>;
  onDeleteSubcategory?: (chip: ArchiveTaxonomyChip) => void | Promise<void>;
  onCreateSubcategory?: (category: ArchiveCategory) => void;
  onResetGroup: () => void;
  onSelectGroup: (chip: ArchiveTaxonomyChip) => void;
  onRenameGroup?: (
    chip: ArchiveTaxonomyChip,
    nextName?: string
  ) => void | Promise<void>;
  onDeleteGroup?: (chip: ArchiveTaxonomyChip) => void | Promise<void>;
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
  const [actionTarget, setActionTarget] = useState<{
    kind: TaxonomyKind;
    chip: ArchiveTaxonomyChip;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  function openActions(kind: TaxonomyKind, chip: ArchiveTaxonomyChip) {
    if (!compact) return;
    setActionTarget({ kind, chip });
    setRenameDraft(chip.label);
  }

  async function saveRename() {
    if (!actionTarget || actionBusy) return;
    const nextName = renameDraft.trim();
    if (!nextName) return;
    if (nextName === actionTarget.chip.label) {
      setActionTarget(null);
      return;
    }

    const handler =
      actionTarget.kind === "subcategory" ? onRenameSubcategory : onRenameGroup;
    if (!handler) return;

    setActionBusy(true);
    try {
      await handler(actionTarget.chip, nextName);
      setActionTarget(null);
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteTarget() {
    if (!actionTarget || actionBusy) return;
    const handler =
      actionTarget.kind === "subcategory" ? onDeleteSubcategory : onDeleteGroup;
    if (!handler) return;

    setActionBusy(true);
    try {
      await handler(actionTarget.chip);
      setActionTarget(null);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      <section style={panelStyle(compact)}>
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
          <div style={separatorStyle(compact)} />
        ) : null}

        {activeCategory && showSubcategoryRow ? (
          <div style={rowStyle(compact)}>
            <button
              type="button"
              onClick={onResetSubcategory}
              style={rowLabelStyle(!activeSubcategoryId, compact)}
              title={t.archive_workspace.show_all_category}
            >
              {compact
                ? t.archive_workspace.subcategory
                : t.archive_workspace.subcategory_prefix}
            </button>

            {subcategories.map((chip) => (
              <TaxonomyChipButton
                key={chip.id}
                chip={chip}
                active={activeSubcategoryId === chip.id}
                compact={compact}
                onSelect={() => onSelectSubcategory(chip)}
                onDelete={onDeleteSubcategory ? () => onDeleteSubcategory(chip) : undefined}
                onLongPress={() => openActions("subcategory", chip)}
              />
            ))}

            {onCreateSubcategory ? (
              <button
                type="button"
                onClick={() => onCreateSubcategory(activeCategory)}
                style={addButtonStyle(compact)}
                title={t.archive_workspace.add_subcategory}
                aria-label={t.archive_workspace.add_subcategory}
              >
                +
              </button>
            ) : null}
          </div>
        ) : null}

        {activeCategory && activeSubcategoryId && showGroupRow ? (
          <>
            <div style={separatorStyle(compact)} />
            <div style={rowStyle(compact)}>
              <button
                type="button"
                onClick={onResetGroup}
                style={rowLabelStyle(!activeGroupId, compact)}
                title={t.archive_workspace.show_all_groups}
              >
                {compact ? t.archive_workspace.group : t.archive_workspace.group_prefix}
              </button>

              {groups.map((chip) => (
                <TaxonomyChipButton
                  key={chip.id}
                  chip={chip}
                  active={activeGroupId === chip.id}
                  compact={compact}
                  onSelect={() => onSelectGroup(chip)}
                  onDelete={onDeleteGroup ? () => onDeleteGroup(chip) : undefined}
                  onLongPress={() => openActions("group", chip)}
                />
              ))}

              {onCreateGroup ? (
                <button
                  type="button"
                  onClick={onCreateGroup}
                  style={addButtonStyle(compact)}
                  title={t.archive_workspace.add_group}
                  aria-label={t.archive_workspace.add_group}
                >
                  +
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      {compact && actionTarget ? (
        <div
          role="presentation"
          style={dialogBackdropStyle}
          onClick={() => {
            if (!actionBusy) setActionTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={actionTarget.chip.label}
            style={dialogPanelStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={dialogTitleStyle}>{actionTarget.chip.label}</div>
            {(actionTarget.kind === "subcategory"
              ? onRenameSubcategory
              : onRenameGroup) ? (
              <label style={dialogFieldStyle}>
                <span>
                  {actionTarget.kind === "subcategory"
                    ? t.archive_workspace.rename_category_prompt
                    : t.archive_workspace.rename_group_prompt}
                </span>
                <input
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  autoFocus
                  maxLength={80}
                  style={dialogInputStyle}
                />
              </label>
            ) : null}
            <div style={dialogActionRowStyle}>
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                disabled={actionBusy}
                style={dialogSecondaryButtonStyle}
              >
                {t.archive_workspace.cancel}
              </button>
              {(actionTarget.kind === "subcategory"
                ? onDeleteSubcategory
                : onDeleteGroup) ? (
                <button
                  type="button"
                  onClick={() => void deleteTarget()}
                  disabled={actionBusy}
                  style={dialogDangerButtonStyle}
                >
                  {t.archive_workspace.delete}
                </button>
              ) : null}
              {(actionTarget.kind === "subcategory"
                ? onRenameSubcategory
                : onRenameGroup) ? (
                <button
                  type="button"
                  onClick={() => void saveRename()}
                  disabled={actionBusy || !renameDraft.trim()}
                  style={dialogPrimaryButtonStyle}
                >
                  {t.archive_workspace.done}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function TaxonomyChipButton({
  chip,
  active,
  compact,
  onSelect,
  onDelete,
  onLongPress,
}: {
  chip: ArchiveTaxonomyChip;
  active: boolean;
  compact: boolean;
  onSelect: () => void;
  onDelete?: () => void | Promise<void>;
  onLongPress?: () => void;
}) {
  const { t } = useLanguage();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function beginLongPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!compact || !onLongPress) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearTimer();
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(12);
      }
    }, 520);
  }

  return (
    <span style={chipWrapperStyle(compact)}>
      <button
        type="button"
        onPointerDown={beginLongPress}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(event) => {
          if (!compact || !onLongPress) return;
          event.preventDefault();
          clearTimer();
          longPressedRef.current = true;
          onLongPress();
        }}
        onClick={(event) => {
          if (longPressedRef.current) {
            event.preventDefault();
            longPressedRef.current = false;
            return;
          }
          onSelect();
        }}
        style={chipButtonStyle(active, compact)}
      >
        {chip.label}
      </button>

      {!compact && onDelete ? (
        <button
          type="button"
          onClick={() => void onDelete()}
          style={deleteButtonStyle}
          title={t.archive_workspace.delete}
          aria-label={`${t.archive_workspace.delete} ${chip.label}`}
        >
          x
        </button>
      ) : null}
    </span>
  );
}

function panelStyle(compact: boolean): CSSProperties {
  return {
    marginBottom: compact ? 8 : 18,
    padding: compact ? "7px 8px" : "12px 14px",
    border: "1px solid #edf0e8",
    borderRadius: compact ? 12 : 16,
    background: "#fff",
    overflow: compact ? "hidden" : undefined,
  };
}

function rowStyle(compact: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: compact ? 5 : 8,
    flexWrap: compact ? "nowrap" : "wrap",
    overflowX: compact ? "auto" : undefined,
    paddingBottom: compact ? 2 : undefined,
    WebkitOverflowScrolling: compact ? "touch" : undefined,
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

function separatorStyle(compact: boolean): CSSProperties {
  return {
    height: 1,
    background: "#edf0e8",
    margin: compact ? "5px 0" : "10px 0",
  };
}

function pillStyle(active: boolean, compact: boolean): CSSProperties {
  return {
    border: active ? "1px solid #3f7d3d" : "1px solid #cfe3c8",
    background: active ? "#3f7d3d" : "#f8fbf5",
    color: active ? "#fff" : "#335033",
    borderRadius: 999,
    padding: compact ? "5px 7px" : "7px 14px",
    fontSize: compact ? 13 : 15,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: compact ? 1.15 : 1.3,
    minHeight: compact ? 40 : undefined,
    whiteSpace: compact ? "normal" : "nowrap",
    textAlign: "center",
  };
}

function rowLabelStyle(active: boolean, compact: boolean): CSSProperties {
  if (!compact) return pillStyle(active, false);
  return {
    ...pillStyle(active, true),
    minHeight: 34,
    padding: "4px 9px",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  };
}

function chipWrapperStyle(compact: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: compact ? 0 : 4,
    marginRight: compact ? 0 : 3,
    marginBottom: compact ? 0 : 4,
    flex: "0 0 auto",
  };
}

function chipButtonStyle(active: boolean, compact: boolean): CSSProperties {
  return {
    border: active ? "1px solid #2f6d2f" : "1px solid #dfe7d9",
    background: active ? "#2f6d2f" : "#fff",
    color: active ? "#fff" : "#374437",
    borderRadius: 999,
    padding: compact ? "5px 10px" : "7px 13px",
    fontSize: compact ? 13 : 15,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    lineHeight: compact ? 1.15 : 1.3,
    whiteSpace: "nowrap",
    boxShadow: active ? "0 6px 14px rgba(63,125,61,0.18)" : "none",
    touchAction: compact ? "pan-x" : undefined,
    userSelect: compact ? "none" : undefined,
    WebkitUserSelect: compact ? "none" : undefined,
    WebkitTouchCallout: compact ? "none" : undefined,
  };
}

const deleteButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#b7b7b7",
  cursor: "pointer",
  fontSize: 13,
  padding: 0,
  lineHeight: 1,
};

function addButtonStyle(compact: boolean): CSSProperties {
  return {
    flex: "0 0 auto",
    minWidth: compact ? 34 : undefined,
    minHeight: compact ? 34 : undefined,
    border: "1px dashed #cbdcc2",
    background: "#fbfdf9",
    color: "#4CAF50",
    borderRadius: 999,
    padding: compact ? "4px 9px" : "5px 10px",
    cursor: "pointer",
    fontSize: compact ? 16 : 14,
    lineHeight: 1.15,
  };
}

const dialogBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2200,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "16px 12px calc(16px + var(--app-safe-area-bottom))",
  background: "rgba(28, 38, 27, 0.32)",
};

const dialogPanelStyle: CSSProperties = {
  width: "min(100%, 420px)",
  borderRadius: 20,
  border: "1px solid #dfe8da",
  background: "#fff",
  padding: 16,
  boxShadow: "0 18px 46px rgba(25, 39, 24, 0.24)",
};

const dialogTitleStyle: CSSProperties = {
  color: "#243524",
  fontSize: 18,
  fontWeight: 850,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const dialogDangerButtonStyle: CSSProperties = {
  minHeight: 46,
  border: "1px solid #efd5d2",
  borderRadius: 13,
  background: "#fff8f7",
  color: "#ad5049",
  fontSize: 15,
  fontWeight: 750,
  padding: "0 13px",
};

const dialogSecondaryButtonStyle: CSSProperties = {
  minHeight: 46,
  border: "1px solid #dbe6d7",
  borderRadius: 13,
  background: "#fff",
  color: "#657264",
  fontSize: 15,
  fontWeight: 750,
  padding: "0 13px",
};

const dialogPrimaryButtonStyle: CSSProperties = {
  minHeight: 46,
  border: "1px solid #3f7d3d",
  borderRadius: 13,
  background: "#3f7d3d",
  color: "#fff",
  fontSize: 15,
  fontWeight: 750,
  padding: "0 13px",
};

const dialogFieldStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 14,
  color: "#657264",
  fontSize: 14,
};

const dialogInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  border: "1px solid #bdcfb8",
  borderRadius: 13,
  padding: "0 13px",
  color: "#263526",
  background: "#fff",
  fontSize: 16,
  outline: "none",
};

const dialogActionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 14,
  flexWrap: "wrap",
};
