"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";
import {
  buildExperienceCardVideoScenes,
  getExperienceCardVideoDuration,
  type ExperienceCardVideoImageSelection,
} from "@/lib/experience-card-video";
import type { ExperienceCardDetail } from "@/lib/experience-card-types";
import { useLanguage } from "@/lib/i18n/useLanguage";

function getPublicPlaybackSelection(detail: ExperienceCardDetail) {
  const mediaIds = detail.card.playback_media_ids;
  if (!Array.isArray(mediaIds)) return undefined;
  const selected = new Set(mediaIds);

  return Object.fromEntries(
    detail.records.map((record) => [
      record.id,
      record.media
        .filter((media) => selected.has(media.id))
        .map((media) => media.display_url || media.display_thumb_url || "")
        .filter(Boolean),
    ])
  ) as ExperienceCardVideoImageSelection;
}

export default function PublicExperiencePlayer({
  detail,
  active,
  fullscreen = false,
}: {
  detail: ExperienceCardDetail;
  active: boolean;
  fullscreen?: boolean;
}) {
  const { language, t } = useLanguage();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const scenes = useMemo(
    () =>
      buildExperienceCardVideoScenes(
        detail,
        getPublicPlaybackSelection(detail),
        undefined,
        "",
        language
      ),
    [detail, language]
  );
  const duration = useMemo(() => getExperienceCardVideoDuration(scenes), [scenes]);
  const currentScene = scenes[sceneIndex] || scenes[0];
  const elapsedBeforeScene = scenes
    .slice(0, sceneIndex)
    .reduce((total, scene) => total + scene.duration, 0);
  const progress = duration > 0
    ? Math.min(1, (elapsedBeforeScene + elapsed) / duration)
    : 0;

  useEffect(() => {
    if (!active || paused || !currentScene) return;
    const intervalId = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 0.1;
        if (next < currentScene.duration) return next;
        setSceneIndex((index) => (index + 1) % scenes.length);
        return 0;
      });
    }, 100);
    return () => window.clearInterval(intervalId);
  }, [active, currentScene, paused, scenes.length]);

  if (!currentScene) return null;

  return (
    <article style={fullscreen ? fullscreenPlayerShellStyle : playerShellStyle} aria-label={detail.card.title}>
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? t.experience.play : t.experience.pause}
        style={fullscreen ? fullscreenStageButtonStyle : stageButtonStyle}
      >
        {currentScene.imageUrl ? (
          <img
            src={currentScene.imageUrl}
            alt=""
            style={sceneImageStyle}
          />
        ) : null}
        <span style={sceneShadeStyle} />

        {currentScene.kind === "intro" ? (
          <span style={introStyle}>
            <span style={introBrandStyle}>{currentScene.subtitle}</span>
            <strong style={introTitleStyle}>{currentScene.title}</strong>
            <span style={introAuthorStyle}>{currentScene.text}</span>
          </span>
        ) : currentScene.kind === "outro" ? (
          <span style={introStyle}>
            <strong style={introTitleStyle}>{currentScene.title}</strong>
            <span style={introAuthorStyle}>{currentScene.text}</span>
          </span>
        ) : (
          <span style={fullscreen ? fullscreenRecordCaptionStyle : recordCaptionStyle}>
            <span style={recordDateStyle}>{currentScene.date}</span>
            {currentScene.text ? (
              <span style={recordTextStyle}>{currentScene.text}</span>
            ) : null}
            {currentScene.tags.length > 0 ? (
              <span style={tagRowStyle}>
                {currentScene.tags.map((tag) => (
                  <span key={tag} style={tagStyle}>{tag}</span>
                ))}
              </span>
            ) : null}
          </span>
        )}

        {paused ? (
          <span style={pausedBadgeStyle}>
            <UiIcon name="record" size={18} /> {t.experience.paused}
          </span>
        ) : null}
      </button>

      <span style={fullscreen ? fullscreenProgressTrackStyle : progressTrackStyle}>
        <span style={{ ...progressFillStyle, width: `${progress * 100}%` }} />
      </span>

      <div style={fullscreen ? fullscreenMetaStyle : metaStyle}>
        <div style={{ minWidth: 0 }}>
          <strong style={fullscreen ? fullscreenTitleStyle : titleStyle}>{detail.card.title}</strong>
          <span style={fullscreen ? fullscreenAuthorStyle : authorStyle}>
            {detail.author?.username || t.experience.default_user}
            {detail.archive.title ? ` · ${detail.archive.title}` : ""}
          </span>
        </div>
        {!fullscreen ? (
          <Link href={`/experience-cards/${detail.card.id}`} style={detailLinkStyle}>
            {t.experience.view_details}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

const playerShellStyle: CSSProperties = {
  width: "min(100%, 330px)",
  margin: "0 auto 16px",
  scrollSnapAlign: "start",
};
const fullscreenPlayerShellStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  margin: 0,
  overflow: "hidden",
  background: "#101710",
};
const stageButtonStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "9 / 16",
  maxHeight: "calc(100vh - 190px)",
  display: "block",
  overflow: "hidden",
  border: 0,
  borderRadius: 18,
  background: "linear-gradient(155deg, #344f35, #162417)",
  color: "#fff",
  padding: 0,
  textAlign: "left",
  cursor: "pointer",
  boxShadow: "0 12px 34px rgba(31, 48, 31, 0.18)",
};
const fullscreenStageButtonStyle: CSSProperties = {
  ...stageButtonStyle,
  height: "100%",
  maxHeight: "none",
  aspectRatio: "auto",
  borderRadius: 0,
  boxShadow: "none",
};
const sceneImageStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
};
const sceneShadeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(8,17,9,.08) 35%, rgba(8,17,9,.78) 100%)",
};
const introStyle: CSSProperties = {
  position: "absolute",
  inset: "25% 10% auto",
  display: "grid",
  gap: 13,
  textAlign: "center",
  textShadow: "0 2px 12px rgba(0,0,0,.35)",
};
const introBrandStyle: CSSProperties = { fontSize: 13, letterSpacing: 1.2 };
const introTitleStyle: CSSProperties = { fontSize: 27, lineHeight: 1.3 };
const introAuthorStyle: CSSProperties = { fontSize: 14, opacity: 0.9 };
const recordCaptionStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 18,
  display: "grid",
  gap: 7,
  padding: "13px 14px",
  borderRadius: 14,
  background: "rgba(15, 25, 15, 0.58)",
  backdropFilter: "blur(7px)",
};
const fullscreenRecordCaptionStyle: CSSProperties = {
  ...recordCaptionStyle,
  bottom: "calc(92px + var(--app-safe-area-bottom))",
};
const recordDateStyle: CSSProperties = { fontSize: 12, opacity: 0.82 };
const recordTextStyle: CSSProperties = { fontSize: 15, lineHeight: 1.55 };
const tagRowStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap" };
const tagStyle: CSSProperties = {
  padding: "3px 7px",
  borderRadius: 999,
  background: "rgba(255,255,255,.15)",
  fontSize: 11,
};
const pausedBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 9px",
  borderRadius: 999,
  background: "rgba(0,0,0,.48)",
  color: "#fff",
  fontSize: 12,
};
const progressTrackStyle: CSSProperties = {
  display: "block",
  height: 3,
  margin: "7px 5px 0",
  overflow: "hidden",
  borderRadius: 999,
  background: "#dfe7dc",
};
const fullscreenProgressTrackStyle: CSSProperties = {
  ...progressTrackStyle,
  position: "absolute",
  left: 12,
  right: 12,
  bottom: "calc(78px + var(--app-safe-area-bottom))",
  zIndex: 4,
  margin: 0,
  background: "rgba(255,255,255,.28)",
};
const progressFillStyle: CSSProperties = {
  display: "block",
  height: "100%",
  borderRadius: 999,
  background: "#648c60",
  transition: "width .1s linear",
};
const metaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "9px 4px 0",
};
const fullscreenMetaStyle: CSSProperties = {
  ...metaStyle,
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 4,
  padding: "14px 16px calc(16px + var(--app-safe-area-bottom))",
  background: "linear-gradient(180deg, transparent, rgba(8,14,8,.78))",
};
const titleStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  color: "#253725",
  fontSize: 15,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const authorStyle: CSSProperties = {
  display: "block",
  marginTop: 3,
  overflow: "hidden",
  color: "#768273",
  fontSize: 12,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const fullscreenTitleStyle: CSSProperties = {
  ...titleStyle,
  color: "#fff",
};
const fullscreenAuthorStyle: CSSProperties = {
  ...authorStyle,
  color: "rgba(255,255,255,.78)",
};
const detailLinkStyle: CSSProperties = {
  flexShrink: 0,
  color: "#4f744d",
  fontSize: 13,
  fontWeight: 750,
  textDecoration: "none",
};
