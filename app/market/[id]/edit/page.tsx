"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getMarketItemCategoryOptions,
  getMarketPostTypeOptions,
  type MarketItemCategory,
  type MarketPostRow,
  type MarketPostType,
} from "@/lib/market-types";
import type { SupabaseUser } from "@/lib/domain-types";
import { attachMediaDisplayUrls } from "@/lib/media-urls";
import { buildLoginHref, getCurrentInternalPath } from "@/lib/auth-return";
import UiIcon from "@/components/ui/UiIcon";
import {
  requestMarketMediaDeletion,
  rollbackReservedMarketImage,
  setMarketPostCover,
  settleReservedMarketImage,
  uploadReservedMarketImage,
  type ReservedMarketImage,
} from "@/lib/market-media-storage";
import {
  isStorageUploadMaintenance,
} from "@/lib/storage-upload-maintenance";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { extractExternalHttpUrl } from "@/lib/external-url";

type ArchiveOption = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

type MarketMediaRow = {
  id: string;
  market_post_id: string;
  user_id: string;
  url: string | null;
  path: string | null;
  thumb_url?: string | null;
  thumb_path?: string | null;
  display_url?: string | null;
  display_thumb_url?: string | null;
  source_media_id: string | null;
  source_record_id: string | null;
  upload_reservation_id?: string | null;
  sort_order: number | null;
  created_at: string | null;
};

export default function EditMarketPostPage() {
  const { language, t } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [item, setItem] = useState<MarketPostRow | null>(null);
  const [archives, setArchives] = useState<ArchiveOption[]>([]);
  const [marketMedia, setMarketMedia] = useState<MarketMediaRow[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [postType, setPostType] = useState<MarketPostType>("offer");
  const [itemCategory, setItemCategory] =
    useState<MarketItemCategory>("seedling");
  const [archiveId, setArchiveId] = useState("");
  const [locationText, setLocationText] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  const [uploading, setUploading] = useState(false);
  const [workingMediaId, setWorkingMediaId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [notOwner, setNotOwner] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push(buildLoginHref(getCurrentInternalPath()));
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from("market_posts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("load market post for edit error:", error);
        setItem(null);
        setLoading(false);
        return;
      }

      const row = (data || null) as MarketPostRow | null;

      if (!row) {
        setItem(null);
        setLoading(false);
        return;
      }

      if (row.user_id !== user.id) {
        setNotOwner(true);
        setItem(row);
        setLoading(false);
        return;
      }

      setItem(row);
      setTitle(row.title || "");
      setDescription(row.description || "");
      setPostType(row.post_type);
      setItemCategory(row.item_category);
      setArchiveId(row.archive_id || "");
      setLocationText(row.location_text || "");
      setExternalUrl(row.external_url || "");

      const [archiveResult, mediaResult] = await Promise.all([
        supabase
          .from("archives")
          .select("id, title, system_name, species_name_snapshot")
          .eq("user_id", user.id)
          .order("last_record_time", { ascending: false }),

        supabase
          .from("market_media")
          .select("*")
          .eq("market_post_id", row.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (archiveResult.error) {
        console.error("load archives for market edit error:", archiveResult.error);
      }

      if (mediaResult.error) {
        console.error("load market media for edit error:", mediaResult.error);
      }

      setArchives((archiveResult.data || []) as ArchiveOption[]);
      setMarketMedia(
        await attachMediaDisplayUrls(
          supabase,
          (mediaResult.data || []) as MarketMediaRow[]
        )
      );
      setLoading(false);
    }

    if (id) {
      void init();
    }
  }, [id, router]);

  const selectedArchive = useMemo(() => {
    return archives.find((archive) => archive.id === archiveId) || null;
  }, [archives, archiveId]);

  async function reloadMarketMedia(postId: string) {
    const { data, error } = await supabase
      .from("market_media")
      .select("*")
      .eq("market_post_id", postId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("reload market media error:", error);
      return;
    }

    setMarketMedia(
      await attachMediaDisplayUrls(supabase, (data || []) as MarketMediaRow[])
    );
  }

  async function reloadMarketPost(postId: string) {
    const { data, error } = await supabase
      .from("market_posts")
      .select("*")
      .eq("id", postId)
      .maybeSingle();
    if (error) {
      console.error("reload market post error:", error);
      return;
    }
    if (data) setItem(data as MarketPostRow);
  }

  async function handleSubmit() {
    if (!user || !item || saving || notOwner) return;

    const safeTitle = title.trim();
    const safeDescription = description.trim();
    const safeLocation = locationText.trim();
    const safeExternalUrl = extractExternalHttpUrl(externalUrl);

    if (externalUrl.trim() && !safeExternalUrl) {
      setErrorMsg(t.market.invalid_external_link);
      return;
    }

    if (!safeTitle) {
      setErrorMsg(t.market.title_required);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase
      .from("market_posts")
      .update({
        archive_id: archiveId || null,
        title: safeTitle,
        description: safeDescription || null,
        post_type: postType,
        item_category: itemCategory,
        location_text: safeLocation || null,
        external_url: safeExternalUrl || null,
        external_label: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", user.id);

    setSaving(false);

    if (error) {
      console.error("update market post error:", error);
      setErrorMsg(t.market.save_failed);
      return;
    }

    router.push(`/market/${item.id}`);
  }

  async function handleUploadImages(event: ChangeEvent<HTMLInputElement>) {
    if (!user || !item || uploading) return;

    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length !== files.length) {
      setErrorMsg(t.market.image_only);
      return;
    }

    const tooLarge = imageFiles.find((file) => file.size > 6 * 1024 * 1024);
    if (tooLarge) {
      setErrorMsg(t.market.single_image_size_limit);
      return;
    }

    if (await isStorageUploadMaintenance()) {
      setErrorMsg(t.market.image_upload_maintenance);
      return;
    }

    setUploading(true);
    setErrorMsg("");

    const currentMaxSort = marketMedia.reduce((max, media) => {
      return Math.max(max, Number(media.sort_order || 0));
    }, -1);

    let firstCommitted: MarketMediaRow | null = null;
    let failureCount = 0;
    let lastError = "";

    for (let index = 0; index < imageFiles.length; index += 1) {
      const marketMediaId = crypto.randomUUID();
      let uploaded: ReservedMarketImage | null = null;
      let committed = false;
      let cleanupAllowed = true;

      try {
        uploaded = await uploadReservedMarketImage({
          userId: user.id,
          postId: item.id,
          targetType: "market_media",
          targetId: marketMediaId,
          file: imageFiles[index],
        });

        const insertResult = await supabase
          .from("market_media")
          .insert({
            id: marketMediaId,
            market_post_id: item.id,
            user_id: user.id,
            url: null,
            path: uploaded.path,
            thumb_url: null,
            thumb_path: uploaded.thumbPath,
            source_media_id: null,
            source_record_id: null,
            sort_order: currentMaxSort + index + 1,
            ...(uploaded.reservation.reservation_id
              ? { upload_reservation_id: uploaded.reservation.reservation_id }
              : {}),
          })
          .select("*")
          .single();

        let committedRow = insertResult.data as MarketMediaRow | null;
        if (insertResult.error || !committedRow) {
          const reconciliation = await supabase
            .from("market_media")
            .select("*")
            .eq("id", marketMediaId)
            .maybeSingle();
          if (reconciliation.error) {
            cleanupAllowed = false;
            throw new Error(t.market.image_state_pending);
          }
          committedRow = reconciliation.data as MarketMediaRow | null;
          if (!committedRow) throw new Error(t.market.image_save_failed);
        }

        committed = true;
        await settleReservedMarketImage(uploaded);
        firstCommitted ||= committedRow;
      } catch (error) {
        if (uploaded && !committed && cleanupAllowed) {
          await rollbackReservedMarketImage(uploaded);
        }
        failureCount += 1;
        lastError = error instanceof Error ? error.message : t.market.image_upload_failed;
      }
    }

    await reloadMarketMedia(item.id);
    if (!item.cover_image_path && !item.cover_image_url && firstCommitted) {
      await setCoverFromValue({
        path: firstCommitted.path,
        thumbPath: firstCommitted.thumb_path || null,
      });
    }

    if (failureCount > 0) {
      setErrorMsg(
        failureCount === imageFiles.length
          ? lastError
          : `${t.market.partial_image_success_prefix} ${imageFiles.length - failureCount} ${t.market.partial_image_success_middle}${failureCount} ${t.market.partial_image_success_suffix}`,
      );
    }
    setUploading(false);
  }

  async function setCoverFromValue(params: {
    path: string | null;
    thumbPath?: string | null;
  }) {
    if (!user || !item) return;

    const result = await setMarketPostCover({
      postId: item.id,
      path: params.path,
      thumbPath: params.thumbPath || null,
    });

    if (!result.ok) {
      setErrorMsg(t.market.set_cover_failed);
      return;
    }

    setItem({
      ...item,
      cover_image_url: null,
      cover_image_path: params.path,
      cover_thumb_url: null,
      cover_thumb_path: params.thumbPath || null,
    });
  }

  async function handleSetCover(media: MarketMediaRow) {
    if (!item || !user || workingMediaId) return;

    setWorkingMediaId(media.id);
    await setCoverFromValue({
      path: media.path,
      thumbPath: media.thumb_path || null,
    });
    setWorkingMediaId(null);
  }

  async function handleDeleteMedia(media: MarketMediaRow) {
    if (!item || !user || workingMediaId) return;

    const ok = window.confirm(t.market.delete_image_confirm);
    if (!ok) return;

    setWorkingMediaId(media.id);
    setErrorMsg("");

    const result = await requestMarketMediaDeletion(media.id);
    if (!result.ok) {
      setErrorMsg(t.market.delete_image_failed);
      setWorkingMediaId(null);
      return;
    }
    await Promise.all([reloadMarketMedia(item.id), reloadMarketPost(item.id)]);
    setWorkingMediaId(null);
  }

  if (loading) {
    return <main style={pageStyle}>{t.market.loading}</main>;
  }

  if (!item) {
    return (
      <main style={pageStyle}>
        <div style={shellStyle}>
          <Link href="/market" className="mobile-app-desktop-only" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> {t.market.back_to_market}
          </Link>
          <section style={emptyStyle}>{t.market.not_found}</section>
        </div>
      </main>
    );
  }

  if (notOwner) {
    return (
      <main style={pageStyle}>
        <div style={shellStyle}>
          <Link href={`/market/${item.id}`} className="mobile-app-desktop-only" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> {t.market.back_to_detail}
          </Link>
          <section style={emptyStyle}>{t.market.owner_only_edit}</section>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <Link href={`/market/${item.id}`} className="mobile-app-desktop-only" style={backLinkStyle}>
          <UiIcon name="arrow-left" size={15} /> {t.market.back_to_detail}
        </Link>

        <section style={panelStyle}>
          <h1 className="mobile-app-desktop-only" style={titleStyle}>{t.market.edit_title}</h1>

          {errorMsg ? <div style={errorStyle}>{errorMsg}</div> : null}

          <section style={imageManagerSectionStyle}>
            <div style={imageManagerHeaderStyle}>
              <div style={sectionTitleStyle}>{t.market.market_images}</div>

              <label style={uploadButtonStyle}>
                {uploading ? t.market.uploading : t.market.upload_or_camera}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadImages}
                  style={{ display: "none" }}
                  disabled={uploading}
                />
              </label>
            </div>

            {marketMedia.length > 0 ? (
              <div style={mediaManageGridStyle}>
                {marketMedia.map((media) => {
                  const isCover = item.cover_image_path
                    ? item.cover_image_path === media.path
                    : item.cover_image_url === media.url;
                  const isWorking = workingMediaId === media.id;
                  const mediaImageUrl = media.display_url || null;
                  const mediaThumbUrl =
                    media.display_thumb_url || mediaImageUrl;

                  return (
                    <article key={media.id} style={mediaManageCardStyle}>
                      <div style={mediaImageWrapStyle}>
                        {mediaThumbUrl ? (
                          <img
                            src={mediaThumbUrl}
                            alt=""
                            style={mediaManageImageStyle}
                            loading="lazy"
                          />
                        ) : (
                          <div
                            aria-label={t.market.image_unavailable}
                            style={{
                              ...mediaManageImageStyle,
                              display: "grid",
                              placeItems: "center",
                              color: "#879486",
                              fontSize: 12,
                            }}
                          >
                            {t.market.image_unavailable}
                          </div>
                        )}
                        {isCover ? (
                          <span style={coverBadgeStyle}>{t.market.cover}</span>
                        ) : null}
                        {media.path && !media.source_media_id ? (
                          <span style={uploadedBadgeStyle}>{t.market.uploaded_image}</span>
                        ) : (
                          <span style={sourceBadgeStyle}>{t.market.source_image}</span>
                        )}
                      </div>

                      <div style={mediaActionRowStyle}>
                        <button
                          type="button"
                          onClick={() => handleSetCover(media)}
                          disabled={isCover || isWorking}
                          style={smallButtonStyle(isCover)}
                        >
                          {isCover ? t.market.current_cover : t.market.set_as_cover}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteMedia(media)}
                          disabled={isWorking}
                          style={smallDangerButtonStyle}
                        >
                          {isWorking ? t.market.processing : t.market.delete}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div style={emptyImageStyle}>
                {t.market.no_market_images}
              </div>
            )}
          </section>

          <div style={formStyle}>
            <div>
              <label style={labelStyle}>{t.market.type}</label>
              <select
                value={postType}
                onChange={(event) =>
                  setPostType(event.target.value as MarketPostType)
                }
                style={inputStyle}
              >
                {getMarketPostTypeOptions(language).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>{t.market.category}</label>
              <select
                value={itemCategory}
                onChange={(event) =>
                  setItemCategory(event.target.value as MarketItemCategory)
                }
                style={inputStyle}
              >
                {getMarketItemCategoryOptions(language).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>{t.market.title_label}</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                style={inputStyle}
                placeholder={t.market.title_placeholder}
              />
            </div>

            <div>
              <label style={labelStyle}>{t.market.optional_archive}</label>
              <select
                value={archiveId}
                onChange={(event) => setArchiveId(event.target.value)}
                style={inputStyle}
              >
                <option value="">{t.market.no_archive}</option>
                {archives.map((archive) => {
                  const systemName =
                    archive.system_name || archive.species_name_snapshot || "";

                  return (
                    <option key={archive.id} value={archive.id}>
                      {archive.title || t.market.unnamed_project}
                      {systemName ? ` · ${systemName}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedArchive ? (
              <div style={archiveHintStyle}>
                {t.market.linked_archive}{selectedArchive.title || t.market.unnamed_project}
              </div>
            ) : null}

            <div>
              <label style={labelStyle}>{t.market.transaction_area}</label>
              <input
                value={locationText}
                onChange={(event) => setLocationText(event.target.value)}
                style={inputStyle}
                placeholder={t.market.transaction_area_placeholder}
              />
            </div>

            <div>
              <label style={labelStyle}>{t.market.optional_external_link}</label>
              <input
                value={externalUrl}
                onChange={(event) => setExternalUrl(event.target.value)}
                style={inputStyle}
                placeholder={t.market.external_link_placeholder}
              />
              <div style={coverHintStyle}>
                {t.market.external_link_hint}
              </div>
            </div>

            <div>
              <label style={labelStyle}>{t.market.description}</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                style={textareaStyle}
                placeholder={t.market.description_placeholder}
              />
            </div>
          </div>

          <div style={noticeStyle}>
            {t.market.disclaimer}
          </div>

          <div style={buttonRowStyle}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? t.market.saving : t.market.save_changes}
            </button>

            <Link href={`/market/${item.id}`} style={secondaryButtonStyle}>
              {t.market.cancel}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f6f8f3",
  padding: "18px 12px 36px",
};

const shellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 820,
  margin: "0 auto",
};

const backLinkStyle: CSSProperties = {
  display: "inline-block",
  color: "#587050",
  textDecoration: "none",
  fontSize: 14,
  marginBottom: 10,
};

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 18,
  padding: 16,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 26,
  color: "#1f2a1f",
};

const sectionTitleStyle: CSSProperties = {
  color: "#1f2a1f",
  fontSize: 17,
  fontWeight: 700,
};

const imageManagerSectionStyle: CSSProperties = {
  marginTop: 16,
  background: "#fafcf8",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
};

const imageManagerHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const uploadButtonStyle: CSSProperties = {
  display: "inline-block",
  cursor: "pointer",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "8px 13px",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const mediaManageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
  gap: 10,
};

const mediaManageCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #dfe8da",
  borderRadius: 14,
  padding: 8,
};

const mediaImageWrapStyle: CSSProperties = {
  position: "relative",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #e4ece0",
  background: "#f6f8f3",
};

const mediaManageImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  display: "block",
};

const coverBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 700,
};

const sourceBadgeStyle: CSSProperties = {
  position: "absolute",
  left: 6,
  bottom: 6,
  background: "rgba(255,255,255,0.92)",
  color: "#6f7b69",
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 700,
};

const uploadedBadgeStyle: CSSProperties = {
  ...sourceBadgeStyle,
  color: "#7a6636",
};

const mediaActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 8,
};

function smallButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "1px solid #d7e2d2",
    background: disabled ? "#edf4e8" : "#fff",
    color: disabled ? "#4f7b45" : "#40583a",
    borderRadius: 999,
    padding: "5px 9px",
    cursor: disabled ? "default" : "pointer",
    fontSize: 12,
    fontWeight: 700,
  };
}

const smallDangerButtonStyle: CSSProperties = {
  border: "1px solid #ffd6cf",
  background: "#fff",
  color: "#c23a2b",
  borderRadius: 999,
  padding: "5px 9px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

const emptyImageStyle: CSSProperties = {
  color: "#7b8676",
  fontSize: 13,
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 12,
  padding: 12,
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 16,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  color: "#5e6959",
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d8e3d3",
  borderRadius: 12,
  padding: "10px 11px",
  fontSize: 14,
  outline: "none",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  resize: "vertical",
  lineHeight: 1.6,
};

const archiveHintStyle: CSSProperties = {
  background: "#f7fbf2",
  border: "1px solid #dfe8da",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#5f6a5b",
  fontSize: 13,
};

const coverHintStyle: CSSProperties = {
  marginTop: 6,
  color: "#7b8575",
  fontSize: 12,
  lineHeight: 1.5,
};

const noticeStyle: CSSProperties = {
  marginTop: 14,
  background: "#fffaf0",
  border: "1px solid #f1e3c7",
  borderRadius: 12,
  padding: "10px 12px",
  color: "#7a6636",
  fontSize: 13,
  lineHeight: 1.7,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 16px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const secondaryButtonStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d8e3d3",
  color: "#40583a",
  borderRadius: 12,
  padding: "9px 15px",
  fontSize: 14,
  fontWeight: 700,
};

const errorStyle: CSSProperties = {
  marginTop: 12,
  background: "#fff2f0",
  border: "1px solid #ffd6cf",
  color: "#c23a2b",
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 14,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};
