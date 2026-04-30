"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import MarketCommentsSection from "@/components/market/MarketCommentsSection";
import {
  formatMarketTime,
  getMarketItemCategoryLabel,
  getMarketPostTypeLabel,
  type MarketPostRow,
} from "@/lib/market-types";
import type { SupabaseUser } from "@/lib/domain-types";

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
  url: string;
  path: string | null;
  source_media_id: string | null;
  source_record_id: string | null;
  sort_order: number | null;
  created_at: string | null;
};

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [item, setItem] = useState<MarketPostRow | null>(null);
  const [profile, setProfile] = useState<ProfileBrief | null>(null);
  const [archive, setArchive] = useState<ArchiveBrief | null>(null);
  const [sourceRecord, setSourceRecord] = useState<SourceRecordBrief | null>(
    null
  );
  const [marketMedia, setMarketMedia] = useState<MarketMediaRow[]>([]);
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
      setItem(row);

      if (!row) {
        setLoading(false);
        return;
      }

      const [profileResult, archiveResult, sourceRecordResult, mediaResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, username, avatar_url")
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

      if (mediaResult.error) {
        console.error("load market media error:", mediaResult.error);
        setMarketMedia([]);
      } else {
        setMarketMedia((mediaResult.data || []) as MarketMediaRow[]);
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

    const mediaPaths = marketMedia
      .map((media) => media.path)
      .filter(Boolean) as string[];

    const standaloneCoverPath =
      item.cover_image_path && !mediaPaths.includes(item.cover_image_path)
        ? item.cover_image_path
        : null;

    const pathsToRemove = [
      ...mediaPaths,
      ...(standaloneCoverPath ? [standaloneCoverPath] : []),
    ];

    const { error } = await supabase
      .from("market_posts")
      .delete()
      .eq("id", item.id)
      .eq("user_id", item.user_id);

    if (error) {
      setWorking(false);
      console.error("delete market post error:", error);
      return;
    }

    if (pathsToRemove.length > 0) {
      const { error: removeError } = await supabase.storage
        .from("media")
        .remove(pathsToRemove);

      if (removeError) {
        console.error("remove market media files error:", removeError);
      }
    }

    setWorking(false);
    router.push("/market");
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
  const hasSource = Boolean(archive || sourceRecord);

  return (
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

          {item.cover_image_url ? (
            <img
              src={item.cover_image_url}
              alt={item.title}
              style={coverImageStyle}
            />
          ) : null}

          {marketMedia.length > 0 ? (
            <section style={marketMediaSectionStyle}>
              <div style={marketMediaTitleStyle}>集市图片</div>
              <div style={marketMediaGridStyle}>
                {marketMedia.map((media) => {
                  const isCover = item.cover_image_url === media.url;

                  return (
                    <a
                      key={media.id}
                      href={media.url}
                      target="_blank"
                      rel="noreferrer"
                      style={marketMediaItemStyle}
                    >
                      <img src={media.url} alt="" style={marketMediaImageStyle} />
                      {isCover ? (
                        <span style={marketMediaCoverBadgeStyle}>封面</span>
                      ) : null}
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div style={metaStyle}>
            发布人：
            <Link
              href={`/user/${item.user_id}/profile`}
              style={publisherLinkStyle}
            >
              {profile?.username || "未设置用户名"}
            </Link>
            {item.location_text ? ` · ${item.location_text}` : ""}
            {Number(item.view_count || 0) > 0
              ? ` · 浏览 ${Number(item.view_count || 0)}`
              : ""}
          </div>

          {item.description ? (
            <section style={descriptionBlockStyle}>{item.description}</section>
          ) : (
            <section style={descriptionBlockStyle}>没有填写说明。</section>
          )}

          {hasSource ? (
            <section style={linkedSourceStyle}>
              <div style={{ color: "#6f7b69", fontSize: 13 }}>来源</div>

              <div style={{ marginTop: 4, fontWeight: 700, color: "#1f2a1f" }}>
                {archiveName || "未命名项目"}
                {systemName ? ` · ${systemName}` : ""}
                {sourceRecord?.photo_time
                  ? ` · ${formatSourceRecordTime(sourceRecord.photo_time)}`
                  : ""}
              </div>

              {sourceRecord?.note ? (
                <div style={sourceRecordNoteStyle}>{sourceRecord.note}</div>
              ) : null}

              {sourceRecord && sourceArchiveId ? (
                <Link
                  href={`/archive/${sourceArchiveId}?record=${sourceRecord.id}`}
                  style={archiveLinkStyle}
                >
                  查看来源记录
                </Link>
              ) : archive ? (
                <Link href={`/archive/${archive.id}`} style={archiveLinkStyle}>
                  查看来源项目
                </Link>
              ) : null}
            </section>
          ) : null}

          <section style={noticeStyle}>
            集市第一版只做信息发布，不做平台支付、担保、物流和纠纷处理。
          </section>

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
  );
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
  fontSize: 26,
};

const coverImageStyle: CSSProperties = {
  width: "100%",
  maxHeight: 420,
  objectFit: "cover",
  borderRadius: 16,
  border: "1px solid #e4ece0",
  marginTop: 12,
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
  textDecoration: "none",
  color: "inherit",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #dfe8da",
  background: "#fff",
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

const metaStyle: CSSProperties = {
  marginTop: 10,
  color: "#6f7b69",
  fontSize: 14,
  lineHeight: 1.6,
};

const publisherLinkStyle: CSSProperties = {
  color: "#4f7b45",
  textDecoration: "none",
  fontWeight: 700,
};

const linkedSourceStyle: CSSProperties = {
  marginTop: 14,
  background: "#f7fbf2",
  border: "1px solid #dfe8da",
  borderRadius: 14,
  padding: 12,
};

const sourceRecordNoteStyle: CSSProperties = {
  marginTop: 6,
  color: "#5f6a5b",
  fontSize: 13,
  lineHeight: 1.6,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const archiveLinkStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  color: "#4f7b45",
  textDecoration: "none",
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