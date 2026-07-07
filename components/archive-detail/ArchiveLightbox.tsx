"use client";

import { useEffect, useRef, useState } from "react";
import type { LightboxImage } from "@/lib/archive-detail-types";
import { getTouchDistance } from "@/lib/archive-detail-utils";
import {
  APP_STATUS_BAR_DARK,
  APP_STATUS_BAR_LIGHT,
  setAppStatusBarTheme,
} from "@/components/StatusBarTheme";

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
  note = "",
  onDeleteCurrentImage,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onChange: (next: number) => void;
  isMobileViewport?: boolean;
  metaText?: string;
  note?: string;
  onDeleteCurrentImage?: (
    image: LightboxImage,
    currentIndex: number,
  ) => Promise<number>;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [mobileToolbarVisible, setMobileToolbarVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    setMobileMenuOpen(false);
    interactedRef.current = false;
    suppressClickRef.current = false;
  }, [index, images.length]);

  useEffect(() => {
    if (!isMobileViewport || typeof window === "undefined") return;

    setAppStatusBarTheme(APP_STATUS_BAR_DARK);

    window.history.pushState({ __archiveLightbox: true }, "");
    pushedMobileHistoryRef.current = true;

    function handlePopState() {
      onClose();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      setAppStatusBarTheme(APP_STATUS_BAR_LIGHT);
    };
    // Run once for this mobile lightbox mount so the Android back key exits it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
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
    onClose();

    if (
      isMobileViewport &&
      pushedMobileHistoryRef.current &&
      typeof window !== "undefined" &&
      window.history.state?.__archiveLightbox
    ) {
      window.setTimeout(() => window.history.back(), 0);
    }
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
    onClose();
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
    if (!onDeleteCurrentImage) return;

    const ok = window.confirm("确定删除当前图片吗？");
    if (!ok) return;

    const remaining = await onDeleteCurrentImage(current, index);
    setMobileMenuOpen(false);

    if (remaining <= 0) {
      requestClose();
    }
  }

  if (isMobileViewport) {
    return (
      <div
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
            setMobileMenuOpen(false);
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
            setMobileMenuOpen(false);
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
              setMobileMenuOpen(false);
            }
            return;
          }

          if (maxDistance < 8) {
            setMobileToolbarVisible((visible) => !visible);
            setMobileMenuOpen(false);
            return;
          }

          if (maxDistance >= 120) {
            requestClose();
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
        <img
          src={current.url}
          alt={current.alt}
          style={{
            width: "100vw",
            height: "100dvh",
            objectFit: "contain",
            display: "block",
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: interactedRef.current ? "none" : "transform 0.14s ease",
            touchAction: "none",
          }}
        />

        {mobileToolbarVisible ? (
          <>
            <div style={mobileTopToolbarStyle}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  requestClose();
                }}
                style={mobileLightboxBackButtonStyle}
              >
                返回
              </button>
              <div style={mobileMetaTextStyle}>{metaText}</div>
              {onDeleteCurrentImage ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMobileMenuOpen((open) => !open);
                  }}
                  aria-label="图片更多操作"
                  style={mobileLightboxMoreButtonStyle}
                >
                  ⋯
                </button>
              ) : null}
              {mobileMenuOpen && onDeleteCurrentImage ? (
                <div style={mobileLightboxMenuStyle}>
                  <button
                    type="button"
                    onClick={() => void deleteCurrentMobileImage()}
                    style={mobileLightboxDangerItemStyle}
                  >
                    删除当前图片
                  </button>
                </div>
              ) : null}
            </div>

            {note.trim() ? (
              <div style={mobileBottomNoteStyle}>{note}</div>
            ) : null}
          </>
        ) : null}
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
        aria-label="上一张"
        style={navButtonStyle("left")}
      >
        ‹
      </button>

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
        aria-label="下一张"
        style={navButtonStyle("right")}
      >
        ›
      </button>

      {!isMobileViewport ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label="关闭图片预览"
          style={{
            position: "fixed",
            top: "calc(12px + env(safe-area-inset-top))",
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
          ×
        </button>
      ) : null}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="关闭图片预览"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(18px + env(safe-area-inset-bottom))",
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
        {isMobileViewport ? "返回" : "关闭"}
      </button>
    </div>
  );
}

const mobileTopToolbarStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 3002,
  minHeight: "calc(54px + env(safe-area-inset-top))",
  padding: "calc(10px + env(safe-area-inset-top)) 48px 10px",
  boxSizing: "border-box",
  background: "linear-gradient(to bottom, rgba(0,0,0,0.76), rgba(0,0,0,0))",
  color: "#fff",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
} as const;

const mobileMetaTextStyle = {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "rgba(255,255,255,0.9)",
  fontSize: 13,
  lineHeight: 1.4,
} as const;

const mobileLightboxMoreButtonStyle = {
  position: "absolute",
  top: "calc(8px + env(safe-area-inset-top))",
  right: 12,
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
} as const;

const mobileLightboxBackButtonStyle = {
  position: "absolute",
  top: "calc(9px + env(safe-area-inset-top))",
  left: 12,
  height: 34,
  minWidth: 52,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "rgba(255,255,255,0.88)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const mobileLightboxMenuStyle = {
  position: "absolute",
  top: "calc(48px + env(safe-area-inset-top))",
  right: 12,
  width: 148,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(18,18,18,0.94)",
  boxShadow: "0 18px 42px rgba(0,0,0,0.36)",
  padding: 6,
} as const;

const mobileLightboxDangerItemStyle = {
  width: "100%",
  minHeight: 36,
  border: "none",
  borderRadius: 9,
  background: "transparent",
  color: "#ffd3ce",
  fontSize: 13,
  fontWeight: 700,
  textAlign: "left",
  padding: "0 10px",
  cursor: "pointer",
} as const;

const mobileBottomNoteStyle = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 3002,
  maxHeight: "34dvh",
  overflowY: "auto",
  padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
  background: "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))",
  color: "rgba(255,255,255,0.92)",
  fontSize: 14,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
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
