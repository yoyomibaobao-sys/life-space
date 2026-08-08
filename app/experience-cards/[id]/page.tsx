"use client";

import Link from "next/link";
import { use, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExperienceCardVideoPanel from "@/components/experience-card/ExperienceCardVideoPanel";
import ExperienceCardTimeline from "@/components/experience-card/ExperienceCardTimeline";
import ExperienceCardEditor from "@/components/experience-card/ExperienceCardEditor";
import ExperienceCardInteractions from "@/components/experience-card/ExperienceCardInteractions";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import {
  deleteExperienceCard,
  formatExperienceCardDate,
  getExperienceCardErrorText,
  loadExperienceCard,
  unpublishExperienceCard,
} from "@/lib/experience-cards";
import type { ExperienceCardDetail } from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";

type PendingAction = "unpublish" | "delete" | null;
type OwnerMode = "view" | "edit";

export default function ExperienceCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<ExperienceCardDetail | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("view");
  const [editorDirty, setEditorDirty] = useState(false);
  const [videoPreviewRevision, setVideoPreviewRevision] = useState(0);

  async function reload() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setViewerId(user?.id || null);
    const nextDetail = await loadExperienceCard(id);
    setDetail(nextDetail);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner = Boolean(detail && viewerId === detail.card.user_id);

  async function runAction(action: Exclude<PendingAction, null>) {
    if (!detail || busy) return;
    setBusy(true);
    setErrorText("");

    try {
      if (action === "unpublish") {
        await unpublishExperienceCard(detail.card.id);
        showToast("经验卡已取消公开");
        await reload();
      } else {
        await deleteExperienceCard(detail.card.id);
        showToast("经验卡已删除，原记录不受影响");
        router.replace("/experience-cards");
      }
    } catch (error) {
      setErrorText(getExperienceCardErrorText(error));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function shareCard() {
    if (!detail?.isPubliclyAvailable) return;
    const url = window.location.href.split("?")[0];

    try {
      if (navigator.share) {
        await navigator.share({ title: detail.card.title, url });
        return;
      }
      await copyCardLink();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("暂时无法分享，请复制浏览器地址");
    }
  }

  async function copyCardLink() {
    if (!detail?.isPubliclyAvailable) return;
    const url = window.location.href.split("?")[0];

    try {
      await navigator.clipboard.writeText(url);
      showToast("公开链接已复制");
    } catch {
      showToast("暂时无法复制，请复制浏览器地址");
    }
  }

  function changeOwnerMode(nextMode: OwnerMode) {
    if (
      ownerMode === "edit" &&
      nextMode !== "edit" &&
      editorDirty &&
      !window.confirm("修改尚未保存，确定返回吗？")
    ) {
      return;
    }

    if (nextMode !== "edit") setEditorDirty(false);
    setOwnerMode(nextMode);
  }

  if (loading) {
    return <main style={pageStyle}>正在读取经验卡...</main>;
  }

  if (!detail) {
    return (
      <main style={pageStyle}>
        <section style={emptyStyle}>
          <h1 style={titleStyle}>经验卡当前不可查看</h1>
          <p style={mutedStyle}>
            它可能尚未公开，或其中一条来源记录已经改为私密、进入回收站或被删除。
          </p>
          <Link href="/discover" style={secondaryLinkStyle}>
            返回发现
          </Link>
        </section>
      </main>
    );
  }

  const startDate = formatExperienceCardDate(detail.records[0]?.record_time);
  const endDate = formatExperienceCardDate(
    detail.records[detail.records.length - 1]?.record_time
  );
  const authorName = detail.author?.username || "用户";
  const systemName =
    detail.archive.system_name?.trim() ||
    detail.archive.species_name_snapshot?.trim() ||
    "";
  const systemNameHref = getSystemNameHref({
    category: detail.archive.category,
    speciesId: detail.archive.species_id,
    systemName,
  });
  const statusLabel = detail.isPubliclyAvailable
    ? "已公开"
    : detail.card.status === "published"
      ? "公开已暂停"
      : "私密草稿";

  return (
    <main style={pageStyle}>
      <header style={topBarStyle}>
        <Link
          href={isOwner ? "/experience-cards" : "/discover"}
          style={backLinkStyle}
        >
          <UiIcon name="arrow-left" size={15} />
          {isOwner ? " 我的经验卡" : " 返回发现"}
        </Link>
      </header>

      <ExperienceCardVideoPanel
        key={`${detail.card.id}-${videoPreviewRevision}`}
        detail={detail}
        readOnly={!isOwner}
        previewOnly={isOwner}
      />

      {isOwner ? (
        <ExperienceCardInteractions
          cardId={detail.card.id}
          cardOwnerId={detail.card.user_id}
          currentUserId={viewerId}
          isPublic={detail.isPubliclyAvailable}
        />
      ) : null}

      <article style={cardShellStyle}>
        <div style={introStyle}>
          <div style={sectionEyebrowStyle}>经验卡信息</div>
          <h1 style={titleStyle}>{detail.card.title}</h1>
          <div style={metaLineStyle}>
            <span>
              {startDate && endDate
                ? startDate === endDate
                  ? startDate
                  : `${startDate}—${endDate}`
                : "暂无日期"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{detail.records.length} 条记录</span>
            <span style={statusBadgeStyle(detail.isPubliclyAvailable)}>
              {statusLabel}
            </span>
          </div>
          <div style={sourceLinksStyle} aria-label="经验卡来源">
            {!isOwner ? (
              <Link
                href={`/user/${detail.card.user_id}`}
                style={sourceLinkStyle}
              >
                <span style={sourceLabelStyle}>用户</span>
                <span style={sourceValueStyle}>{authorName}</span>
                <UiIcon name="arrow-right" size={14} />
              </Link>
            ) : null}
            <Link
              href={`/archive/${detail.archive.id}`}
              style={sourceLinkStyle}
            >
              <span style={sourceLabelStyle}>项目</span>
              <span style={sourceValueStyle}>
                {detail.archive.title || "查看项目"}
              </span>
              <UiIcon name="arrow-right" size={14} />
            </Link>
            {systemNameHref ? (
              <Link href={systemNameHref} style={sourceLinkStyle}>
                <span style={sourceLabelStyle}>系统名</span>
                <span style={sourceValueStyle}>{systemName}</span>
                <UiIcon name="arrow-right" size={14} />
              </Link>
            ) : (
              <span style={sourceMissingStyle}>
                <span style={sourceLabelStyle}>系统名</span>
                <span style={sourceValueStyle}>未填写</span>
              </span>
            )}
          </div>

          {isOwner ? (
            <div style={ownerActionsStyle} aria-label="经验卡操作">
              <button
                type="button"
                onClick={() =>
                  changeOwnerMode(ownerMode === "edit" ? "view" : "edit")
                }
                style={ownerMode === "edit" ? activeButtonStyle : primaryButtonStyle}
              >
                {ownerMode === "edit" ? "返回成品" : "编辑经验卡"}
              </button>
              {detail.isPubliclyAvailable ? (
                <>
                  <button
                    type="button"
                    onClick={() => void shareCard()}
                    style={secondaryButtonStyle}
                  >
                    分享
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyCardLink()}
                    style={secondaryButtonStyle}
                  >
                    复制链接
                  </button>
                </>
              ) : null}
              {detail.card.status === "published" ? (
                <button
                  type="button"
                  onClick={() => setPendingAction("unpublish")}
                  style={quietButtonStyle}
                >
                  取消公开
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>

      {isOwner && !detail.sourceIsComplete ? (
        <section style={warningStyle}>
          来源记录已经变化。这张经验卡已自动停止公开，请重新选择至少3条有效记录后再发布。
        </section>
      ) : null}

      {isOwner &&
      detail.card.status === "published" &&
      !detail.isPubliclyAvailable &&
      detail.sourceIsComplete ? (
        <section style={warningStyle}>
          项目或其中一条来源记录当前不是公开状态，因此游客暂时无法查看这张经验卡。
        </section>
      ) : null}

      {errorText ? <section style={errorStyle}>{errorText}</section> : null}

      {isOwner && ownerMode === "edit" ? (
        <ExperienceCardEditor
          cardId={id}
          embedded
          onDirtyChange={setEditorDirty}
          onVideoSelectionChange={() =>
            setVideoPreviewRevision((current) => current + 1)
          }
          onSaved={async () => {
            setEditorDirty(false);
            setOwnerMode("view");
            await reload();
          }}
        />
      ) : null}

      {!isOwner ? (
        <ExperienceCardInteractions
          cardId={detail.card.id}
          cardOwnerId={detail.card.user_id}
          currentUserId={viewerId}
          isPublic={detail.isPubliclyAvailable}
        />
      ) : null}

      {!isOwner ? (
        <section style={timelineSectionStyle}>
          <div style={timelineHeadingStyle}>
            <strong>经验过程</strong>
            <span>按记录时间排列</span>
          </div>
          <ExperienceCardTimeline
            archive={detail.archive}
            records={detail.records}
          />
        </section>
      ) : null}

      {!isOwner && detail.isPubliclyAvailable ? (
        <footer style={footerStyle}>
          <div style={footerActionsStyle}>
            <button
              type="button"
              onClick={() => void shareCard()}
              style={primaryButtonStyle}
            >
              直接分享
            </button>
            <button
              type="button"
              onClick={() => void copyCardLink()}
              style={secondaryButtonStyle}
            >
              复制链接
            </button>
          </div>
        </footer>
      ) : null}

      {isOwner ? (
        <section style={dangerZoneStyle} aria-label="删除经验卡">
          <button
            type="button"
            onClick={() => setPendingAction("delete")}
            style={deleteButtonStyle}
          >
            删除经验卡
          </button>
          <span style={dangerHintStyle}>原项目、记录和照片不会删除</span>
        </section>
      ) : null}

      <ConfirmDialog
        open={pendingAction === "unpublish"}
        title="取消公开经验卡"
        message="公开链接将立即停止访问。来源记录原有的公开状态不会自动改变，可回到项目中单独调整。"
        confirmText={busy ? "处理中..." : "取消公开"}
        cancelText="返回"
        confirmDisabled={busy}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setPendingAction(null);
        }}
        onConfirm={() => runAction("unpublish")}
      />

      <ConfirmDialog
        open={pendingAction === "delete"}
        title="删除经验卡"
        message="只删除经验卡及其引用关系，原项目、原记录和照片不会删除。"
        confirmText={busy ? "删除中..." : "确认删除"}
        cancelText="取消"
        danger
        confirmDisabled={busy}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setPendingAction(null);
        }}
        onConfirm={() => runAction("delete")}
      />
    </main>
  );
}

function getSystemNameHref({
  category,
  speciesId,
  systemName,
}: {
  category: string | null;
  speciesId: string | null;
  systemName: string;
}) {
  if (!systemName) return null;
  if (category === "plant" && speciesId) return `/plant/${speciesId}`;

  const params = new URLSearchParams();
  params.set("type", "projects");
  if (
    category === "plant" ||
    category === "system" ||
    category === "insect_fish" ||
    category === "other"
  ) {
    params.set("category", category);
  }
  params.set("name", systemName);
  return `/discover/search?${params.toString()}`;
}

const pageStyle: CSSProperties = {
  maxWidth: 880,
  margin: "0 auto",
  padding: "20px 16px 70px",
  color: "#283428",
};

const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
};

const backLinkStyle: CSSProperties = {
  color: "#697667",
  textDecoration: "none",
  fontSize: 14,
};

const cardShellStyle: CSSProperties = {
  border: "1px solid #e1e8de",
  borderRadius: 18,
  background: "#fff",
  padding: "17px clamp(14px, 3vw, 20px)",
  marginBottom: 14,
};

const timelineSectionStyle: CSSProperties = {
  margin: "2px 0 14px",
  padding: "13px 12px 2px",
  border: "1px solid #e3e9df",
  borderRadius: 15,
  background: "#fbfdf9",
};

const timelineHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
  color: "#52624e",
  fontSize: 12,
  flexWrap: "wrap",
};

const introStyle: CSSProperties = {
  padding: 0,
};

const sectionEyebrowStyle: CSSProperties = {
  marginBottom: 6,
  color: "#879283",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  lineHeight: 1.25,
  overflowWrap: "anywhere",
};

const metaLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 10,
  color: "#7b8778",
  fontSize: 12,
  lineHeight: 1.5,
};

function statusBadgeStyle(publiclyAvailable: boolean): CSSProperties {
  return {
    marginLeft: 2,
    padding: "3px 7px",
    borderRadius: 999,
    background: publiclyAvailable ? "#eaf4e7" : "#f1f3ef",
    color: publiclyAvailable ? "#42693d" : "#6e796b",
    fontSize: 11,
    fontWeight: 800,
  };
}

const sourceLinksStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "7px 14px",
  marginTop: 11,
};

const sourceLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minWidth: 0,
  maxWidth: "100%",
  gap: 6,
  color: "#4e634a",
  fontSize: 13,
  lineHeight: 1.5,
  textDecoration: "none",
};

const sourceMissingStyle: CSSProperties = {
  ...sourceLinkStyle,
  color: "#7b8778",
};

const sourceLabelStyle: CSSProperties = {
  flexShrink: 0,
  color: "#899486",
  fontSize: 12,
};

const sourceValueStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 750,
};

const ownerActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 16,
  paddingTop: 14,
  borderTop: "1px solid #edf1eb",
};

const warningStyle: CSSProperties = {
  padding: 14,
  marginBottom: 14,
  borderRadius: 14,
  border: "1px solid #eadfbf",
  background: "#fff9e9",
  color: "#756436",
  fontSize: 14,
  lineHeight: 1.7,
};

const errorStyle: CSSProperties = {
  ...warningStyle,
  borderColor: "#efd8d5",
  background: "#fff8f7",
  color: "#a14d48",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  marginTop: 14,
  padding: 16,
  borderRadius: 18,
  background: "#f3f7f0",
  border: "1px solid #dfe8db",
};

const footerActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const baseButtonStyle: CSSProperties = {
  minHeight: 40,
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid #64885e",
  background: "#64885e",
  color: "#fff",
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid #d3ded0",
  background: "#fff",
  color: "#50604d",
};

const activeButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  borderColor: "#7f9c78",
  background: "#eef5eb",
  color: "#3f613b",
};

const quietButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  border: 0,
  background: "transparent",
  color: "#6f7c6c",
};

const dangerZoneStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 22,
  paddingTop: 16,
  borderTop: "1px solid #ecefea",
};

const deleteButtonStyle: CSSProperties = {
  minHeight: 36,
  padding: "7px 0",
  border: 0,
  background: "transparent",
  color: "#a95651",
  fontSize: 13,
  cursor: "pointer",
};

const dangerHintStyle: CSSProperties = {
  color: "#929b90",
  fontSize: 12,
};

const secondaryLinkStyle: CSSProperties = {
  ...secondaryButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
};

const emptyStyle: CSSProperties = {
  marginTop: 46,
  border: "1px solid #e0e8dd",
  borderRadius: 20,
  background: "#fff",
  padding: 24,
};

const mutedStyle: CSSProperties = {
  color: "#71806e",
  fontSize: 14,
  lineHeight: 1.7,
};
