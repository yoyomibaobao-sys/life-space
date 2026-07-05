"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ArchiveProjectView } from "@/components/archive-ui/types";

type Props = {
  project: ArchiveProjectView;
  eyebrow?: ReactNode;
  latestUpdateText?: string;
  recordCountText?: string;
  encyclopediaHref?: string | null;
  actionSlot?: ReactNode;
  hint?: string;
};

export default function ArchiveDetailHeaderView({
  project,
  eyebrow,
  latestUpdateText,
  recordCountText,
  encyclopediaHref,
  actionSlot,
  hint,
}: Props) {
  const categoryItems = [
    project.categoryLabel,
    project.subcategoryLabel,
    project.groupLabel,
  ].filter(Boolean) as string[];

  return (
    <section style={headerStyle}>
      <div style={topRowStyle}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {eyebrow ? <div style={eyebrowStyle}>{eyebrow}</div> : null}
          <h1 style={titleStyle}>{project.title}</h1>
          <div style={nameStyle}>
            {encyclopediaHref ? (
              <Link href={encyclopediaHref} style={nameLinkStyle}>
                {project.systemName}
              </Link>
            ) : (
              <span>{project.systemName}</span>
            )}
          </div>
          <div style={categoryRowStyle}>
            {categoryItems.map((item) => (
              <span key={item} style={categoryChipStyle}>
                {item}
              </span>
            ))}
            {project.badges?.map((badge) => (
              <span key={badge} style={localBadgeStyle}>
                {badge}
              </span>
            ))}
          </div>
        </div>
        {actionSlot ? <div style={actionWrapStyle}>{actionSlot}</div> : null}
      </div>

      <div style={summaryStyle}>
        {latestUpdateText ? <span>{latestUpdateText}</span> : null}
        {recordCountText ? <span>{recordCountText}</span> : null}
        {project.footerItems?.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      {hint ? <div style={hintStyle}>{hint}</div> : null}
    </section>
  );
}

const headerStyle: CSSProperties = {
  border: "1px solid #e9ede5",
  borderRadius: 22,
  background: "#fff",
  padding: 18,
  boxShadow: "0 6px 24px rgba(0,0,0,0.04)",
  marginBottom: 14,
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  color: "#6f7b69",
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 4,
};

const titleStyle: CSSProperties = {
  margin: "0 0 5px",
  color: "#1f2d1f",
  fontSize: 27,
  lineHeight: 1.22,
};

const nameStyle: CSSProperties = {
  color: "#5e6f58",
  fontSize: 15,
  lineHeight: 1.5,
};

const nameLinkStyle: CSSProperties = {
  color: "#2f6a31",
  textDecoration: "none",
  fontWeight: 700,
};

const categoryRowStyle: CSSProperties = {
  marginTop: 8,
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
};

const categoryChipStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid #dde8d7",
  background: "#f7fbf4",
  color: "#5e7258",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
};

const localBadgeStyle: CSSProperties = {
  ...categoryChipStyle,
  background: "#f6faf3",
  color: "#4e6b45",
};

const actionWrapStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const summaryStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.5,
};

const hintStyle: CSSProperties = {
  marginTop: 8,
  color: "#8a9584",
  fontSize: 12,
  lineHeight: 1.6,
};
