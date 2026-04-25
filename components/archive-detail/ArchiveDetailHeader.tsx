"use client";

import Link from "next/link";
import ArchiveStatusBadge from "@/components/archive-detail/ArchiveStatusBadge";
import { formatDate } from "@/lib/archive-detail-utils";
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
  return (
    <section
      style={{
        border: "1px solid #e9ede5",
        borderRadius: 22,
        background: "#fff",
        padding: 18,
        boxShadow: "0 6px 24px rgba(0,0,0,0.04)",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              color: "#5f685d",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            <span>{mode === "owner" ? "我的「" : `${username}的「`}</span>
            <span
              style={{
                color: "#1f2d1f",
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {archive.title}
            </span>
            <span>」的记录</span>

            {encyclopediaHref ? (
              <Link
                href={encyclopediaHref}
                style={{
                  color: "#4CAF50",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  fontSize: 14,
                }}
              >
                🌿 {archiveDisplayName}
              </Link>
            ) : (
              <span style={{ color: "#4CAF50", fontSize: 14 }}>
                🌿 {archiveDisplayName}
              </span>
            )}

            {archive.status === "ended" ? (
              <ArchiveStatusBadge kind="ended">已结束</ArchiveStatusBadge>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              color: "#6f7f6f",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: "#51614f", fontWeight: 600 }}>
              {archiveCategoryLabel}
            </span>
            <span>创建于 {formatDate(archive.created_at) || "暂无"}</span>
            <span>最近更新 {formatDate(latestUpdate) || "暂无"}</span>
            <span>共 {recordCount} 条记录</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
              {archive.is_public ? "已公开" : "仅自己可见"}
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
        </div>
      </div>
    </section>
  );
}
