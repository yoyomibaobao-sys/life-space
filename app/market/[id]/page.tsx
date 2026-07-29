"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import MarketCommentsSection from "@/components/market/MarketCommentsSection";
import ArchiveLightbox from "@/components/archive-detail/ArchiveLightbox";
import {
  formatMarketTime,
  getMarketItemCategoryLabel,
  getMarketPostTypeLabel,
  type MarketPostRow,
} from "@/lib/market-types";
import { PUBLIC_PROFILE_SELECT, type SupabaseUser } from "@/lib/domain-types";
import type { LightboxImage } from "@/lib/archive-detail-types";
import { resolveMediaDisplayPairs } from "@/lib/media-urls";
import { requestMarketPostDeletion } from "@/lib/market-media-storage";

type ProfileBrief = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type ArchiveBrief = {
  id: string;
  title: string | null;
  system_name: string | null;
  species_name_snapshot: string | null;
};

type SourceRecordBrief = {
  id: string;
  archive_id: string | null;
  note: string | null;
  photo_time: string | null;
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
  sort_order: number | null;
  created_at: string | null;
};

type MarketPostDisplayRow = MarketPostRow & {
  display_cover_image_url?: string | null;
  display_cover_thumb_url?: string | null;
};

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [item, setItem] = useState<MarketPostDisplayRow | null>(null);
  const [profile, setProfile] = useState<ProfileBrief | null>(null);
  const [archive, setArchive] = useState<ArchiveBrief | null>(null);
  const [sourceRecord, setSourceRecord] = useState<SourceRecordBrief | null>(
    null
  );
  const [marketMedia, setMarketMedia] = useState<MarketMediaRow[]>([]);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user || null);

      const { data, error } = await supabase
        .from("market_posts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("load market detail error:", error);
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

      const [profileResult, archiveResult, sourceRecordResult, mediaResult] =
        await Promise.all([
          supabase
            .from("public_profiles")
            .select(PUBLIC_PROFILE_SELECT)
            .eq("id", row.user_id)
            .maybeSingle(),

          row.archive_id
            ? supabase
                .from("archives")
                .select("id, title, system_name, species_name_snapshot")
                .eq("id", row.archive_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          row.source_record_id
            ? supabase
                .from("records")
                .select("id, archive_id, note, photo_time")
                .eq("id", row.source_record_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          supabase
            .from("market_media")
            .select("*")
            .eq("market_post_id", row.id)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
        ]);

      setProfile((profileResult.data || null) as ProfileBrief | null);
      setArchive((archiveResult.data || null) as ArchiveBrief | null);
      setSourceRecord(
        (sourceRecordResult.data || null) as SourceRecordBrief | null
      );

      const rawMarketMedia = mediaResult.error
        ? []
        : ((mediaResult.data || []) as MarketMediaRow[]);
      const displayPairs = await resolveMediaDisplayPairs(supabase, [
        {
          url: row.cover_image_url,
          path: row.cover_image_path,
          thumb_url: row.cover_thumb_url,
          thumb_path: row.cover_thumb_path,
        },
        ...rawMarketMedia,
      ]);
      setItem({
        ...row,
        display_cover_image_url: displayPairs[0]?.display_url || null,
        display_cover_thumb_url: displayPairs[0]?.display_thumb_url || null,
      });

      if (mediaResult.error) {
        console.error("load market media error:", mediaResult.error);
        setMarketMedia([]);
      } else {
        setMarketMedia(
          rawMarketMedia.map((media, index) => ({
            ...media,
            ...displayPairs[index + 1],
          }))
        );
      }

      if (row.status === "active") {
        void supabase
          .from("market_posts")
          .update({ view_count: Number(row.view_count || 0) + 1 })
          .eq("id", row.id);
      }

      setLoading(false);
    }

    if (id) {
      void init();
    }
  }, [id]);

  const isOwner = Boolean(user?.id && item?.user_id === user.id);
  const isLightboxOpen = lightboxImages.length > 0;
  const coverImageUrl = item?.display_cover_image_url || null;
  const coverThumbUrl = item?.display_cover_thumb_url || coverImageUrl;

  useEffect(() => {
    if (!isLightboxOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
    };
  }, [isLightboxOpen]);

  async function updateStatus(nextStatus: "active" | "ended") {
    if (!item || !isOwner || working) return;

    setWorking(true);

    const { error } = await supabase
      .from("market_posts")
      .update({ status: nextStatus })
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    setWorking(false);

    if (error) {
      console.error("update market status error:", error);
      const message = String(error.message || "");
      if (message.includes("market_post_limit_reached")) {
        window.alert("集市同时发布中的条目已达上限，请先结束一条再重新发布。");
      } else if (message.includes("membership_inactive")) {
        window.alert("需要有效云空间才能重新发布集市信息。");
      } else {
        window.alert("更新集市状态失败，请稍后重试。");
      }
      return;
    }

    setItem({
      ...item,
      status: nextStatus,
    });
  }

  async function deletePost() {
    if (!item || !isOwner || working) return;

    const ok = window.confirm("确定删除这条集市信息吗？");
    if (!ok) return;

    setWorking(true);

    const result = await requestMarketPostDeletion(item.id);
    if (!result.ok) {
      setWorking(false);
      return;
    }

    setWorking(false);
    router.push("/market");
  }

  function openMarketLightbox(targetUrl: string) {
    if (!item) return;

    const images = buildMarketLightboxImages(item, marketMedia);
    const nextIndex = images.findIndex((image) => image.url === targetUrl);

    if (!images.length || nextIndex < 0) return;

    setLightboxImages(images);
    setLightboxIndex(nextIndex);
  }

  if (loading) {
    return <main style={pageStyle}>加载中...</main>;
  }

  if (!item) {
    return (
      <main style={pageStyle}>
        <div style={shellStyle}>
          <Link href="/market" style={backLinkStyle}>
            ← 返回集市
          </Link>
          <section style={emptyStyle}>这条集市信息不存在或已不可见</section>
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
  const externalUrl = normalizeExternalUrl(item.external_url || "");
  const externalLabel = item.external_label?.trim() || getExternalLinkLabel(externalUrl);

  return (
    <>
      <main style={pageStyle}>
        <div style={shellStyle}>
          <Link href="/market" style={backLinkStyle}>
            ← 返回集市
          </Link>

          <section style={panelStyle}>
            <div style={topRowStyle}>
              <div style={badgeRowStyle}>
                <span style={typeBadgeStyle}>
                  {getMarketPostTypeLabel(item.post_type)}
                </span>
                <span style={categoryBadgeStyle}>
                  {getMarketItemCategoryLabel(item.item_category)}
                </span>
                {item.status === "ended" ? (
                  <span style={endedBadgeStyle}>已结束</span>
                ) : null}
              </div>

              <span style={timeStyle}>{formatMarketTime(item.created_at)}</span>
            </div>

            <h1 style={titleStyle}>{item.title}</h1>

            <section style={summaryInlineStyle}>
              <span style={summaryInlineItemStyle}>
                <span style={summaryLabelStyle}>发布人</span>
                <Link
                  href={`/user/${item.user_id}/profile`}
                  style={publisherLinkStyle}
                >
                  {profile?.username || "未设置用户名"}
                </Link>
              </span>

              <span style={summarySeparatorStyle}>·</span>

              <span style={summaryInlineItemStyle}>
                <span style={summaryLabelStyle}>地点</span>
                <span style={summaryValueStyle}>{item.location_text || "未填写"}</span>
              </span>

              <span style={summarySeparatorStyle}>·</span>

              <span style={summaryInlineItemStyle}>
                <span style={summaryLabelStyle}>记录来源</span>
                {hasSource && sourceArchiveId ? (
                  <>
                    <Link
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
                          <span style={sourceDetailMissingStyle}>查看来源记录</span>
                        )}
                        {systemName ? (
                          <span style={sourceDetailSystemStyle}>{systemName}</span>
                        ) : null}
                        {sourceTime ? (
                          <span style={sourceDetailTimeStyle}>{sourceTime}</span>
                        ) : null}
                      </span>
                    </Link>
                    {sourceNoteText ? (
                      <span style={sourceInlineNoteStyle}>{sourceNoteText}</span>
                    ) : null}
                  </>
                ) : (
                  <span style={summaryValueStyle}>未关联记录</span>
                )}
              </span>
            </section>

            {externalUrl ? (
              <section style={externalLinkBarStyle}>
                <span style={externalLinkLabelStyle}>外链</span>
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={externalLinkStyle}
                >
                  {externalLabel}
                </a>
              </section>
            ) : null}

            {coverImageUrl ? (
              <button
                type="button"
                onClick={() => openMarketLightbox(coverImageUrl)}
                aria-label="打开封面图片预览"
                style={coverButtonStyle}
              >
                <img
                  src={coverThumbUrl || coverImageUrl}
                  alt={item.title}
                  style={coverImageStyle}
                />
              </button>
            ) : null}

            {marketMedia.length > 0 ? (
              <section style={marketMediaSectionStyle}>
                <div style={marketMediaTitleStyle}>图片</div>
                <div style={marketMediaGridStyle}>
                  {marketMedia.map((media) => {
                    const mediaImageUrl = media.display_url;
                    const isCover = item.cover_image_path
                      ? item.cover_image_path === media.path
                      : item.cover_image_url === media.url;

                    if (!mediaImageUrl) return null;
                    const mediaThumbUrl =
                      media.display_thumb_url || mediaImageUrl;

                    return (
                      <button
                        key={media.id}
                        type="button"
                        onClick={() => openMarketLightbox(mediaImageUrl)}
                        aria-label="打开集市图片预览"
                        style={marketMediaItemStyle}
                      >
                        <img
                          src={mediaThumbUrl}
                          alt=""
                          style={marketMediaImageStyle}
                          loading="lazy"
                        />
                        {isCover ? (
                          <span style={marketMediaCoverBadgeStyle}>封面</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {item.description ? (
              <section style={descriptionBlockStyle}>{item.description}</section>
            ) : null}

            <MarketCommentsSection
              marketPostId={item.id}
              postOwnerId={item.user_id}
              postStatus={item.status}
              currentUserId={user?.id || null}
            />

            {isOwner ? (
              <div style={ownerButtonRowStyle}>
                <Link href={`/market/${item.id}/edit`} style={editLinkStyle}>
                  编辑
                </Link>

                {item.status === "ended" ? (
                  <button
                    type="button"
                    onClick={() => updateStatus("active")}
                    disabled={working}
                    style={primaryButtonStyle}
                  >
                    恢复进行中
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateStatus("ended")}
                    disabled={working}
                    style={secondaryButtonStyle}
                  >
                    标记已结束
                  </button>
                )}

                <button
                  type="button"
                  onClick={deletePost}
                  disabled={working}
                  style={dangerButtonStyle}
                >
                  删除
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      {isLightboxOpen ? (
        <ArchiveLightbox
          images={lightboxImages}
          index={lightboxIndex}
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

function normalizeExternalUrl(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function getExternalLinkLabel(url: string) {
  if (!url) return "打开外部链接";

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || "打开外部链接";
  } catch {
    return "打开外部链接";
  }
}

function buildMarketLightboxImages(
  item: MarketPostDisplayRow,
  marketMedia: MarketMediaRow[]
): LightboxImage[] {
  const seen = new Set<string>();
  const images: LightboxImage[] = [];

  function add(url?: string | null, alt?: string | null) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, alt: alt || item.title || "集市图片" });
  }

  add(item.display_cover_image_url, item.title || "集市封面");

  marketMedia.forEach((media, index) => {
    add(media.display_url, `${item.title || "集市图片"} ${index + 1}`);
  });

  return images;
}

function formatSourceRecordTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  marginBottom: 10,
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

const marketMediaCoverBadgeStyle: CSSProperties = {
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
