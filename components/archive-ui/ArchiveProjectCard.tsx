"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import LocalBlobImage from "@/components/local/LocalBlobImage";
import type { ArchiveProjectView } from "@/components/archive-ui/types";
import CompactActivityTime from "@/components/ui/CompactActivityTime";
import ProjectMetaLine from "@/components/ui/ProjectMetaLine";
import UiIcon from "@/components/ui/UiIcon";

type Props = {
  project: ArchiveProjectView;
  onClick?: () => void;
  selectControls?: ReactNode;
  actionSlot?: ReactNode;
  actionRailSlot?: ReactNode;
  mobileMode?: boolean;
  onEditTitle?: (project: ArchiveProjectView) => void;
  onEditSystemName?: (project: ArchiveProjectView) => void;
  titleEditorSlot?: ReactNode;
  systemNameEditorSlot?: ReactNode;
};

export default function ArchiveProjectCard({
  project,
  onClick,
  selectControls,
  actionSlot,
  actionRailSlot,
  mobileMode = true,
  onEditTitle,
  onEditSystemName,
  titleEditorSlot,
  systemNameEditorSlot,
}: Props) {
  function handleInlineEdit(
    event: MouseEvent<HTMLButtonElement>,
    callback?: (project: ArchiveProjectView) => void
  ) {
    if (!callback) return;
    event.preventDefault();
    event.stopPropagation();
    callback(project);
  }

  const titleContent = (
    <div style={mobileMode ? mobileTitleTextStyle : titleStyle} title={`${project.title} · ${project.systemName}`}>
      {titleEditorSlot ? (
        <span data-no-card-nav="true" style={inlineEditorWrapStyle}>
          {titleEditorSlot}
        </span>
      ) : onEditTitle ? (
        <button
          type="button"
          data-no-card-nav="true"
          onClick={(event) => handleInlineEdit(event, onEditTitle)}
          onDoubleClick={(event) => handleInlineEdit(event, onEditTitle)}
          style={inlineEditButtonStyle(titleTextStyle)}
          title="点击可修改项目名"
        >
          {project.title}
        </button>
      ) : (
        <span>{project.title}</span>
      )}
      {project.systemName ? <span style={dividerStyle}> · </span> : null}
      {project.systemName || systemNameEditorSlot ? (
        systemNameEditorSlot ? (
          <span data-no-card-nav="true" style={inlineEditorWrapStyle}>
            {systemNameEditorSlot}
          </span>
        ) : onEditSystemName ? (
          <button
            type="button"
            data-no-card-nav="true"
            onClick={(event) => handleInlineEdit(event, onEditSystemName)}
            onDoubleClick={(event) => handleInlineEdit(event, onEditSystemName)}
            style={inlineEditButtonStyle(systemNameStyle)}
            title="点击可修改系统名"
          >
            {project.systemName}
          </button>
        ) : (
          <span style={systemNameStyle}>{project.systemName}</span>
        )
      ) : null}
    </div>
  );
  const mobileCategoryText = [
    project.categoryLabel,
    project.subcategoryLabel,
    project.groupLabel,
  ]
    .filter(Boolean)
    .join(" / ");
  const mobilePrimaryStatsText = project.mobilePrimaryStatsText || project.activityText || "";
  const mobileSecondaryStatsText = project.mobileSecondaryStatsText || "";

  const content = mobileMode ? (
    <>
      <ArchiveProjectCover project={project} mobileMode />

      <div style={mobileBodyStyle}>
        <div style={mobileTitleRowStyle}>
          {titleContent}
          {actionSlot}
        </div>

        <div style={mobileStatusCategoryRowStyle}>
          {project.visibilityLabel ? (
            <span style={visibilityBadgeStyle(project.visibilityTone)}>
              {project.visibilityLabel}
            </span>
          ) : null}
          {selectControls ? (
            <div
              data-no-card-nav="true"
              onClick={(event) => event.stopPropagation()}
              style={mobileSelectRowStyle}
            >
              {selectControls}
            </div>
          ) : mobileCategoryText ? (
            <span style={mobileCategoryTextStyle}>{mobileCategoryText}</span>
          ) : null}
        </div>

        {project.recordCount !== undefined || project.durationDays !== undefined ? (
          <ProjectMetaLine
            recordCount={project.recordCount}
            durationDays={project.durationDays}
            ended={Boolean(project.ended)}
          />
        ) : mobilePrimaryStatsText ? (
          <div style={mobileStatsLineStyle}>{mobilePrimaryStatsText}</div>
        ) : null}
        {mobileSecondaryStatsText ? (
          <div style={mobileStatsLineStyle}>{mobileSecondaryStatsText}</div>
        ) : null}
      </div>
    </>
  ) : (
    <>
      <ArchiveProjectCover project={project} mobileMode={mobileMode} />

      <div style={bodyStyle}>
        <div style={titleRowStyle}>
          <span style={categoryPillStyle(project.category)}>{project.categoryLabel}</span>
          {titleContent}
          {actionSlot}
        </div>

        <div style={statusActionRowStyle}>
          <div style={statusBadgeRowStyle}>
            {project.visibilityLabel ? (
              <span style={visibilityBadgeStyle(project.visibilityTone)}>
                {project.visibilityLabel}
              </span>
            ) : null}
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
        </div>

        {project.latestText ? (
          <div style={latestTextStyle} title={project.latestText}>
            {project.latestText}
            {project.latestTime ? (
              <>
                <span aria-hidden="true"> · </span>
                <CompactActivityTime value={project.latestTime} />
              </>
            ) : null}
          </div>
        ) : null}

        <div style={bottomRowStyle}>
          {project.recordCount !== undefined || project.durationDays !== undefined ? (
            <ProjectMetaLine
              recordCount={project.recordCount}
              durationDays={project.durationDays}
              ended={Boolean(project.ended)}
              viewCount={project.viewCount}
              followerCount={project.followerCount}
              commentCount={project.commentCount}
            />
          ) : (
            <span style={statusLineStyle}>{project.activityText || ""}</span>
          )}
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

      {actionRailSlot ? (
        <div
          data-no-card-nav="true"
          onClick={(event) => event.stopPropagation()}
          style={actionRailStyle}
        >
          {actionRailSlot}
        </div>
      ) : null}
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
    return (
      <img
        src={project.cover.url}
        alt={project.cover.alt || project.title}
        loading="lazy"
        style={style}
      />
    );
  }

  if (project.cover?.kind === "blob") {
    return <LocalBlobImage blob={project.cover.blob} style={style} />;
  }

  return (
    <div style={{ ...style, ...placeholderStyle }}>
      <UiIcon name={project.categoryIcon} size={24} strokeWidth={1.6} />
    </div>
  );
}

function projectCardStyle(ended: boolean, mobileMode: boolean): CSSProperties {
  return {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
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
    alignSelf: "flex-start",
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
  gap: 5,
};

const mobileBodyStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const mobileTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const mobileTitleTextStyle: CSSProperties = {
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

const mobileStatusCategoryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  overflow: "visible",
};

const mobileSelectRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  overflow: "visible",
};

const mobileCategoryTextStyle: CSSProperties = {
  minWidth: 0,
  color: "#667066",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mobileStatsLineStyle: CSSProperties = {
  minWidth: 0,
  color: "#7f887a",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const actionRailStyle: CSSProperties = {
  minWidth: 46,
  marginLeft: 4,
  paddingLeft: 8,
  borderLeft: "1px solid #f0f0ec",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  alignItems: "flex-end",
  gap: 8,
  alignSelf: "stretch",
};

const titleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
};

function categoryPillStyle(category: string): CSSProperties {
  return {
    flexShrink: 0,
    fontSize: 12,
    color: category === "plant" ? "#4b7244" : "#6c6c7a",
    background: category === "plant" ? "#edf6e9" : "#f1f1f5",
    borderRadius: 999,
    padding: "2px 7px",
    lineHeight: 1.3,
    whiteSpace: "nowrap",
  };
}

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

const titleTextStyle: CSSProperties = {
  color: "#1f2d1f",
  fontWeight: 800,
};

function inlineEditButtonStyle(extra?: CSSProperties): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "baseline",
    ...extra,
  };
}

const inlineEditorWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minWidth: 0,
  maxWidth: "100%",
  verticalAlign: "baseline",
};

const dividerStyle: CSSProperties = {
  color: "#9aa493",
  fontWeight: 500,
};

const systemNameStyle: CSSProperties = {
  color: "#53694d",
  fontWeight: 700,
};

const statusActionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  minWidth: 0,
};

const statusBadgeRowStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
  minWidth: 0,
};

function visibilityBadgeStyle(tone?: "public" | "private" | "neutral"): CSSProperties {
  return {
    borderRadius: 999,
    border: tone === "public" ? "1px solid #b7dfbb" : "1px solid #ddd",
    background: tone === "public" ? "#f1fff1" : "#fff",
    color: tone === "public" ? "#2f8f2f" : tone === "private" ? "#888" : "#697663",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    padding: "4px 7px",
    whiteSpace: "nowrap",
  };
}

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  background: "#f4f8ef",
  color: "#5f7a55",
  border: "1px solid #dfe9d7",
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  padding: "4px 7px",
  whiteSpace: "nowrap",
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
  marginTop: 1,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#929b8d",
  fontSize: 11,
  lineHeight: 1.3,
};
