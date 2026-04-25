"use client";

import { useEffect, useRef, useState } from "react";
import type { LightboxImage } from "@/lib/archive-detail-types";
import { getTouchDistance } from "@/lib/archive-detail-utils";

export default function ArchiveLightbox({
  images,
  index,
  onClose,
  onChange,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onChange: (next: number) => void;
}) {
  const [scale, setScale] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const interactedRef = useRef(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setScale(1);
    touchStartX.current = null;
    touchCurrentX.current = null;
    pinchStartDistance.current = null;
    pinchStartScale.current = 1;
    interactedRef.current = false;
    suppressClickRef.current = false;
  }, [index, images.length]);

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

  function clampScale(next: number) {
    return Math.min(4, Math.max(1, Number(next.toFixed(2))));
  }

  function go(step: number) {
    const next = (index + step + images.length) % images.length;
    setScale(1);
    onChange(next);
  }

  return (
    <div
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onClose();
      }}
      onWheel={(event) => {
        event.preventDefault();
        interactedRef.current = true;
        setScale((prev) => clampScale(prev + (event.deltaY < 0 ? 0.2 : -0.2)));
      }}
      onTouchStart={(event) => {
        if (event.touches.length >= 2) {
          pinchStartDistance.current = getTouchDistance(event.touches);
          pinchStartScale.current = scale;
          touchStartX.current = null;
          return;
        }

        touchStartX.current = event.touches[0]?.clientX ?? null;
        touchCurrentX.current = touchStartX.current;
        interactedRef.current = false;
      }}
      onTouchMove={(event) => {
        if (event.touches.length >= 2) {
          const currentDistance = getTouchDistance(event.touches);
          if (pinchStartDistance.current && currentDistance) {
            const ratio = currentDistance / pinchStartDistance.current;
            setScale(clampScale(pinchStartScale.current * ratio));
          }
          interactedRef.current = true;
          suppressClickRef.current = true;
          return;
        }

        const nextX = event.touches[0]?.clientX ?? null;
        touchCurrentX.current = nextX;
        if (
          touchStartX.current !== null &&
          nextX !== null &&
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

        touchStartX.current = null;
        touchCurrentX.current = null;
        pinchStartDistance.current = null;
        pinchStartScale.current = scale;
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.86)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
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
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: "min(92vw, 1200px)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          userSelect: "none",
        }}
      >
        <img
          src={current.url}
          alt={current.alt}
          style={{
            maxWidth: "100%",
            maxHeight: "80vh",
            objectFit: "contain",
            borderRadius: 16,
            transform: `scale(${scale})`,
            transition: interactedRef.current ? "none" : "transform 0.16s ease",
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

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="关闭图片预览"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: "none",
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          fontSize: 24,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}

function navButtonStyle(side: "left" | "right") {
  return {
    position: "fixed",
    [side]: 16,
    top: "50%",
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
