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
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ExperienceCardTimeline({
  archive,
  records,
}: {
  archive: ExperienceCardArchive;
  records: ExperienceCardSourceRecord[];
}) {
  const { language, t } = useLanguage();

  return (
    <section style={timelineStyle} aria-label={t.experience.timeline_aria}>
      {records.map((record, index) => {
        const imageMedia = record.media.filter((media) =>
          Boolean(media.display_thumb_url || media.display_url)
        );
        const previewMedia = imageMedia.slice(0, 3);
        const hasImages = previewMedia.length > 0;
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
              aria-label={`${t.experience.view_original_prefix}${formatExperienceCardDate(record.record_time) || t.experience.this_day}${t.experience.view_original_suffix}`}
            >
              <div style={metaRowStyle}>
                <span style={stageStyle}>
                  {getExperienceCardStageLabel(index, records.length, language)}
                </span>
                <time dateTime={record.record_time} style={dateStyle}>
                  {formatExperienceCardDate(record.record_time) || t.experience.date_missing}
                </time>
              </div>

              <div style={recordRowStyle}>
                {hasImages ? (
                  <div style={thumbWrapStyle(previewMedia.length)}>
                    {previewMedia.map((media, mediaIndex) => {
                      const src = media.display_thumb_url || media.display_url;
                      if (!src) return null;
                      return (
                        <span
                          key={media.id}
                          style={thumbCellStyle(previewMedia.length, mediaIndex)}
                        >
                          <img
                            src={src}
                            alt={`${formatExperienceCardDate(record.record_time)} ${t.experience.record_photo_prefix}${mediaIndex + 1}`}
                            style={thumbStyle}
                            loading="lazy"
                          />
                          {mediaIndex === previewMedia.length - 1 && imageMedia.length > 3 ? (
                            <span style={mediaCountStyle}>{t.experience.total_photos_prefix}{imageMedia.length}{t.experience.total_photos_suffix}</span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                {tags.length > 0 || record.note ? (
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

                    {record.note ? <p style={noteStyle}>{record.note}</p> : null}
                  </div>
                ) : null}
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

const recordRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  minWidth: 0,
};

function thumbWrapStyle(count: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: count === 1 ? "1fr" : "repeat(2, 1fr)",
    gridTemplateRows: count === 3 ? "repeat(2, 1fr)" : "1fr",
    gap: 2,
    width: 104,
    height: 76,
    flex: "0 0 104px",
    borderRadius: 9,
    overflow: "hidden",
    background: "#eef2eb",
  };
}

function thumbCellStyle(count: number, index: number): CSSProperties {
  return {
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    gridRow: count === 3 && index === 0 ? "1 / span 2" : undefined,
  };
}

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
