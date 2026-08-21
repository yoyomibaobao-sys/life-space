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
  type ExperienceCardVideoPanelStatus,
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
  updateExperienceCardDescription,
} from "@/lib/experience-cards";
import { deleteCachedExperienceCardVideo } from "@/lib/experience-card-video-cache";
import type { ExperienceCardDetail } from "@/lib/experience-card-types";
import { formatStorageBytes } from "@/lib/membership";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n/useLanguage";

type PendingAction = "publish" | "unpublish" | "delete" | null;

const initialVideoStatus: ExperienceCardVideoPanelStatus = {
  hasVideo: false,
  generating: false,
  progress: 0,
  loading: true,
  selectedImageCount: 0,
  sizeBytes: null,
};

export default function ExperienceCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { language, t } = useLanguage();
  const [detail, setDetail] = useState<ExperienceCardDetail | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [videoStatus, setVideoStatus] =
    useState<ExperienceCardVideoPanelStatus>(initialVideoStatus);
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
    if (!detail || !isOwner || descriptionEditing) return;
    setDescriptionDraft(detail.card.description || "");
  }, [descriptionEditing, detail, isOwner]);

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
      showToast(t.experience.save_pending_first);
      scrollToEditor();
      return;
    }
    if (detail.card.status === "published" && !detail.isPubliclyAvailable) {
      showToast(t.experience.inspect_source_first);
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
      setErrorText(t.experience.title_length_error);
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
      showToast(t.experience.title_saved_video_hint);
    } catch (error) {
      setErrorText(getExperienceCardErrorText(error, language));
    } finally {
      setTitleSaving(false);
    }
  }

  function beginDescriptionEdit() {
    if (!detail || !isOwner) return;
    setDescriptionDraft(detail.card.description || "");
    setErrorText("");
    setDescriptionEditing(true);
  }

  function cancelDescriptionEdit() {
    setDescriptionDraft(detail?.card.description || "");
    setDescriptionEditing(false);
  }

  function handleDescriptionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      cancelDescriptionEdit();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void saveDescription();
    }
  }

  async function saveDescription() {
    if (!detail || !isOwner || descriptionSaving) return;
    const nextDescription = descriptionDraft.trim();
    if (nextDescription.length > 500) {
      setErrorText(t.experience.description_length_error);
      return;
    }
    if (nextDescription === (detail.card.description || "").trim()) {
      setDescriptionEditing(false);
      return;
    }

    setDescriptionSaving(true);
    setErrorText("");
    try {
      const saved = await updateExperienceCardDescription(
        detail.card.id,
        nextDescription
      );
      if (!saved) throw new Error("experience_card_description_save_failed");
      setDetail((current) =>
        current && current.card.id === detail.card.id
          ? {
              ...current,
              card: {
                ...current.card,
                description: nextDescription || null,
              },
            }
          : current
      );
      setDescriptionEditing(false);
      showToast(nextDescription ? t.experience.description_saved : t.experience.description_cleared);
    } catch (error) {
      setErrorText(getExperienceCardErrorText(error, language));
    } finally {
      setDescriptionSaving(false);
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
        showToast(t.experience.card_published);
        await reload();
      } else if (action === "unpublish") {
        await unpublishExperienceCard(detail.card.id);
        showToast(t.experience.card_private);
        await reload();
      } else {
        await deleteExperienceCard(detail.card.id);
        showToast(t.experience.deleted_toast);
        router.replace("/experience-cards");
      }
    } catch (error) {
      setErrorText(getExperienceCardErrorText(error, language));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }

  function requireSavedEditor() {
    if (!editorDirty) return true;
    showToast(t.experience.save_pending_first);
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

  function shareVideo() {
    if (!requireSavedEditor()) return;
    videoPanelRef.current?.share();
  }

  function saveVideo() {
    if (!requireSavedEditor()) return;
    videoPanelRef.current?.save();
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
      showToast(t.experience.share_failed_browser);
    }
  }

  async function copyCardLink() {
    if (!detail?.isPubliclyAvailable) return;
    const url = getCardShareUrl();

    try {
      await navigator.clipboard.writeText(url);
      showToast(t.experience.public_link_copied);
    } catch {
      showToast(t.experience.copy_failed_browser);
    }
  }

  if (loading) {
    return <main style={pageStyle}>{t.experience.reading_card}</main>;
  }

  if (!detail) {
    return (
      <main style={pageStyle}>
        <section style={emptyStyle}>
          <h1 style={titleStyle}>{t.experience.unavailable_title}</h1>
          <p style={mutedStyle}>
            {t.experience.unavailable_hint}
          </p>
          <Link href="/discover" style={secondaryLinkStyle}>
            {t.experience.back_to_discover}
          </Link>
        </section>
      </main>
    );
  }

  const durationDays = getInclusiveDaySpan(
    detail.records[0]?.record_time,
    detail.records[detail.records.length - 1]?.record_time
  );
  const createdDate = formatExperienceCardDate(detail.card.created_at);
  const recordSummary = [
    durationDays ? `${durationDays}${t.experience.day_suffix}` : null,
    `${detail.records.length}${t.experience.record_suffix}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const authorName = detail.author?.username || t.experience.default_user;
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
      <header className="mobile-app-desktop-only" style={topBarStyle}>
        <Link
          href={isOwner ? "/experience-cards" : "/discover"}
          style={backLinkStyle}
        >
          <UiIcon name="arrow-left" size={15} />
          {isOwner ? ` ${t.experience.back_my_cards}` : ` ${t.nav.home}`}
        </Link>
      </header>

      <section style={heroStyle} aria-label={t.experience.finished_aria}>
        <div style={videoColumnStyle}>
          {isOwner ? (
            <ExperienceCardVideoPanel
              key={detail.card.updated_at}
              ref={videoPanelRef}
              detail={detail}
              previewOnly
              integrated
              hideGenerateAction
              externalControls
              onStatusChange={setVideoStatus}
            />
          ) : (
            <ExperienceCardVideoPanel detail={detail} readOnly integrated />
          )}
        </div>

        <article style={infoColumnStyle}>
          {isOwner && renaming ? (
            <div style={renameEditorStyle}>
              <input
                autoFocus
                aria-label={t.experience.card_name_aria}
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
                  {t.experience.cancel}
                </button>
                <button
                  type="button"
                  disabled={titleSaving}
                  onClick={() => void saveTitle()}
                  style={renameSaveButtonStyle}
                >
                  {titleSaving ? t.experience.saving : t.experience.save_name}
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
                  aria-label={`${t.experience.edit_name_prefix}${detail.card.title}`}
                >
                  <span>{detail.card.title}</span>
                  <UiIcon name="edit" size={17} />
                </button>
              ) : (
                detail.card.title
              )}
            </h1>
          )}

          <div style={overviewGridStyle}>
            <OverviewItem
              label={t.experience.project}
              value={detail.archive.title || t.experience.view_project}
              href={`/archive/${detail.archive.id}`}
            />
            <OverviewItem
              label={t.experience.system_name}
              value={systemName || t.experience.not_filled}
              href={systemNameHref}
            />
            <OverviewItem
              label={t.experience.records}
              value={recordSummary}
            />
            <OverviewItem
              label={t.experience.created}
              value={createdDate || t.experience.time_missing}
            />
            <div style={overviewStatusItemStyle}>
              <span style={overviewLabelStyle}>{t.experience.status}</span>
              {isOwner ? (
                <div
                  style={visibilityToggleStyle}
                  role="group"
                  aria-label={t.experience.visibility_aria}
                >
                  <button
                    type="button"
                    aria-pressed={!isPublished}
                    onClick={() => requestVisibility(false)}
                    style={visibilityChoiceStyle(!isPublished)}
                  >
                    {t.experience.private}
                  </button>
                  <button
                    type="button"
                    aria-pressed={isPublished}
                    onClick={() => requestVisibility(true)}
                    style={visibilityChoiceStyle(isPublished)}
                  >
                    {t.experience.public}
                  </button>
                </div>
              ) : (
                <strong style={overviewValueStyle}>{t.experience.public}</strong>
              )}
            </div>
            {isOwner || detail.card.description ? (
              <div style={overviewDescriptionItemStyle}>
                <span style={overviewLabelStyle}>{t.experience.description}</span>
                {isOwner && descriptionEditing ? (
                  <div style={descriptionEditorStyle}>
                    <textarea
                      autoFocus
                      aria-label={t.experience.description}
                      value={descriptionDraft}
                      maxLength={500}
                      rows={3}
                      placeholder={t.experience.description_placeholder}
                      onChange={(event) =>
                        setDescriptionDraft(event.target.value)
                      }
                      onKeyDown={handleDescriptionKeyDown}
                      style={descriptionTextareaStyle}
                    />
                    <div style={descriptionActionsStyle}>
                      <span style={renameCounterStyle}>
                        {descriptionDraft.trim().length}/500
                      </span>
                      <button
                        type="button"
                        disabled={descriptionSaving}
                        onClick={cancelDescriptionEdit}
                        style={renameCancelButtonStyle}
                      >
                        {t.experience.cancel}
                      </button>
                      <button
                        type="button"
                        disabled={descriptionSaving}
                        onClick={() => void saveDescription()}
                        style={renameSaveButtonStyle}
                      >
                        {descriptionSaving ? t.experience.saving : t.experience.save}
                      </button>
                    </div>
                  </div>
                ) : isOwner ? (
                  <button
                    type="button"
                    onClick={beginDescriptionEdit}
                    style={editableDescriptionButtonStyle}
                    aria-label={t.experience.edit_description_aria}
                  >
                    <span>
                      {detail.card.description?.trim() || t.experience.add_description}
                    </span>
                    <UiIcon name="edit" size={13} />
                  </button>
                ) : (
                  <p style={overviewDescriptionValueStyle}>
                    {detail.card.description}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {!isOwner ? (
            <div style={sourceLinksStyle} aria-label={t.experience.author_aria}>
              <Link
                href={isOwner ? "/archive" : `/user/${detail.card.user_id}`}
                style={sourceLinkStyle}
              >
                <span style={sourceLabelStyle}>{t.experience.user}</span>
                <span style={sourceValueStyle}>{authorName}</span>
                <UiIcon name="arrow-right" size={14} />
              </Link>
            </div>
          ) : null}

          {isOwner ? (
            <div style={ownerActionStackStyle} aria-label={t.experience.card_actions_aria}>
              <div style={actionButtonRowStyle} aria-label={t.experience.mp4_actions_aria}>
                <button
                  type="button"
                  onClick={generateVideo}
                  disabled={videoStatus.loading || videoStatus.generating}
                  style={primaryButtonStyle(
                    videoStatus.loading || videoStatus.generating
                  )}
                >
                  {videoStatus.generating
                    ? t.experience.generating
                    : videoStatus.hasVideo
                      ? t.experience.regenerate_mp4
                      : t.experience.generate_mp4}
                </button>
                {videoStatus.hasVideo && !videoStatus.generating ? (
                  <>
                    <button
                      type="button"
                      onClick={shareVideo}
                      style={secondaryButtonStyle}
                    >
                      <UiIcon name="share" size={15} /> {t.experience.share_mp4}
                    </button>
                    <button
                      type="button"
                      onClick={saveVideo}
                      style={secondaryButtonStyle}
                    >
                      {t.experience.save_mp4}
                    </button>
                  </>
                ) : null}
                {!videoStatus.loading ? (
                  <span style={videoMetaStyle}>
                    {videoStatus.selectedImageCount}{t.experience.image_suffix}
                    {videoStatus.hasVideo && videoStatus.sizeBytes
                      ? ` · ${formatStorageBytes(videoStatus.sizeBytes)}`
                      : ""}
                  </span>
                ) : null}
              </div>

              {videoStatus.generating ? (
                <div style={videoProgressWrapStyle}>
                  <div style={videoProgressTextStyle}>
                    <span>{t.experience.generating_local_video}</span>
                    <strong>{Math.round(videoStatus.progress * 100)}%</strong>
                  </div>
                  <div style={videoProgressTrackStyle}>
                    <div
                      style={{
                        ...videoProgressBarStyle,
                        width: `${Math.max(2, videoStatus.progress * 100)}%`,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => videoPanelRef.current?.stop()}
                    style={stopVideoButtonStyle}
                  >
                    {t.experience.stop_generating}
                  </button>
                </div>
              ) : null}

            </div>
          ) : detail.isPubliclyAvailable ? (
            <div style={readerActionRowStyle} aria-label={t.experience.card_share_aria}>
              <button
                type="button"
                onClick={() => void shareCard()}
                style={secondaryButtonStyle}
              >
                <UiIcon name="share" size={15} /> {t.experience.share}
              </button>
              <button
                type="button"
                onClick={() => void copyCardLink()}
                style={secondaryButtonStyle}
              >
                {t.experience.copy_link}
              </button>
            </div>
          ) : null}
        </article>
      </section>

      {isOwner && !detail.sourceIsComplete ? (
        <section style={warningStyle}>
          {t.experience.source_changed_warning}
        </section>
      ) : null}

      {isOwner &&
      detail.card.status === "published" &&
      !detail.isPubliclyAvailable &&
      detail.sourceIsComplete ? (
        <section style={warningStyle}>
          {t.experience.source_private_warning}
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
            <strong>{t.experience.process}</strong>
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
          aria-label={t.experience.editor_aria}
        >
          <h2 style={editorSectionTitleStyle}>
            <button
              type="button"
              aria-expanded={editorOpen}
              onClick={() => {
                if (
                  editorOpen &&
                  editorDirty &&
                  !window.confirm(t.experience.unsaved_collapse_confirm)
                ) {
                  return;
                }
                setEditorOpen((value) => !value);
                if (editorOpen) setEditorDirty(false);
              }}
              style={editorHeadingButtonStyle}
            >
              {editorOpen ? t.experience.collapse_editor : t.experience.edit_card}
              <UiIcon
                name={editorOpen ? "chevron-up" : "chevron-down"}
                size={14}
              />
            </button>
          </h2>

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

      {isOwner ? (
        <section style={deleteSectionStyle} aria-label={t.experience.delete_aria}>
          <button
            type="button"
            onClick={() => {
              if (!requireSavedEditor()) return;
              setPendingAction("delete");
            }}
            style={deleteExperienceCardButtonStyle}
          >
            <UiIcon name="trash" size={14} /> {t.experience.delete_title}
          </button>
        </section>
      ) : null}

      <ConfirmDialog
        open={pendingAction === "publish"}
        title={t.experience.publish_title}
        message={`${t.experience.publish_message_prefix}${detail.records.length}${t.experience.publish_message_suffix}`}
        confirmText={busy ? t.experience.processing : t.experience.confirm_publish}
        cancelText={t.experience.cancel}
        confirmDisabled={busy}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setPendingAction(null);
        }}
        onConfirm={() => runAction("publish")}
      />

      <ConfirmDialog
        open={pendingAction === "unpublish"}
        title={t.experience.make_private_title}
        message={t.experience.make_private_message}
        confirmText={busy ? t.experience.processing : t.experience.make_private}
        cancelText={t.experience.cancel}
        confirmDisabled={busy}
        cancelDisabled={busy}
        onClose={() => {
          if (!busy) setPendingAction(null);
        }}
        onConfirm={() => runAction("unpublish")}
      />

      <ConfirmDialog
        open={pendingAction === "delete"}
        title={t.experience.delete_title}
        message={t.experience.delete_message}
        confirmText={busy ? t.experience.deleting : t.experience.confirm_delete}
        cancelText={t.experience.cancel}
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

function OverviewItem({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string | null;
}) {
  const content = (
    <>
      <span style={overviewLabelStyle}>{label}</span>
      <strong style={overviewValueStyle}>{value}</strong>
    </>
  );

  return href ? (
    <Link href={href} style={{ ...overviewItemStyle, ...overviewLinkItemStyle }}>
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

const overviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 18,
  rowGap: 8,
  marginTop: 19,
};

const overviewItemStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gridTemplateColumns: "56px minmax(0, 1fr)",
  alignItems: "baseline",
  gap: 8,
  padding: "2px 0",
};

const overviewLinkItemStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const overviewLabelStyle: CSSProperties = {
  color: "#879283",
  fontSize: 12,
  lineHeight: 1.45,
  whiteSpace: "nowrap",
};

const overviewValueStyle: CSSProperties = {
  minWidth: 0,
  color: "#42513f",
  fontSize: 13,
  lineHeight: 1.45,
  fontWeight: 750,
  overflowWrap: "anywhere",
};

const overviewDescriptionItemStyle: CSSProperties = {
  ...overviewItemStyle,
  gridColumn: "1 / -1",
  alignItems: "start",
  paddingTop: 5,
};

const overviewStatusItemStyle: CSSProperties = {
  ...overviewItemStyle,
  alignItems: "center",
};

const overviewDescriptionValueStyle: CSSProperties = {
  ...overviewValueStyle,
  margin: 0,
  fontWeight: 600,
  whiteSpace: "pre-wrap",
};

const editableDescriptionButtonStyle: CSSProperties = {
  minWidth: 0,
  display: "inline-flex",
  alignItems: "flex-start",
  justifySelf: "start",
  gap: 6,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "#42513f",
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.55,
  fontWeight: 600,
  textAlign: "left",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  cursor: "pointer",
};

const descriptionEditorStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 7,
};

const descriptionTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 82,
  boxSizing: "border-box",
  resize: "vertical",
  padding: "9px 10px",
  border: "1px solid #8ea588",
  borderRadius: 10,
  background: "#fff",
  color: "#344331",
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.6,
  outline: "none",
};

const descriptionActionsStyle: CSSProperties = {
  ...renameActionsStyle,
  minWidth: 0,
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

const ownerActionStackStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 15,
  paddingTop: 13,
  borderTop: "1px solid #edf1eb",
};

const videoMetaStyle: CSSProperties = {
  color: "#8a9587",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.4,
  whiteSpace: "nowrap",
};

const actionButtonRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 7,
};

const readerActionRowStyle: CSSProperties = {
  ...actionButtonRowStyle,
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
  minHeight: 36,
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

function primaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    ...baseButtonStyle,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #64885e",
    background: "#64885e",
    color: "#fff",
    opacity: disabled ? 0.58 : 1,
    cursor: disabled ? "wait" : "pointer",
  };
}

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
  minHeight: 30,
  display: "inline-flex",
  alignItems: "stretch",
  padding: 2,
  border: "1px solid #d3ded0",
  borderRadius: 999,
  background: "#f5f7f3",
};

function visibilityChoiceStyle(active: boolean): CSSProperties {
  return {
    minWidth: 46,
    padding: "4px 9px",
    border: 0,
    borderRadius: 999,
    background: active ? "#64885e" : "transparent",
    color: active ? "#fff" : "#677363",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}

const deleteSectionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 14,
  paddingTop: 14,
  borderTop: "1px solid #e6ebe3",
};

const deleteExperienceCardButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #ead3d0",
  background: "#fff",
  color: "#a4514d",
};

const videoProgressWrapStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxWidth: 430,
  padding: 10,
  border: "1px solid #dce7d8",
  borderRadius: 13,
  background: "#f8fbf6",
};

const videoProgressTextStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "#4c6048",
  fontSize: 12,
};

const videoProgressTrackStyle: CSSProperties = {
  height: 8,
  overflow: "hidden",
  borderRadius: 999,
  background: "#e7eee3",
};

const videoProgressBarStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "#64885e",
  transition: "width 120ms linear",
};

const stopVideoButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  minHeight: 34,
  justifySelf: "start",
  padding: "6px 11px",
  border: "1px solid #ecd1ce",
  background: "#fff",
  color: "#a14d48",
};

const editorSectionStyle: CSSProperties = {
  scrollMarginTop: 18,
  marginTop: 18,
  padding: "15px clamp(13px, 2.5vw, 18px)",
  border: "1px solid #dfe7dc",
  borderRadius: 18,
  background: "#f8fbf6",
};

const editorSectionTitleStyle: CSSProperties = {
  margin: 0,
};

const editorHeadingButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "3px 0",
  border: 0,
  background: "transparent",
  color: "#354432",
  fontSize: 18,
  lineHeight: 1.35,
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
