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
import UiIcon from "@/components/ui/UiIcon";

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
  isProjectFollowed,
  systemNameCandidates,
  systemNameMode,
  onToggleArchiveVisibility,
  onToggleProjectFollow,
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
  isProjectFollowed: boolean;
  systemNameCandidates?: ArchiveSystemNameCandidate[];
  systemNameMode?: "candidate" | "text";
  onToggleArchiveVisibility: () => void;
  onToggleProjectFollow: () => void;
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
  const archiveCategory = normalizeArchiveCategory(archive.category);
  const createdAtText = formatDate(archive.created_at) || "暂无";
  const latestUpdateDisplay = formatDate(latestUpdate) || "暂无";
  const ongoingDays = getOngoingDays(archive.created_at);
  const durationText = ongoingDays ? `已持续 ${ongoingDays} 天` : "暂无";
  const systemNameText = archiveDisplayName || "未填写";
  const systemNameLabel = archiveCategory === "plant" ? "系统植物名 *" : "系统名 *";

  const projectView = {
    id: archive.id,
    mode: "cloud" as const,
    title: archive.title || "未命名项目",
    category: archiveCategory,
    plantId: archive.species_id,
    categoryLabel: archiveCategoryLabel,
    categoryIcon: getArchiveCategoryIcon(archiveCategory),
    systemName: systemNameText,
    subcategoryLabel: archiveSubcategoryLabel,
    groupLabel: archiveGroupLabel,
    badges: archive.status === "ended" ? ["已结束"] : [],
    footerItems: [`创建于 ${createdAtText}`],
    visibilityLabel: null,
    visibilityTone: archive.is_public ? ("public" as const) : ("private" as const),
    storageLabel: "云端",
    storageTone: "cloud" as const,
    recordCount,
    durationDays: ongoingDays,
    latestTime: latestUpdate,
    ended: archive.status === "ended",
  };

  const profileRows = [
    { label: "项目名称 *", value: archive.title || "未命名项目", field: "title" as const },
    { label: "种类", value: archiveCategoryLabel || "其他", field: "category" as const },
    {
      label: systemNameLabel,
      value: systemNameText,
      field: "systemName" as const,
    },
    { label: "来源", value: archive.source || "未填写", field: "source" as const },
    { label: "备注", value: archive.note || "未填写", field: "note" as const },
    {
      label: "项目摘要",
      value: archive.archive_summary || "未填写",
      field: "archiveSummary" as const,
    },
    { label: "创建时间", value: createdAtText },
    { label: "最近更新", value: latestUpdateDisplay },
    { label: "记录数", value: `${recordCount}` },
    { label: "持续天数", value: durationText },
  ];

  async function saveProfileField(change: ArchiveProfileFieldSave) {
    if (change.field === "title") {
      const cleanValue = change.value.trim();
      if (!cleanValue) throw new Error("项目名称不能为空");
      if (cleanValue !== (archive.title || "")) await onSaveTitle?.(cleanValue);
      return;
    }

    if (change.field === "category") {
      if (change.value !== archiveCategory) await onSaveCategory?.(change.value);
      return;
    }

    if (change.field === "systemName") {
      const cleanValue = change.value.name.trim();
      if (!cleanValue) throw new Error("系统名不能为空");
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

  const actionSlot = (
    <>
      {mode === "owner" ? (
        <button
          type="button"
          onClick={onToggleArchiveVisibility}
          style={{
            fontSize: 13,
            padding: "9px 14px",
            borderRadius: 999,
            border: archive.is_public ? "1px solid #b7dfbb" : "1px solid #ddd",
            background: archive.is_public ? "#f1fff3" : "#f7f7f7",
            color: archive.is_public ? "#2f6f3a" : "#666",
            cursor: "pointer",
          }}
        >
          {archive.is_public ? "公开发现" : "仅自己可见"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggleProjectFollow}
          style={{
            fontSize: 14,
            padding: "10px 16px",
            borderRadius: 999,
            border: isProjectFollowed ? "1px solid #d6dde9" : "1px solid #c8dfc5",
            background: isProjectFollowed ? "#f5f7fa" : "#edf7ea",
            color: isProjectFollowed ? "#4f5e73" : "#35693d",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {isProjectFollowed ? "已关注该项目" : "关注该项目"}
        </button>
      )}

      {mode === "viewer" ? (
        <a
          href={`/user/${archive.user_id}`}
          style={{ fontSize: 14, color: "#4CAF50", textDecoration: "none" }}
        >
          进入{username}的空间 <UiIcon name="arrow-right" size={14} />
        </a>
      ) : null}
    </>
  );

  return (
    <ArchiveDetailHeaderView
      project={projectView}
      eyebrow={
        <>
          <span>{mode === "owner" ? "项目档案" : `${username}的项目档案`}</span>
          {archive.status === "ended" ? (
            <ArchiveStatusBadge kind="ended">已结束</ArchiveStatusBadge>
          ) : null}
        </>
      }
      latestUpdateText={`最近更新 ${latestUpdateDisplay}`}
      recordCountText={`记录 ${recordCount}`}
      durationText={ongoingDays ? `已持续 ${ongoingDays} 天` : undefined}
      encyclopediaHref={encyclopediaHref}
      actionSlot={actionSlot}
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
                  ? "其他种类没有预设系统名，可直接输入。"
                  : "输入关键词搜索候选名；无匹配时可使用当前输入作为新的系统名。",
            }
          : undefined
      }
      profileActions={
        mode === "owner" ? (
          <>
            <button type="button" onClick={onToggleArchiveStatus} style={profileActionButtonStyle}>
              {archive.status === "ended" ? "恢复" : "结束"}
            </button>
            <button type="button" onClick={onToggleArchiveVisibility} style={profileActionButtonStyle}>
              {archive.is_public ? "设为仅自己可见" : "设为公开发现"}
            </button>
            <button type="button" onClick={onDeleteArchive} style={profileDangerButtonStyle}>
              移入回收站
            </button>
          </>
        ) : null
      }
      profileExtra={profileExtra}
      profileAlwaysOpen
    />
  );
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
