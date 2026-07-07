"use client";

import type { CSSProperties, ReactNode } from "react";

type RecordTone = "default" | "help" | "resolved" | "highlighted";

type Props = {
  id?: string;
  metaText?: ReactNode;
  statusSlot?: ReactNode;
  children: ReactNode;
  mobileMode?: boolean;
  latest?: boolean;
  tone?: RecordTone;
  onClick?: () => void;
};

export default function ArchiveRecordCardShell({
  id,
  metaText,
  statusSlot,
  children,
  mobileMode = false,
  latest = false,
  tone = "default",
  onClick,
}: Props) {
  return (
    <article
      id={id}
      style={recordOuterStyle(mobileMode, Boolean(onClick))}
      onClick={onClick}
    >
      {!mobileMode ? <div style={timelineDotStyle(latest)} /> : null}

      <div style={recordMetaRowStyle}>
        {metaText ? <div style={recordMetaTextStyle}>{metaText}</div> : <span />}
        {statusSlot}
      </div>

      <div style={recordCardStyle(mobileMode, tone)}>{children}</div>
    </article>
  );
}

function recordOuterStyle(mobileMode: boolean, clickable: boolean): CSSProperties {
  return {
    position: "relative",
    marginBottom: 14,
    paddingLeft: mobileMode ? 0 : 10,
    scrollMarginTop: 120,
    cursor: clickable ? "pointer" : "default",
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

const recordMetaRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 6,
};

const recordMetaTextStyle: CSSProperties = {
  fontSize: 12,
  color: "#8a9588",
  minWidth: 0,
};

function recordCardStyle(mobileMode: boolean, tone: RecordTone): CSSProperties {
  const isHelp = tone === "help";
  const isResolved = tone === "resolved";
  const isHighlighted = tone === "highlighted";

  return {
    background: isHelp ? "#fffaf5" : isResolved ? "#fbfffb" : "#fff",
    padding: mobileMode ? 10 : 12,
    borderRadius: mobileMode ? 14 : 16,
    border: isHelp
      ? "1px solid #edc6a9"
      : isResolved
        ? "1px solid #cfe4d4"
        : isHighlighted
          ? "1px solid #b6ddb4"
          : "1px solid #ebefea",
    boxShadow: isHelp
      ? "0 0 0 3px rgba(166, 95, 69, 0.08)"
      : isResolved
        ? "0 0 0 3px rgba(77, 124, 91, 0.08)"
        : isHighlighted
          ? "0 0 0 4px rgba(79, 143, 70, 0.08)"
          : "0 3px 14px rgba(0,0,0,0.025)",
  };
}
