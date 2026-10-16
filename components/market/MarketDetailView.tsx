"use client";

import { useEffect, useState, type CSSProperties } from "react";
import InternalLink from "@/components/navigation/InternalLink";
import ReportLink from "@/components/support/ReportLink";
import MarketCommentsSection from "@/components/market/MarketCommentsSection";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { formatPreciseDateTime } from "@/lib/date-time";
import { getMarketItemCategoryLabel, getMarketPostTypeLabel } from "@/lib/market-types";
import { extractExternalHttpUrl } from "@/lib/external-url";
import type { LightboxImage } from "@/lib/archive-detail-types";
import type { MarketDetailPayload, MarketPostDisplayRow, MarketDetailMediaRow as MarketMediaRow } from "@/lib/market-detail-loader";

export default function MarketDetailView({ payload, loading, working, online, onBack, onStatus, onDelete, onExternalLink }: {
  payload: MarketDetailPayload | null;
  loading: boolean;
  working: boolean;
  online: boolean;
  onBack: () => void;
  onStatus: (status: "active" | "ended") => void;
  onDelete: () => void;
  onExternalLink?: (url: string) => void;
}) {
  const { language, t } = useLanguage();
  const item = payload?.item || null;
  const profile = payload?.profile || null;
  const archive = payload?.archive || null;
  const sourceRecord = payload?.sourceRecord || null;
  const marketMedia = payload?.marketMedia || [];
  const currentUserId = payload?.currentUserId || null;
  const isOwner = Boolean(currentUserId && item?.user_id === currentUserId);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    function updateViewportMode() { setIsMobileViewport(window.innerWidth < 760); }
    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);
  const isLightboxOpen = lightboxImages.length > 0;
  const coverImageUrl = item?.display_cover_image_url || null;
  const coverThumbUrl = item?.display_cover_thumb_url || coverImageUrl;
  const additionalMarketMedia = marketMedia.filter((media) => Boolean(media.display_url) && media.display_url !== coverImageUrl);
  useEffect(() => {
    if (!isLightboxOpen) return;
    const overflow = document.body.style.overflow;
    const touchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => { document.body.style.overflow = overflow; document.body.style.touchAction = touchAction; };
  }, [isLightboxOpen]);

  function openMarketLightbox(targetUrl: string) {
    if (!item) return;

    const images = buildMarketLightboxImages(
      item,
      marketMedia,
      t.market.market_image,
      t.market.market_cover
    );
    const nextIndex = images.findIndex((image) => image.url === targetUrl);

    if (!images.length || nextIndex < 0) return;

    setLightboxImages(images);
    setLightboxIndex(nextIndex);
  }

  if (loading) {
    return <main data-market-detail-view="true" style={pageStyle}>{t.market.loading}</main>;
  }

  if (!item) {
    return (
      <main data-market-detail-view="true" style={pageStyle}>
        <div style={shellStyle}>
          <button type="button" onClick={onBack} className="mobile-app-desktop-only" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> {t.market.back_to_market}
          </button>
          <section style={emptyStyle}>{online ? t.market.not_found : (language === "zh" ? "当前未联网，联网后查看集市详情" : "Offline. Connect to view this listing.")}</section>
        </div>
      </main>
    );
  }

  const archiveName = archive?.title || "";
  const systemName = archive?.system_name || archive?.species_name_snapshot || "";
  const sourceArchiveId = sourceRecord?.archive_id || item.archive_id || "";
  const sourceTime = sourceRecord?.photo_time ? formatSourceRecordTime(sourceRecord.photo_time) : "";
  const sourceNoteText = sourceRecord?.note?.trim() || "";
  const hasSource = Boolean(archive || sourceRecord);
  const externalUrl = extractExternalHttpUrl(item.external_url || "");

  return (
    <>
      <main data-market-detail-view="true" style={pageStyle}>
        <div style={shellStyle}>
          <button type="button" onClick={onBack} className="mobile-app-desktop-only" style={backLinkStyle}>
            <UiIcon name="arrow-left" size={15} /> {t.market.back_to_market}
          </button>

          <section style={panelStyle}>
            {coverImageUrl ? (
              <button
                type="button"
                onClick={() => openMarketLightbox(coverImageUrl)}
                aria-label={t.market.open_cover_preview}
                style={coverButtonStyle}
              >
                <img
                  src={coverThumbUrl || coverImageUrl}
                  alt={item.title}
                  style={coverImageStyle}
                />
              </button>
            ) : null}

            {additionalMarketMedia.length > 0 ? (
              <section style={marketMediaSectionStyle}>
                <div style={marketMediaTitleStyle}>{t.market.images}</div>
                <div style={marketMediaGridStyle}>
                  {additionalMarketMedia.map((media) => {
                    const mediaImageUrl = media.display_url;
                    if (!mediaImageUrl) return null;
                    return (
                      <button
                        key={media.id}
                        type="button"
                        onClick={() => openMarketLightbox(mediaImageUrl)}
                        aria-label={t.market.open_image_preview}
                        style={marketMediaItemStyle}
                      >
                        <img
                          src={media.display_thumb_url || mediaImageUrl}
                          alt=""
                          style={marketMediaImageStyle}
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div style={topRowStyle}>
              <div style={badgeRowStyle}>
                <span style={typeBadgeStyle}>
                  {getMarketPostTypeLabel(item.post_type, language)}
                </span>
                <span style={categoryBadgeStyle}>
                  {getMarketItemCategoryLabel(item.item_category, language)}
                </span>
                {item.status === "ended" ? (
                  <span style={endedBadgeStyle}>{t.market.ended}</span>
                ) : null}
              </div>

              <span style={timeStyle}>{formatPreciseDateTime(item.created_at)}</span>
            </div>

            {!isMobileViewport ? <h1 style={titleStyle}>{item.title}</h1> : null}

            <section style={summaryInlineStyle}>
              <span style={summaryInlineItemStyle}>
                <span style={summaryLabelStyle}>{t.market.publisher}</span>
                <InternalLink
                  href={isOwner ? "/archive" : `/user/${item.user_id}`}
                  style={publisherLinkStyle}
                >
                  {profile?.username || t.market.unset_username}
                </InternalLink>
              </span>

              <span style={summarySeparatorStyle}>·</span>

              <span style={summaryInlineItemStyle}>
                <span style={summaryLabelStyle}>{t.market.location}</span>
                <span style={summaryValueStyle}>{item.location_text || t.market.not_provided}</span>
              </span>

              <span style={summarySeparatorStyle}>·</span>

              <span style={summaryInlineItemStyle}>
                <span style={summaryLabelStyle}>{t.market.record_source}</span>
                {hasSource && sourceArchiveId ? (
                  <>
                    <InternalLink
                      href={
                        sourceRecord
                          ? `/archive/${sourceArchiveId}?record=${sourceRecord.id}`
                          : `/archive/${sourceArchiveId}`
                      }
                      style={archiveLinkStyle}
                    >
                      <span style={sourceDetailInlineStyle}>
                        {archiveName ? (
                          <span style={sourceDetailArchiveStyle}>{archiveName}</span>
                        ) : (
                          <span style={sourceDetailMissingStyle}>{t.market.view_source_record}</span>
                        )}
                        {systemName ? (
                          <span style={sourceDetailSystemStyle}>{systemName}</span>
                        ) : null}
                        {sourceTime ? (
                          <span style={sourceDetailTimeStyle}>{sourceTime}</span>
                        ) : null}
                      </span>
                    </InternalLink>
                    {sourceNoteText ? (
                      <span style={sourceInlineNoteStyle}>{sourceNoteText}</span>
                    ) : null}
                  </>
                ) : (
                  <span style={summaryValueStyle}>{t.market.no_linked_record}</span>
                )}
              </span>
            </section>

            {externalUrl ? (
              <section style={externalLinkBarStyle}>
                <span style={externalLinkLabelStyle}>{t.market.external_link}</span>
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={externalLinkStyle}
                  onClick={onExternalLink ? (event) => { event.preventDefault(); onExternalLink(externalUrl); } : undefined}
                >
                  {externalUrl}
                </a>
              </section>
            ) : null}

            {item.description ? (
              <section style={descriptionBlockStyle}>{item.description}</section>
            ) : null}

            {online ? <MarketCommentsSection
              marketPostId={item.id}
              postOwnerId={item.user_id}
              postStatus={item.status}
              currentUserId={currentUserId}
            /> : <section aria-label={t.market.messages}>{language === "zh" ? "联网后查看评论与咨询" : "Reconnect to view comments and consultations"}</section>}

            {isOwner ? (
              <div style={ownerButtonRowStyle}>
                <InternalLink href={`/market/${item.id}/edit`} style={editLinkStyle}>
                  {t.market.edit}
                </InternalLink>

                {item.status === "ended" ? (
                  <button
                    type="button"
                    onClick={() => onStatus("active")}
                    disabled={working || !online}
                    style={primaryButtonStyle}
                  >
                    {t.market.resume}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStatus("ended")}
                    disabled={working || !online}
                    style={secondaryButtonStyle}
                  >
                    {t.market.mark_ended}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onDelete}
                  disabled={working || !online}
                  style={dangerButtonStyle}
                >
                  {t.market.delete}
                </button>
              </div>
            ) : null}
          </section>
          {!isOwner && <ReportLink targetUrl={`/market/${item.id}`} />}
        </div>
      </main>

      {isLightboxOpen ? (
        <ArchiveLightbox
          images={lightboxImages}
          index={lightboxIndex}
          isMobileViewport={isMobileViewport}
          onChange={setLightboxIndex}
          onClose={() => {
            setLightboxImages([]);
            setLightboxIndex(0);
          }}
        />
      ) : null}
    </>
  );
}

function buildMarketLightboxImages(
  item: MarketPostDisplayRow,
  marketMedia: MarketMediaRow[],
  imageFallback: string,
  coverFallback: string
): LightboxImage[] {
  const seen = new Set<string>();
  const images: LightboxImage[] = [];

  function add(url?: string | null, alt?: string | null) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt: alt || item.title || imageFallback });
  }

  add(item.display_cover_image_url, item.title || coverFallback);

  marketMedia.forEach((media, index) => {
    add(media.display_url, `${item.title || imageFallback} ${index + 1}`);
  });

  return images;
}

function formatSourceRecordTime(value?: string | null) {
  return formatPreciseDateTime(value);
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

const topRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginTop: 10,
  marginBottom: 8,
};

const badgeRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const typeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#edf4e8",
  color: "#4f7b45",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const categoryBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f5f3e8",
  color: "#7a6b35",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const endedBadgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f2f2f2",
  color: "#777",
  padding: "3px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const timeStyle: CSSProperties = {
  color: "#8a9585",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#1f2a1f",
  fontSize: 25,
  lineHeight: 1.35,
};

const summaryInlineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "5px 8px",
  marginTop: 10,
  marginBottom: 12,
  padding: "8px 10px",
  border: "1px solid #e4ece0",
  background: "#fafcf8",
  borderRadius: 12,
};

const summaryInlineItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 5,
  minWidth: 0,
  maxWidth: "100%",
};

const summarySeparatorStyle: CSSProperties = {
  color: "#c1cbbb",
  fontSize: 12,
};

const sourceInlineNoteStyle: CSSProperties = {
  color: "#5f6a5b",
  fontSize: 13,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
};

const summaryLabelStyle: CSSProperties = {
  color: "#8a9585",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const summaryValueStyle: CSSProperties = {
  color: "#2f3a2f",
  fontSize: 14,
  lineHeight: 1.35,
};

const externalLinkBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
  padding: "8px 10px",
  border: "1px solid #e4ece0",
  background: "#fffdf6",
  borderRadius: 12,
};

const externalLinkLabelStyle: CSSProperties = {
  color: "#8a7a42",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const externalLinkStyle: CSSProperties = {
  color: "#4f7b45",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const coverButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "zoom-in",
};

const coverImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: 420,
  objectFit: "cover",
  borderRadius: 16,
  border: "1px solid #e4ece0",
  background: "#f0f4ed",
};

const marketMediaSectionStyle: CSSProperties = {
  marginTop: 12,
  background: "#fafcf8",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 12,
};

const marketMediaTitleStyle: CSSProperties = {
  color: "#5f6a5b",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 9,
};

const marketMediaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
  gap: 8,
};

const marketMediaItemStyle: CSSProperties = {
  position: "relative",
  display: "block",
  width: "100%",
  padding: 0,
  textAlign: "left",
  color: "inherit",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #dfe8da",
  background: "#fff",
  cursor: "zoom-in",
};

const marketMediaImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  display: "block",
};

const publisherLinkStyle: CSSProperties = {
  color: "#4f7b45",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 14,
};

const archiveLinkStyle: CSSProperties = {
  color: "#4f7b45",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const sourceDetailInlineStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
  flexWrap: "wrap",
};

const sourceDetailArchiveStyle: CSSProperties = {
  color: "#2f3a2f",
  fontSize: 14,
  fontWeight: 700,
};

const sourceDetailSystemStyle: CSSProperties = {
  color: "#4f7b45",
  fontSize: 12,
  fontWeight: 700,
  background: "#edf4e8",
  borderRadius: 999,
  padding: "2px 7px",
};

const sourceDetailTimeStyle: CSSProperties = {
  color: "#8a9585",
  fontSize: 12,
  fontWeight: 500,
};

const sourceDetailMissingStyle: CSSProperties = {
  color: "#4f7b45",
  fontSize: 14,
  fontWeight: 700,
};

const descriptionBlockStyle: CSSProperties = {
  marginTop: 14,
  color: "#2f3a2f",
  fontSize: 15,
  lineHeight: 1.8,
  whiteSpace: "pre-wrap",
};


const ownerButtonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
  flexWrap: "wrap",
};

const editLinkStyle: CSSProperties = {
  textDecoration: "none",
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 12,
  padding: "9px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 12,
  padding: "9px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #d8e3d3",
  background: "#fff",
  color: "#40583a",
  borderRadius: 12,
  padding: "9px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid #ffd6cf",
  background: "#fff",
  color: "#c23a2b",
  borderRadius: 12,
  padding: "9px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const emptyStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 28,
  color: "#6f7b69",
  textAlign: "center",
};
