"use client";

import { useEffect, useRef, useState } from "react";
import type { LightboxImage } from "@/lib/archive-detail-types";
import { getTouchDistance } from "@/lib/archive-detail-utils";
import {
  APP_STATUS_BAR_DARK,
  APP_STATUS_BAR_LIGHT,
  setAppStatusBarHidden,
  setAppStatusBarTheme,
} from "@/components/StatusBarTheme";
import UiIcon from "@/components/ui/UiIcon";
import AppConfirmDialog from "@/components/mobile/AppConfirmDialog";
import { showToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { saveViewedImage } from "@/lib/image-save";

type PanOffset = {
  x: number;
  y: number;
};

export default function ArchiveLightbox({
  images,
  index,
  onClose,
  onChange,
  isMobileViewport = false,
  metaText = "",
  dayText = "",
  note = "",
  onDeleteCurrentImage,
  deleteActionLabel,
  deleteConfirmMessage,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onChange: (next: number) => void;
  isMobileViewport?: boolean;
  metaText?: string;
  dayText?: string;
  note?: string;
  onDeleteCurrentImage?: (
    image: LightboxImage,
    currentIndex: number,
  ) => Promise<number>;
  deleteActionLabel?: string;
  deleteConfirmMessage?: string;
}) {
  const { language, t } = useLanguage();
  const copy = t.record;
  const resolvedDeleteActionLabel = deleteActionLabel || copy.delete_current_image;
  const resolvedDeleteConfirmMessage =
    deleteConfirmMessage || copy.delete_current_image_confirm;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [mobileToolbarVisible, setMobileToolbarVisible] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [imageActionBusy, setImageActionBusy] = useState(false);
  const [isDeletingCurrentImage, setIsDeletingCurrentImage] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const mobileTouchStart = useRef<PanOffset | null>(null);
  const mobileTouchCurrent = useRef<PanOffset | null>(null);
  const mobileTouchMoved = useRef(false);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const panStartPoint = useRef<PanOffset | null>(null);
  const panStartOffset = useRef<PanOffset>({ x: 0, y: 0 });
  const mousePanStartPoint = useRef<PanOffset | null>(null);
  const mousePanStartOffset = useRef<PanOffset>({ x: 0, y: 0 });
  const [isMousePanning, setIsMousePanning] = useState(false);
  const interactedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pushedMobileHistoryRef = useRef(false);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    touchStartX.current = null;
    touchCurrentX.current = null;
    pinchStartDistance.current = null;
    pinchStartScale.current = 1;
    panStartPoint.current = null;
    panStartOffset.current = { x: 0, y: 0 };
    mousePanStartPoint.current = null;
    mousePanStartOffset.current = { x: 0, y: 0 };
    setIsMousePanning(false);
    setMobileToolbarVisible(false);
    setTrashConfirmOpen(false);
    interactedRef.current = false;
    suppressClickRef.current = false;
  }, [index, images.length]);

  useEffect(() => {
    if (!isMobileViewport || typeof window === "undefined") return;

    setAppStatusBarTheme(APP_STATUS_BAR_DARK);
    setAppStatusBarHidden(true);
    document.documentElement.dataset.mobileOverlayOpen = "true";

    window.history.pushState(
      { ...(window.history.state || {}), __archiveLightbox: true },
      "",
      window.location.href,
    );
    pushedMobileHistoryRef.current = true;

    function handlePopState() {
      if (document.visibilityState === "hidden") {
        if (pushedMobileHistoryRef.current && !window.history.state?.__archiveLightbox) {
          window.history.pushState(
            { ...(window.history.state || {}), __archiveLightbox: true },
            "",
            window.location.href,
          );
        }
        return;
      }
      pushedMobileHistoryRef.current = false;
      onClose();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (pushedMobileHistoryRef.current && window.history.state?.__archiveLightbox) {
        pushedMobileHistoryRef.current = false;
        const rest = { ...window.history.state };
        delete rest.__archiveLightbox;
        window.history.replaceState(rest, "", window.location.href);
      }
      delete document.documentElement.dataset.mobileOverlayOpen;
      setAppStatusBarHidden(false);
      setAppStatusBarTheme(APP_STATUS_BAR_LIGHT);
    };
    // Run once for this mobile lightbox mount so the Android back key exits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!images.length) return null;

  const current = images[((index % images.length) + images.length) % images.length];

  function requestClose() {
    if (
      isMobileViewport &&
      pushedMobileHistoryRef.current &&
      typeof window !== "undefined" &&
      window.history.state?.__archiveLightbox
    ) {
      window.history.back();
      return;
    }

    onClose();
  }

  function clampScale(next: number) {
    return Math.min(4, Math.max(1, Number(next.toFixed(2))));
  }

  function clampOffset(next: PanOffset, nextScale = scale): PanOffset {
    if (nextScale <= 1.02) return { x: 0, y: 0 };

    const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
    const maxX = Math.max(40, (viewportWidth * (nextScale - 1)) / 2 + 80);
    const maxY = Math.max(40, (viewportHeight * (nextScale - 1)) / 2 + 80);

    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function setNextScale(next: number) {
    const clamped = clampScale(next);
    setScale(clamped);
    setOffset((prev) => clampOffset(prev, clamped));
  }

  function go(step: number) {
    const next = (index + step + images.length) % images.length;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsMousePanning(false);
    mousePanStartPoint.current = null;
    onChange(next);
  }

  function closeFromTap() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    requestClose();
  }

  function startMousePan(event: React.MouseEvent<HTMLImageElement>) {
    if (scale <= 1.02) return;

    event.preventDefault();
    event.stopPropagation();
    mousePanStartPoint.current = { x: event.clientX, y: event.clientY };
    mousePanStartOffset.current = offset;
    interactedRef.current = false;
    suppressClickRef.current = false;
    setIsMousePanning(true);
  }

  function moveMousePan(event: React.MouseEvent<HTMLDivElement>) {
    if (!isMousePanning || !mousePanStartPoint.current) return;

    event.preventDefault();
    const dx = event.clientX - mousePanStartPoint.current.x;
    const dy = event.clientY - mousePanStartPoint.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      interactedRef.current = true;
      suppressClickRef.current = true;
    }

    setOffset(
      clampOffset({
        x: mousePanStartOffset.current.x + dx,
        y: mousePanStartOffset.current.y + dy,
      })
    );
  }

  function endMousePan() {
    if (!isMousePanning) return;
    setIsMousePanning(false);
    mousePanStartPoint.current = null;
  }

  async function deleteCurrentMobileImage() {
    if (!onDeleteCurrentImage || isDeletingCurrentImage) return;

    setTrashConfirmOpen(false);
    setIsDeletingCurrentImage(true);
    try {
      const remaining = await onDeleteCurrentImage(current, index);

      if (remaining <= 0) {
        requestClose();
      }
    } catch {
      showToast(language === "zh" ? "移入回收站失败，请重试。" : "Could not move image to trash. Try again.");
    } finally {
      setIsDeletingCurrentImage(false);
    }
  }

  async function saveCurrentImage() {
    if (imageActionBusy) return;
    setImageActionBusy(true);
    try {
      const saved = await saveViewedImage(current.url, current.id);
      if (saved) showToast(language === "zh" ? "图片已下载" : "Image downloaded");
    } catch {
      showToast(language === "zh" ? "图片下载失败，请检查访问权限和网络后重试。" : "Could not download the image. Check access and connectivity.");
    } finally {
      setImageActionBusy(false);
    }
  }

  if (isMobileViewport) {
    return (
      <div
        data-mobile-swipe-ignore="true"
        onTouchStart={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("button")) return;

          if (event.touches.length >= 2) {
            pinchStartDistance.current = getTouchDistance(event.touches);
            pinchStartScale.current = scale;
            panStartPoint.current = null;
            mobileTouchStart.current = null;
            mobileTouchCurrent.current = null;
            mobileTouchMoved.current = true;
            return;
          }

          const touch = event.touches[0];
          if (!touch) return;
          mobileTouchStart.current = { x: touch.clientX, y: touch.clientY };
          mobileTouchCurrent.current = { x: touch.clientX, y: touch.clientY };
          mobileTouchMoved.current = false;
          interactedRef.current = false;
          suppressClickRef.current = false;

          if (scale > 1.02) {
            panStartPoint.current = { x: touch.clientX, y: touch.clientY };
            panStartOffset.current = offset;
          } else {
            panStartPoint.current = null;
            panStartOffset.current = { x: 0, y: 0 };
          }
        }}
        onTouchMove={(event) => {
          if (event.touches.length >= 2) {
            event.preventDefault();
            const currentDistance = getTouchDistance(event.touches);
            if (pinchStartDistance.current && currentDistance) {
              const ratio = currentDistance / pinchStartDistance.current;
              const nextScale = clampScale(pinchStartScale.current * ratio);
              setScale(nextScale);
              setOffset((prev) => clampOffset(prev, nextScale));
            }
            mobileTouchMoved.current = true;
            interactedRef.current = true;
            suppressClickRef.current = true;
            return;
          }

          const touch = event.touches[0];
          if (!touch || !mobileTouchStart.current) return;

          if (scale > 1.02 && panStartPoint.current) {
            event.preventDefault();
            const dx = touch.clientX - panStartPoint.current.x;
            const dy = touch.clientY - panStartPoint.current.y;

            if (Math.max(Math.abs(dx), Math.abs(dy)) > 3) {
              mobileTouchMoved.current = true;
              interactedRef.current = true;
              suppressClickRef.current = true;
            }

            setOffset(
              clampOffset({
                x: panStartOffset.current.x + dx,
                y: panStartOffset.current.y + dy,
              })
            );
            return;
          }

          mobileTouchCurrent.current = { x: touch.clientX, y: touch.clientY };

          const dx = touch.clientX - mobileTouchStart.current.x;
          const dy = touch.clientY - mobileTouchStart.current.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
            mobileTouchMoved.current = true;
          }
        }}
        onTouchEnd={(event) => {
          if (event.touches.length > 0) return;

          if (pinchStartDistance.current) {
            pinchStartDistance.current = null;
            pinchStartScale.current = scale;
            panStartPoint.current = null;
            mobileTouchStart.current = null;
            mobileTouchCurrent.current = null;
            return;
          }

          const start = mobileTouchStart.current;
          const currentTouch = mobileTouchCurrent.current;

          mobileTouchStart.current = null;
          mobileTouchCurrent.current = null;
          panStartPoint.current = null;

          if (!start || !currentTouch) return;

          const dx = currentTouch.x - start.x;
          const dy = currentTouch.y - start.y;
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);
          const maxDistance = Math.max(absX, absY);

          if (scale > 1.02) {
            if (maxDistance < 8) {
              setMobileToolbarVisible((visible) => !visible);
            }
            return;
          }

          if (maxDistance < 8) {
            setMobileToolbarVisible((visible) => !visible);
            return;
          }

          if (absX >= 48 && absY < 70) {
            go(dx > 0 ? -1 : 1);
          }
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 3000,
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div style={{ ...mobileMediaColumnStyle,
          gridTemplateRows: mobileToolbarVisible ? "auto minmax(0, 1fr) auto" : "minmax(0, 1fr)" }}>
          {mobileToolbarVisible ? (
            <div style={mobileTopToolbarStyle}>
              <button type="button" style={mobileLightboxBackButtonStyle}
                onClick={(event) => { event.stopPropagation(); requestClose(); }}>
                {copy.back}
              </button>
              <div style={mobileMetaTextStyle}>
                <div>{metaText}</div>
                {dayText ? <div style={mobileDayTextStyle}>{dayText}</div> : null}
              </div>
              <div style={mobileImageCountStyle}>{index + 1}/{images.length}</div>
            </div>
          ) : null}
          <div style={mobileImageFrameStyle}>
            <img
              src={current.url}
              alt={current.alt}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
                transition: interactedRef.current ? "none" : "transform 0.14s ease",
                touchAction: "none",
              }}
            />
          </div>
          {mobileToolbarVisible ? (
            <div style={mobileMediaFooterStyle}
              onClick={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}>
              <div style={mobileFooterNoteStyle}>{note}</div>
              <div style={mobileImageActionsStyle}>
                <button type="button" style={mobileImageActionButtonStyle}
                  aria-label={language === "zh" ? "下载当前图片" : "Download current image"}
                  title={language === "zh" ? "下载图片" : "Download image"}
                  disabled={imageActionBusy} onClick={() => void saveCurrentImage()}>
                  <UiIcon name="download" size={22} />
                </button>
                {onDeleteCurrentImage ? (
                  <button type="button" style={mobileImageActionButtonStyle}
                    aria-label={resolvedDeleteActionLabel} title={resolvedDeleteActionLabel}
                    disabled={isDeletingCurrentImage} onClick={() => setTrashConfirmOpen(true)}>
                    <UiIcon name="trash" size={21} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div onClick={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}>
          <AppConfirmDialog open={trashConfirmOpen}
            title={resolvedDeleteActionLabel}
            message={resolvedDeleteConfirmMessage}
            cancelLabel={language === "zh" ? "取消" : "Cancel"}
            confirmLabel={resolvedDeleteActionLabel} destructive
            onCancel={() => setTrashConfirmOpen(false)}
            onConfirm={() => void deleteCurrentMobileImage()} />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={closeFromTap}
      onWheel={(event) => {
        event.preventDefault();
        interactedRef.current = true;
        setNextScale(scale + (event.deltaY < 0 ? 0.2 : -0.2));
      }}
      onMouseMove={moveMousePan}
      onMouseUp={endMousePan}
      onMouseLeave={endMousePan}
      onTouchStart={(event) => {
        if (event.touches.length >= 2) {
          pinchStartDistance.current = getTouchDistance(event.touches);
          pinchStartScale.current = scale;
          panStartPoint.current = null;
          touchStartX.current = null;
          return;
        }

        const touch = event.touches[0];
        if (!touch) return;

        touchStartX.current = touch.clientX;
        touchCurrentX.current = touch.clientX;
        interactedRef.current = false;

        if (scale > 1.02) {
          panStartPoint.current = { x: touch.clientX, y: touch.clientY };
          panStartOffset.current = offset;
        } else {
          panStartPoint.current = null;
          panStartOffset.current = { x: 0, y: 0 };
        }
      }}
      onTouchMove={(event) => {
        if (event.touches.length >= 2) {
          const currentDistance = getTouchDistance(event.touches);
          if (pinchStartDistance.current && currentDistance) {
            const ratio = currentDistance / pinchStartDistance.current;
            const nextScale = clampScale(pinchStartScale.current * ratio);
            setScale(nextScale);
            setOffset((prev) => clampOffset(prev, nextScale));
          }
          interactedRef.current = true;
          suppressClickRef.current = true;
          return;
        }

        const touch = event.touches[0];
        if (!touch) return;

        if (scale > 1.02 && panStartPoint.current) {
          event.preventDefault();
          const dx = touch.clientX - panStartPoint.current.x;
          const dy = touch.clientY - panStartPoint.current.y;

          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            interactedRef.current = true;
            suppressClickRef.current = true;
          }

          setOffset(
            clampOffset({
              x: panStartOffset.current.x + dx,
              y: panStartOffset.current.y + dy,
            })
          );
          return;
        }

        const nextX = touch.clientX;
        touchCurrentX.current = nextX;
        if (
          touchStartX.current !== null &&
          Math.abs(nextX - touchStartX.current) > 6
        ) {
          interactedRef.current = true;
          suppressClickRef.current = true;
        }
      }}
      onTouchEnd={() => {
        if (
          touchStartX.current !== null &&
          touchCurrentX.current !== null &&
          Math.abs(touchCurrentX.current - touchStartX.current) > 48 &&
          scale <= 1.02
        ) {
          if (touchCurrentX.current > touchStartX.current) {
            go(-1);
          } else {
            go(1);
          }
        }

        if (scale <= 1.02) {
          setOffset({ x: 0, y: 0 });
        }

        touchStartX.current = null;
        touchCurrentX.current = null;
        pinchStartDistance.current = null;
        pinchStartScale.current = scale;
        panStartPoint.current = null;
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background: "rgba(0,0,0,0.86)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        touchAction: "none",
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          go(-1);
        }}
        aria-label={copy.previous_image}
        style={navButtonStyle("left")}
      >
        <UiIcon name="chevron-left" size={26} />
      </button>
      <div style={{ position: "fixed", right: 16, bottom: "calc(16px + var(--app-safe-area-bottom))",
        zIndex: 3002, display: "flex", gap: 6 }} onClick={(event) => event.stopPropagation()}>
        <button type="button" aria-label={language === "zh" ? "下载当前图片" : "Download current image"}
          title={language === "zh" ? "下载图片" : "Download image"}
          disabled={imageActionBusy} onClick={() => void saveCurrentImage()}
          style={mobileImageActionButtonStyle}>
          <UiIcon name="download" size={22} />
        </button>
        {onDeleteCurrentImage ? (
          <button type="button" aria-label={resolvedDeleteActionLabel} title={resolvedDeleteActionLabel}
            disabled={isDeletingCurrentImage} onClick={() => setTrashConfirmOpen(true)}
            style={mobileImageActionButtonStyle}>
            <UiIcon name="trash" size={21} />
          </button>
        ) : null}
      </div>

      <div
        onClick={(event) => {
          if (isMobileViewport) {
            closeFromTap();
            return;
          }

          event.stopPropagation();
        }}
        style={{
          width: "100vw",
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          userSelect: "none",
          padding: "12px 0 10px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <img
          src={current.url}
          alt={current.alt}
          onMouseDown={startMousePan}
          onClick={(event) => {
            event.stopPropagation();
            closeFromTap();
          }}
          style={{
            maxWidth: "100vw",
            maxHeight: "calc(100dvh - 58px)",
            objectFit: "contain",
            borderRadius: 0,
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: interactedRef.current ? "none" : "transform 0.16s ease",
            touchAction: "none",
            cursor: isMousePanning ? "grabbing" : scale > 1.02 ? "grab" : "zoom-in",
          }}
        />

        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>
          {index + 1} / {images.length}
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          go(1);
        }}
        aria-label={copy.next_image}
        style={navButtonStyle("right")}
      >
        <UiIcon name="chevron-right" size={26} />
      </button>

      {!isMobileViewport ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label={copy.close_preview}
          style={{
            position: "fixed",
            top: "calc(12px + var(--app-safe-area-top))",
            right: 12,
            zIndex: 3002,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: "none",
            background: "rgba(255,255,255,0.2)",
            color: "#fff",
            fontSize: 26,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          <UiIcon name="close" size={24} />
        </button>
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label={copy.close_preview}
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(18px + var(--app-safe-area-bottom))",
          zIndex: 3002,
          transform: "translateX(-50%)",
          minWidth: 96,
          height: 40,
          padding: "0 18px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.28)",
          background: "rgba(0,0,0,0.38)",
          color: "#fff",
          fontSize: 14,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
      >
        {isMobileViewport ? copy.back : copy.close}
      </button>
      <div onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}>
        <AppConfirmDialog open={trashConfirmOpen}
          title={resolvedDeleteActionLabel} message={resolvedDeleteConfirmMessage}
          cancelLabel={language === "zh" ? "取消" : "Cancel"}
          confirmLabel={resolvedDeleteActionLabel} destructive
          onCancel={() => setTrashConfirmOpen(false)}
          onConfirm={() => void deleteCurrentMobileImage()} />
      </div>
    </div>
  );
}

const mobileTopToolbarStyle = {
  zIndex: 3002,
  minHeight: "calc(60px + var(--app-safe-area-top))",
  padding: "calc(9px + var(--app-safe-area-top)) 12px 8px",
  boxSizing: "border-box",
  background: "#000",
  color: "#fff",
  display: "grid",
  gridTemplateColumns: "68px minmax(0, 1fr) 68px",
  gap: 6,
  alignItems: "center",
} as const;

const mobileMetaTextStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  color: "rgba(255,255,255,0.92)",
  fontSize: 12.5,
  lineHeight: 1.4,
  textAlign: "center",
} as const;

const mobileDayTextStyle = {
  color: "rgba(255,255,255,0.68)",
  fontSize: 11.5,
  lineHeight: 1.5,
} as const;

const mobileLightboxBackButtonStyle = {
  height: 40,
  width: 62,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.92)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const mobileMediaColumnStyle = {
  width: "100vw",
  height: "100dvh",
  display: "grid",
  gridTemplateRows: "minmax(0, 1fr)",
  background: "#000",
} as const;

const mobileImageFrameStyle = {
  minHeight: 0,
  width: "100%",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
} as const;

const mobileMediaFooterStyle = {
  position: "relative",
  zIndex: 3002,
  width: "100%",
  maxHeight: "28dvh",
  overflowY: "hidden",
  padding: "10px 16px calc(14px + var(--app-safe-area-bottom))",
  boxSizing: "border-box",
  background: "#000",
  color: "rgba(255,255,255,0.92)",
  textAlign: "left",
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
} as const;

const mobileImageCountStyle = {
  color: "rgba(255,255,255,0.78)",
  fontSize: 13,
  lineHeight: 1.4,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
} as const;

const mobileFooterNoteStyle = {
  flex: "1 1 auto",
  minWidth: 0,
  maxHeight: "calc(28dvh - 30px - var(--app-safe-area-bottom))",
  overflowY: "auto",
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} as const;

const mobileImageActionsStyle = {
  flex: "0 0 auto",
  display: "flex",
  gap: 4,
  alignItems: "flex-start",
} as const;

const mobileImageActionButtonStyle = {
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.07)",
  color: "#fff",
  cursor: "pointer",
  flexShrink: 0,
} as const;

function navButtonStyle(side: "left" | "right") {
  return {
    position: "fixed",
    [side]: 16,
    top: "50%",
    zIndex: 3001,
    transform: "translateY(-50%)",
    width: 40,
    height: 40,
    borderRadius: 999,
    border: "none",
    background: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 26,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
}
