"use client";

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatPreciseDateTime } from "@/lib/date-time";
import { buildLoginHref } from "@/lib/auth-return";
import {
  getMarketItemCategoryOptions,
  getMarketPostTypeOptions,
  type MarketItemCategory,
  type MarketPostType,
} from "@/lib/market-types";
import type { SupabaseUser } from "@/lib/domain-types";
import UiIcon from "@/components/ui/UiIcon";
import {
  requestMarketPostDeletion,
  rollbackReservedMarketImage,
  setMarketPostCover,
  settleReservedMarketImage,
  uploadReservedMarketImage,
  type ReservedMarketImage,
} from "@/lib/market-media-storage";
import {
  canCreateMembershipMarketPost,
  getCreateMarketPostBlockedText,
  getMarketPostQuotaHint,
  getMarketPostQuotaLabel,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import {
  attachMediaDisplayUrls,
  getMediaObjectPath,
  getMediaThumbObjectPath,
} from "@/lib/media-urls";
import {
  isStorageUploadMaintenance,
} from "@/lib/storage-upload-maintenance";
import { getStoredLanguage, getTranslations } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { extractExternalHttpUrl } from "@/lib/external-url";

type ArchiveOption = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

type ProfileLocation = {
  country_name: string | null;
  region_name: string | null;
  city_name: string | null;
  location: string | null;
};

type SourceRecordBrief = {
  id: string;
  archive_id: string | null;
  user_id: string | null;
  note: string | null;
  photo_time: string | null;
};

type SourceMediaOption = {
  id: string;
  record_id: string | null;
  url: string | null;
  storage_path?: string | null;
  thumb_url?: string | null;
  thumb_path?: string | null;
  display_url?: string | null;
  display_thumb_url?: string | null;
  created_at: string | null;
};

type PendingMarketImage = {
  id: string;
  file: File;
  previewUrl: string;
};
export default function NewMarketPostPage() {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<main style={pageStyle}>{t.market.loading}</main>}>
      <NewMarketPostPageContent />
    </Suspense>
  );
}
function NewMarketPostPageContent() {
  const { language, t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const sourceArchiveIdParam = searchParams.get("archiveId") || "";
  const sourceRecordIdParam = searchParams.get("recordId") || "";

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [archives, setArchives] = useState<ArchiveOption[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [postType, setPostType] = useState<MarketPostType>("offer");
  const [itemCategory, setItemCategory] =
    useState<MarketItemCategory>("seedling");
  const [archiveId, setArchiveId] = useState("");
  const [locationText, setLocationText] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  const [sourceRecordId, setSourceRecordId] = useState("");
  const [sourceRecordHint, setSourceRecordHint] = useState("");
  const [sourceMediaOptions, setSourceMediaOptions] = useState<
    SourceMediaOption[]
  >([]);
  const [selectedSourceMediaIds, setSelectedSourceMediaIds] = useState<string[]>(
    []
  );

  const [pendingImages, setPendingImages] = useState<PendingMarketImage[]>([]);
  const pendingImagesRef = useRef<PendingMarketImage[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [membership, setMembership] = useState<MyMembership | null>(null);

  const isFromSourceRecord = Boolean(sourceRecordId);
  const marketBlocked = !canCreateMembershipMarketPost(membership);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push(buildLoginHref("/market/new"));
        return;
      }

      setUser(user);

      const [profileResult, archivesResult, membershipResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("country_name, region_name, city_name, location")
          .eq("id", user.id)
          .maybeSingle(),

        supabase
          .from("archives")
          .select("id, title, system_name, species_name_snapshot")
          .eq("user_id", user.id)
          .order("last_record_time", { ascending: false }),

        supabase.rpc("get_my_membership"),
      ]);

      const profile = (profileResult.data || null) as ProfileLocation | null;
      const defaultLocation = buildLocationText(profile);
      setLocationText(defaultLocation);

      const archiveRows = (archivesResult.data || []) as ArchiveOption[];
      setArchives(archiveRows);

      if (membershipResult.error) {
        console.error("load membership error:", membershipResult.error);
        setMembership(null);
      } else {
        setMembership(normalizeMembershipRpcResult(membershipResult.data));
      }

      if (sourceArchiveIdParam) {
        setArchiveId(sourceArchiveIdParam);
      }

      if (sourceRecordIdParam) {
        const { data: recordData, error: recordError } = await supabase
          .from("records")
          .select("id, archive_id, user_id, note, photo_time")
          .eq("id", sourceRecordIdParam)
          .eq("user_id", user.id)
          .maybeSingle();

        if (recordError) {
          console.error("load source record error:", recordError);
        }

        const sourceRecord = (recordData || null) as SourceRecordBrief | null;

        if (sourceRecord) {
          const nextArchiveId = sourceRecord.archive_id || sourceArchiveIdParam;
          const sourceArchive = archiveRows.find(
            (item) => item.id === nextArchiveId
          );

          const initialT = getTranslations(getStoredLanguage());
          const archiveName =
            sourceArchive?.title ||
            sourceArchive?.system_name ||
            sourceArchive?.species_name_snapshot ||
            initialT.market.loading_source;

          setSourceRecordId(sourceRecord.id);
          setArchiveId(nextArchiveId || "");

          setTitle(`${archiveName}${initialT.market.source_title_suffix}`);

          if (sourceRecord.note) {
            setDescription(sourceRecord.note);
          }

          setSourceRecordHint(
            sourceRecord.photo_time
              ? `${archiveName} · ${formatSourceRecordTime(
                  sourceRecord.photo_time
                )}`
              : archiveName
          );

          const { data: mediaData, error: mediaError } = await supabase
            .from("media")
            .select("id, record_id, url, storage_path, thumb_url, thumb_path, created_at")
            .eq("record_id", sourceRecord.id)
            .eq("user_id", user.id)
            .eq("type", "image")
            .order("created_at", { ascending: true });

          if (mediaError) {
            console.error("load source record media error:", mediaError);
            setSourceMediaOptions([]);
          } else {
            const displayMedia = await attachMediaDisplayUrls(
              supabase,
              (mediaData || []) as SourceMediaOption[]
            );
            setSourceMediaOptions(
              displayMedia.filter(
                (media) => media.display_thumb_url || media.display_url
              )
            );
          }
        }
      }

      setLoading(false);
    }

    void init();
  }, [router, sourceArchiveIdParam, sourceRecordIdParam]);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => () => {
    pendingImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  const selectedArchive = useMemo(() => {
    return archives.find((item) => item.id === archiveId) || null;
  }, [archives, archiveId]);

  const selectedSourceMediaRows = useMemo(() => {
    return selectedSourceMediaIds
      .map((id) => sourceMediaOptions.find((item) => item.id === id) || null)
      .filter(Boolean) as SourceMediaOption[];
  }, [selectedSourceMediaIds, sourceMediaOptions]);

  function toggleSourceMedia(mediaId: string) {
    setSelectedSourceMediaIds((prev) => {
      if (prev.includes(mediaId)) {
        return prev.filter((id) => id !== mediaId);
      }

      return [...prev, mediaId];
    });
  }

  function handleImageFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    if (files.some((file) => !file.type.startsWith("image/"))) {
      setErrorMsg(t.market.image_only);
      return;
    }
    if (files.some((file) => file.size > 6 * 1024 * 1024)) {
      setErrorMsg(t.market.single_image_size_limit);
      return;
    }

    setErrorMsg("");
    setPendingImages((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function removePendingImage(id: string) {
    setPendingImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }

  async function refreshMembership() {
    const { data, error } = await supabase.rpc("get_my_membership");

    if (error) {
      console.error("refresh membership error:", error);
      return membership;
    }

    const nextMembership = normalizeMembershipRpcResult(data);
    setMembership(nextMembership);
    return nextMembership;
  }

  async function handleSubmit() {
    if (!user || saving) return;

    const latestMembership = await refreshMembership();

    if (!canCreateMembershipMarketPost(latestMembership)) {
      setErrorMsg(getCreateMarketPostBlockedText(latestMembership, language));
      return;
    }

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

    if (pendingImages.length > 0 && (await isStorageUploadMaintenance())) {
      setErrorMsg(t.market.upload_maintenance);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const firstSourceMedia = selectedSourceMediaRows[0] || null;

    const { data, error } = await supabase
      .from("market_posts")
      .insert({
        user_id: user.id,
        archive_id: archiveId || null,
        source_record_id: sourceRecordId || null,
        title: safeTitle,
        description: safeDescription || null,
        post_type: postType,
        item_category: itemCategory,
        location_text: safeLocation || null,
        external_url: safeExternalUrl || null,
        external_label: null,
        cover_image_url: null,
        cover_image_path: null,
        cover_thumb_url: null,
        cover_thumb_path: null,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("create market post error:", error);
      setSaving(false);
      setErrorMsg(t.market.publish_failed);
      return;
    }

    const postId = data.id as string;

    if (selectedSourceMediaRows.length > 0) {
      const mediaInsertRows = selectedSourceMediaRows.map((item, index) => ({
        market_post_id: postId,
        user_id: user.id,
        url: null,
        path: getMediaObjectPath(item),
        thumb_url: null,
        thumb_path: getMediaThumbObjectPath(item),
        source_media_id: item.id,
        source_record_id: sourceRecordId || null,
        sort_order: pendingImages.length + index,
      }));

      const { error: marketMediaError } = await supabase
        .from("market_media")
        .insert(mediaInsertRows);

      if (marketMediaError) {
        console.error("create market media error:", marketMediaError);
        await requestMarketPostDeletion(postId);

        setSaving(false);
        setErrorMsg(t.market.save_source_images_failed);
        return;
      }

    }

    let firstUploadedImage: ReservedMarketImage | null = null;
    for (let index = 0; index < pendingImages.length; index += 1) {
      const mediaId = crypto.randomUUID();
      let uploaded: ReservedMarketImage | null = null;
      let committed = false;
      try {
        uploaded = await uploadReservedMarketImage({
          userId: user.id,
          postId,
          targetType: "market_media",
          targetId: mediaId,
          file: pendingImages[index].file,
        });

        const insertResult = await supabase
          .from("market_media")
          .insert({
            id: mediaId,
            market_post_id: postId,
            user_id: user.id,
            url: null,
            path: uploaded.path,
            thumb_url: null,
            thumb_path: uploaded.thumbPath,
            source_media_id: null,
            source_record_id: null,
            sort_order: index,
            ...(uploaded.reservation.reservation_id
              ? { upload_reservation_id: uploaded.reservation.reservation_id }
              : {}),
          })
          .select("id")
          .single();

        if (insertResult.error || !insertResult.data?.id) {
          const reconciliation = await supabase
            .from("market_media")
            .select("id, path, upload_reservation_id")
            .eq("id", mediaId)
            .maybeSingle();
          const reconciliationCommitted =
            !reconciliation.error &&
            reconciliation.data?.path === uploaded.path &&
            reconciliation.data?.upload_reservation_id === uploaded.reservation.reservation_id;
          if (!reconciliationCommitted) throw new Error(t.market.image_save_failed);
        }

        committed = true;
        await settleReservedMarketImage(uploaded);
        firstUploadedImage ||= uploaded;
      } catch (uploadError) {
        if (uploaded && !committed) {
          await rollbackReservedMarketImage(uploaded);
        }
        await requestMarketPostDeletion(postId);
        setSaving(false);
        setErrorMsg(
          (await isStorageUploadMaintenance())
            ? t.market.upload_maintenance
            : uploadError instanceof Error
              ? uploadError.message
              : t.market.image_upload_failed,
        );
        return;
      }
    }

    const coverPath = firstUploadedImage?.path || getMediaObjectPath(firstSourceMedia);
    const coverThumbPath =
      firstUploadedImage?.thumbPath || getMediaThumbObjectPath(firstSourceMedia);
    if (coverPath) {
      const coverResult = await setMarketPostCover({
        postId,
        path: coverPath,
        thumbPath: coverThumbPath,
      });
      if (!coverResult.ok) {
        await requestMarketPostDeletion(postId);
        setSaving(false);
        setErrorMsg(t.market.save_source_cover_failed);
        return;
      }
    }

    setSaving(false);
    router.push(`/market/${postId}`);
  }

  if (loading) {
    return <main style={pageStyle}>{t.market.loading}</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <Link href="/market" className="mobile-app-desktop-only" style={backLinkStyle}>
          <UiIcon name="arrow-left" size={15} /> {t.market.back_to_market}
        </Link>

        <section style={panelStyle}>
          <h1 className="mobile-app-desktop-only" style={titleStyle}>{t.market.new_title}</h1>
          <p className="mobile-app-desktop-only" style={subtitleStyle}>
            {t.market.new_description}
          </p>

          {errorMsg ? <div style={errorStyle}>{errorMsg}</div> : null}

          <div style={quotaInfoStyle(marketBlocked)}>
            <strong>{getMarketPostQuotaLabel(membership, language)}</strong>
            <span className="mobile-app-desktop-only">{getMarketPostQuotaHint(membership, language)}</span>
            {marketBlocked ? (
              <Link href="/membership" style={quotaLinkStyle}>
                {t.market.learn_membership}
              </Link>
            ) : null}
          </div>

          <div style={formStyle}>
            <section style={imagePickerSectionStyle}>
              <div style={imagePickerHeaderStyle}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>{t.market.market_images}</label>
                <label style={imagePickerButtonStyle}>
                  {t.market.upload_or_camera}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageFilesChange}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              {pendingImages.length > 0 ? (
                <div style={sourceMediaGridStyle}>
                  {pendingImages.map((image, index) => (
                    <div key={image.id} style={pendingImageCardStyle}>
                      <img src={image.previewUrl} alt="" style={sourceMediaImageStyle} />
                      {index === 0 ? (
                        <span style={sourceMediaSelectedBadgeStyle}>{t.market.cover}</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removePendingImage(image.id)}
                        aria-label={t.market.remove_cover}
                        style={pendingImageRemoveStyle}
                      >
                        <UiIcon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {isFromSourceRecord ? (
                <div style={sourceImagePickerStyle}>
                  <div style={sourceImagePickerTitleStyle}>{t.market.source_images}</div>
                  {sourceMediaOptions.length > 0 ? (
                    <div style={sourceMediaGridStyle}>
                      {sourceMediaOptions.map((media) => {
                        const active = selectedSourceMediaIds.includes(media.id);
                        const selectedIndex = selectedSourceMediaIds.indexOf(media.id);
                        const isCover = pendingImages.length === 0 && selectedIndex === 0;
                        return (
                          <button
                            key={media.id}
                            type="button"
                            onClick={() => toggleSourceMedia(media.id)}
                            style={sourceMediaButtonStyle(active)}
                          >
                            <img
                              src={media.display_thumb_url || media.display_url || ""}
                              alt=""
                              style={sourceMediaImageStyle}
                              loading="lazy"
                            />
                            {active ? (
                              <span style={sourceMediaSelectedBadgeStyle}>
                                {isCover ? t.market.cover : `${t.market.selected_prefix} ${selectedIndex + 1}`}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={coverHintStyle}>{t.market.source_no_images}</div>
                  )}
                </div>
              ) : null}

              <div style={coverHintStyle}>
                {t.market.selected_prefix} {pendingImages.length + selectedSourceMediaIds.length} {t.market.selected_suffix}
              </div>
            </section>

            <div>
              <label style={labelStyle}>{t.market.type}</label>
              <select
                value={postType}
                onChange={(event) =>
                  setPostType(event.target.value as MarketPostType)
                }
                style={inputStyle}
              >
                {getMarketPostTypeOptions(language).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
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
                {getMarketItemCategoryOptions(language).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
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

            {sourceRecordHint ? (
              <div style={sourceRecordHintStyle}>
                {t.market.source_record}{sourceRecordHint}
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
              <div style={coverHintStyle}>
                {t.market.transaction_area_hint}
              </div>
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
              disabled={saving || marketBlocked}
              style={marketBlocked ? disabledPrimaryButtonStyle : primaryButtonStyle}
            >
              {saving ? t.market.publishing : t.market.publish}
            </button>

            <Link href="/market" style={secondaryButtonStyle}>
              {t.market.cancel}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatSourceRecordTime(value?: string | null) {
  return formatPreciseDateTime(value);
}

function buildLocationText(profile?: ProfileLocation | null) {
  if (!profile) return "";

  const parts = [
    profile.country_name,
    profile.region_name,
    profile.city_name,
  ].filter(Boolean);

  if (parts.length > 0) return parts.join(" · ");

  return profile.location || "";
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

const subtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#6f7b69",
  fontSize: 14,
  lineHeight: 1.7,
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

const imagePickerSectionStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  border: "1px solid #dfe8da",
  borderRadius: 16,
  background: "#fafcf8",
};

const imagePickerHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const imagePickerButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "7px 12px",
  background: "#4f7b45",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const sourceMediaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
  gap: 8,
};

function sourceMediaButtonStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    border: active ? "2px solid #4f7b45" : "1px solid #dfe8da",
    background: "#fff",
    borderRadius: 14,
    padding: 3,
    cursor: "pointer",
    overflow: "hidden",
  };
}

const sourceMediaImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  borderRadius: 10,
  display: "block",
};

const sourceMediaSelectedBadgeStyle: CSSProperties = {
  position: "absolute",
  right: 6,
  top: 6,
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 999,
  padding: "3px 7px",
  fontSize: 11,
  fontWeight: 700,
};

const coverHintStyle: CSSProperties = {
  marginTop: 7,
  color: "#8a9585",
  fontSize: 12,
  lineHeight: 1.6,
};

const pendingImageCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  padding: 3,
  border: "2px solid #dfe8da",
  borderRadius: 14,
  background: "#fff",
};

const pendingImageRemoveStyle: CSSProperties = {
  position: "absolute",
  left: 6,
  top: 6,
  width: 26,
  height: 26,
  display: "grid",
  placeItems: "center",
  border: 0,
  borderRadius: 999,
  background: "rgba(255,255,255,0.94)",
  color: "#9a493f",
  fontSize: 19,
  lineHeight: 1,
  cursor: "pointer",
};

const sourceImagePickerStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  paddingTop: 4,
};

const sourceImagePickerTitleStyle: CSSProperties = {
  color: "#64715f",
  fontSize: 13,
  fontWeight: 700,
};

const archiveHintStyle: CSSProperties = {
  background: "#f7fbf2",
  border: "1px solid #dfe8da",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#5f6a5b",
  fontSize: 13,
};

const sourceRecordHintStyle: CSSProperties = {
  background: "#fffaf0",
  border: "1px solid #f1e3c7",
  borderRadius: 12,
  padding: "9px 10px",
  color: "#7a6636",
  fontSize: 13,
  lineHeight: 1.6,
};


function quotaInfoStyle(blocked: boolean): CSSProperties {
  return {
    marginTop: 12,
    display: "grid",
    gap: 5,
    padding: "11px 12px",
    borderRadius: 14,
    border: blocked ? "1px solid #ead9b8" : "1px solid #dfe8da",
    background: blocked ? "#fff8ea" : "#f7fbf2",
    color: blocked ? "#7a5c24" : "#587050",
    fontSize: 13,
    lineHeight: 1.6,
  };
}

const quotaLinkStyle: CSSProperties = {
  width: "fit-content",
  color: "#4f7b45",
  textDecoration: "none",
  fontWeight: 700,
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



const disabledPrimaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#9aa398",
  cursor: "not-allowed",
};
