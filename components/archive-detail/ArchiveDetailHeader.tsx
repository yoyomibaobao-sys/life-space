"use client";

import Link from "next/link";
import ArchiveDetailHeaderView from "@/components/archive-ui/ArchiveDetailHeaderView";
import ArchiveStatusBadge from "@/components/archive-detail/ArchiveStatusBadge";
import { formatDate } from "@/lib/archive-detail-utils";
import {
  getArchiveCategoryIcon,
  type ArchiveCategory,
} from "@/lib/archive-categories";
import type { ArchiveDetailArchive, ArchiveMode } from "@/lib/archive-detail-types";

export default function ArchiveDetailHeader({
  mode,
  archive,
  username,
  archiveDisplayName,
  archiveCategoryLabel,
  latestUpdate,
  recordCount,
  encyclopediaHref,
  isProjectFollowed,
  onToggleArchiveVisibility,
  onToggleProjectFollow,
}: {
  mode: ArchiveMode;
  archive: ArchiveDetailArchive;
  username: string;
  archiveDisplayName: string;
  archiveCategoryLabel: string;
  latestUpdate?: string | null;
  recordCount: number;
  encyclopediaHref?: string | null;
  isProjectFollowed: boolean;
  onToggleArchiveVisibility: () => void;
  onToggleProjectFollow: () => void;
}) {
  const archiveCategory = normalizeArchiveCategory(archive.category);
  const projectView = {
    id: archive.id,
    mode: "cloud" as const,
    title: archive.title || "未命名项目",
    category: archiveCategory,
    plantId: archive.species_id,
    categoryLabel: archiveCategoryLabel,
    categoryIcon: getArchiveCategoryIcon(archiveCategory),
    systemName: archiveDisplayName || "未填写",
    badges: archive.status === "ended" ? ["已结束"] : [],
    footerItems: [
      `创建于 ${formatDate(archive.created_at) || "暂无"}`,
    ],
    visibilityLabel: archive.is_public ? "公开发现" : "仅自己可见",
    visibilityTone: archive.is_public ? "public" as const : "private" as const,
  };

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
        <Link
          href={`/user/${archive.user_id}`}
          style={{ fontSize: 14, color: "#4CAF50", textDecoration: "none" }}
        >
          去 TA 的空间 →
        </Link>
      ) : null}
    </>
  );

  return (
    <ArchiveDetailHeaderView
      project={projectView}
      eyebrow={
        <>
          <span>{mode === "owner" ? "我的项目记录" : `${username}的项目记录`}</span>
          {archive.status === "ended" ? (
            <ArchiveStatusBadge kind="ended">已结束</ArchiveStatusBadge>
          ) : null}
        </>
      }
      latestUpdateText={`最近更新 ${formatDate(latestUpdate) || "暂无"}`}
      recordCountText={`共 ${recordCount} 条记录`}
      encyclopediaHref={encyclopediaHref}
      actionSlot={actionSlot}
    />
  );
}

function normalizeArchiveCategory(value?: string | null): ArchiveCategory {
  if (value === "plant" || value === "system" || value === "insect_fish" || value === "other") {
    return value;
  }

  return "other";
}
