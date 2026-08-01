"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { showToast } from "@/components/Toast";
import type {
  ExperienceCardDetail,
  ExperienceCardMedia,
  ExperienceCardSourceRecord,
} from "@/lib/experience-card-types";
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
  type ExperienceCardVideoImageSelection,
} from "@/lib/experience-card-video";
import {
  deleteCachedExperienceCardVideo,
  getCachedExperienceCardVideo,
  getExperienceCardVideoSourceSignature,
  saveCachedExperienceCardVideo,
} from "@/lib/experience-card-video-cache";

type RecordImageOption = {
  id: string;
  sourceUrl: string;
  previewUrl: string;
};

function isImageMedia(media: ExperienceCardMedia) {
  const mimeType = String(media.mime_type || "").toLowerCase();
  const type = String(media.type || "").toLowerCase();
  if (mimeType) return mimeType.startsWith("image/");
  if (type) return type === "image" || type === "photo";
  return true;
}

function getRecordImageOptions(record: ExperienceCardSourceRecord): RecordImageOption[] {
  return record.media
    .filter(
      (media) =>
        isImageMedia(media) &&
        Boolean(media.display_url || media.display_thumb_url)
    )
    .map((media) => ({
      id: media.id,
      sourceUrl: media.display_url || media.display_thumb_url || "",
      previewUrl: media.display_thumb_url || media.display_url || "",
    }))
    .filter((item) => Boolean(item.sourceUrl));
}

function buildDefaultImageSelection(
  detail: ExperienceCardDetail
): ExperienceCardVideoImageSelection {
  return Object.fromEntries(
    detail.records.map((record) => [
      record.id,
      getRecordImageOptions(record).map((option) => option.sourceUrl),
    ])
  );
}

function getSelectedImageUrls(
  detail: ExperienceCardDetail,
  selection: ExperienceCardVideoImageSelection
) {
  return detail.records.flatMap((record) => selection[record.id] || []);
}

function getSelectedMediaIdsByRecordId(
  detail: ExperienceCardDetail,
  selection: ExperienceCardVideoImageSelection
) {
  return Object.fromEntries(
    detail.records.map((record) => {
      const selectedUrls = new Set(selection[record.id] || []);
      return [
        record.id,
        getRecordImageOptions(record)
          .filter((option) => selectedUrls.has(option.sourceUrl))
          .map((option) => option.id),
      ];
    })
  );
}

function getCoverMediaId(
  detail: ExperienceCardDetail,
  coverImageUrl: string | null
) {
  if (!coverImageUrl) return null;
  return (
    detail.records
      .flatMap((record) => getRecordImageOptions(record))
      .find((option) => option.sourceUrl === coverImageUrl)?.id || null
  );
}

function getDefaultCoverImageUrl(
  detail: ExperienceCardDetail,
  selection: ExperienceCardVideoImageSelection
) {
  const selectedUrls = getSelectedImageUrls(detail, selection);
  const savedCoverUrl =
    detail.cover?.display_url || detail.cover?.display_thumb_url || null;
  return savedCoverUrl && selectedUrls.includes(savedCoverUrl)
    ? savedCoverUrl
    : selectedUrls[0] || null;
}

export default function ExperienceCardVideoPanel({
  detail,
}: {
  detail: ExperienceCardDetail;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const videoUrlRef = useRef("");
  const [images, setImages] = useState<ExperienceCardVideoImages>(new Map());
  const [imageLoading, setImageLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [cacheLoading, setCacheLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [selectedImageByRecordId, setSelectedImageByRecordId] =
    useState<ExperienceCardVideoImageSelection>(() =>
      buildDefaultImageSelection(detail)
    );
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(() => {
    const selection = buildDefaultImageSelection(detail);
    return getDefaultCoverImageUrl(detail, selection);
  });

  const imageOptionsByRecordId = useMemo(
    () =>
      new Map(
        detail.records.map((record) => [
          record.id,
          getRecordImageOptions(record),
        ])
      ),
    [detail]
  );
  const totalImageCount = useMemo(
    () =>
      Array.from(imageOptionsByRecordId.values()).reduce(
        (total, options) => total + options.length,
        0
      ),
    [imageOptionsByRecordId]
  );
  const selectedImageUrls = useMemo(
    () => getSelectedImageUrls(detail, selectedImageByRecordId),
    [detail, selectedImageByRecordId]
  );
  const selectedImageCount = selectedImageUrls.length;
  const effectiveCoverImageUrl =
    coverImageUrl && selectedImageUrls.includes(coverImageUrl)
      ? coverImageUrl
      : selectedImageUrls[0] || null;
  const scenes = useMemo(
    () =>
      buildExperienceCardVideoScenes(
        detail,
        selectedImageByRecordId,
        effectiveCoverImageUrl
      ),
    [detail, effectiveCoverImageUrl, selectedImageByRecordId]
  );
  const duration = useMemo(
    () => getExperienceCardVideoDuration(scenes),
    [scenes]
  );
  const filename = useMemo(
    () => getExperienceCardVideoFilename(detail),
    [detail]
  );
  const sourceSignature = useMemo(
    () => getExperienceCardVideoSourceSignature(detail),
    [detail]
  );

  useEffect(() => {
    let cancelled = false;
    const nextSelection = buildDefaultImageSelection(detail);
    setSelectedImageByRecordId(nextSelection);
    setCoverImageUrl(getDefaultCoverImageUrl(detail, nextSelection));
    clearGeneratedVideo();
    setErrorText("");
    setCacheLoading(true);

    void getCachedExperienceCardVideo(detail.card.id)
      .then(async (cached) => {
        if (cancelled || !cached) return;
        if (cached.sourceSignature !== sourceSignature) {
          await deleteCachedExperienceCardVideo(detail.card.id).catch(
            () => undefined
          );
          return;
        }

        const optionsByRecordId = new Map(
          detail.records.map((record) => [
            record.id,
            getRecordImageOptions(record),
          ])
        );
        const restoredSelection = Object.fromEntries(
          detail.records.map((record) => [
            record.id,
            (optionsByRecordId.get(record.id) || [])
              .filter((option) =>
                (cached.selectedMediaIdsByRecordId[record.id] || []).includes(
                  option.id
                )
              )
              .map((option) => option.sourceUrl),
          ])
        );
        const restoredUrls = getSelectedImageUrls(detail, restoredSelection);
        const restoredCoverOption = Array.from(optionsByRecordId.values())
          .flat()
          .find((option) => option.id === cached.coverMediaId);
        const restoredCover =
          restoredCoverOption?.sourceUrl || restoredUrls[0] || null;

        if (cancelled) return;
        setSelectedImageByRecordId(restoredSelection);
        setCoverImageUrl(restoredCover);
        replaceGeneratedVideo(cached.blob);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCacheLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // The signature captures every source field used by the generated video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.card.id, sourceSignature]);

  useEffect(() => {
    let cancelled = false;
    let loadedImages: ExperienceCardVideoImages = new Map();
    setImageLoading(true);
    setImages(new Map());

    void loadExperienceCardVideoImages(detail, scenes)
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
  }, [detail, scenes]);

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

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    },
    []
  );

  function replaceGeneratedVideo(blob: Blob | null) {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const nextUrl = blob ? URL.createObjectURL(blob) : "";
    videoUrlRef.current = nextUrl;
    setVideoBlob(blob);
    setVideoUrl(nextUrl);
  }

  function clearGeneratedVideo() {
    replaceGeneratedVideo(null);
  }

  function toggleRecordImage(recordId: string, imageUrl: string) {
    if (generating || cacheLoading) return;
    clearGeneratedVideo();
    setErrorText("");
    setSelectedImageByRecordId((current) => {
      const currentUrls = current[recordId] || [];
      const nextUrls = currentUrls.includes(imageUrl)
        ? currentUrls.filter((url) => url !== imageUrl)
        : [...currentUrls, imageUrl];
      return { ...current, [recordId]: nextUrls };
    });
  }

  function clearRecordImages(recordId: string) {
    if (generating || cacheLoading) return;
    clearGeneratedVideo();
    setErrorText("");
    setSelectedImageByRecordId((current) => ({
      ...current,
      [recordId]: [],
    }));
  }

  function selectCoverImage(imageUrl: string) {
    if (
      generating ||
      cacheLoading ||
      !selectedImageUrls.includes(imageUrl)
    ) {
      return;
    }
    clearGeneratedVideo();
    setErrorText("");
    setCoverImageUrl(imageUrl);
  }

  async function handleGenerate() {
    if (generating || imageLoading || cacheLoading) return;
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
      replaceGeneratedVideo(generated.blob);
      setProgress(1);
      try {
        await saveCachedExperienceCardVideo({
          cardId: detail.card.id,
          sourceSignature,
          blob: generated.blob,
          filename,
          selectedMediaIdsByRecordId: getSelectedMediaIdsByRecordId(
            detail,
            selectedImageByRecordId
          ),
          coverMediaId: getCoverMediaId(detail, effectiveCoverImageUrl),
        });
        showToast("竖屏MP4已生成并保存在本机");
      } catch {
        showToast("MP4已生成，但本机缓存失败，请立即保存");
      }
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

  function restartGeneratedVideo(video: HTMLVideoElement) {
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }

  return (
    <section style={panelStyle} aria-label="经验卡视频">
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>经验卡视频</div>
          <h2 style={titleStyle}>竖屏 MP4</h2>
        </div>
        <span style={durationStyle}>
          {formatExperienceCardVideoDuration(duration)}
        </span>
      </div>

      <p style={descriptionStyle}>
        自动串联全部来源记录，记录文字烧录为字幕；每张照片都可单独选取，并可从已选照片中指定视频封面。生成后保存在当前浏览器，再次打开可直接下载；不上传云端，也不占云空间。
      </p>

      <details style={imageSelectorStyle}>
        <summary style={imageSelectorSummaryStyle}>
          选择图片与封面（已选 {selectedImageCount}/{totalImageCount} 张）
        </summary>
        <div style={imageSelectorListStyle}>
          {detail.records.map((record, index) => {
            const options = imageOptionsByRecordId.get(record.id) || [];
            const selectedUrls = selectedImageByRecordId[record.id] || [];

            return (
              <div key={record.id} style={imageSelectorRecordStyle}>
                <div style={imageSelectorRecordTitleStyle}>
                  第 {index + 1} 条记录
                </div>
                <div style={imageChoiceGridStyle}>
                  <button
                    type="button"
                    disabled={cacheLoading}
                    onClick={() => clearRecordImages(record.id)}
                    aria-pressed={selectedUrls.length === 0}
                    style={imageNoneButtonStyle(selectedUrls.length === 0)}
                  >
                    不使用图片
                  </button>
                  {options.map((option) => {
                    const active = selectedUrls.includes(option.sourceUrl);
                    const isCover =
                      active && effectiveCoverImageUrl === option.sourceUrl;
                    return (
                      <div key={option.id} style={imageChoiceItemStyle}>
                        <button
                          type="button"
                          disabled={cacheLoading}
                          onClick={() =>
                            toggleRecordImage(record.id, option.sourceUrl)
                          }
                          aria-pressed={active}
                          style={imageChoiceButtonStyle(active)}
                        >
                          <img
                            src={option.previewUrl}
                            alt={`第${index + 1}条记录可选图片`}
                            style={imageChoiceImageStyle}
                          />
                          <span style={imageSelectedBadgeStyle(active)}>
                            {active ? "已选" : "选择"}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={!active || cacheLoading}
                          onClick={() => selectCoverImage(option.sourceUrl)}
                          style={coverChoiceButtonStyle(isCover, active)}
                        >
                          {isCover ? "当前封面" : "设为封面"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      <div style={contentGridStyle}>
        <div style={previewShellStyle}>
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              autoPlay
              muted
              playsInline
              onEnded={(event) => restartGeneratedVideo(event.currentTarget)}
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
            {detail.records.length} 条记录 · 9:16 竖屏 · 静音 H.264 MP4 · {scenes.filter((scene) => scene.kind === "record").length > detail.records.length ? "长文字自动分段" : "原记录文字"}
          </div>

          {imageLoading ? (
            <div style={noticeStyle}>正在准备记录照片...</div>
          ) : null}

          {cacheLoading ? (
            <div style={noticeStyle}>正在检查本机已生成的MP4...</div>
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
                disabled={imageLoading || cacheLoading}
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
            页面内会自动循环播放；同一设备和浏览器可再次下载，换设备或清理网站数据后需重新生成。保存后的MP4是否循环由相册或视频平台决定。手机支持文件分享时，会打开系统分享面板。生成期间请保持页面开启。
          </p>
        </div>
      </div>
    </section>
  );
}

const panelStyle: CSSProperties = {
  margin: "0 0 14px",
  padding: 16,
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
  margin: "8px 0 13px",
  color: "#657260",
  fontSize: 13,
  lineHeight: 1.75,
};

const imageSelectorStyle: CSSProperties = {
  margin: "0 0 16px",
  border: "1px solid #dfe8db",
  borderRadius: 14,
  background: "#fff",
  overflow: "hidden",
};

const imageSelectorSummaryStyle: CSSProperties = {
  padding: "11px 13px",
  color: "#466043",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const imageSelectorListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "0 12px 12px",
};

const imageSelectorRecordStyle: CSSProperties = {
  paddingTop: 10,
  borderTop: "1px solid #edf1ea",
};

const imageSelectorRecordTitleStyle: CSSProperties = {
  marginBottom: 7,
  color: "#6b7967",
  fontSize: 12,
  fontWeight: 800,
};

const imageChoiceGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))",
  gap: 7,
  alignItems: "start",
};

const imageChoiceItemStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 5,
};

function imageChoiceButtonStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    aspectRatio: "1 / 1",
    padding: 2,
    border: active ? "2px solid #5f8b59" : "1px solid #dce5d8",
    borderRadius: 10,
    background: active ? "#edf5e9" : "#f8faf7",
    overflow: "hidden",
    cursor: "pointer",
  };
}

function imageSelectedBadgeStyle(active: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 5,
    bottom: 5,
    padding: "2px 6px",
    borderRadius: 999,
    background: active ? "rgba(55,91,52,0.88)" : "rgba(25,36,25,0.62)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
  };
}

function coverChoiceButtonStyle(
  isCover: boolean,
  enabled: boolean
): CSSProperties {
  return {
    minHeight: 28,
    padding: "3px 5px",
    border: isCover ? "1px solid #5f8b59" : "1px solid #dce5d8",
    borderRadius: 8,
    background: isCover ? "#e8f2e4" : "#fff",
    color: isCover ? "#365c34" : "#71806e",
    fontSize: 10,
    fontWeight: 800,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.45,
  };
}

function imageNoneButtonStyle(active: boolean): CSSProperties {
  return {
    ...imageChoiceButtonStyle(active),
    minHeight: 68,
    aspectRatio: "auto",
    color: active ? "#365c34" : "#6f7c6b",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1.35,
  };
}

const imageChoiceImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
  borderRadius: 7,
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
  color: "#687565",
  fontSize: 12,
  lineHeight: 1.6,
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
