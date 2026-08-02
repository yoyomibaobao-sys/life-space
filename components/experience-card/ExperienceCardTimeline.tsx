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
        const imageMedia = record.media.filter((media) =>
          Boolean(media.display_thumb_url || media.display_url)
        );
        const firstImage = imageMedia[0];
        const firstImageUrl =
          firstImage?.display_thumb_url || firstImage?.display_url || null;
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

            <Link
              href={`/archive/${archive.id}?record=${record.id}`}
              style={contentStyle}
              aria-label={`查看${formatExperienceCardDate(record.record_time) || "这一天"}的原记录`}
            >
              <div style={metaRowStyle}>
                <span style={stageStyle}>
                  {getExperienceCardStageLabel(index, records.length)}
                </span>
                <time style={dateStyle}>
                  {formatExperienceCardDate(record.record_time) || "日期未记录"}
                </time>
              </div>

              <div style={recordRowStyle}>
                {firstImageUrl ? (
                  <div style={thumbWrapStyle}>
                    <img
                      src={firstImageUrl}
                      alt={`${formatExperienceCardDate(record.record_time)}的记录照片`}
                      style={thumbStyle}
                      loading="lazy"
                    />
                    {imageMedia.length > 1 ? (
                      <span style={mediaCountStyle}>+{imageMedia.length - 1}</span>
                    ) : null}
                  </div>
                ) : null}

                <div style={recordTextStyle}>
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
                    <p style={emptyNoteStyle}>
                      {firstImageUrl ? "这条记录以照片为主。" : "这条记录没有文字。"}
                    </p>
                  )}
                </div>
              </div>
            </Link>
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
  display: "block",
  minWidth: 0,
  marginBottom: 20,
  padding: "0 0 3px",
  color: "inherit",
  textDecoration: "none",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 7,
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
  marginBottom: 5,
};

const tagStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  background: "#f5f7f3",
  color: "#64705f",
  fontSize: 12,
};

const noteStyle: CSSProperties = {
  margin: 0,
  color: "#2f3b2e",
  fontSize: 14,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const emptyNoteStyle: CSSProperties = {
  ...noteStyle,
  color: "#8b9388",
  fontStyle: "italic",
};

const recordRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  minWidth: 0,
};

const thumbWrapStyle: CSSProperties = {
  position: "relative",
  width: 78,
  height: 68,
  flex: "0 0 78px",
  borderRadius: 9,
  overflow: "hidden",
  background: "#eef2eb",
};

const thumbStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const mediaCountStyle: CSSProperties = {
  position: "absolute",
  right: 5,
  bottom: 5,
  borderRadius: 999,
  background: "rgba(31, 45, 31, 0.72)",
  color: "#fff",
  padding: "2px 6px",
  fontSize: 10,
  fontWeight: 800,
};

const recordTextStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
};
