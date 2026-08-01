"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import {
  getExperienceCardErrorText,
  loadExperienceCard,
  publishExperienceCard,
  saveExperienceCard,
} from "@/lib/experience-cards";
import type {
  ExperienceCardArchive,
  ExperienceCardMedia,
  ExperienceCardSourceRecord,
} from "@/lib/experience-card-types";
import { attachMediaDisplayUrls } from "@/lib/media-urls";
import { saveExperienceCardVideoSelection } from "@/lib/experience-card-video-cache";
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

export default function ExperienceCardEditor({
  cardId,
}: {
  cardId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedArchiveId = searchParams.get("archiveId");

  const [archive, setArchive] = useState<ExperienceCardArchive | null>(null);
  const [records, setRecords] = useState<ExperienceCardSourceRecord[]>([]);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [coverMediaId, setCoverMediaId] = useState<string | null>(null);
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
        setTitle(detail.card.title);
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
          "id, user_id, title, category, system_name, species_name_snapshot, is_public"
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
      setSelectedMediaIds(
        nextRecords
          .filter((record) => existingRecordIds.includes(record.id))
          .flatMap((record) =>
            record.media
              .filter(isSelectableImage)
              .filter((media) =>
                Boolean(media.display_url || media.display_thumb_url)
              )
              .map((media) => media.id)
          )
      );
      setCoverMediaId(existingCoverMediaId);
      if (!cardId) setTitle(`${archiveData.title}的经验`);
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
  const selectedMediaSet = useMemo(
    () => new Set(selectedMediaIds),
    [selectedMediaIds]
  );
  const selectedImages = imageOptions.filter((media) =>
    selectedMediaSet.has(media.id)
  );
  const selectedRecordIdSet = new Set(
    selectedImages.map((media) => media.record_id)
  );
  const selectedRecords = records.filter((record) =>
    selectedRecordIdSet.has(record.id)
  );
  const coverOptions = selectedImages;
  const effectiveCoverMediaId =
    coverOptions.some((media) => media.id === coverMediaId)
      ? coverMediaId
      : coverOptions[0]?.id || null;
  const canSave =
    Boolean(archive) &&
    canCreateMembershipContent(membership) &&
    title.trim().length >= 1 &&
    title.trim().length <= 120 &&
    selectedMediaIds.length >= 1 &&
    selectedRecords.length >= 3 &&
    selectedRecords.length <= 12 &&
    !saving;

  function toggleImage(media: ExperienceCardMedia) {
    setSelectedMediaIds((current) => {
      if (current.includes(media.id)) {
        return current.filter((id) => id !== media.id);
      }
      const currentRecordIds = new Set(
        imageOptions
          .filter((option) => current.includes(option.id))
          .map((option) => option.record_id)
      );
      if (
        !currentRecordIds.has(media.record_id) &&
        currentRecordIds.size >= 12
      ) {
        showToast("一张经验卡最多关联12条来源记录");
        return current;
      }
      return [...current, media.id];
    });
  }

  async function persist(mode: "draft" | "preview" | "publish") {
    if (!archive || !canSave) return;
    setSaving(true);
    setErrorText("");

    try {
      const savedCardId = await saveExperienceCard({
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
            selectedImages
              .filter((media) => media.record_id === record.id)
              .map((media) => media.id),
          ])
        ),
        coverMediaId: effectiveCoverMediaId,
      });

      if (mode === "publish") {
        await publishExperienceCard(savedCardId);
        showToast("经验卡已公开");
      } else {
        showToast(mode === "preview" ? "草稿已保存" : "经验卡草稿已保存");
      }

      router.push(
        `/experience-cards/${savedCardId}${mode === "preview" ? "?preview=1" : ""}`
      );
    } catch (error) {
      setErrorText(getExperienceCardErrorText(error));
    } finally {
      setSaving(false);
      setPublishConfirmOpen(false);
    }
  }

  if (loading) {
    return <main style={pageStyle}>正在读取项目记录...</main>;
  }

  if (errorText && !archive) {
    return (
      <main style={pageStyle}>
        <section style={messageCardStyle}>
          <h1 style={titleStyle}>无法编辑经验卡</h1>
          <p style={mutedStyle}>{errorText}</p>
          <Link href="/experience-cards" style={secondaryLinkStyle}>
            返回我的经验卡
          </Link>
        </section>
      </main>
    );
  }

  if (!canCreateMembershipContent(membership)) {
    return (
      <main style={pageStyle}>
        <section style={messageCardStyle}>
          <h1 style={titleStyle}>需要有效云空间</h1>
          <p style={mutedStyle}>
            经验卡引用云端项目与记录，只有有效云空间用户可以创建、修改和发布。
          </p>
          <div style={actionRowStyle}>
            <Link href="/membership" style={primaryLinkStyle}>
              查看云空间
            </Link>
            <Link href="/experience-cards" style={secondaryLinkStyle}>
              返回
            </Link>
          </div>
        </section>
      </main>
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
            ← 返回
          </Link>
          <h1 style={titleStyle}>{cardId ? "修改经验卡" : "生成经验卡"}</h1>
        </div>
        <Link href="/experience-cards" style={secondaryLinkStyle}>
          我的经验卡
        </Link>
      </header>

      {wasPublished ? (
        <section style={noticeStyle}>
          修改并保存后会先回到私密草稿，需要重新确认发布。
        </section>
      ) : null}

      <section style={panelStyle}>
        <div style={eyebrowStyle}>来源项目</div>
        <h2 style={sectionTitleStyle}>{archive?.title}</h2>
        <p style={mutedStyle}>
          {archive?.system_name ||
            archive?.species_name_snapshot ||
            "未填写系统名"}
        </p>
      </section>

      <section style={panelStyle}>
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
      </section>

      <section style={panelStyle}>
        <div style={sectionHeadingRowStyle}>
          <div>
            <div style={eyebrowStyle}>选择图片</div>
            <h2 style={sectionTitleStyle}>
              已选择 {selectedMediaIds.length} 张
            </h2>
          </div>
          <span style={countPillStyle(selectedRecords.length >= 3)}>
            来自 {selectedRecords.length} 条记录
          </span>
        </div>

        {imageOptions.length === 0 ? (
          <p style={errorStyle}>
            当前项目还没有可选择的照片。
          </p>
        ) : (
          <div style={imageGridStyle}>
            {imageOptions.map((media, index) => {
              const selected = selectedMediaSet.has(media.id);
              const selectedAsCover =
                selected && effectiveCoverMediaId === media.id;
              const src = media.display_thumb_url || media.display_url;
              if (!src) return null;
              return (
                <div key={media.id} style={imageOptionWrapStyle}>
                  <button
                    type="button"
                    onClick={() => toggleImage(media)}
                    aria-pressed={selected}
                    style={imageOptionStyle(selected)}
                  >
                    <img
                      src={src}
                      alt={`经验卡可选图片${index + 1}`}
                      style={imageOptionImageStyle}
                    />
                    <span style={imageOptionBadgeStyle(selected)}>
                      {selected ? "已选" : "选择"}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!selected}
                    onClick={() => setCoverMediaId(media.id)}
                    style={imageCoverButtonStyle(selectedAsCover, selected)}
                  >
                    {selectedAsCover ? "当前封面" : "设为封面"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {selectedRecords.length > 0 && selectedRecords.length < 3 ? (
          <p style={selectionHintStyle}>请至少选择来自3条记录的图片。</p>
        ) : null}
      </section>

      {errorText ? <section style={errorPanelStyle}>{errorText}</section> : null}

      <section style={stickyActionsStyle}>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void persist("draft")}
          style={secondaryButtonStyle(canSave)}
        >
          {saving ? "保存中..." : "保存草稿"}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void persist("preview")}
          style={secondaryButtonStyle(canSave)}
        >
          预览
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => setPublishConfirmOpen(true)}
          style={primaryButtonStyle(canSave)}
        >
          发布经验卡
        </button>
      </section>

      <ConfirmDialog
        open={publishConfirmOpen}
        title="确认公开经验卡"
        message={`发布后，所选${selectedMediaIds.length}张图片及其来源记录将公开，游客可通过直接链接查看。项目中其他记录仍保持原来的可见性。`}
        confirmText={saving ? "发布中..." : "确认发布"}
        cancelText="取消"
        confirmDisabled={saving}
        cancelDisabled={saving}
        onClose={() => {
          if (!saving) setPublishConfirmOpen(false);
        }}
        onConfirm={() => persist("publish")}
      />
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

const messageCardStyle: CSSProperties = {
  ...panelStyle,
  marginTop: 40,
};

const noticeStyle: CSSProperties = {
  ...panelStyle,
  background: "#fff9e9",
  borderColor: "#eadfbf",
  color: "#756436",
  fontSize: 14,
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

const imageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
  gap: 10,
};

const imageOptionWrapStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

function imageOptionStyle(selected: boolean): CSSProperties {
  return {
    position: "relative",
    border: selected ? "2px solid #6f9867" : "1px solid #dfe6dc",
    borderRadius: 13,
    overflow: "hidden",
    background: "#eef2eb",
    padding: 2,
    cursor: "pointer",
    aspectRatio: "1 / 1",
  };
}

const imageOptionImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  borderRadius: 10,
};

function imageOptionBadgeStyle(selected: boolean): CSSProperties {
  return {
    position: "absolute",
    right: 6,
    bottom: 6,
    padding: "3px 7px",
    borderRadius: 999,
    background: selected ? "#52784c" : "rgba(255,255,255,0.88)",
    color: selected ? "#fff" : "#4f5e4b",
    fontSize: 11,
    fontWeight: 800,
  };
}

function imageCoverButtonStyle(
  isCover: boolean,
  enabled: boolean
): CSSProperties {
  return {
    minHeight: 32,
    padding: "5px 8px",
    border: isCover ? "1px solid #6f9867" : "1px solid #dfe6dc",
    borderRadius: 9,
    background: isCover ? "#edf5e9" : "#fff",
    color: isCover ? "#42653e" : "#6f7b6c",
    fontSize: 11,
    fontWeight: 800,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.45,
  };
}

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

const errorPanelStyle: CSSProperties = {
  ...panelStyle,
  color: "#a74b47",
  background: "#fff8f7",
  borderColor: "#efd8d5",
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
