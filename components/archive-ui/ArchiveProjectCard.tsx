"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import LocalBlobImage from "@/components/local/LocalBlobImage";
import type { ArchiveProjectView } from "@/components/archive-ui/types";

type Props = {
  project: ArchiveProjectView;
  onClick?: () => void;
  selectControls?: ReactNode;
  actionSlot?: ReactNode;
  mobileMode?: boolean;
};

export default function ArchiveProjectCard({
  project,
  onClick,
  selectControls,
  actionSlot,
  mobileMode = true,
}: Props) {
  const content = (
    <>
      <ArchiveProjectCover project={project} mobileMode={mobileMode} />

      <div style={bodyStyle}>
        <div style={titleRowStyle}>
          <div style={titleStyle} title={`${project.title} · ${project.systemName}`}>
            <span>{project.title}</span>
            {project.systemName ? <span style={dividerStyle}> · </span> : null}
            {project.systemName ? <span style={systemNameStyle}>{project.systemName}</span> : null}
          </div>
          {actionSlot}
        </div>

        <div style={metaRowStyle}>
          <span>{project.categoryIcon}</span>
          <span>{project.categoryLabel}</span>
          {project.subcategoryLabel ? <span>{project.subcategoryLabel}</span> : null}
          {project.groupLabel ? <span>{project.groupLabel}</span> : null}
          {project.badges?.map((badge) => (
            <span key={badge} style={badgeStyle}>
              {badge}
            </span>
          ))}
        </div>

        {selectControls ? (
          <div
            data-no-card-nav="true"
            onClick={(event) => event.stopPropagation()}
            style={selectRowStyle}
          >
            {selectControls}
          </div>
        ) : null}

        {project.latestText ? (
          <div style={latestTextStyle} title={project.latestText}>
            {project.latestText}
          </div>
        ) : null}

        <div style={bottomRowStyle}>
          <span style={statusLineStyle}>
            {project.visibilityLabel ? (
              <span style={visibilityTextStyle(project.visibilityTone)}>
                {project.visibilityLabel}
              </span>
            ) : null}
            {project.activityText
              ? `${project.visibilityLabel ? " · " : ""}${project.activityText}`
              : ""}
          </span>
          {project.statusLabel ? (
            <span style={endedStyle}>{project.statusLabel}</span>
          ) : null}
        </div>

        {project.footerItems?.length ? (
          <div style={footerStyle}>
            {project.footerItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  const cardStyle = projectCardStyle(Boolean(project.ended), mobileMode);

  if (project.href) {
    return (
      <Link href={project.href} style={cardStyle}>
        {content}
      </Link>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        ...cardStyle,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {content}
    </div>
  );
}

function ArchiveProjectCover({
  project,
  mobileMode,
}: {
  project: ArchiveProjectView;
  mobileMode: boolean;
}) {
  const style = coverStyle(mobileMode);

  if (project.cover?.kind === "url" && project.cover.url) {
    return <img src={project.cover.url} alt={project.cover.alt || project.title} loading="lazy" style={style} />;
  }

  if (project.cover?.kind === "blob") {
    return <LocalBlobImage blob={project.cover.blob} style={style} />;
  }

  return (
    <div style={{ ...style, ...placeholderStyle }}>
      <span>{project.categoryIcon}</span>
    </div>
  );
}

function projectCardStyle(ended: boolean, mobileMode: boolean): CSSProperties {
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: mobileMode ? 10 : 12,
    border: "1px solid #e4e6df",
    borderRadius: 14,
    padding: mobileMode ? 8 : 10,
    marginBottom: 10,
    minHeight: mobileMode ? 110 : 124,
    boxSizing: "border-box",
    background: ended ? "#fafafa" : "#fff",
    opacity: ended ? 0.82 : 1,
    boxShadow: ended ? "none" : "0 6px 18px rgba(44, 74, 38, 0.045)",
    color: "inherit",
    textDecoration: "none",
  };
}

function coverStyle(mobileMode: boolean): CSSProperties {
  return {
    width: mobileMode ? 94 : 104,
    height: mobileMode ? 94 : 104,
    flexShrink: 0,
    borderRadius: 11,
    objectFit: "cover",
    background: "#f4f7f1",
    overflow: "hidden",
    display: "block",
  };
}

const placeholderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #f4f7f1, #eef4ed)",
  color: "#9aaa9a",
  fontSize: 28,
};

const bodyStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const titleStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  color: "#1f2d1f",
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const dividerStyle: CSSProperties = {
  color: "#9aa493",
  fontWeight: 500,
};

const systemNameStyle: CSSProperties = {
  color: "#53694d",
  fontWeight: 700,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  minWidth: 0,
  color: "#7c8975",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f4f8ef",
  color: "#5f7a55",
  border: "1px solid #dfe9d7",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  padding: "4px 7px",
};

const selectRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  overflow: "visible",
};

const latestTextStyle: CSSProperties = {
  color: "#60705b",
  fontSize: 12,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const bottomRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  columnGap: 8,
  rowGap: 2,
  flexWrap: "wrap",
  minWidth: 0,
};

const statusLineStyle: CSSProperties = {
  flex: "1 1 150px",
  minWidth: 0,
  color: "#7f887a",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.35,
  whiteSpace: "normal",
};

function visibilityTextStyle(tone?: "public" | "private" | "neutral"): CSSProperties {
  return {
    color: tone === "public" ? "#2f8f2f" : tone === "private" ? "#888" : "#697663",
    fontWeight: 700,
  };
}

const endedStyle: CSSProperties = {
  flex: "0 0 auto",
  marginLeft: "auto",
  color: "#767f73",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
};

const footerStyle: CSSProperties = {
  marginTop: 2,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#87927f",
  fontSize: 12,
};
