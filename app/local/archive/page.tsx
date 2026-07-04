"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import LocalBlobImage from "@/components/local/LocalBlobImage";
import {
  listLocalArchiveSummaries,
  type LocalArchiveSummary,
} from "@/lib/local-offline-db";
import {
  getArchiveCategoryIcon,
  getArchiveCategoryLabel,
} from "@/lib/archive-categories";

function formatDate(value?: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";

  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LocalArchivePage() {
  const [archives, setArchives] = useState<LocalArchiveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const rows = await listLocalArchiveSummaries();
        if (!active) return;
        setArchives(rows);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "读取本地项目失败");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={pageStyle}>
      <section style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>本地离线</div>
          <h1 style={titleStyle}>本地项目</h1>
          <p style={subtitleStyle}>
            数据和图片只保存在当前设备，不上传云端，不进入发现页。
          </p>
        </div>
        <Link href="/local/archive/new" style={primaryActionStyle}>
          新建本地项目
        </Link>
      </section>

      <section style={noticeStyle}>
        本地记录暂不支持公开发现、求助、评论和集市。后续同步到云空间时，会先按私密项目处理。
      </section>

      {loading ? (
        <section style={emptyStyle}>正在读取本地项目...</section>
      ) : error ? (
        <section style={emptyStyle}>{error}</section>
      ) : archives.length === 0 ? (
        <section style={emptyStyle}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>还没有本地项目</div>
          <div style={{ color: "#6f7b69", fontSize: 14 }}>
            可以先在本机记录，等之后再选择是否同步到云空间。
          </div>
          <Link href="/local/archive/new" style={secondaryActionStyle}>
            创建第一个本地项目
          </Link>
        </section>
      ) : (
        <section style={gridStyle}>
          {archives.map((archive) => (
            <Link
              key={archive.id}
              href={`/local/archive/${archive.id}`}
              style={cardStyle}
            >
              {archive.cover_image ? (
                <LocalBlobImage
                  blob={archive.cover_image.blob}
                  style={coverStyle}
                />
              ) : (
                <div style={coverPlaceholderStyle}>
                  {getArchiveCategoryIcon(archive.category)}
                </div>
              )}

              <div style={{ minWidth: 0 }}>
                <div style={cardMetaStyle}>
                  <span>{getArchiveCategoryLabel(archive.category)}</span>
                  <span style={localPillStyle}>本地离线</span>
                </div>
                <h2 style={cardTitleStyle}>{archive.title || "未命名项目"}</h2>
                <div style={systemNameStyle}>
                  {archive.system_name || "未填写植物 / 对象"}
                </div>
                <p style={noteStyle}>
                  {archive.latest_record_note || archive.note || "暂无记录内容"}
                </p>
                <div style={cardFooterStyle}>
                  <span>只在本机</span>
                  <span>{archive.record_count} 条记录</span>
                  <span>{archive.image_count} 张图片</span>
                  <span>最近 {formatDate(archive.latest_record_time || archive.updated_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

const pageStyle = {
  minHeight: "calc(100vh - 70px)",
  padding: "22px 16px 46px",
  background: "#fbfcf7",
  color: "#263326",
} satisfies CSSProperties;

const headerStyle = {
  maxWidth: 760,
  margin: "0 auto 10px",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
} satisfies CSSProperties;

const eyebrowStyle = {
  color: "#6f7b69",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const titleStyle = {
  margin: "4px 0 6px",
  fontSize: 26,
  lineHeight: 1.2,
} satisfies CSSProperties;

const subtitleStyle = {
  margin: 0,
  maxWidth: 620,
  color: "#5d6a56",
  fontSize: 14,
  lineHeight: 1.7,
} satisfies CSSProperties;

const primaryActionStyle = {
  height: 40,
  padding: "0 16px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#3f7d3d",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
} satisfies CSSProperties;

const secondaryActionStyle = {
  marginTop: 14,
  height: 38,
  padding: "0 14px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef6e8",
  color: "#2f5f2d",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
} satisfies CSSProperties;

const noticeStyle = {
  maxWidth: 760,
  margin: "0 auto 12px",
  color: "#8a9584",
  fontSize: 12,
  lineHeight: 1.6,
} satisfies CSSProperties;

const emptyStyle = {
  maxWidth: 760,
  margin: "0 auto",
  padding: 24,
  borderRadius: 18,
  border: "1px solid #e1eadb",
  background: "#fff",
} satisfies CSSProperties;

const gridStyle = {
  maxWidth: 760,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
} satisfies CSSProperties;

const cardStyle = {
  display: "grid",
  gridTemplateColumns: "104px minmax(0, 1fr)",
  gap: 10,
  minHeight: 124,
  padding: 10,
  borderRadius: 14,
  border: "1px solid #e2eadc",
  background: "#fff",
  boxShadow: "0 8px 22px rgba(42, 66, 34, 0.05)",
  color: "inherit",
  textDecoration: "none",
} satisfies CSSProperties;

const coverStyle = {
  width: 104,
  height: 104,
  objectFit: "cover",
  borderRadius: 11,
  background: "#f1f5eb",
} satisfies CSSProperties;

const coverPlaceholderStyle = {
  width: 104,
  height: 104,
  borderRadius: 11,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f1f6ec",
  color: "#78906e",
  fontSize: 28,
} satisfies CSSProperties;

const cardMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#78906e",
  fontSize: 12,
  fontWeight: 700,
} satisfies CSSProperties;

const localPillStyle = {
  padding: "3px 7px",
  borderRadius: 999,
  border: "1px solid #d9e6d0",
  background: "#f6faf3",
  color: "#4f6e45",
} satisfies CSSProperties;

const cardTitleStyle = {
  margin: "5px 0 2px",
  fontSize: 17,
  lineHeight: 1.35,
  color: "#263326",
} satisfies CSSProperties;

const systemNameStyle = {
  color: "#64745d",
  fontSize: 13,
  lineHeight: 1.5,
} satisfies CSSProperties;

const noteStyle = {
  margin: "6px 0 0",
  color: "#4d5848",
  fontSize: 13,
  lineHeight: 1.45,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
} satisfies CSSProperties;

const cardFooterStyle = {
  marginTop: 8,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#87927f",
  fontSize: 12,
} satisfies CSSProperties;
