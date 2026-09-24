"use client";

import type { CSSProperties } from "react";
import SegmentedChoice from "@/components/ui/SegmentedChoice";
import UiIcon from "@/components/ui/UiIcon";
import type { GroupTagItem, SubTagItem } from "@/lib/archive-page-types";
import type { ArchiveCategory } from "@/lib/archive-categories";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ArchiveOwnerSettingsFields({
  category,
  subTagId,
  groupTagId,
  subTags,
  groupTags,
  maxDepth,
  ended,
  isPublic,
  canWrite,
  busy,
  showVisibility = true,
  onChangeSubcategory,
  onChangeGroup,
  onToggleEnded,
  onTogglePublic,
}: {
  category: ArchiveCategory;
  subTagId: string | null;
  groupTagId: string | null;
  subTags: SubTagItem[];
  groupTags: GroupTagItem[];
  maxDepth: number;
  ended: boolean;
  isPublic: boolean;
  canWrite: boolean;
  busy: boolean;
  showVisibility?: boolean;
  onChangeSubcategory: (value: string) => void;
  onChangeGroup: (value: string) => void;
  onToggleEnded: () => void;
  onTogglePublic?: () => void;
}) {
  const { t } = useLanguage();
  const copy = t.archive;
  const availableSubTags = subTags.filter((tag) => tag.category === category);
  const availableGroupTags = subTagId
    ? groupTags.filter((tag) => String(tag.sub_tag_id) === subTagId)
    : [];

  if (!canWrite && !(showVisibility && isPublic)) return null;

  return (
    <section style={fieldsStyle} aria-label={copy.project_settings}>
      {canWrite && maxDepth >= 2 ? (
        <label style={selectRowStyle}>
          <span style={labelStyle}>{copy.subcategory}</span>
          <span style={selectWrapStyle}>
            <select
              value={subTagId || ""}
              disabled={busy}
              onChange={(event) => onChangeSubcategory(event.target.value)}
              style={selectStyle}
            >
              <option value="">{copy.no_subcategory}</option>
              {availableSubTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            <span aria-hidden="true" style={selectIconStyle}>
              <UiIcon name="chevron-down" size={14} />
            </span>
          </span>
        </label>
      ) : null}

      {canWrite && maxDepth >= 3 ? (
        <label style={selectRowStyle}>
          <span style={labelStyle}>{copy.group}</span>
          <span style={selectWrapStyle}>
            <select
              value={groupTagId || ""}
              disabled={busy || !subTagId}
              onChange={(event) => onChangeGroup(event.target.value)}
              style={selectStyle}
            >
              <option value="">{copy.no_group}</option>
              {availableGroupTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            <span aria-hidden="true" style={selectIconStyle}>
              <UiIcon name="chevron-down" size={14} />
            </span>
          </span>
        </label>
      ) : null}

      {canWrite ? (
        <div style={actionRowStyle}>
          <span style={labelStyle}>{copy.project_status}</span>
          <SegmentedChoice
            label={copy.project_status}
            value={ended ? "ended" : "active"}
            options={[
              { value: "active", label: copy.ongoing },
              { value: "ended", label: copy.ended },
            ]}
            disabled={busy}
            onChange={() => onToggleEnded()}
          />
        </div>
      ) : null}

      {showVisibility && (canWrite || isPublic) ? (
        <div style={actionRowStyle}>
          <span style={labelStyle}>{copy.visibility}</span>
          <SegmentedChoice
            label={copy.visibility}
            value={isPublic ? "public" : "private"}
            options={[
              { value: "private", label: copy.private_only },
              { value: "public", label: copy.public_discover, disabled: !canWrite },
            ]}
            disabled={busy}
            onChange={() => onTogglePublic?.()}
          />
        </div>
      ) : null}
    </section>
  );
}

const fieldsStyle: CSSProperties = {
  overflow: "hidden",
  marginBottom: 14,
  border: "1px solid #e6ece1",
  borderRadius: 16,
  background: "#fff",
  padding: "0 14px",
};

const selectRowStyle: CSSProperties = {
  minHeight: 48,
  display: "grid",
  gridTemplateColumns: "84px minmax(0, 1fr)",
  alignItems: "center",
  gap: 10,
  borderBottom: "1px solid #f0f3ed",
  color: "#6f7b6c",
  fontSize: 13.5,
};

const selectWrapStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
};

const selectIconStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  right: 0,
  display: "inline-flex",
  color: "#748171",
  pointerEvents: "none",
  transform: "translateY(-50%)",
};

const selectStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: 0,
  outline: 0,
  background: "transparent",
  color: "#273327",
  padding: "8px 20px 8px 0",
  fontSize: 14,
  textAlign: "right",
  cursor: "pointer",
};

const actionRowStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  display: "grid",
  gridTemplateColumns: "84px minmax(0, 1fr)",
  alignItems: "center",
  gap: 10,
  border: 0,
  borderBottom: "1px solid #f0f3ed",
  background: "transparent",
  color: "#6f7b6c",
  padding: 0,
  fontSize: 13.5,
  textAlign: "left",
};

const labelStyle: CSSProperties = {
  color: "#7a8577",
  fontSize: 13,
  lineHeight: 1.45,
};
