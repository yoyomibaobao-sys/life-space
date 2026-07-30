"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  formatExperienceCardDate,
  getExperienceCardStageLabel,
} from "@/lib/experience-cards";
import type {
  ExperienceCardArchive,
  ExperienceCardSourceRecord,
} from "@/lib/experience-card-types";

export default function ExperienceCardTimeline({
  archive,
  records,
}: {
  archive: ExperienceCardArchive;
  records: ExperienceCardSourceRecord[];
}) {
  return (
    <section style={timelineStyle} aria-label="经验时间线">
      {records.map((record, index) => {
        const tags = Array.from(
          new Set(
            (record.record_tags || [])
              .filter(
                (tag) =>
                  tag.tag_type === "behavior" &&
                  tag.is_active !== false &&
                  Boolean(tag.tag)
              )
              .map((tag) => String(tag.tag))
          )
        );

        return (
          <article key={record.id} style={itemStyle}>
            <div style={railStyle}>
              <div style={dotStyle} />
              {index < records.length - 1 ? <div style={lineStyle} /> : null}
            </div>

            <div style={contentStyle}>
              <div style={metaRowStyle}>
                <span style={stageStyle}>
                  {getExperienceCardStageLabel(index, records.length)}
                </span>
                <time style={dateStyle}>
                  {formatExperienceCardDate(record.record_time) || "日期未记录"}
                </time>
              </div>

              {tags.length > 0 ? (
                <div style={tagRowStyle}>
                  {tags.map((tag) => (
                    <span key={tag} style={tagStyle}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {record.note ? (
                <p style={noteStyle}>{record.note}</p>
              ) : (
                <p style={emptyNoteStyle}>这条记录没有文字。</p>
              )}

              {record.media.length > 0 ? (
                <div style={mediaGridStyle}>
                  {record.media.map((media) => {
                    const src =
                      media.display_thumb_url || media.display_url || null;
                    return src ? (
                      <a
                        key={media.id}
                        href={media.display_url || src}
                        target="_blank"
                        rel="noreferrer"
                        style={mediaLinkStyle}
                      >
                        <img
                          src={src}
                          alt={`${formatExperienceCardDate(record.record_time)}的记录照片`}
                          style={mediaStyle}
                          loading="lazy"
                        />
                      </a>
                    ) : null;
                  })}
                </div>
              ) : null}

              <Link
                href={`/archive/${archive.id}?record=${record.id}`}
                style={sourceLinkStyle}
              >
                查看原记录 →
              </Link>
            </div>
          </article>
        );
      })}
    </section>
  );
}

const timelineStyle: CSSProperties = {
  display: "grid",
  gap: 0,
};

const itemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr)",
  gap: 12,
};

const railStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  justifyContent: "center",
};

const dotStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: 12,
  height: 12,
  marginTop: 7,
  borderRadius: 999,
  background: "#6f9568",
  border: "3px solid #edf4ea",
  boxSizing: "content-box",
};

const lineStyle: CSSProperties = {
  position: "absolute",
  top: 24,
  bottom: -8,
  width: 2,
  background: "#dce8d8",
};

const contentStyle: CSSProperties = {
  minWidth: 0,
  marginBottom: 28,
  padding: "0 0 2px",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 8,
};

const stageStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 25,
  padding: "2px 10px",
  borderRadius: 999,
  background: "#edf4ea",
  color: "#42633f",
  fontSize: 12,
  fontWeight: 800,
};

const dateStyle: CSSProperties = {
  color: "#778273",
  fontSize: 13,
};

const tagRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 9,
};

const tagStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  background: "#f5f7f3",
  color: "#64705f",
  fontSize: 12,
};

const noteStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "#2f3b2e",
  fontSize: 15,
  lineHeight: 1.8,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const emptyNoteStyle: CSSProperties = {
  ...noteStyle,
  color: "#8b9388",
  fontStyle: "italic",
};

const mediaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))",
  gap: 8,
  marginBottom: 12,
};

const mediaLinkStyle: CSSProperties = {
  display: "block",
  borderRadius: 12,
  overflow: "hidden",
  background: "#eef2eb",
  minHeight: 120,
};

const mediaStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 120,
  maxHeight: 260,
  objectFit: "cover",
  display: "block",
};

const sourceLinkStyle: CSSProperties = {
  color: "#557653",
  fontSize: 13,
  textDecoration: "none",
  fontWeight: 700,
};
