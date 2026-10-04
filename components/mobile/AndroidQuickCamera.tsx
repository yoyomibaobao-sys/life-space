"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import UiIcon from "@/components/ui/UiIcon";

export default function AndroidQuickCamera({
  language,
  onCapture,
  onAlbum,
  onSkip,
  onCancel,
}: {
  language: "zh" | "en";
  onCapture: (file: File) => void | Promise<void>;
  onAlbum: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let active = true;
    void navigator.mediaDevices?.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    }).then((stream) => {
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      setReady(true);
    }).catch(() => {
      if (active) {
        setError(language === "zh"
          ? "无法打开摄像头，可使用相册或跳过照片。"
          : "Camera unavailable. Choose from album or skip photos.");
      }
    });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [language]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth || !video.videoHeight || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("capture");
      await onCapture(new File([blob], `camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      }));
    } catch {
      setError(language === "zh" ? "拍照失败，请重试。" : "Could not capture photo.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <section style={shellStyle} data-android-quick-camera="true">
      <div style={topBarStyle}>
        <button type="button" onClick={onCancel} style={topButtonStyle} aria-label={language === "zh" ? "返回" : "Back"}>
          <UiIcon name="arrow-left" size={22} />
        </button>
        <strong style={topTitleStyle}>{language === "zh" ? "拍照记录" : "Capture"}</strong>
        <button type="button" onClick={onSkip} style={skipButtonStyle}>
          {language === "zh" ? "跳过" : "Skip"}
        </button>
      </div>

      <div style={previewStyle}>
        <video ref={videoRef} playsInline muted style={videoStyle} />
        {!ready ? (
          <div style={cameraStateStyle}>{error || (language === "zh" ? "正在打开摄像头…" : "Opening camera…")}</div>
        ) : null}
      </div>

      <div style={bottomBarStyle}>
        <button type="button" onClick={onAlbum} style={sideActionStyle} aria-label={language === "zh" ? "相册" : "Album"}>
          <UiIcon name="image" size={24} />
          <span>{language === "zh" ? "相册" : "Album"}</span>
        </button>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={!ready || capturing}
          style={captureButtonStyle(!ready || capturing)}
          aria-label={language === "zh" ? "拍照" : "Take photo"}
        >
          <span style={captureInnerStyle} />
        </button>
        <button type="button" onClick={onSkip} style={sideActionStyle}>
          <UiIcon name="arrow-right" size={24} />
          <span>{language === "zh" ? "下一步" : "Next"}</span>
        </button>
      </div>
    </section>
  );
}

const shellStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1500,
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  background: "#0d120d",
  color: "#fff",
};

const topBarStyle: CSSProperties = {
  minHeight: "calc(58px + var(--app-safe-area-top, env(safe-area-inset-top, 0px)))",
  padding: "calc(8px + var(--app-safe-area-top, env(safe-area-inset-top, 0px))) 14px 8px",
  display: "grid",
  gridTemplateColumns: "48px 1fr 64px",
  alignItems: "center",
  gap: 8,
  background: "#111811",
};

const topButtonStyle: CSSProperties = {
  width: 44,
  height: 40,
  border: 0,
  background: "transparent",
  color: "#fff",
  display: "grid",
  placeItems: "center",
};

const topTitleStyle: CSSProperties = {
  textAlign: "center",
  fontSize: 17,
  fontWeight: 800,
};

const skipButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#fff",
  fontSize: 15,
  fontWeight: 750,
};

const previewStyle: CSSProperties = {
  position: "relative",
  minHeight: 0,
  overflow: "hidden",
  background: "#000",
};

const videoStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const cameraStateStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 24,
  color: "#e8eee5",
  textAlign: "center",
  lineHeight: 1.6,
};

const bottomBarStyle: CSSProperties = {
  minHeight: "calc(116px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
  padding: "14px 22px calc(14px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
  display: "grid",
  gridTemplateColumns: "1fr 92px 1fr",
  alignItems: "center",
  gap: 14,
  background: "#111811",
};

const sideActionStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#fff",
  display: "grid",
  justifyItems: "center",
  gap: 5,
  fontSize: 12,
};

function captureButtonStyle(disabled: boolean): CSSProperties {
  return {
    width: 78,
    height: 78,
    margin: "0 auto",
    borderRadius: 999,
    border: "4px solid #fff",
    background: "transparent",
    display: "grid",
    placeItems: "center",
    opacity: disabled ? 0.45 : 1,
  };
}

const captureInnerStyle: CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: 999,
  background: "#fff",
};
