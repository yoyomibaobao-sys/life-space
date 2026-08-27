"use client";

import type { ReactNode } from "react";
import ArchiveDetailHeaderView, {
  type ArchiveProfileFieldSave,
  type ArchiveProfileSystemNameValue,
  type ArchiveSystemNameCandidate,
} from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveStatusBadge from "@/components/archive-detail/ArchiveStatusBadge";
import { formatDate } from "@/lib/archive-detail-utils";
import {
  getArchiveCategoryIcon,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { ArchiveDetailArchive, ArchiveMode } from "@/lib/archive-detail-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ArchiveDetailHeader({
  mode,
  archive,
  username,
  archiveDisplayName,
  archiveCategoryLabel,
  archiveSubcategoryLabel,
  archiveGroupLabel,
  latestUpdate,
  recordCount,
  encyclopediaHref,
  systemNameCandidates,
  systemNameMode,
  onToggleArchiveVisibility,
  onToggleArchiveStatus,
  onDeleteArchive,
  onSaveTitle,
  onSaveCategory,
  onSaveSystemName,
  onSaveSource,
  onSaveNote,
  onSaveArchiveSummary,
  profileExtra,
}: {
  mode: ArchiveMode;
  archive: ArchiveDetailArchive;
  username: string;
  archiveDisplayName: string;
  archiveCategoryLabel: string;
  archiveSubcategoryLabel?: string | null;
  archiveGroupLabel?: string | null;
  latestUpdate?: string | null;
  recordCount: number;
  encyclopediaHref?: string | null;
  systemNameCandidates?: ArchiveSystemNameCandidate[];
  systemNameMode?: "candidate" | "text";
  onToggleArchiveVisibility: () => void;
  onToggleArchiveStatus?: () => void;
  onDeleteArchive?: () => void;
  onSaveTitle?: (value: string) => Promise<void> | void;
  onSaveCategory?: (value: ArchiveCategory) => Promise<void> | void;
  onSaveSystemName?: (value: ArchiveProfileSystemNameValue) => Promise<void> | void;
  onSaveSource?: (value: string) => Promise<void> | void;
  onSaveNote?: (value: string) => Promise<void> | void;
  onSaveArchiveSummary?: (value: string) => Promise<void> | void;
  profileExtra?: ReactNode;
}) {
  const { language, t } = useLanguage();
  const copy = t.archive;
  const archiveCategory = normalizeArchiveCategory(archive.category);
  const createdAtText = formatDate(archive.created_at) || copy.none;
  const latestUpdateDisplay = formatDate(latestUpdate) || copy.none;
  const ongoingDays = getOngoingDays(archive.created_at);
  const durationText = ongoingDays
    ? language === "en"
      ? `${copy.ongoing_days_prefix} ${ongoingDays} ${copy.days_suffix}`
      : `${copy.ongoing_days_prefix} ${ongoingDays} ${copy.days_suffix}`
    : copy.none;
  const systemNameText = archiveDisplayName || copy.not_filled;
  const systemNameLabel =
    archiveCategory === "plant"
      ? copy.system_plant_name_required
      : copy.system_name_required;
  const localizedCategoryLabel =
    language === "zh" && archiveCategoryLabel
      ? archiveCategoryLabel
      : getLocalizedCategoryLabel(archiveCategory, copy);

  const projectView = {
    id: archive.id,
    mode: "cloud" as const,
    title: archive.title || copy.unnamed_project,
    category: archiveCategory,
    plantId: archive.species_id,
    categoryLabel: localizedCategoryLabel,
    categoryIcon: getArchiveCategoryIcon(archiveCategory),
    systemName: systemNameText,
    subcategoryLabel: archiveSubcategoryLabel,
    groupLabel: archiveGroupLabel,
    badges: archive.status === "ended" ? [copy.ended] : [],
    footerItems: [`${copy.created_on} ${createdAtText}`],
    visibilityLabel: null,
    visibilityTone: archive.is_public ? ("public" as const) : ("private" as const),
    storageLabel: copy.cloud,
    storageTone: "cloud" as const,
    recordCount,
    durationDays: ongoingDays,
    latestTime: latestUpdate,
    ended: archive.status === "ended",
  };

  const profileRows = [
    { label: copy.project_name_required, value: archive.title || copy.unnamed_project, field: "title" as const },
    { label: copy.category, value: localizedCategoryLabel, field: "category" as const },
    {
      label: systemNameLabel,
      value: encyclopediaHref ? (
        <a
          href={encyclopediaHref}
          onClick={(event) => event.stopPropagation()}
          style={guideProfileLinkStyle}
        >
          {systemNameText}
        </a>
      ) : systemNameText,
      field: "systemName" as const,
    },
    { label: copy.source, value: archive.source || copy.not_filled, field: "source" as const },
    { label: copy.note, value: archive.note || copy.not_filled, field: "note" as const },
    {
      label: copy.summary,
      value: archive.archive_summary || copy.not_filled,
      field: "archiveSummary" as const,
    },
    { label: copy.created_time, value: createdAtText },
    { label: copy.latest_update, value: latestUpdateDisplay },
    { label: copy.record_count, value: `${recordCount}` },
    { label: copy.duration_days, value: durationText },
  ];

  async function saveProfileField(change: ArchiveProfileFieldSave) {
    if (change.field === "title") {
      const cleanValue = change.value.trim();
      if (!cleanValue) throw new Error(copy.project_name_empty);
      if (cleanValue !== (archive.title || "")) await onSaveTitle?.(cleanValue);
      return;
    }

    if (change.field === "category") {
      if (change.value !== archiveCategory) await onSaveCategory?.(change.value);
      return;
    }

    if (change.field === "systemName") {
      const cleanValue = change.value.name.trim();
      if (!cleanValue) throw new Error(copy.system_name_empty);
      if (cleanValue !== systemNameText || change.value.candidateId) {
        await onSaveSystemName?.({ ...change.value, name: cleanValue });
      }
      return;
    }

    if (change.field === "source") {
      const cleanValue = change.value.trim();
      if (cleanValue !== (archive.source || "")) await onSaveSource?.(cleanValue);
      return;
    }

    if (change.field === "note") {
      const cleanValue = change.value.trim();
      if (cleanValue !== (archive.note || "")) await onSaveNote?.(cleanValue);
      return;
    }

    if (change.field === "archiveSummary") {
      const cleanValue = change.value.trim();
      if (cleanValue !== (archive.archive_summary || "")) await onSaveArchiveSummary?.(cleanValue);
    }
  }

  return (
    <ArchiveDetailHeaderView
      project={projectView}
      eyebrow={
        <>
          <span>
            {mode === "owner"
              ? copy.project_archive
              : `${username}${copy.user_project_archive_suffix}`}
          </span>
          {archive.status === "ended" ? (
            <ArchiveStatusBadge kind="ended">{copy.ended}</ArchiveStatusBadge>
          ) : null}
        </>
      }
      latestUpdateText={`${copy.latest_update} ${latestUpdateDisplay}`}
      recordCountText={`${copy.records} ${recordCount}`}
      durationText={ongoingDays ? durationText : undefined}
      encyclopediaHref={encyclopediaHref}
      profileRows={profileRows}
      profileEditor={
        mode === "owner"
          ? {
              values: {
                title: archive.title || "",
                category: archiveCategory,
                systemName: systemNameText,
                source: archive.source || "",
                note: archive.note || "",
                archiveSummary: archive.archive_summary || "",
              },
              onSaveField: saveProfileField,
              systemNameMode,
              systemNameCandidates,
              systemNameHint:
                systemNameMode === "text"
                  ? copy.other_system_hint
                  : copy.candidate_system_hint,
            }
          : undefined
      }
      profileActions={
        mode === "owner" ? (
          <>
            <button type="button" onClick={onToggleArchiveStatus} style={profileActionButtonStyle}>
              {archive.status === "ended" ? copy.restore : copy.end}
            </button>
            <button type="button" onClick={onToggleArchiveVisibility} style={profileActionButtonStyle}>
              {archive.is_public ? copy.set_private : copy.set_public}
            </button>
            <button type="button" onClick={onDeleteArchive} style={profileDangerButtonStyle}>
              {copy.move_to_trash}
            </button>
          </>
        ) : null
      }
      profileExtra={profileExtra}
      profileAlwaysOpen
      showSystemNameInTitle={false}
    />
  );
}

function getLocalizedCategoryLabel(
  category: ArchiveCategory,
  copy: ReturnType<typeof useLanguage>["t"]["archive"]
) {
  if (category === "plant") return copy.categories.plant_label;
  if (category === "system") return copy.categories.system_label;
  if (category === "insect_fish") return copy.categories.insect_fish_label;
  return copy.categories.other_label;
}

function normalizeArchiveCategory(value?: string | null): ArchiveCategory {
  if (value === "plant" || value === "system" || value === "insect_fish" || value === "other") {
    return value;
  }

  return "other";
}

function getOngoingDays(createdAt?: string | null) {
  if (!createdAt) return null;

  const startedAt = new Date(createdAt);
  if (Number.isNaN(startedAt.getTime())) return null;

  const startDate = new Date(
    startedAt.getFullYear(),
    startedAt.getMonth(),
    startedAt.getDate()
  ).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(1, Math.floor((today - startDate) / dayMs) + 1);
}

const profileActionButtonStyle = {
  border: "1px solid #d6dfd1",
  borderRadius: 999,
  background: "#fff",
  color: "#52624b",
  fontSize: 13,
  fontWeight: 800,
  padding: "7px 12px",
  cursor: "pointer",
} as const;

const profileDangerButtonStyle = {
  ...profileActionButtonStyle,
  color: "#c85f5a",
  border: "1px solid #efd8d5",
} as const;

const guideProfileLinkStyle = {
  color: "#356f39",
  fontWeight: 750,
  textDecoration: "underline",
  textUnderlineOffset: 3,
} as const;
