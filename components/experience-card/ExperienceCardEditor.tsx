"use client";

import Link from "next/link";
import UiIcon from "@/components/ui/UiIcon";
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
import {
  deleteCachedExperienceCardVideo,
  getExperienceCardVideoSelection,
  saveExperienceCardVideoSelection,
} from "@/lib/experience-card-video-cache";
import type {
  ExperienceCardArchive,
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

function getRecordImages(record: ExperienceCardSourceRecord) {
  return record.media.filter(
    (media) =>
      isSelectableImage(media) &&
      Boolean(media.display_url || media.display_thumb_url)
  );
}

function reconcileMediaSelection(
  records: ExperienceCardSourceRecord[],
  storedSelection?: Record<string, string[]> | null
): Record<string, string[]> {
  return Object.fromEntries(
    records.map((record) => {
      const availableIds = getRecordImages(record).map((media) => media.id);
      if (!storedSelection || !(record.id in storedSelection)) {
        return [record.id, availableIds];
      }
      const availableIdSet = new Set(availableIds);
      return [
        record.id,
        (storedSelection[record.id] || []).filter((id) =>
          availableIdSet.has(id)
        ),
      ];
    })
  );
}

function getFirstSelectedMediaId({
  records,
  selectedRecordIds,
  selectedMediaIdsByRecordId,
}: {
  records: ExperienceCardSourceRecord[];
  selectedRecordIds: string[];
  selectedMediaIdsByRecordId: Record<string, string[]>;
}) {
  const selectedRecordIdSet = new Set(selectedRecordIds);
  for (const record of records) {
    if (!selectedRecordIdSet.has(record.id)) continue;
    const selectedMediaIdSet = new Set(
      selectedMediaIdsByRecordId[record.id] || []
    );
    const firstSelected = getRecordImages(record).find((media) =>
      selectedMediaIdSet.has(media.id)
    );
    if (firstSelected) return firstSelected.id;
  }
  return null;
}

function createEditorSnapshot({
  title,
  recordIds,
  selectedMediaIdsByRecordId,
  coverMediaId,
}: {
  title: string;
  recordIds: string[];
  selectedMediaIdsByRecordId: Record<string, string[]>;
  coverMediaId: string | null;
}) {
  const normalizedRecordIds = [...recordIds].sort();
  return JSON.stringify({
    title: title.trim(),
    recordIds: normalizedRecordIds,
    selectedMediaIdsByRecordId: Object.fromEntries(
      normalizedRecordIds.map((recordId) => [
        recordId,
        [...(selectedMediaIdsByRecordId[recordId] || [])].sort(),
      ])
    ),
    coverMediaId,
  });
}

async function loadEditorRecords({
  archiveId,
  userId,
}: {
  archiveId: string;
  userId: string;
}) {
  const { data: recordData, error: recordError } = await supabase
    .from("records")
    .select(RECORD_SELECT)
    .eq("archive_id", archiveId)
    .eq("user_id", userId)
    .is("trashed_at", null)
    .order("record_time", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (recordError) throw recordError;

  const baseRecords = (recordData || []) as unknown as Omit<
    ExperienceCardSourceRecord,
    "media"
  >[];
  const recordIds = baseRecords.map((record) => record.id);
  const mediaByRecord = new Map<string, ExperienceCardMedia[]>();

  if (recordIds.length > 0) {
    const { data: mediaData, error: mediaError } = await supabase
      .from("media")
      .select(MEDIA_SELECT)
      .in("record_id", recordIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (mediaError) throw mediaError;

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

  return baseRecords.map((record) => ({
    ...record,
    media: mediaByRecord.get(record.id) || [],
  }));
}

export default function ExperienceCardEditor({
  cardId,
  embedded = false,
  showTitleField = true,
  compact = false,
  onDirtyChange,
  onSaved,
}: {
  cardId?: string;
  embedded?: boolean;
  showTitleField?: boolean;
  compact?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedArchiveId = searchParams.get("archiveId");

  const [archive, setArchive] = useState<ExperienceCardArchive | null>(null);
  const [records, setRecords] = useState<ExperienceCardSourceRecord[]>([]);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [selectedMediaIdsByRecordId, setSelectedMediaIdsByRecordId] = useState<
    Record<string, string[]>
  >({});
  const [title, setTitle] = useState("");
  const [coverMediaId, setCoverMediaId] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [wasPublished, setWasPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingRecords, setRefreshingRecords] = useState(false);
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
          "id, user_id, title, category, species_id, system_name, species_name_snapshot, is_public, default_record_visibility"
        )
        .eq("id", archiveId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!archiveData) {
        setErrorText("来源项目不存在，或者已经进入回收站。");
        setLoading(false);
        return;
      }

      let nextRecords: ExperienceCardSourceRecord[];
      try {
        nextRecords = await loadEditorRecords({ archiveId, userId: user.id });
      } catch (error) {
        console.error("load experience card editor records error:", error);
        setErrorText("项目记录读取失败，请稍后重试。");
        setLoading(false);
        return;
      }
      const nextSelectedRecordIds = cardId
        ? existingRecordIds
        : nextRecords.map((record) => record.id);
      const storedSelection = cardId
        ? getExperienceCardVideoSelection(cardId)
        : null;
      const nextMediaSelection = reconcileMediaSelection(
        nextRecords,
        storedSelection?.selectedMediaIdsByRecordId
      );
      const selectedRecordIdSet = new Set(nextSelectedRecordIds);
      const coverRecord = existingCoverMediaId
        ? nextRecords.find((record) =>
            getRecordImages(record).some(
              (media) => media.id === existingCoverMediaId
            )
          )
        : null;
      if (
        existingCoverMediaId &&
        coverRecord &&
        selectedRecordIdSet.has(coverRecord.id) &&
        !(nextMediaSelection[coverRecord.id] || []).includes(
          existingCoverMediaId
        )
      ) {
        nextMediaSelection[coverRecord.id] = [
          ...(nextMediaSelection[coverRecord.id] || []),
          existingCoverMediaId,
        ];
      }
      const selectedMediaIdSet = new Set(
        nextSelectedRecordIds.flatMap(
          (recordId) => nextMediaSelection[recordId] || []
        )
      );
      const preferredCoverMediaId =
        existingCoverMediaId && selectedMediaIdSet.has(existingCoverMediaId)
          ? existingCoverMediaId
          : storedSelection?.coverMediaId &&
              selectedMediaIdSet.has(storedSelection.coverMediaId)
            ? storedSelection.coverMediaId
            : null;
      const nextCoverMediaId =
        preferredCoverMediaId ||
        getFirstSelectedMediaId({
          records: nextRecords,
          selectedRecordIds: nextSelectedRecordIds,
          selectedMediaIdsByRecordId: nextMediaSelection,
        });

      setArchive(archiveData as ExperienceCardArchive);
      setRecords(nextRecords);
      setSelectedRecordIds(nextSelectedRecordIds);
      setSelectedMediaIdsByRecordId(nextMediaSelection);
      setCoverMediaId(nextCoverMediaId);
      if (!cardId) {
        setTitle(`${archiveData.title}的经验`);
      } else {
        setInitialSnapshot(
          createEditorSnapshot({
            title: existingTitle,
            recordIds: existingRecordIds,
            selectedMediaIdsByRecordId: nextMediaSelection,
            coverMediaId: nextCoverMediaId,
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
  const selectedMediaIdSet = useMemo(
    () =>
      new Set(
        selectedRecords.flatMap(
          (record) => selectedMediaIdsByRecordId[record.id] || []
        )
      ),
    [selectedMediaIdsByRecordId, selectedRecords]
  );
  const coverOptions = imageOptions.filter(
    (media) =>
      selectedRecordIdSet.has(media.record_id) &&
      selectedMediaIdSet.has(media.id)
  );
  const effectiveCoverMediaId =
    coverOptions.some((media) => media.id === coverMediaId)
      ? coverMediaId
      : null;
  const unselectedRecordCount = availableRecords.length;
  const currentSnapshot = createEditorSnapshot({
    title,
    recordIds: selectedRecords.map((record) => record.id),
    selectedMediaIdsByRecordId,
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

  useEffect(() => {
    if (!loading) onDirtyChange?.(hasChanges);
  }, [hasChanges, loading, onDirtyChange]);

  function persistLocalSelection({
    nextRecordIds,
    nextMediaSelection,
    preferredCoverMediaId,
    recordSource = records,
  }: {
    nextRecordIds: string[];
    nextMediaSelection: Record<string, string[]>;
    preferredCoverMediaId: string | null;
    recordSource?: ExperienceCardSourceRecord[];
  }) {
    const selectedMediaIds = new Set(
      nextRecordIds.flatMap(
        (recordId) => nextMediaSelection[recordId] || []
      )
    );
    const nextCoverMediaId =
      preferredCoverMediaId && selectedMediaIds.has(preferredCoverMediaId)
        ? preferredCoverMediaId
        : getFirstSelectedMediaId({
            records: recordSource,
            selectedRecordIds: nextRecordIds,
            selectedMediaIdsByRecordId: nextMediaSelection,
          });

    setSelectedMediaIdsByRecordId(nextMediaSelection);
    setCoverMediaId(nextCoverMediaId);

    const selectionStorageKey = cardId || (archive ? `draft:${archive.id}` : null);
    if (selectionStorageKey) {
      saveExperienceCardVideoSelection(selectionStorageKey, {
        selectedMediaIdsByRecordId: Object.fromEntries(
          nextRecordIds.map((recordId) => [
            recordId,
            nextMediaSelection[recordId] || [],
          ])
        ),
        coverMediaId: nextCoverMediaId,
      });
    }
    if (cardId) {
      void deleteCachedExperienceCardVideo(cardId).catch(() => undefined);
    }
  }

  async function refreshProjectRecords({ announce = true } = {}) {
    if (!archive || refreshingRecords) return;
    setRefreshingRecords(true);
    setErrorText("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || user.id !== archive.user_id) {
        throw new Error("experience_card_not_found_or_forbidden");
      }

      const nextRecords = await loadEditorRecords({
        archiveId: archive.id,
        userId: user.id,
      });
      const currentRecordIdSet = new Set(records.map((record) => record.id));
      const validRecordIdSet = new Set(nextRecords.map((record) => record.id));
      const newlyAddedRecords = nextRecords.filter(
        (record) => !currentRecordIdSet.has(record.id)
      );
      const nextRecordIds = selectedRecordIds.filter((recordId) =>
        validRecordIdSet.has(recordId)
      );
      const nextMediaSelection = Object.fromEntries(
        nextRecords.map((record) => {
          const availableIds = getRecordImages(record).map((media) => media.id);
          const availableIdSet = new Set(availableIds);
          return [
            record.id,
            (selectedMediaIdsByRecordId[record.id] || []).filter((mediaId) =>
              availableIdSet.has(mediaId)
            ),
          ];
        })
      );

      setRecords(nextRecords);
      setSelectedRecordIds(nextRecordIds);
      persistLocalSelection({
        nextRecordIds,
        nextMediaSelection,
        preferredCoverMediaId: coverMediaId,
        recordSource: nextRecords,
      });

      if (announce) {
        showToast(
          newlyAddedRecords.length > 0
            ? `项目已有记录已更新，当前共有${nextRecords.length}条可供选择`
            : "项目记录已是最新"
        );
      }
    } catch (error) {
      console.error("refresh experience card editor records error:", error);
      setErrorText("新记录读取失败，请稍后再试。");
    } finally {
      setRefreshingRecords(false);
    }
  }

  function toggleRecord(recordId: string) {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;

    const isSelected = selectedRecordIdSet.has(recordId);
    const nextRecordIds = isSelected
      ? selectedRecordIds.filter((id) => id !== recordId)
      : [...selectedRecordIds, recordId];
    const nextMediaSelection = {
      ...selectedMediaIdsByRecordId,
      [recordId]: isSelected
        ? []
        : getRecordImages(record).map((media) => media.id),
    };

    setSelectedRecordIds(nextRecordIds);
    persistLocalSelection({
      nextRecordIds,
      nextMediaSelection,
      preferredCoverMediaId: coverMediaId,
    });
  }

  function toggleRecordImage(recordId: string, mediaId: string) {
    if (!selectedRecordIdSet.has(recordId)) return;
    const currentMediaIds = selectedMediaIdsByRecordId[recordId] || [];
    const nextMediaIds = currentMediaIds.includes(mediaId)
      ? currentMediaIds.filter((id) => id !== mediaId)
      : [...currentMediaIds, mediaId];
    const nextMediaSelection = {
      ...selectedMediaIdsByRecordId,
      [recordId]: nextMediaIds,
    };
    persistLocalSelection({
      nextRecordIds: selectedRecordIds,
      nextMediaSelection,
      preferredCoverMediaId: coverMediaId,
    });
  }

  function toggleAllRecordImages(record: ExperienceCardSourceRecord) {
    if (!selectedRecordIdSet.has(record.id)) return;
    const imageIds = getRecordImages(record).map((media) => media.id);
    const currentMediaIds = selectedMediaIdsByRecordId[record.id] || [];
    const nextMediaSelection = {
      ...selectedMediaIdsByRecordId,
      [record.id]:
        currentMediaIds.length === imageIds.length ? [] : imageIds,
    };
    persistLocalSelection({
      nextRecordIds: selectedRecordIds,
      nextMediaSelection,
      preferredCoverMediaId: coverMediaId,
    });
  }

  function selectCoverMedia(mediaId: string) {
    if (!selectedMediaIdSet.has(mediaId)) return;
    persistLocalSelection({
      nextRecordIds: selectedRecordIds,
      nextMediaSelection: selectedMediaIdsByRecordId,
      preferredCoverMediaId: mediaId,
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

      saveExperienceCardVideoSelection(savedCardId, {
        selectedMediaIdsByRecordId: Object.fromEntries(
          selectedRecords.map((record) => [
            record.id,
            selectedMediaIdsByRecordId[record.id] || [],
          ])
        ),
        coverMediaId: effectiveCoverMediaId,
      });

      if (mode === "publish") {
        await publishExperienceCard(savedCardId);
      }

      if (mode === "publish") {
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

  function renderSelectedRecord(
    record: ExperienceCardSourceRecord,
    index: number
  ) {
    const recordImages = getRecordImages(record);
    const selectedMediaIds = selectedMediaIdsByRecordId[record.id] || [];
    const selectedMediaIdSetForRecord = new Set(selectedMediaIds);
    const allImagesSelected =
      recordImages.length > 0 && selectedMediaIds.length === recordImages.length;

    return (
      <article key={record.id} style={recordEditorStyle(true)}>
        <button
          type="button"
          aria-pressed="true"
          onClick={() => toggleRecord(record.id)}
          style={recordHeaderButtonStyle}
          aria-label={`从经验卡移出第${index + 1}条记录`}
        >
          <span style={recordCheckStyle(true)} aria-hidden="true">
            <UiIcon name="check" size={14} />
          </span>
          <span style={recordHeaderTextStyle}>
            <span style={recordMetaStyle}>
              {formatExperienceCardDate(record.record_time) || `记录${index + 1}`}
            </span>
            <span style={recordNoteStyle}>
              {record.note?.trim() || "无文字记录"}
            </span>
          </span>
          <span style={recordSelectedStyle(false)}>移出</span>
        </button>

        <div style={recordMediaAreaStyle(true)}>
          <div style={recordMediaHeadingStyle}>
            <span>
              {recordImages.length > 0
                ? `MP4图片 ${selectedMediaIds.length}/${recordImages.length}`
                : "这条记录没有图片，将使用文字画面"}
            </span>
            {recordImages.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleAllRecordImages(record)}
                style={recordMediaActionStyle}
              >
                {allImagesSelected ? "清空图片" : "全选图片"}
              </button>
            ) : null}
          </div>

          {recordImages.length > 0 ? (
            <div style={recordImageGridStyle}>
              {recordImages.map((media, mediaIndex) => {
                const active = selectedMediaIdSetForRecord.has(media.id);
                const isCover = active && effectiveCoverMediaId === media.id;
                const previewUrl =
                  media.display_thumb_url || media.display_url || "";

                return (
                  <div key={media.id} style={recordImageItemStyle}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleRecordImage(record.id, media.id)}
                      style={recordImageButtonStyle(active, true)}
                    >
                      <img
                        src={previewUrl}
                        alt={`第${index + 1}条记录的图片${mediaIndex + 1}`}
                        loading="lazy"
                        style={recordThumbnailStyle}
                      />
                      {active ? (
                        <span style={recordImageBadgeStyle}>
                          <UiIcon name="check" size={13} />
                        </span>
                      ) : null}
                    </button>
                    {active ? (
                      <button
                        type="button"
                        onClick={() => selectCoverMedia(media.id)}
                        style={recordCoverButtonStyle(isCover)}
                      >
                        {isCover ? "封面" : "设为封面"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  function renderAvailableRecord(
    record: ExperienceCardSourceRecord,
    index: number
  ) {
    const recordImages = getRecordImages(record);

    return (
      <article key={record.id} style={recordEditorStyle(false)}>
        <button
          type="button"
          aria-pressed="false"
          onClick={() => toggleRecord(record.id)}
          style={recordHeaderButtonStyle}
          aria-label={`把第${index + 1}条已有记录加入经验卡`}
        >
          <span style={recordCheckStyle(false)} aria-hidden="true">
            <UiIcon name="plus" size={14} />
          </span>
          <span style={recordHeaderTextStyle}>
            <span style={recordMetaStyle}>
              {formatExperienceCardDate(record.record_time) || `记录${index + 1}`}
            </span>
            <span style={recordNoteStyle}>
              {record.note?.trim() || "无文字记录"}
            </span>
          </span>
          <span style={recordSelectedStyle(false)}>加入</span>
        </button>

        <div style={recordMediaAreaStyle(false)}>
          <div style={recordMediaHeadingStyle}>
            <span>
              {recordImages.length > 0
                ? `${recordImages.length}张图片 · 加入后默认全选`
                : "这条记录没有图片，将使用文字画面"}
            </span>
          </div>
          {recordImages.length > 0 ? (
            <div style={availableImageGridStyle}>
              {recordImages.map((media, mediaIndex) => (
                <img
                  key={media.id}
                  src={media.display_thumb_url || media.display_url || ""}
                  alt={`可加入的第${index + 1}条记录图片${mediaIndex + 1}`}
                  loading="lazy"
                  style={availableRecordThumbnailStyle}
                />
              ))}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  const editorContent = (
    <>
      <section style={compact ? compactPanelStyle : panelStyle}>
        {!compact ? (
          <>
            <div style={editorHeadingStyle}>
              <div>
                <div style={eyebrowStyle}>内容编辑</div>
                <h2 style={sectionTitleStyle}>
                  {showTitleField ? "标题、记录与图片" : "记录、图片与封面"}
                </h2>
              </div>
            </div>
            <p style={editorLeadStyle}>
              经验卡引用项目里的已有记录；所选图片用于当前设备生成MP4，封面随经验卡保存。
            </p>
          </>
        ) : null}

        {showTitleField ? (
          <div style={titleSectionStyle}>
            <label style={labelStyle} htmlFor="experience-card-title">
              经验卡标题
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
        ) : null}

        <div style={compact ? compactEditorSectionStyle : editorSectionStyle}>
          <div style={sectionHeadingRowStyle}>
            <h3 style={compactSectionTitleStyle}>全部记录</h3>
            <div style={recordToolbarStyle}>
              <button
                type="button"
                disabled={refreshingRecords}
                onClick={() => void refreshProjectRecords()}
                style={refreshRecordsButtonStyle}
              >
                <UiIcon name="refresh" size={14} />
                {refreshingRecords ? "刷新中..." : "刷新记录"}
              </button>
            </div>
          </div>
          <div style={recordSummaryStyle}>
            <span style={countPillStyle(selectedRecords.length >= 3)}>
              已选 {selectedRecords.length} / {records.length} 条
            </span>
            {unselectedRecordCount > 0 ? (
              <span>{unselectedRecordCount} 条可加入</span>
            ) : null}
          </div>
          <p style={recordSelectionIntroStyle}>
            至少选择3条，不设累计上限；记录按原始时间排序。
          </p>

          {records.length === 0 ? (
            <div style={emptyRecordsStyle}>
              <strong>当前项目还没有可用记录</strong>
              <span>请先回到来源项目添加记录，再返回这里刷新。</span>
              {archive ? (
                <Link href={`/archive/${archive.id}`} style={secondaryLinkStyle}>
                  返回来源项目
                </Link>
              ) : null}
            </div>
          ) : (
            <div style={recordListStyle}>
              {records.map((record, index) =>
                selectedRecordIdSet.has(record.id)
                  ? renderSelectedRecord(record, index)
                  : renderAvailableRecord(record, index)
              )}
            </div>
          )}
          {selectedRecords.length < 3 ? (
            <p style={selectionHintStyle}>还需选择至少3条记录。</p>
          ) : null}
        </div>

        {errorText ? <div style={inlineErrorStyle}>{errorText}</div> : null}
      </section>

      <section style={compact ? compactActionsStyle : stickyActionsStyle}>
        {embedded ? (
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void persist("draft")}
            style={primaryButtonStyle(canSave)}
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
      <section
        style={compact ? compactEmbeddedEditorStyle : embeddedEditorStyle}
        aria-label="编辑经验卡"
      >
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
  maxWidth: 880,
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
  border: "1px solid #dfe7dc",
  borderRadius: 20,
  background: "#fff",
  padding: "18px clamp(14px, 3vw, 22px) 22px",
  marginBottom: 14,
  boxShadow: "0 10px 28px rgba(54,74,51,0.05)",
};

const compactPanelStyle: CSSProperties = {
  ...panelStyle,
  padding: 0,
  border: 0,
  borderRadius: 0,
  background: "transparent",
  boxShadow: "none",
};

const embeddedEditorStyle: CSSProperties = {
  marginBottom: 14,
};

const compactEmbeddedEditorStyle: CSSProperties = {
  margin: 0,
};

const editorHeadingStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 14,
  marginBottom: 2,
};

const editorLeadStyle: CSSProperties = {
  maxWidth: 650,
  margin: "8px 0 0",
  color: "#6f7c6c",
  fontSize: 13,
  lineHeight: 1.65,
};

const titleSectionStyle: CSSProperties = {
  marginTop: 18,
  padding: 14,
  border: "1px solid #e5ebe2",
  borderRadius: 14,
  background: "#fafcf9",
};

const editorSectionStyle: CSSProperties = {
  marginTop: 22,
  paddingTop: 20,
  borderTop: "1px solid #edf1eb",
};

const compactEditorSectionStyle: CSSProperties = {
  marginTop: 8,
};

const messageCardStyle: CSSProperties = {
  ...panelStyle,
  marginTop: 40,
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
  flexWrap: "wrap",
};

const recordToolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 7,
  flexWrap: "wrap",
};

const refreshRecordsButtonStyle: CSSProperties = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 11px",
  border: "1px solid #d6dfd2",
  borderRadius: 999,
  background: "#fff",
  color: "#5e6d5a",
  fontSize: 12,
  fontWeight: 750,
  cursor: "pointer",
};

const recordSummaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "7px 12px",
  flexWrap: "wrap",
  margin: "0 0 10px",
  color: "#778374",
  fontSize: 12,
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

const recordSelectionIntroStyle: CSSProperties = {
  margin: "0 0 14px",
  color: "#748071",
  fontSize: 12,
  lineHeight: 1.65,
};

const emptyRecordsStyle: CSSProperties = {
  minHeight: 160,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  padding: 20,
  border: "1px dashed #ccd9c8",
  borderRadius: 15,
  background: "#fafcf9",
  color: "#687565",
  fontSize: 13,
  textAlign: "center",
};

const recordListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

function recordEditorStyle(selected: boolean): CSSProperties {
  return {
    minWidth: 0,
    border: selected ? "1px solid #8eaa87" : "1px solid #dfe6dc",
    borderRadius: 14,
    background: selected ? "#f7faf5" : "#fbfcfa",
    overflow: "hidden",
  };
}

const recordHeaderButtonStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "28px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  padding: "11px 12px",
  border: 0,
  background: "transparent",
  color: "#334231",
  textAlign: "left",
  cursor: "pointer",
};

const recordMetaStyle: CSSProperties = {
  color: "#7b8678",
  fontSize: 11,
  lineHeight: 1.35,
};

function recordCheckStyle(selected: boolean): CSSProperties {
  return {
    width: 26,
    height: 26,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: selected ? "1px solid #63865d" : "1px solid #cbd6c8",
    background: selected ? "#63865d" : "#fff",
    color: selected ? "#fff" : "#697767",
    fontSize: 14,
    fontWeight: 850,
  };
}

const recordHeaderTextStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 4,
};

function recordSelectedStyle(selected: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "4px 8px",
    borderRadius: 999,
    background: selected ? "#e7f1e3" : "#f0f3ee",
    color: selected ? "#44673f" : "#657263",
    fontSize: 11,
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

function recordMediaAreaStyle(selected: boolean): CSSProperties {
  return {
    padding: "10px 12px 12px",
    borderTop: "1px solid #e5ece2",
    background: selected ? "#fff" : "#f7f9f6",
    opacity: selected ? 1 : 0.72,
  };
}

const recordMediaHeadingStyle: CSSProperties = {
  minHeight: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 8,
  color: "#748071",
  fontSize: 11,
};

const recordMediaActionStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: 28,
  padding: "4px 9px",
  border: "1px solid #d6dfd2",
  borderRadius: 999,
  background: "#fff",
  color: "#596956",
  fontSize: 11,
  cursor: "pointer",
};

const recordImageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
  gap: 8,
};

const availableImageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(68px, 92px))",
  gap: 7,
};

const availableRecordThumbnailStyle: CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  border: "1px solid #dce5d9",
  borderRadius: 9,
  background: "#edf1eb",
};

const recordImageItemStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
};

function recordImageButtonStyle(
  active: boolean,
  recordSelected: boolean
): CSSProperties {
  return {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    padding: 0,
    overflow: "hidden",
    border: active ? "2px solid #668e60" : "1px solid #dce5d9",
    borderRadius: 10,
    background: "#edf1eb",
    cursor: recordSelected ? "pointer" : "not-allowed",
    opacity: recordSelected ? 1 : 0.72,
  };
}

const recordThumbnailStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "cover",
};

const recordImageBadgeStyle: CSSProperties = {
  position: "absolute",
  right: 5,
  top: 5,
  width: 21,
  height: 21,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "rgba(68,105,62,0.92)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
};

function recordCoverButtonStyle(isCover: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 6,
    bottom: 6,
    zIndex: 2,
    minHeight: 24,
    padding: "3px 7px",
    border: isCover ? "1px solid #d7e8d2" : "1px solid rgba(255,255,255,0.78)",
    borderRadius: 999,
    background: isCover ? "rgba(65,103,59,0.94)" : "rgba(28,39,27,0.72)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    cursor: "pointer",
  };
}

const selectionHintStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#8b7048",
  fontSize: 13,
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

const compactActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 9,
  flexWrap: "wrap",
  marginTop: 14,
  paddingTop: 14,
  borderTop: "1px solid #e4eae1",
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
