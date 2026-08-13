"use client";

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
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
  const [externalLabel, setExternalLabel] = useState("");

  const [sourceRecordId, setSourceRecordId] = useState("");
  const [sourceRecordHint, setSourceRecordHint] = useState("");
  const [sourceMediaOptions, setSourceMediaOptions] = useState<
    SourceMediaOption[]
  >([]);
  const [selectedSourceMediaIds, setSelectedSourceMediaIds] = useState<string[]>(
    []
  );

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");

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
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

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

  function handleCoverFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setCoverFile(null);
      setCoverPreviewUrl("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMsg(t.market.image_file_required);
      setCoverFile(null);
      setCoverPreviewUrl("");
      return;
    }

    if (file.size > 6 * 1024 * 1024) {
      setErrorMsg(t.market.image_size_limit);
      setCoverFile(null);
      setCoverPreviewUrl("");
      return;
    }

    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }

    setErrorMsg("");
    setCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
  }

  function clearCoverFile() {
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl);
    }

    setCoverFile(null);
    setCoverPreviewUrl("");
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
    const safeExternalUrl = normalizeExternalUrl(externalUrl);
    const safeExternalLabel = externalLabel.trim();

    if (externalUrl.trim() && !safeExternalUrl) {
      setErrorMsg(t.market.invalid_external_link);
      return;
    }

    if (!safeTitle) {
      setErrorMsg(t.market.title_required);
      return;
    }

    if (!isFromSourceRecord && coverFile && (await isStorageUploadMaintenance())) {
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
        external_label: safeExternalLabel || null,
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
        sort_order: index,
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

      if (firstSourceMedia) {
        const coverResult = await setMarketPostCover({
          postId,
          path: getMediaObjectPath(firstSourceMedia),
          thumbPath: getMediaThumbObjectPath(firstSourceMedia),
        });
        if (!coverResult.ok) {
          await requestMarketPostDeletion(postId);
          setSaving(false);
          setErrorMsg(t.market.save_source_cover_failed);
          return;
        }
      }
    }

    if (!isFromSourceRecord && coverFile) {
      let cover: ReservedMarketImage | null = null;
      let rollbackAttempted = false;
      try {
        cover = await uploadReservedMarketImage({
          userId: user.id,
          postId,
          targetType: "market_cover",
          targetId: postId,
          file: coverFile,
        });

        const coverResult = await setMarketPostCover({
          postId,
          path: cover.path,
          thumbPath: cover.thumbPath,
          reservationId: cover.reservation.reservation_id,
        });

        if (!coverResult.ok) {
          const reconciliation = await supabase
            .from("market_posts")
            .select("cover_image_path, cover_upload_reservation_id")
            .eq("id", postId)
            .maybeSingle();
          const committed =
            !reconciliation.error &&
            reconciliation.data?.cover_image_path === cover.path &&
            reconciliation.data?.cover_upload_reservation_id ===
              cover.reservation.reservation_id;
          if (!committed) {
            rollbackAttempted = true;
            await rollbackReservedMarketImage(cover);
            await requestMarketPostDeletion(postId);
            throw new Error(t.market.cover_save_failed);
          }
        }

        await settleReservedMarketImage(cover);
      } catch (uploadError) {
        if (cover && !rollbackAttempted) {
          await rollbackReservedMarketImage(cover);
        }
        await requestMarketPostDeletion(postId);
        setSaving(false);
        setErrorMsg(
          (await isStorageUploadMaintenance())
            ? t.market.upload_maintenance
            : uploadError instanceof Error
              ? uploadError.message
              : t.market.cover_upload_failed,
        );
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
        <Link href="/market" style={backLinkStyle}>
          <UiIcon name="arrow-left" size={15} /> {t.market.back_to_market}
        </Link>

        <section style={panelStyle}>
          <h1 style={titleStyle}>{t.market.new_title}</h1>
          <p style={subtitleStyle}>
            {t.market.new_description}
          </p>

          {errorMsg ? <div style={errorStyle}>{errorMsg}</div> : null}

          <div style={quotaInfoStyle(marketBlocked)}>
            <strong>{getMarketPostQuotaLabel(membership, language)}</strong>
            <span>{getMarketPostQuotaHint(membership, language)}</span>
            {marketBlocked ? (
              <Link href="/membership" style={quotaLinkStyle}>
                {t.market.learn_membership}
              </Link>
            ) : null}
          </div>

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

            {isFromSourceRecord ? (
              <div>
                <label style={labelStyle}>{t.market.source_images}</label>

                {sourceMediaOptions.length > 0 ? (
                  <>
                    <div style={sourceMediaGridStyle}>
                      {sourceMediaOptions.map((media) => {
                        const active = selectedSourceMediaIds.includes(media.id);
                        const selectedIndex = selectedSourceMediaIds.indexOf(
                          media.id
                        );

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
                                {selectedIndex === 0
                                  ? t.market.cover
                                  : `${t.market.selected_prefix} ${selectedIndex + 1}`}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    <div style={coverHintStyle}>
                      {t.market.selected_prefix} {selectedSourceMediaIds.length} {t.market.selected_suffix}
                    </div>
                  </>
                ) : (
                  <div style={coverHintStyle}>
                    {t.market.source_no_images}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label style={labelStyle}>{t.market.optional_cover}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverFileChange}
                  style={fileInputStyle}
                />

                {coverPreviewUrl ? (
                  <div style={coverPreviewWrapStyle}>
                    <img
                      src={coverPreviewUrl}
                      alt={t.market.cover_preview}
                      style={coverPreviewStyle}
                    />
                    <button
                      type="button"
                      onClick={clearCoverFile}
                      style={removeImageButtonStyle}
                    >
                      {t.market.remove_cover}
                    </button>
                  </div>
                ) : (
                  <div style={coverHintStyle}>
                    {t.market.cover_hint}
                  </div>
                )}
              </div>
            )}

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
              <label style={labelStyle}>{t.market.optional_external_label}</label>
              <input
                value={externalLabel}
                onChange={(event) => setExternalLabel(event.target.value)}
                style={inputStyle}
                placeholder={t.market.external_label_placeholder}
              />
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

function normalizeExternalUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
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

const fileInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d8e3d3",
  borderRadius: 12,
  padding: "9px 10px",
  fontSize: 14,
  background: "#fff",
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

const coverPreviewWrapStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gap: 8,
};

const coverPreviewStyle: CSSProperties = {
  width: "100%",
  maxHeight: 260,
  objectFit: "cover",
  borderRadius: 14,
  border: "1px solid #e4ece0",
  background: "#f6f8f3",
};

const removeImageButtonStyle: CSSProperties = {
  width: "fit-content",
  border: "1px solid #eadbd7",
  background: "#fff",
  color: "#b74636",
  borderRadius: 999,
  padding: "6px 11px",
  cursor: "pointer",
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
