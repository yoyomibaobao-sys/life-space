"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { showToast } from "@/components/Toast";
import ArchiveCategoryTabs from "@/components/archive-ui/ArchiveCategoryTabs";
import ArchiveProjectCard from "@/components/archive-ui/ArchiveProjectCard";
import { localArchiveToProjectView } from "@/components/archive-ui/localArchiveProjectView";
import { supabase } from "@/lib/supabase";
import {
  listVisibleLocalArchiveSummaries,
  markUnownedLocalArchivesForOwner,
  type LocalArchiveOwnerContext,
  type LocalArchiveSummary,
} from "@/lib/local-offline-db";
import {
  type ArchiveCategory,
} from "@/lib/archive-categories";

type CategoryFilter = "all" | ArchiveCategory;

function formatDate(value?: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LocalArchivePage() {
  const [archives, setArchives] = useState<LocalArchiveSummary[]>([]);
  const [ownerContext, setOwnerContext] = useState<LocalArchiveOwnerContext | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unownedCount, setUnownedCount] = useState(0);
  const [hiddenOwnedByOtherCount, setHiddenOwnedByOtherCount] = useState(0);
  const [ownershipPromptDismissed, setOwnershipPromptDismissed] = useState(false);
  const [markingOwner, setMarkingOwner] = useState(false);

  const categoryCounts = useMemo(() => {
    const counts: Record<ArchiveCategory, number> = {
      plant: 0,
      system: 0,
      insect_fish: 0,
      other: 0,
    };

    archives.forEach((archive) => {
      counts[archive.category] += 1;
    });

    return counts;
  }, [archives]);

  const filteredArchives = useMemo(
    () =>
      activeCategory === "all"
        ? archives
        : archives.filter((archive) => archive.category === activeCategory),
    [activeCategory, archives]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data } = await supabase.auth.getUser();
        const nextOwnerContext = data.user
          ? { userId: data.user.id, email: data.user.email || null }
          : null;
        const result = await listVisibleLocalArchiveSummaries(nextOwnerContext);
        if (!active) return;
        setOwnerContext(nextOwnerContext);
        setArchives(result.archives);
        setUnownedCount(result.unownedCount);
        setHiddenOwnedByOtherCount(result.hiddenOwnedByOtherCount);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "读取本地项目失败");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function refreshArchives(context: LocalArchiveOwnerContext | null = ownerContext) {
    const result = await listVisibleLocalArchiveSummaries(context);
    setArchives(result.archives);
    setUnownedCount(result.unownedCount);
    setHiddenOwnedByOtherCount(result.hiddenOwnedByOtherCount);
  }

  async function markUnownedArchivesAsMine() {
    if (!ownerContext?.userId || markingOwner) return;

    setMarkingOwner(true);
    try {
      const markedCount = await markUnownedLocalArchivesForOwner({
        userId: ownerContext.userId,
        email: ownerContext.email || null,
      });
      await refreshArchives(ownerContext);
      showToast(markedCount > 0 ? "已标记为我的本地项目" : "没有需要标记的本地项目");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "标记本地项目失败");
    } finally {
      setMarkingOwner(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>本地离线</div>
          <h1 style={titleStyle}>本地项目</h1>
          <p style={subtitleStyle}>
            数据和图片只保存在当前设备，不上传云端，不进入发现页。
          </p>
        </div>
        <Link href="/local/archive/new" style={primaryActionStyle}>
          新建本地项目
        </Link>
      </section>

      <section style={noticeStyle}>
        本地项目只在本机使用，不上传云端，也不会进入公共页面。这里的子分类和分组只保存在本机，
        不会自动创建或影响云空间分类。
      </section>

      {ownerContext?.userId && unownedCount > 0 && !ownershipPromptDismissed ? (
        <section style={ownershipNoticeStyle}>
          <span>
            发现本机有未归属的本地离线项目。这些内容仍只保存在这台设备，不会自动上传云端。
          </span>
          <div style={ownershipActionRowStyle}>
            <button
              type="button"
              onClick={markUnownedArchivesAsMine}
              disabled={markingOwner}
              style={ownershipPrimaryButtonStyle}
            >
              {markingOwner ? "标记中..." : "标记为我的本地项目"}
            </button>
            <button
              type="button"
              onClick={() => setOwnershipPromptDismissed(true)}
              style={ownershipSecondaryButtonStyle}
            >
              暂不处理
            </button>
          </div>
        </section>
      ) : null}

      {hiddenOwnedByOtherCount > 0 ? (
        <section style={otherOwnerNoticeStyle}>
          这台设备上有已归属其他账号的本地离线项目。
        </section>
      ) : null}

      <section style={filterPanelStyle}>
        <ArchiveCategoryTabs
          activeCategory={activeCategory === "all" ? null : activeCategory}
          counts={categoryCounts}
          totalCount={archives.length}
          onSelect={(category) => setActiveCategory(category || "all")}
          mobileMode
        />
      </section>

      {loading ? (
        <section style={emptyStyle}>正在读取本地项目...</section>
      ) : error ? (
        <section style={emptyStyle}>{error}</section>
      ) : archives.length === 0 ? (
        <section style={emptyStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>还没有本地项目</div>
          <div style={{ color: "#6f7b69", fontSize: 14 }}>
            可以先在本机记录，数据只保存在当前设备。
          </div>
          <Link href="/local/archive/new" style={secondaryActionStyle}>
            创建第一个本地项目
          </Link>
        </section>
      ) : filteredArchives.length === 0 ? (
        <section style={emptyStyle}>
          当前主分类下还没有本地项目。
        </section>
      ) : (
        <section style={gridStyle}>
          {filteredArchives.map((archive) => {
            return (
              <ArchiveProjectCard
                key={archive.id}
                project={localArchiveToProjectView(archive, ownerContext)}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}

const pageStyle = {
  minHeight: "calc(100vh - 70px)",
  padding: "22px 16px 46px",
  background: "#fbfcf7",
  color: "#263326",
} satisfies CSSProperties;

const headerStyle = {
  maxWidth: 1080,
  margin: "0 auto 10px",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
} satisfies CSSProperties;

const eyebrowStyle = {
  color: "#6f7b69",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const titleStyle = {
  margin: "4px 0 6px",
  fontSize: 26,
  lineHeight: 1.2,
} satisfies CSSProperties;

const subtitleStyle = {
  margin: 0,
  maxWidth: 620,
  color: "#5d6a56",
  fontSize: 14,
  lineHeight: 1.7,
} satisfies CSSProperties;

const primaryActionStyle = {
  height: 40,
  padding: "0 16px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#3f7d3d",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
} satisfies CSSProperties;

const secondaryActionStyle = {
  marginTop: 14,
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef6e8",
  color: "#2f5f2d",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
} satisfies CSSProperties;

const noticeStyle = {
  maxWidth: 1080,
  margin: "0 auto 12px",
  color: "#8a9584",
  fontSize: 12,
  lineHeight: 1.6,
} satisfies CSSProperties;

const ownershipNoticeStyle = {
  maxWidth: 1080,
  margin: "0 auto 12px",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #dfead7",
  background: "#f7fbf2",
  color: "#54624d",
  fontSize: 13,
  lineHeight: 1.55,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
} satisfies CSSProperties;

const otherOwnerNoticeStyle = {
  maxWidth: 1080,
  margin: "0 auto 12px",
  color: "#87917e",
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const ownershipActionRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const ownershipPrimaryButtonStyle = {
  minHeight: 32,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid #b7d2af",
  background: "#eef7e8",
  color: "#2f5f2d",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const ownershipSecondaryButtonStyle = {
  minHeight: 32,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #dde5d7",
  background: "#fff",
  color: "#66735f",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const filterPanelStyle = {
  maxWidth: 1080,
  margin: "0 auto 12px",
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const filterLabelStyle = {
  color: "#7b8874",
  fontSize: 13,
  fontWeight: 800,
} satisfies CSSProperties;

function filterButtonStyle(active: boolean): CSSProperties {
  return {
    minHeight: 32,
    padding: "5px 10px",
    borderRadius: 999,
    border: active ? "1px solid #9fc796" : "1px solid #dfe7d9",
    background: active ? "#f0f8ed" : "#fff",
    color: active ? "#2f6a2c" : "#54634f",
    fontSize: 13,
    fontWeight: active ? 800 : 600,
    lineHeight: 1.25,
  };
}

const emptyStyle = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: 24,
  borderRadius: 18,
  border: "1px solid #e1eadb",
  background: "#fff",
} satisfies CSSProperties;

const gridStyle = {
  maxWidth: 1080,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
} satisfies CSSProperties;

const cardStyle = {
  display: "grid",
  gridTemplateColumns: "104px minmax(0, 1fr)",
  gap: 10,
  minHeight: 124,
  padding: 10,
  borderRadius: 14,
  border: "1px solid #e2eadc",
  background: "#fff",
  boxShadow: "0 8px 22px rgba(42, 66, 34, 0.05)",
  color: "inherit",
  textDecoration: "none",
} satisfies CSSProperties;

const coverStyle = {
  width: 104,
  height: 104,
  objectFit: "cover",
  borderRadius: 11,
  background: "#f1f5eb",
} satisfies CSSProperties;

const coverPlaceholderStyle = {
  width: 104,
  height: 104,
  borderRadius: 11,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f1f6ec",
  color: "#78906e",
  fontSize: 28,
} satisfies CSSProperties;

const cardMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#78906e",
  fontSize: 12,
  fontWeight: 700,
} satisfies CSSProperties;

const localPillStyle = {
  padding: "3px 7px",
  borderRadius: 999,
  border: "1px solid #d9e6d0",
  background: "#f6faf3",
  color: "#4f6e45",
} satisfies CSSProperties;

const cardTitleStyle = {
  margin: "5px 0 2px",
  fontSize: 17,
  lineHeight: 1.35,
  color: "#263326",
} satisfies CSSProperties;

const systemNameStyle = {
  color: "#64745d",
  fontSize: 13,
  lineHeight: 1.5,
} satisfies CSSProperties;

const categoryLineStyle = {
  marginTop: 3,
  color: "#7d8a76",
  fontSize: 12,
  lineHeight: 1.45,
} satisfies CSSProperties;

const noteStyle = {
  margin: "6px 0 0",
  color: "#4d5848",
  fontSize: 13,
  lineHeight: 1.45,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
} satisfies CSSProperties;

const cardFooterStyle = {
  marginTop: 8,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#87927f",
  fontSize: 12,
} satisfies CSSProperties;
