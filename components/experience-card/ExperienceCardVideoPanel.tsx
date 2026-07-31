"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { showToast } from "@/components/Toast";
import type { ExperienceCardDetail } from "@/lib/experience-card-types";
import {
  buildExperienceCardVideoScenes,
  formatExperienceCardVideoDuration,
  generateExperienceCardMp4,
  getExperienceCardVideoDuration,
  getExperienceCardVideoErrorText,
  getExperienceCardVideoFilename,
  loadExperienceCardVideoImages,
  releaseExperienceCardVideoImages,
  renderExperienceCardVideoFrame,
  type ExperienceCardVideoImages,
} from "@/lib/experience-card-video";

export default function ExperienceCardVideoPanel({
  detail,
}: {
  detail: ExperienceCardDetail;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [images, setImages] = useState<ExperienceCardVideoImages>(new Map());
  const [imageLoading, setImageLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [errorText, setErrorText] = useState("");

  const scenes = useMemo(
    () => buildExperienceCardVideoScenes(detail),
    [detail]
  );
  const duration = useMemo(
    () => getExperienceCardVideoDuration(scenes),
    [scenes]
  );
  const filename = useMemo(
    () => getExperienceCardVideoFilename(detail),
    [detail]
  );

  useEffect(() => {
    let cancelled = false;
    let loadedImages: ExperienceCardVideoImages = new Map();
    setImageLoading(true);
    setImages(new Map());

    void loadExperienceCardVideoImages(detail)
      .then((nextImages) => {
        loadedImages = nextImages;
        if (cancelled) {
          releaseExperienceCardVideoImages(nextImages);
          return;
        }
        setImages(nextImages);
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });

    return () => {
      cancelled = true;
      releaseExperienceCardVideoImages(loadedImages);
    };
  }, [detail]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || videoUrl) return;
    canvas.width = 360;
    canvas.height = 640;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const startTime = performance.now();
    let frameId = 0;

    const draw = (now: number) => {
      renderExperienceCardVideoFrame(
        context,
        scenes,
        images,
        (now - startTime) / 1000
      );
      frameId = window.requestAnimationFrame(draw);
    };

    renderExperienceCardVideoFrame(context, scenes, images, 0);
    frameId = window.requestAnimationFrame(draw);

    return () => window.cancelAnimationFrame(frameId);
  }, [images, scenes, videoUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function clearGeneratedVideo() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl("");
    setVideoBlob(null);
  }

  async function handleGenerate() {
    if (generating || imageLoading) return;
    clearGeneratedVideo();
    setErrorText("");
    setProgress(0);
    setGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const generated = await generateExperienceCardMp4({
        detail,
        scenes,
        images,
        signal: controller.signal,
        onProgress: setProgress,
      });
      const nextUrl = URL.createObjectURL(generated.blob);
      setVideoBlob(generated.blob);
      setVideoUrl(nextUrl);
      setProgress(1);
      showToast("竖屏MP4已生成");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        showToast("视频生成已停止");
      } else {
        setErrorText(getExperienceCardVideoErrorText(error));
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function downloadVideo(showMessage = true) {
    if (!videoBlob || !videoUrl) return;
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (showMessage) showToast("MP4已保存到当前设备");
  }

  async function shareVideo() {
    if (!videoBlob) return;
    const file = new File([videoBlob], filename, { type: "video/mp4" });

    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: detail.card.title,
          text: "有时·耕作经验卡",
          files: [file],
        });
        return;
      }

      downloadVideo(false);
      showToast("当前浏览器不能直接分享，MP4已保存，可上传到视频平台");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      downloadVideo(false);
      showToast("直接分享失败，MP4已保存到当前设备");
    }
  }

  return (
    <section style={panelStyle} aria-label="经验卡视频">
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>经验卡视频</div>
          <h2 style={titleStyle}>自动生成竖屏 MP4</h2>
        </div>
        <span style={durationStyle}>
          {formatExperienceCardVideoDuration(duration)}
        </span>
      </div>

      <p style={descriptionStyle}>
        所有被选记录都会进入视频；每条记录的原文字自动烧录为字幕，并采用该记录的首张照片。视频只在当前设备生成，不上传云端，也不占云空间。
      </p>

      <div style={contentGridStyle}>
        <div style={previewShellStyle}>
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              autoPlay
              muted
              loop
              playsInline
              style={previewStyle}
            />
          ) : (
            <canvas ref={canvasRef} style={previewStyle} aria-label="循环视频预览" />
          )}
          <div style={previewLabelStyle}>
            {videoUrl ? "MP4循环播放" : "循环预览"}
          </div>
        </div>

        <div style={controlStyle}>
          <div style={summaryStyle}>
            <Info label="来源记录" value={`${detail.records.length} 条`} />
            <Info label="画面比例" value="9:16 竖屏" />
            <Info label="视频格式" value="静音 H.264 MP4" />
            <Info
              label="字幕"
              value={
                scenes.filter((scene) => scene.kind === "record").length >
                detail.records.length
                  ? "长文字自动分段"
                  : "原记录文字"
              }
            />
          </div>

          {imageLoading ? (
            <div style={noticeStyle}>正在准备记录照片...</div>
          ) : null}

          {generating ? (
            <div style={progressWrapStyle}>
              <div style={progressTextStyle}>
                正在本机生成视频 {Math.round(progress * 100)}%
              </div>
              <div style={progressTrackStyle}>
                <div
                  style={{
                    ...progressBarStyle,
                    width: `${Math.max(2, progress * 100)}%`,
                  }}
                />
              </div>
              <button type="button" onClick={handleStop} style={stopButtonStyle}>
                停止生成
              </button>
            </div>
          ) : null}

          {errorText ? <div style={errorStyle}>{errorText}</div> : null}

          <div style={actionsStyle}>
            {!generating ? (
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={imageLoading}
                style={primaryButtonStyle}
              >
                {videoBlob ? "重新生成MP4" : "生成竖屏MP4"}
              </button>
            ) : null}

            {videoBlob ? (
              <>
                <button
                  type="button"
                  onClick={() => void shareVideo()}
                  style={shareButtonStyle}
                >
                  直接分享视频
                </button>
                <button
                  type="button"
                  onClick={() => downloadVideo()}
                  style={secondaryButtonStyle}
                >
                  保存MP4
                </button>
              </>
            ) : null}
          </div>

          <p style={helperStyle}>
            手机支持文件分享时，会打开系统分享面板；也可以保存后上传到 YouTube、哔哩哔哩或其他视频平台。生成期间请保持页面开启。
          </p>
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  marginTop: 14,
  padding: 18,
  border: "1px solid #dfe8db",
  borderRadius: 20,
  background: "#f8fbf6",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  color: "#71806e",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
};

const titleStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#2c3a2b",
  fontSize: 21,
  lineHeight: 1.3,
};

const durationStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  padding: "2px 11px",
  borderRadius: 999,
  background: "#edf4ea",
  color: "#496846",
  fontSize: 12,
  fontWeight: 800,
};

const descriptionStyle: CSSProperties = {
  margin: "10px 0 16px",
  color: "#657260",
  fontSize: 13,
  lineHeight: 1.75,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))",
  gap: 18,
  alignItems: "start",
};

const previewShellStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 280,
  margin: "0 auto",
  overflow: "hidden",
  borderRadius: 18,
  border: "1px solid #d7e1d3",
  background: "#253728",
  boxShadow: "0 12px 30px rgba(47, 73, 43, 0.14)",
};

const previewStyle: CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "9 / 16",
  objectFit: "cover",
  background: "#253728",
};

const previewLabelStyle: CSSProperties = {
  position: "absolute",
  left: 10,
  bottom: 10,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(19,33,21,0.66)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 800,
  pointerEvents: "none",
};

const controlStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 12,
};

const summaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
};

const infoStyle: CSSProperties = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid #e2e9de",
  background: "#fff",
};

const infoLabelStyle: CSSProperties = {
  color: "#82907f",
  fontSize: 11,
};

const infoValueStyle: CSSProperties = {
  marginTop: 4,
  color: "#3f4e3d",
  fontSize: 13,
  fontWeight: 800,
};

const noticeStyle: CSSProperties = {
  padding: 10,
  borderRadius: 12,
  background: "#f1f5ef",
  color: "#657260",
  fontSize: 12,
};

const progressWrapStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 13,
  border: "1px solid #dce7d8",
  background: "#fff",
};

const progressTextStyle: CSSProperties = {
  color: "#4c6048",
  fontSize: 12,
  fontWeight: 800,
};

const progressTrackStyle: CSSProperties = {
  height: 8,
  borderRadius: 999,
  overflow: "hidden",
  background: "#e7eee3",
};

const progressBarStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "#64885e",
  transition: "width 120ms linear",
};

const errorStyle: CSSProperties = {
  padding: 11,
  borderRadius: 12,
  border: "1px solid #efd8d5",
  background: "#fff8f7",
  color: "#a14d48",
  fontSize: 12,
  lineHeight: 1.6,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const buttonBaseStyle: CSSProperties = {
  minHeight: 40,
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: "1px solid #64885e",
  background: "#64885e",
  color: "#fff",
};

const shareButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  borderColor: "#4e7650",
  background: "#4e7650",
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  border: "1px solid #d3ded0",
  background: "#fff",
  color: "#50604d",
};

const stopButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  justifySelf: "start",
  color: "#a14d48",
  borderColor: "#ecd1ce",
};

const helperStyle: CSSProperties = {
  margin: 0,
  color: "#7a8776",
  fontSize: 12,
  lineHeight: 1.65,
};
