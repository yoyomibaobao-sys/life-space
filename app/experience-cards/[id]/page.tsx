"use client";

import Link from "next/link";
import {
  use,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExperienceCardEditWorkspace from "@/components/experience-card/ExperienceCardEditWorkspace";
import ExperienceCardVideoPanel, {
  type ExperienceCardVideoPanelHandle,
} from "@/components/experience-card/ExperienceCardVideoPanel";
import ExperienceCardTimeline from "@/components/experience-card/ExperienceCardTimeline";
import ExperienceCardInteractions from "@/components/experience-card/ExperienceCardInteractions";
import UiIcon from "@/components/ui/UiIcon";
import { showToast } from "@/components/Toast";
import { getInclusiveDaySpan } from "@/lib/date-time";
import {
  deleteExperienceCard,
  formatExperienceCardDate,
  getExperienceCardErrorText,
  loadExperienceCard,
  publishExperienceCard,
  saveExperienceCard,
  unpublishExperienceCard,
} from "@/lib/experience-cards";
import { deleteCachedExperienceCardVideo } from "@/lib/experience-card-video-cache";
import type {
  ExperienceCardDetail,
  ExperienceCardMedia,
} from "@/lib/experience-card-types";
import { supabase } from "@/lib/supabase";

type PendingAction = "publish" | "unpublish" | "delete" | null;

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
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const editorRef = useRef<HTMLElement | null>(null);
  const videoPanelRef = useRef<ExperienceCardVideoPanelHandle | null>(null);

  async function reload(showLoading = true) {
    if (showLoading) setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setViewerId(user?.id || null);
    const nextDetail = await loadExperienceCard(id);
    setDetail(nextDetail);
    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner = Boolean(detail && viewerId === detail.card.user_id);

  useEffect(() => {
    if (!detail || !isOwner) return;
    if (!renaming) setTitleDraft(detail.card.title);
  }, [detail, isOwner, renaming]);

  useEffect(() => {
    if (!detail || !isOwner || window.location.hash !== "#experience-card-editor") {
      return;
    }
    setEditorOpen(true);
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [detail, isOwner]);

  function scrollToEditor() {
    setRenaming(false);
    setEditorOpen(true);
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function beginRename() {
    if (!detail || !isOwner) return;
    if (editorDirty) {
      showToast("请先保存下面尚未完成的内容修改");
      scrollToEditor();
      return;
    }
    if (detail.card.status === "published" && !detail.isPubliclyAvailable) {
      showToast("请先在下方检查来源记录，再修改名称");
      scrollToEditor();
      return;
    }
    setTitleDraft(detail.card.title);
    setErrorText("");
    setRenaming(true);
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveTitle();
    } else if (event.key === "Escape") {
      setTitleDraft(detail?.card.title || "");
      setRenaming(false);
    }
  }

  async function saveTitle() {
    if (!detail || !isOwner || titleSaving) return;
    const nextTitle = titleDraft.trim();
    if (nextTitle.length < 1 || nextTitle.length > 120) {
      setErrorText("名称需为1～120个字符。");
      return;
    }
    if (nextTitle === detail.card.title.trim()) {
      setRenaming(false);
      return;
    }

    setTitleSaving(true);
    setErrorText("");
    try {
      await saveExperienceCard({
        cardId: detail.card.id,
        archiveId: detail.archive.id,
        title: nextTitle,
        recordIds: detail.records.map((record) => record.id),
        coverMediaId: detail.card.cover_media_id,
      });
      await deleteCachedExperienceCardVideo(detail.card.id).catch(
        () => undefined
      );
      setRenaming(false);
      setEditorRevision((value) => value + 1);
      await reload(false);
      showToast("经验卡名称已修改；原MP4可按新名称重新生成");
    } catch (error) {
      setErrorText(getExperienceCardErrorText(error));
    } finally {
      setTitleSaving(false);
    }
  }

  async function handleEditorSaved() {
    setEditorDirty(false);
    await reload(false);
  }

  async function runAction(action: Exclude<PendingAction, null>) {
    if (!detail || busy) return;
    setBusy(true);
    setErrorText("");

    try {
      if (action === "publish") {
        await publishExperienceCard(detail.card.id);
        showToast("经验卡已公开");
        await reload();
      } else if (action === "unpublish") {
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

  function requireSavedEditor() {
    if (!editorDirty) return true;
    showToast("请先保存下面尚未完成的内容修改");
    scrollToEditor();
    return false;
  }

  function requestVisibility(nextPublished: boolean) {
    if (!detail || !isOwner || !requireSavedEditor()) return;
    const isPublished = detail.card.status === "published";
    if (nextPublished === isPublished) return;
    setPendingAction(nextPublished ? "publish" : "unpublish");
  }

  function generateVideo() {
    if (!requireSavedEditor()) return;
    videoPanelRef.current?.generate();
  }

  async function shareCard() {
    if (!detail?.isPubliclyAvailable) return;
    const url = getCardShareUrl();

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
    const url = getCardShareUrl();

    try {
      await navigator.clipboard.writeText(url);
      showToast("公开链接已复制");
    } catch {
      showToast("暂时无法复制，请复制浏览器地址");
    }
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
  const durationDays = getInclusiveDaySpan(
    detail.records[0]?.record_time,
    detail.records[detail.records.length - 1]?.record_time
  );
  const imageCount = detail.records.reduce(
    (count, record) =>
      count + record.media.filter(isExperienceCardImage).length,
    0
  );
  const createdDate = formatExperienceCardDate(detail.card.created_at);
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
  const isPublished = detail.card.status === "published";

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

      <section style={heroStyle} aria-label="经验卡成品与概况">
        <div style={videoColumnStyle}>
          <div style={sectionEyebrowStyle}>MP4</div>
          {isOwner ? (
            <ExperienceCardVideoPanel
              key={detail.card.updated_at}
              ref={videoPanelRef}
              detail={detail}
              previewOnly
              integrated
              hideGenerateAction
            />
          ) : (
            <ExperienceCardVideoPanel detail={detail} readOnly integrated />
          )}
        </div>

        <article style={infoColumnStyle}>
          <div style={sectionEyebrowStyle}>经验卡</div>
          {isOwner && renaming ? (
            <div style={renameEditorStyle}>
              <input
                autoFocus
                aria-label="经验卡名称"
                value={titleDraft}
                maxLength={120}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={handleTitleKeyDown}
                style={renameInputStyle}
              />
              <div style={renameActionsStyle}>
                <span style={renameCounterStyle}>
                  {titleDraft.trim().length}/120
                </span>
                <button
                  type="button"
                  disabled={titleSaving}
                  onClick={() => {
                    setTitleDraft(detail.card.title);
                    setRenaming(false);
                  }}
                  style={renameCancelButtonStyle}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={titleSaving}
                  onClick={() => void saveTitle()}
                  style={renameSaveButtonStyle}
                >
                  {titleSaving ? "保存中..." : "保存名称"}
                </button>
              </div>
            </div>
          ) : (
            <h1 style={titleStyle}>
              {isOwner ? (
                <button
                  type="button"
                  onClick={beginRename}
                  style={editableTitleButtonStyle}
                  aria-label={`修改经验卡名称：${detail.card.title}`}
                >
                  <span>{detail.card.title}</span>
                  <UiIcon name="edit" size={17} />
                </button>
              ) : (
                detail.card.title
              )}
            </h1>
          )}

          <div style={overviewHeadingStyle}>经验卡概况</div>
          <div style={overviewGridStyle}>
            <OverviewItem
              icon="project"
              label="项目"
              value={detail.archive.title || "查看项目"}
              href={`/archive/${detail.archive.id}`}
            />
            <OverviewItem
              icon="sprout"
              label="系统名"
              value={systemName || "未填写"}
              href={systemNameHref}
            />
            <OverviewItem
              icon="duration"
              label="时长"
              value={durationDays ? `${durationDays}天` : "暂无"}
            />
            <OverviewItem
              icon="record"
              label="记录数"
              value={`${detail.records.length}条`}
            />
            <OverviewItem icon="image" label="图片数" value={`${imageCount}张`} />
            <OverviewItem
              icon="calendar"
              label="创建时间"
              value={createdDate || "暂无"}
            />
          </div>

          <div style={periodStyle}>
            {startDate && endDate
              ? startDate === endDate
                ? startDate
                : `${startDate}—${endDate}`
              : "记录日期暂缺"}
          </div>

          {!isOwner ? (
            <div style={sourceLinksStyle} aria-label="经验卡作者">
              <Link
                href={`/user/${detail.card.user_id}`}
                style={sourceLinkStyle}
              >
                <span style={sourceLabelStyle}>用户</span>
                <span style={sourceValueStyle}>{authorName}</span>
                <UiIcon name="arrow-right" size={14} />
              </Link>
            </div>
          ) : null}

          <div style={infoActionRowStyle} aria-label="经验卡操作">
            {isOwner ? (
              <button
                type="button"
                onClick={generateVideo}
                style={primaryButtonStyle}
              >
                生成竖屏MP4
              </button>
            ) : null}
            {detail.isPubliclyAvailable ? (
              <>
                <button
                  type="button"
                  onClick={() => void shareCard()}
                  style={secondaryButtonStyle}
                >
                  <UiIcon name="share" size={15} /> 分享
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
            {isOwner ? (
              <div
                style={visibilityToggleStyle}
                role="group"
                aria-label="经验卡公开方式"
              >
                <button
                  type="button"
                  aria-pressed={!isPublished}
                  onClick={() => requestVisibility(false)}
                  style={visibilityChoiceStyle(!isPublished)}
                >
                  默认
                </button>
                <button
                  type="button"
                  aria-pressed={isPublished}
                  onClick={() => requestVisibility(true)}
                  style={visibilityChoiceStyle(isPublished)}
                >
                  公开
                </button>
              </div>
            ) : null}
            {isOwner ? (
              <button
                type="button"
                onClick={() => {
                  if (!requireSavedEditor()) return;
                  setPendingAction("delete");
                }}
                style={compactDeleteButtonStyle}
              >
                <UiIcon name="trash" size={14} /> 删除经验卡
              </button>
            ) : null}
          </div>
        </article>
      </section>

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

      <ExperienceCardInteractions
        cardId={detail.card.id}
        cardOwnerId={detail.card.user_id}
        currentUserId={viewerId}
        isPublic={detail.isPubliclyAvailable}
      />

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

      {isOwner ? (
        <section
          id="experience-card-editor"
          ref={editorRef}
          style={editorSectionStyle}
          aria-label="经验卡内容编辑"
        >
          <div style={editorSectionHeadingStyle}>
            <h2 style={editorSectionTitleStyle}>记录与图片</h2>
            <button
              type="button"
              aria-expanded={editorOpen}
              onClick={() => {
                if (
                  editorOpen &&
                  editorDirty &&
                  !window.confirm("修改尚未保存，确定收起吗？")
                ) {
                  return;
                }
                setEditorOpen((value) => !value);
                if (editorOpen) setEditorDirty(false);
              }}
              style={editorToggleButtonStyle}
            >
              {editorOpen ? "收起编辑" : "打开编辑"}
              <UiIcon
                name={editorOpen ? "chevron-up" : "chevron-down"}
                size={14}
              />
            </button>
          </div>

          {editorOpen ? (
            <ExperienceCardEditWorkspace
              key={`${detail.card.id}-${detail.card.status}-${detail.card.updated_at}-${editorRevision}`}
              cardId={detail.card.id}
              onDirtyChange={setEditorDirty}
              onCardSaved={handleEditorSaved}
            />
          ) : null}
        </section>
      ) : null}

      <ConfirmDialog
        open={pendingAction === "publish"}
        title="公开经验卡"
        message={`公开后，所选${detail.records.length}条来源记录及其照片可通过经验卡链接查看；项目中其他记录保持原来的可见性。`}
        confirmText={busy ? "处理中..." : "确认公开"}
        cancelText="取消"
        confirmDisabled={busy}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setPendingAction(null);
        }}
        onConfirm={() => runAction("publish")}
      />

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

function getCardShareUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isExperienceCardImage(media: ExperienceCardMedia) {
  const mimeType = String(media.mime_type || "").toLowerCase();
  const type = String(media.type || "").toLowerCase();
  if (mimeType) return mimeType.startsWith("image/");
  if (type) return type === "image" || type === "photo";
  return true;
}

function OverviewItem({
  icon,
  label,
  value,
  href,
}: {
  icon: "project" | "sprout" | "duration" | "record" | "image" | "calendar";
  label: string;
  value: string;
  href?: string | null;
}) {
  const content = (
    <>
      <span style={overviewIconStyle}>
        <UiIcon name={icon} size={16} />
      </span>
      <span style={overviewTextStyle}>
        <span style={overviewLabelStyle}>{label}</span>
        <strong style={overviewValueStyle}>{value}</strong>
      </span>
      {href ? <UiIcon name="arrow-right" size={13} /> : null}
    </>
  );

  return href ? (
    <Link href={href} style={overviewLinkItemStyle}>
      {content}
    </Link>
  ) : (
    <div style={overviewItemStyle}>{content}</div>
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
  maxWidth: 980,
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

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  alignItems: "start",
  gap: "clamp(20px, 4vw, 38px)",
  border: "1px solid #e1e8de",
  borderRadius: 22,
  background: "#fff",
  padding: "clamp(15px, 3vw, 24px)",
  marginBottom: 14,
  boxShadow: "0 12px 34px rgba(55, 75, 52, 0.05)",
};

const videoColumnStyle: CSSProperties = {
  minWidth: 0,
};

const infoColumnStyle: CSSProperties = {
  minWidth: 0,
  paddingTop: 2,
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

const sectionEyebrowStyle: CSSProperties = {
  marginBottom: 6,
  color: "#879283",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "clamp(24px, 4vw, 31px)",
  lineHeight: 1.25,
  overflowWrap: "anywhere",
};

const editableTitleButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  maxWidth: "100%",
  gap: 9,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "#283428",
  font: "inherit",
  fontWeight: "inherit",
  lineHeight: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const renameEditorStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const renameInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 48,
  padding: "8px 11px",
  border: "1px solid #8ea588",
  borderRadius: 11,
  background: "#fff",
  color: "#283428",
  fontSize: "clamp(21px, 3vw, 27px)",
  fontWeight: 800,
  lineHeight: 1.3,
  outline: "none",
};

const renameActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 7,
};

const renameCounterStyle: CSSProperties = {
  marginRight: "auto",
  color: "#8a9587",
  fontSize: 11,
};

const renameCancelButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: "5px 10px",
  border: "1px solid #d6dfd2",
  borderRadius: 999,
  background: "#fff",
  color: "#60705d",
  fontSize: 12,
  fontWeight: 750,
  cursor: "pointer",
};

const renameSaveButtonStyle: CSSProperties = {
  ...renameCancelButtonStyle,
  borderColor: "#64885e",
  background: "#64885e",
  color: "#fff",
};

const overviewHeadingStyle: CSSProperties = {
  marginTop: 22,
  marginBottom: 9,
  color: "#687565",
  fontSize: 12,
  fontWeight: 800,
};

const overviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const overviewItemStyle: CSSProperties = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "5px 2px",
};

const overviewLinkItemStyle: CSSProperties = {
  ...overviewItemStyle,
  color: "inherit",
  textDecoration: "none",
};

const overviewIconStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  flex: "0 0 auto",
  color: "#5f7a59",
};

const overviewTextStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 1,
};

const overviewLabelStyle: CSSProperties = {
  color: "#879283",
  fontSize: 10,
};

const overviewValueStyle: CSSProperties = {
  color: "#42513f",
  fontSize: 13,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const periodStyle: CSSProperties = {
  marginTop: 9,
  color: "#849080",
  fontSize: 12,
  lineHeight: 1.5,
};

const sourceLinksStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 15,
  paddingTop: 13,
  borderTop: "1px solid #edf1eb",
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

const infoActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 7,
  marginTop: 15,
  paddingTop: 13,
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
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #64885e",
  background: "#64885e",
  color: "#fff",
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #d3ded0",
  background: "#fff",
  color: "#50604d",
};

const visibilityToggleStyle: CSSProperties = {
  minHeight: 40,
  display: "inline-flex",
  alignItems: "stretch",
  padding: 2,
  border: "1px solid #d3ded0",
  borderRadius: 999,
  background: "#f5f7f3",
};

function visibilityChoiceStyle(active: boolean): CSSProperties {
  return {
    minWidth: 54,
    padding: "6px 11px",
    border: 0,
    borderRadius: 999,
    background: active ? "#64885e" : "transparent",
    color: active ? "#fff" : "#677363",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}

const compactDeleteButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #ead3d0",
  background: "#fff",
  color: "#a4514d",
};

const editorSectionStyle: CSSProperties = {
  scrollMarginTop: 18,
  marginTop: 18,
  padding: "15px clamp(13px, 2.5vw, 18px)",
  border: "1px solid #dfe7dc",
  borderRadius: 18,
  background: "#f8fbf6",
};

const editorSectionHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const editorSectionTitleStyle: CSSProperties = {
  margin: "3px 0 0",
  color: "#354432",
  fontSize: 18,
  lineHeight: 1.35,
};

const editorToggleButtonStyle: CSSProperties = {
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 11px",
  border: "1px solid #789673",
  borderRadius: 999,
  background: "#fff",
  color: "#456240",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
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
