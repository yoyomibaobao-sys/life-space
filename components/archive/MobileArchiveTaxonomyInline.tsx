"use client";

import type { CSSProperties } from "react";
import {
  archiveCategoryOptions,
  getArchiveCategoryLabel,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { GroupTagItem, SubTagItem } from "@/lib/archive-page-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

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
    <span style={rowStyle} data-no-card-nav="true">
      <InlineSelect
        label={getArchiveCategoryLabel(category, language)}
        ariaLabel={t.archive_workspace.main_category}
        value={category}
        onChange={onChangeCategory}
        options={archiveCategoryOptions.map((option) => ({
          value: option.value,
          label: getArchiveCategoryLabel(option.value, language),
        }))}
      />

      {maxDepth >= 2 ? (
        <InlineSelect
          label={selectedSubTag?.name || t.archive_workspace.ungrouped}
          ariaLabel={t.archive_workspace.subcategory}
          value={selectedSubTag?.id || ""}
          onChange={(value) => onChangeCategory(value || category)}
          options={[
            { value: "", label: t.archive_workspace.ungrouped },
            ...availableSubTags.map((tag) => ({ value: tag.id, label: tag.name })),
          ]}
        />
      ) : null}

      {maxDepth >= 3 && selectedSubTag ? (
        <InlineSelect
          label={selectedGroup?.name || t.archive_workspace.ungrouped}
          ariaLabel={t.archive_workspace.group}
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
}: {
  label: string;
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={selectWrapStyle}>
      <span style={selectLabelStyle}>{label}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
        style={selectOverlayStyle}
      >
        {options.map((option) => (
          <option key={`${option.value}:${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const rowStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  gap: 12,
  overflowX: "auto",
  overflowY: "hidden",
  scrollbarWidth: "none",
  WebkitOverflowScrolling: "touch",
};

const selectWrapStyle: CSSProperties = {
  position: "relative",
  flex: "0 0 auto",
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 5px",
  borderRadius: 8,
  color: "#536a50",
  fontSize: 12,
  fontWeight: 750,
  lineHeight: 1.2,
  cursor: "pointer",
  touchAction: "manipulation",
};

const selectLabelStyle: CSSProperties = {
  pointerEvents: "none",
  whiteSpace: "nowrap",
};

const selectOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
};
