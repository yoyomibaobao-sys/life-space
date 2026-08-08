"use client";

import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";
import ExperienceCardVideoPanel from "@/components/experience-card/ExperienceCardVideoPanel";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import {
  formatExperienceCardDate,
  getExperienceCardErrorText,
  loadExperienceCard,
  publishExperienceCard,
  saveExperienceCard,
} from "@/lib/experience-cards";
import type {
  ExperienceCardArchive,
  ExperienceCardDetail,
  ExperienceCardMedia,
  ExperienceCardSourceRecord,
} from "@/lib/experience-card-types";
import { attachMediaDisplayUrls } from "@/lib/media-urls";
import {
  canCreateMembershipContent,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import { supabase } from "@/lib/supabase";

const RECORD_SELECT = [
  "id",
  "archive_id",
  "user_id",
  "note",
  "record_time",
  "created_at",
  "visibility",
  "status_tag",
  "record_tags(tag, tag_type, source, is_active)",
].join(", ");

const MEDIA_SELECT = [
  "id",
  "record_id",
  "user_id",
  "type",
  "url",
  "storage_path",
  "thumb_url",
  "thumb_path",
  "sort_order",
  "created_at",
  "captured_at",
  "mime_type",
  "width",
  "height",
].join(", ");

function isSelectableImage(media: ExperienceCardMedia) {
  const mimeType = String(media.mime_type || "").toLowerCase();
  const type = String(media.type || "").toLowerCase();
  if (mimeType) return mimeType.startsWith("image/");
  if (type) return type === "image" || type === "photo";
  return true;
}

function createEditorSnapshot({
  title,
  recordIds,
  coverMediaId,
}: {
  title: string;
  recordIds: string[];
  coverMediaId: string | null;
}) {
  return JSON.stringify({
    title: title.trim(),
    recordIds: [...recordIds].sort(),
    coverMediaId,
  });
}

export default function ExperienceCardEditor({
  cardId,
  embedded = false,
  onDirtyChange,
  onVideoSelectionChange,
  onSaved,
}: {
  cardId?: string;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onVideoSelectionChange?: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedArchiveId = searchParams.get("archiveId");

  const [archive, setArchive] = useState<ExperienceCardArchive | null>(null);
  const [existingDetail, setExistingDetail] =
    useState<ExperienceCardDetail | null>(null);
  const [records, setRecords] = useState<ExperienceCardSourceRecord[]>([]);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [coverMediaId, setCoverMediaId] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [wasPublished, setWasPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setErrorText("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: membershipData } = await supabase.rpc("get_my_membership");
      const nextMembership = normalizeMembershipRpcResult(membershipData);
      setMembership(nextMembership);

      let archiveId = requestedArchiveId;
      let existingRecordIds: string[] = [];
      let existingCoverMediaId: string | null = null;
      let existingTitle = "";

      if (cardId) {
        const detail = await loadExperienceCard(cardId);
        if (!detail || detail.card.user_id !== user.id) {
          setErrorText("经验卡不存在，或者你没有编辑权限。");
          setLoading(false);
          return;
        }

        archiveId = detail.card.archive_id;
        setExistingDetail(detail);
        existingRecordIds = detail.records.map((record) => record.id);
        existingCoverMediaId = detail.card.cover_media_id;
        existingTitle = detail.card.title;
        setTitle(existingTitle);
        setWasPublished(detail.card.status === "published");
      }

      if (!archiveId) {
        setErrorText("请先从一个云端项目中选择“生成经验卡”。");
        setLoading(false);
        return;
      }

      const { data: archiveData } = await supabase
        .from("archives")
        .select(
          "id, user_id, title, category, species_id, system_name, species_name_snapshot, is_public"
        )
        .eq("id", archiveId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!archiveData) {
        setErrorText("来源项目不存在，或者已经进入回收站。");
        setLoading(false);
        return;
      }

      const { data: recordData } = await supabase
        .from("records")
        .select(RECORD_SELECT)
        .eq("archive_id", archiveId)
        .eq("user_id", user.id)
        .is("trashed_at", null)
        .order("record_time", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      const baseRecords = (recordData || []) as unknown as Omit<
        ExperienceCardSourceRecord,
        "media"
      >[];
      const recordIds = baseRecords.map((record) => record.id);
      const mediaByRecord = new Map<string, ExperienceCardMedia[]>();

      if (recordIds.length > 0) {
        const { data: mediaData } = await supabase
          .from("media")
          .select(MEDIA_SELECT)
          .in("record_id", recordIds)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        const mediaRows = await attachMediaDisplayUrls(
          supabase,
          (mediaData || []) as unknown as ExperienceCardMedia[]
        );

        mediaRows.forEach((media) => {
          const list = mediaByRecord.get(media.record_id) || [];
          list.push(media);
          mediaByRecord.set(media.record_id, list);
        });
      }

      const nextRecords = baseRecords.map((record) => ({
        ...record,
        media: mediaByRecord.get(record.id) || [],
      }));

      setArchive(archiveData as ExperienceCardArchive);
      setRecords(nextRecords);
      setSelectedRecordIds(existingRecordIds);
      setCoverMediaId(existingCoverMediaId);
      if (!cardId) {
        setTitle(`${archiveData.title}的经验`);
      } else {
        setInitialSnapshot(
          createEditorSnapshot({
            title: existingTitle,
            recordIds: existingRecordIds,
            coverMediaId: existingCoverMediaId,
          })
        );
      }
      setLoading(false);
    }

    void init();
  }, [cardId, requestedArchiveId, router]);

  const imageOptions = useMemo(
    () =>
      records.flatMap((record) =>
        record.media
          .filter(isSelectableImage)
          .filter((media) =>
            Boolean(media.display_url || media.display_thumb_url)
          )
      ),
    [records]
  );
  const selectedRecordIdSet = useMemo(
    () => new Set(selectedRecordIds),
    [selectedRecordIds]
  );
  const selectedRecords = records.filter((record) =>
    selectedRecordIdSet.has(record.id)
  );
  const availableRecords = records.filter(
    (record) => !selectedRecordIdSet.has(record.id)
  );
  const coverOptions = imageOptions.filter((media) =>
    selectedRecordIdSet.has(media.record_id)
  );
  const effectiveCoverMediaId =
    coverOptions.some((media) => media.id === coverMediaId)
      ? coverMediaId
      : null;
  const currentSnapshot = createEditorSnapshot({
    title,
    recordIds: selectedRecords.map((record) => record.id),
    coverMediaId: effectiveCoverMediaId,
  });
  const hasChanges = !cardId || currentSnapshot !== initialSnapshot;
  const canPersist =
    Boolean(archive) &&
    canCreateMembershipContent(membership) &&
    title.trim().length >= 1 &&
    title.trim().length <= 120 &&
    selectedRecords.length >= 3 &&
    !saving;
  const canSave = canPersist && hasChanges;
  const canPublish = canPersist && (!wasPublished || hasChanges);
  const videoDetail = useMemo<ExperienceCardDetail | null>(() => {
    if (!cardId || !existingDetail || !archive || selectedRecords.length === 0) {
      return null;
    }

    return {
      ...existingDetail,
      card: {
        ...existingDetail.card,
        title: title.trim() || existingDetail.card.title,
        cover_media_id: effectiveCoverMediaId,
        source_record_count: selectedRecords.length,
      },
      archive: {
        ...existingDetail.archive,
        ...archive,
      },
      records: selectedRecords,
      cover:
        coverOptions.find((media) => media.id === effectiveCoverMediaId) ||
        null,
    };
  }, [
    archive,
    cardId,
    coverOptions,
    effectiveCoverMediaId,
    existingDetail,
    selectedRecords,
    title,
  ]);

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  function toggleRecord(recordId: string) {
    setSelectedRecordIds((current) => {
      if (current.includes(recordId)) {
        if (
          coverMediaId &&
          records
            .find((record) => record.id === recordId)
            ?.media.some((media) => media.id === coverMediaId)
        ) {
          setCoverMediaId(null);
        }
        return current.filter((id) => id !== recordId);
      }
      return [...current, recordId];
    });
  }

  async function persist(mode: "draft" | "preview" | "publish") {
    if (!archive || !canPersist) return;
    if (mode !== "publish" && !hasChanges) return;
    if (mode === "publish" && !canPublish) return;
    setSaving(true);
    setErrorText("");

    try {
      const savedCardId =
        cardId && !hasChanges
          ? cardId
          : await saveExperienceCard({
              cardId: cardId || null,
              archiveId: archive.id,
              title,
              recordIds: selectedRecords.map((record) => record.id),
              coverMediaId: effectiveCoverMediaId,
            });

      if (mode === "publish") {
        await publishExperienceCard(savedCardId);
        showToast("经验卡已公开");
      } else {
        showToast(
          mode === "preview"
            ? "草稿已保存"
            : cardId
              ? "经验卡修改已保存"
              : "经验卡草稿已保存"
        );
      }

      if (onSaved) {
        await onSaved();
      } else {
        router.push(
          `/experience-cards/${savedCardId}${mode === "preview" ? "?preview=1" : ""}`
        );
      }
    } catch (error) {
      setErrorText(getExperienceCardErrorText(error));
    } finally {
      setSaving(false);
      setPublishConfirmOpen(false);
    }
  }

  if (loading) {
    return embedded ? (
      <section style={messageCardStyle}>正在读取可编辑内容...</section>
    ) : (
      <main style={pageStyle}>正在读取项目记录...</main>
    );
  }

  if (errorText && !archive) {
    const message = (
      <section style={messageCardStyle}>
        <h1 style={titleStyle}>无法编辑经验卡</h1>
        <p style={mutedStyle}>{errorText}</p>
        <Link href="/experience-cards" style={secondaryLinkStyle}>
          返回我的经验卡
        </Link>
      </section>
    );
    return embedded ? message : (
      <main style={pageStyle}>
        {message}
      </main>
    );
  }

  if (!canCreateMembershipContent(membership)) {
    const membershipMessage = (
      <section style={messageCardStyle}>
        <h1 style={titleStyle}>需要开通云会员</h1>
        <p style={mutedStyle}>
          经验卡引用云端项目与记录，只有云会员可以创建、修改和发布。
        </p>
        <div style={actionRowStyle}>
          <Link href="/membership" style={primaryLinkStyle}>
            了解云会员
          </Link>
          {!embedded ? (
            <Link href="/experience-cards" style={secondaryLinkStyle}>
              返回
            </Link>
          ) : null}
        </div>
      </section>
    );
    return embedded ? membershipMessage : (
      <main style={pageStyle}>
        {membershipMessage}
      </main>
    );
  }

  const editorContent = (
    <>
      <section style={panelStyle}>
        <div style={editorHeadingStyle}>
          <div>
            <div style={eyebrowStyle}>编辑经验卡</div>
            <h2 style={sectionTitleStyle}>内容与图片</h2>
          </div>
          {archive ? (
            <Link href={`/archive/${archive.id}`} style={sourceProjectLinkStyle}>
              来源项目：{archive.title}
            </Link>
          ) : null}
        </div>

        {wasPublished && hasChanges ? (
          <p style={inlineNoticeStyle}>保存后会同步更新当前公开内容。</p>
        ) : null}

        <div style={editorSectionStyle}>
          <label style={labelStyle} htmlFor="experience-card-title">
            标题
          </label>
          <input
            id="experience-card-title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            style={inputStyle}
          />
          <div style={counterStyle}>{title.trim().length} / 120</div>
        </div>

        <div style={editorSectionStyle}>
          <div style={sectionHeadingRowStyle}>
            <div>
              <div style={eyebrowStyle}>记录</div>
              <h3 style={compactSectionTitleStyle}>至少选择3条</h3>
            </div>
            <span style={countPillStyle(selectedRecords.length >= 3)}>
              已选 {selectedRecords.length} 条
            </span>
          </div>

          {records.length === 0 ? (
            <p style={errorStyle}>当前项目还没有可选择的记录。</p>
          ) : (
            <>
              <div style={recordGroupHeadingStyle}>
                <strong>已选记录</strong>
                <span>点击“移除”可取消引用</span>
              </div>
              <div style={recordGridStyle}>
                {selectedRecords.map((record, index) => {
                  const imageCount = record.media.filter(
                    isSelectableImage
                  ).length;
                  return (
                    <button
                      key={record.id}
                      type="button"
                      aria-pressed="true"
                      onClick={() => toggleRecord(record.id)}
                      style={recordOptionStyle(true)}
                    >
                      <span style={recordMetaStyle}>
                        <span>
                          {formatExperienceCardDate(record.record_time) ||
                            `记录${index + 1}`}
                        </span>
                        <span style={recordSelectedStyle(true)}>移除</span>
                      </span>
                      <span style={recordNoteStyle}>
                        {record.note?.trim() || "无文字记录"}
                      </span>
                      <span style={recordImageCountStyle}>
                        {imageCount > 0 ? `${imageCount}张图片` : "无图片"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={recordGroupHeadingStyle}>
                <strong>增加记录</strong>
                <span>
                  {availableRecords.length > 0
                    ? `还有 ${availableRecords.length} 条可加入`
                    : "项目中暂无其他记录"}
                </span>
              </div>
              {availableRecords.length > 0 ? (
                <div style={recordGridStyle}>
                  {availableRecords.map((record, index) => {
                    const imageCount = record.media.filter(
                      isSelectableImage
                    ).length;
                    return (
                      <button
                        key={record.id}
                        type="button"
                        aria-pressed="false"
                        onClick={() => toggleRecord(record.id)}
                        style={recordOptionStyle(false)}
                      >
                        <span style={recordMetaStyle}>
                          <span>
                            {formatExperienceCardDate(record.record_time) ||
                              `记录${index + 1}`}
                          </span>
                          <span style={recordSelectedStyle(false)}>+ 加入</span>
                        </span>
                        <span style={recordNoteStyle}>
                          {record.note?.trim() || "无文字记录"}
                        </span>
                        <span style={recordImageCountStyle}>
                          {imageCount > 0 ? `${imageCount}张图片` : "无图片"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
          {selectedRecords.length > 0 && selectedRecords.length < 3 ? (
            <p style={selectionHintStyle}>还需选择至少3条记录。</p>
          ) : null}
        </div>

        <div style={editorSectionStyle}>
          {videoDetail ? (
            <ExperienceCardVideoPanel
              detail={videoDetail}
              integrated
              selectionOnly
              coverMediaId={effectiveCoverMediaId}
              onCoverMediaIdChange={setCoverMediaId}
              onSelectionChange={onVideoSelectionChange}
            />
          ) : (
            <div>
              <div style={eyebrowStyle}>图片与视频</div>
              <h3 style={compactSectionTitleStyle}>先选择来源记录</h3>
              <p style={mutedStyle}>
                选择记录后，可从这些记录的图片中选择视频画面和经验卡封面。
              </p>
            </div>
          )}
        </div>

        {errorText ? <div style={inlineErrorStyle}>{errorText}</div> : null}
      </section>

      <section style={stickyActionsStyle}>
        {wasPublished && embedded ? (
          <button
            type="button"
            disabled={!canPublish || !hasChanges}
            onClick={() => setPublishConfirmOpen(true)}
            style={primaryButtonStyle(canPublish && hasChanges)}
          >
            {saving ? "保存中..." : "保存修改"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void persist("draft")}
              style={secondaryButtonStyle(canSave)}
            >
              {saving ? "保存中..." : cardId ? "保存修改" : "保存草稿"}
            </button>
            {!embedded ? (
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void persist("preview")}
                style={secondaryButtonStyle(canSave)}
              >
                预览
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canPublish}
              onClick={() => setPublishConfirmOpen(true)}
              style={primaryButtonStyle(canPublish)}
            >
              {wasPublished ? "保存并重新发布" : "发布经验卡"}
            </button>
          </>
        )}
      </section>

      <ConfirmDialog
        open={publishConfirmOpen}
        title={wasPublished ? "保存经验卡修改" : "确认公开经验卡"}
        message={`保存后，所选${selectedRecords.length}条来源记录及其照片将作为经验卡内容公开。项目中其他记录仍保持原来的可见性。`}
        confirmText={saving ? "保存中..." : wasPublished ? "保存修改" : "确认发布"}
        cancelText="取消"
        confirmDisabled={saving}
        cancelDisabled={saving}
        onClose={() => {
          if (!saving) setPublishConfirmOpen(false);
        }}
        onConfirm={() => persist("publish")}
      />
    </>
  );

  if (embedded) {
    return (
      <section style={embeddedEditorStyle} aria-label="编辑经验卡">
        {editorContent}
      </section>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link
            href={cardId ? `/experience-cards/${cardId}` : `/archive/${archive?.id}`}
            style={backLinkStyle}
          >
            <UiIcon name="arrow-left" size={15} /> 返回
          </Link>
          <h1 style={titleStyle}>{cardId ? "修改经验卡" : "生成经验卡"}</h1>
        </div>
        <Link href="/experience-cards" style={secondaryLinkStyle}>
          我的经验卡
        </Link>
      </header>
      {editorContent}
    </main>
  );
}

const pageStyle: CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "24px 16px 96px",
  color: "#263326",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 18,
};

const backLinkStyle: CSSProperties = {
  color: "#6c7869",
  textDecoration: "none",
  fontSize: 14,
};

const titleStyle: CSSProperties = {
  margin: "8px 0 6px",
  fontSize: 28,
  lineHeight: 1.25,
};

const mutedStyle: CSSProperties = {
  margin: 0,
  color: "#748071",
  fontSize: 14,
  lineHeight: 1.7,
};

const panelStyle: CSSProperties = {
  border: "1px solid #e1e9de",
  borderRadius: 18,
  background: "#fff",
  padding: 18,
  marginBottom: 14,
};

const embeddedEditorStyle: CSSProperties = {
  marginBottom: 14,
};

const editorHeadingStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 14,
  marginBottom: 2,
};

const editorSectionStyle: CSSProperties = {
  marginTop: 18,
  paddingTop: 18,
  borderTop: "1px solid #edf1eb",
};

const messageCardStyle: CSSProperties = {
  ...panelStyle,
  marginTop: 40,
};

const inlineNoticeStyle: CSSProperties = {
  margin: "14px 0 0",
  padding: "9px 11px",
  borderRadius: 10,
  background: "#fff9e9",
  border: "1px solid #eadfbf",
  color: "#756436",
  fontSize: 12,
  lineHeight: 1.6,
};

const eyebrowStyle: CSSProperties = {
  color: "#768471",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
};

const sectionTitleStyle: CSSProperties = {
  margin: "5px 0 4px",
  fontSize: 19,
  lineHeight: 1.35,
};

const compactSectionTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 16,
  lineHeight: 1.35,
};

const sourceProjectLinkStyle: CSSProperties = {
  color: "#344b31",
  textDecoration: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 14,
  fontWeight: 800,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cedac9",
  borderRadius: 12,
  minHeight: 46,
  padding: "10px 12px",
  fontSize: 16,
  outline: "none",
};

const counterStyle: CSSProperties = {
  marginTop: 6,
  textAlign: "right",
  color: "#8a9387",
  fontSize: 12,
};

const sectionHeadingRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginBottom: 12,
};

function countPillStyle(valid: boolean): CSSProperties {
  return {
    padding: "5px 10px",
    borderRadius: 999,
    background: valid ? "#edf6e9" : "#f6f1e9",
    color: valid ? "#4e7449" : "#846d48",
    fontSize: 12,
    fontWeight: 800,
  };
}

const recordGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 245px), 1fr))",
  gap: 9,
};

const recordGroupHeadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  margin: "13px 0 8px",
  color: "#768271",
  fontSize: 12,
};

function recordOptionStyle(selected: boolean): CSSProperties {
  return {
    minWidth: 0,
    display: "grid",
    gap: 8,
    padding: 12,
    border: selected ? "1px solid #7ea276" : "1px solid #dfe7dc",
    borderRadius: 13,
    background: selected ? "#f1f7ee" : "#fbfcfa",
    color: "#334231",
    textAlign: "left",
    cursor: "pointer",
  };
}

const recordMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  color: "#7b8678",
  fontSize: 12,
};

function recordSelectedStyle(selected: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "3px 7px",
    borderRadius: 999,
    background: selected ? "#557c50" : "#eef2eb",
    color: selected ? "#fff" : "#667363",
    fontSize: 10,
    fontWeight: 800,
  };
}

const recordNoteStyle: CSSProperties = {
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  fontSize: 13,
  lineHeight: 1.45,
  overflowWrap: "anywhere",
};

const recordImageCountStyle: CSSProperties = {
  color: "#849080",
  fontSize: 11,
};

const selectionHintStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#8b7048",
  fontSize: 13,
};

const errorStyle: CSSProperties = {
  color: "#a74b47",
  lineHeight: 1.6,
  fontSize: 14,
};

const inlineErrorStyle: CSSProperties = {
  marginTop: 16,
  padding: 11,
  borderRadius: 11,
  color: "#a74b47",
  background: "#fff8f7",
  border: "1px solid #efd8d5",
  fontSize: 14,
};

const stickyActionsStyle: CSSProperties = {
  position: "sticky",
  bottom: 10,
  display: "flex",
  justifyContent: "flex-end",
  gap: 9,
  flexWrap: "wrap",
  padding: 10,
  borderRadius: 16,
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #e1e8de",
  boxShadow: "0 10px 28px rgba(54,74,51,0.1)",
  backdropFilter: "blur(8px)",
};

const baseButtonStyle: CSSProperties = {
  minHeight: 42,
  padding: "9px 15px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 800,
};

function secondaryButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...baseButtonStyle,
    border: "1px solid #d4dfd0",
    background: "#fff",
    color: "#50604d",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
  };
}

function primaryButtonStyle(enabled: boolean): CSSProperties {
  return {
    ...baseButtonStyle,
    border: "1px solid #638b5d",
    background: "#638b5d",
    color: "#fff",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
  };
}

const primaryLinkStyle: CSSProperties = {
  ...baseButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  background: "#638b5d",
  border: "1px solid #638b5d",
  color: "#fff",
  textDecoration: "none",
};

const secondaryLinkStyle: CSSProperties = {
  ...baseButtonStyle,
  display: "inline-flex",
  alignItems: "center",
  background: "#fff",
  border: "1px solid #d4dfd0",
  color: "#50604d",
  textDecoration: "none",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};
