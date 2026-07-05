"use client";

import type { CSSProperties, ReactNode } from "react";
import LocalBlobImage from "@/components/local/LocalBlobImage";
import type { ArchiveRecordView } from "@/components/archive-ui/types";

type Props = {
  record: ArchiveRecordView;
  actionSlot?: ReactNode;
  mobileMode?: boolean;
  latest?: boolean;
};

export default function ArchiveLocalRecordCard({
  record,
  actionSlot,
  mobileMode = false,
  latest = false,
}: Props) {
  return (
    <article style={recordOuterStyle(mobileMode)}>
      {!mobileMode ? <div style={timelineDotStyle(latest)} /> : null}

      <div style={recordMetaStyle}>
        <span>{record.metaText}</span>
        {actionSlot}
      </div>

      <div style={recordCardStyle}>
        {record.media.length > 0 ? (
          <div style={imageGridStyle}>
            {record.media.map((media, index) =>
              media.kind === "blob" ? (
                <LocalBlobImage
                  key={media.id}
                  blob={media.blob}
                  style={
                    record.media.length === 1
                      ? recordSingleImageStyle
                      : index === 0
                        ? recordLeadImageStyle
                        : recordImageStyle
                  }
                />
              ) : (
                <img
                  key={media.id}
                  src={media.url}
                  alt={media.alt || ""}
                  loading="lazy"
                  style={
                    record.media.length === 1
                      ? recordSingleImageStyle
                      : index === 0
                        ? recordLeadImageStyle
                        : recordImageStyle
                  }
                />
              )
            )}
          </div>
        ) : null}

        {record.note ? (
          <p style={recordNoteStyle}>{record.note}</p>
        ) : (
          <p style={recordEmptyNoteStyle}>{record.emptyNoteText || "这条记录只有图片。"}</p>
        )}

        {record.footerItems?.length ? (
          <div style={recordFooterStyle}>
            {record.footerItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function recordOuterStyle(mobileMode: boolean): CSSProperties {
  return {
    position: "relative",
    marginBottom: 14,
    paddingLeft: mobileMode ? 0 : 10,
    scrollMarginTop: 120,
  };
}

function timelineDotStyle(latest: boolean): CSSProperties {
  return {
    position: "absolute",
    left: -13,
    top: 8,
    width: 11,
    height: 11,
    borderRadius: "50%",
    background: latest ? "#4CAF50" : "#9fc59a",
    boxShadow: "0 0 0 4px #f8fbf6",
  };
}

const recordMetaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  color: "#7c8975",
  fontSize: 12,
  marginBottom: 6,
};

const recordCardStyle: CSSProperties = {
  border: "1px solid #ebefea",
  borderRadius: 14,
  background: "#fff",
  padding: 10,
  boxShadow: "0 3px 14px rgba(0,0,0,0.025)",
};

const imageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
  gap: 8,
  marginBottom: 10,
};

const recordSingleImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: 12,
  background: "#eef4e8",
  display: "block",
};

const recordLeadImageStyle: CSSProperties = {
  ...recordSingleImageStyle,
  gridColumn: "1 / -1",
};

const recordImageStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1",
  objectFit: "cover",
  borderRadius: 12,
  background: "#eef4e8",
  display: "block",
};

const recordNoteStyle: CSSProperties = {
  margin: 0,
  color: "#334033",
  fontSize: 15,
  lineHeight: 1.75,
  whiteSpace: "pre-line",
};

const recordEmptyNoteStyle: CSSProperties = {
  margin: 0,
  color: "#8a9584",
  fontSize: 14,
};

const recordFooterStyle: CSSProperties = {
  marginTop: 8,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#8a9584",
  fontSize: 12,
};
