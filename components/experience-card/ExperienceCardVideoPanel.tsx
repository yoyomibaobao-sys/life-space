"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
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
  getExperienceCardVideoSelection,
  getExperienceCardVideoSourceSignature,
  saveCachedExperienceCardVideo,
  saveExperienceCardVideoSelection,
} from "@/lib/experience-card-video-cache";

type RecordImageOption = {
  id: string;
  recordId: string;
  sourceUrl: string;
  previewUrl: string;
};

export type ExperienceCardVideoPanelHandle = {
  generate: () => void;
  stop: () => void;
  share: () => void;
  save: () => void;
};

export type ExperienceCardVideoPanelStatus = {
  hasVideo: boolean;
  generating: boolean;
  progress: number;
  loading: boolean;
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
      recordId: record.id,
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

function reconcileImageSelection(
  detail: ExperienceCardDetail,
  current: ExperienceCardVideoImageSelection
): ExperienceCardVideoImageSelection {
  return Object.fromEntries(
    detail.records.map((record) => {
      const availableUrls = getRecordImageOptions(record).map(
        (option) => option.sourceUrl
      );
      if (!Object.prototype.hasOwnProperty.call(current, record.id)) {
        return [record.id, availableUrls];
      }
      const availableUrlSet = new Set(availableUrls);
      return [
        record.id,
        (current[record.id] || []).filter((url) => availableUrlSet.has(url)),
      ];
    })
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
  selection: ExperienceCardVideoImageSelection,
  preferredCoverMediaId?: string | null
) {
  const selectedUrls = getSelectedImageUrls(detail, selection);
  const preferredCoverUrl = detail.records
    .flatMap((record) => getRecordImageOptions(record))
    .find((option) => option.id === preferredCoverMediaId)?.sourceUrl;
  if (preferredCoverUrl && selectedUrls.includes(preferredCoverUrl)) {
    return preferredCoverUrl;
  }
  const savedCoverUrl =
    detail.cover?.display_url || detail.cover?.display_thumb_url || null;
  return savedCoverUrl && selectedUrls.includes(savedCoverUrl)
    ? savedCoverUrl
    : selectedUrls[0] || null;
}

function persistVideoSelectionPreference(
  detail: ExperienceCardDetail,
  selection: ExperienceCardVideoImageSelection,
  coverUrl: string | null
) {
  try {
    saveExperienceCardVideoSelection(detail.card.id, {
      selectedMediaIdsByRecordId: getSelectedMediaIdsByRecordId(
        detail,
        selection
      ),
      coverMediaId: getCoverMediaId(detail, coverUrl),
    });
  } catch {
    // Selection persistence is best effort; video generation remains usable.
  }
}

type ExperienceCardVideoPanelProps = {
  detail: ExperienceCardDetail;
  readOnly?: boolean;
  integrated?: boolean;
  previewOnly?: boolean;
  selectionOnly?: boolean;
  hideGenerateAction?: boolean;
  externalControls?: boolean;
  coverMediaId?: string | null;
  onCoverMediaIdChange?: (mediaId: string | null) => void;
  onSelectionChange?: () => void;
  onStatusChange?: (status: ExperienceCardVideoPanelStatus) => void;
};

const ExperienceCardVideoPanel = forwardRef<
  ExperienceCardVideoPanelHandle,
  ExperienceCardVideoPanelProps
>(function ExperienceCardVideoPanel(
  {
    detail,
    readOnly = false,
    integrated = false,
    previewOnly = false,
    selectionOnly = false,
    hideGenerateAction = false,
    externalControls = false,
    coverMediaId,
    onCoverMediaIdChange,
    onSelectionChange,
    onStatusChange,
  },
  ref
) {
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
    return getDefaultCoverImageUrl(detail, selection, coverMediaId);
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
  const imageOptions = useMemo(
    () => Array.from(imageOptionsByRecordId.values()).flat(),
    [imageOptionsByRecordId]
  );
  const totalImageCount = useMemo(
    () => imageOptions.length,
    [imageOptions]
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
  const websiteUrl = useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : window.location.origin.replace(/^https?:\/\//, ""),
    []
  );
  const scenes = useMemo(
    () =>
      buildExperienceCardVideoScenes(
        detail,
        selectedImageByRecordId,
        effectiveCoverImageUrl,
        websiteUrl
      ),
    [detail, effectiveCoverImageUrl, selectedImageByRecordId, websiteUrl]
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
  const previousSourceSignatureRef = useRef(sourceSignature);
  const sceneImageSignature = useMemo(
    () => JSON.stringify(scenes.map((scene) => scene.imageUrl || null)),
    [scenes]
  );

  useEffect(() => {
    let cancelled = false;
    const nextSelection = buildDefaultImageSelection(detail);
    setSelectedImageByRecordId(nextSelection);
    setCoverImageUrl(
      getDefaultCoverImageUrl(detail, nextSelection, coverMediaId)
    );
    clearGeneratedVideo();
    setErrorText("");
    setCacheLoading(true);

    void getCachedExperienceCardVideo(detail.card.id)
      .then(async (cached) => {
        if (cancelled) return;
        let validCached = cached;
        if (validCached && validCached.sourceSignature !== sourceSignature) {
          await deleteCachedExperienceCardVideo(detail.card.id).catch(
            () => undefined
          );
          validCached = null;
        }

        const storedSelection =
          validCached || getExperienceCardVideoSelection(detail.card.id);
        if (!storedSelection) return;

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
                (
                  storedSelection.selectedMediaIdsByRecordId[record.id] || []
                ).includes(option.id)
              )
              .map((option) => option.sourceUrl),
          ])
        );
        const restoredUrls = getSelectedImageUrls(detail, restoredSelection);
        const restoredCoverOption = Array.from(optionsByRecordId.values())
          .flat()
          .find(
            (option) =>
              option.id ===
              (coverMediaId === undefined
                ? storedSelection.coverMediaId
                : coverMediaId)
          );
        const restoredCover =
          restoredCoverOption?.sourceUrl || restoredUrls[0] || null;

        if (cancelled) return;
        setSelectedImageByRecordId(restoredSelection);
        setCoverImageUrl(restoredCover);
        if (validCached) replaceGeneratedVideo(validCached.blob);
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
  }, [detail.card.id]);

  useEffect(() => {
    if (previousSourceSignatureRef.current === sourceSignature) return;
    previousSourceSignatureRef.current = sourceSignature;
    clearGeneratedVideo();
    void deleteCachedExperienceCardVideo(detail.card.id).catch(
      () => undefined
    );

    setSelectedImageByRecordId((current) => {
      const next = reconcileImageSelection(detail, current);
      const nextSelectedUrls = getSelectedImageUrls(detail, next);
      const preferredCoverUrl = imageOptions.find(
        (option) => option.id === coverMediaId
      )?.sourceUrl;
      setCoverImageUrl((currentCover) => {
        const nextCover =
          preferredCoverUrl && nextSelectedUrls.includes(preferredCoverUrl)
            ? preferredCoverUrl
            : currentCover && nextSelectedUrls.includes(currentCover)
            ? currentCover
            : nextSelectedUrls[0] || null;
        persistVideoSelectionPreference(detail, next, nextCover);
        return nextCover;
      });
      return next;
    });
    // sourceSignature contains every card, record and media field used by MP4.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSignature]);

  useEffect(() => {
    if (coverMediaId === undefined) return;
    const preferredCoverOption = imageOptions.find(
      (option) => option.id === coverMediaId
    );
    const preferredCoverUrl = preferredCoverOption?.sourceUrl;
    if (
      preferredCoverOption &&
      preferredCoverUrl &&
      !selectedImageUrls.includes(preferredCoverUrl)
    ) {
      setSelectedImageByRecordId((current) => {
        const currentUrls = current[preferredCoverOption.recordId] || [];
        const next = {
          ...current,
          [preferredCoverOption.recordId]: [
            ...currentUrls,
            preferredCoverUrl,
          ],
        };
        persistVideoSelectionPreference(detail, next, preferredCoverUrl);
        return next;
      });
      setCoverImageUrl(preferredCoverUrl);
      return;
    }
    setCoverImageUrl(
      preferredCoverUrl && selectedImageUrls.includes(preferredCoverUrl)
        ? preferredCoverUrl
        : selectedImageUrls[0] || null
    );
  }, [coverMediaId, detail, imageOptions, selectedImageUrls]);

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
    // sceneImageSignature changes only when the image sources change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.card.id, sceneImageSignature]);

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

  useEffect(() => {
    onStatusChange?.({
      hasVideo: Boolean(videoBlob && videoUrl),
      generating,
      progress,
      loading: imageLoading || cacheLoading,
    });
  }, [
    cacheLoading,
    generating,
    imageLoading,
    onStatusChange,
    progress,
    videoBlob,
    videoUrl,
  ]);

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

  function invalidateGeneratedVideo() {
    clearGeneratedVideo();
    void deleteCachedExperienceCardVideo(detail.card.id).catch(
      () => undefined
    );
  }

  function toggleRecordImage(recordId: string, imageUrl: string) {
    if (generating || cacheLoading) return;
    invalidateGeneratedVideo();
    setErrorText("");
    setSelectedImageByRecordId((current) => {
      const currentUrls = current[recordId] || [];
      const nextUrls = currentUrls.includes(imageUrl)
        ? currentUrls.filter((url) => url !== imageUrl)
        : [...currentUrls, imageUrl];
      const next = { ...current, [recordId]: nextUrls };
      const nextSelectedUrls = getSelectedImageUrls(detail, next);
      const nextCover =
        coverImageUrl && nextSelectedUrls.includes(coverImageUrl)
          ? coverImageUrl
          : nextSelectedUrls[0] || null;
      setCoverImageUrl(nextCover);
      if (nextCover !== coverImageUrl) {
        onCoverMediaIdChange?.(getCoverMediaId(detail, nextCover));
      }
      persistVideoSelectionPreference(detail, next, nextCover);
      return next;
    });
    onSelectionChange?.();
  }

  function selectAllImages() {
    if (generating || cacheLoading) return;
    invalidateGeneratedVideo();
    setErrorText("");
    const next = buildDefaultImageSelection(detail);
    const nextCover = getDefaultCoverImageUrl(detail, next, coverMediaId);
    setSelectedImageByRecordId(next);
    setCoverImageUrl(nextCover);
    persistVideoSelectionPreference(detail, next, nextCover);
    onSelectionChange?.();
  }

  function clearAllImages() {
    if (generating || cacheLoading) return;
    invalidateGeneratedVideo();
    setErrorText("");
    const next = Object.fromEntries(
      detail.records.map((record) => [record.id, []])
    );
    setSelectedImageByRecordId(next);
    setCoverImageUrl(null);
    onCoverMediaIdChange?.(null);
    persistVideoSelectionPreference(detail, next, null);
    onSelectionChange?.();
  }

  function selectCoverImage(imageUrl: string) {
    if (
      generating ||
      cacheLoading ||
      !selectedImageUrls.includes(imageUrl)
    ) {
      return;
    }
    invalidateGeneratedVideo();
    setErrorText("");
    setCoverImageUrl(imageUrl);
    onCoverMediaIdChange?.(getCoverMediaId(detail, imageUrl));
    persistVideoSelectionPreference(detail, selectedImageByRecordId, imageUrl);
    onSelectionChange?.();
  }

  async function handleGenerate() {
    if (generating) return;
    if (imageLoading || cacheLoading) {
      showToast("正在准备记录图片，请稍后再试");
      return;
    }
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

  useImperativeHandle(ref, () => ({
    generate: () => {
      void handleGenerate();
    },
    stop: handleStop,
    share: () => {
      void shareVideo();
    },
    save: () => downloadVideo(),
  }));

  return (
    <section
      style={integrated ? integratedPanelStyle : panelStyle}
      aria-label="经验卡图片与视频"
    >
      {!readOnly && !previewOnly ? (
        <>
          <div style={headerStyle}>
            <div>
              <div style={eyebrowStyle}>图片</div>
              <h2 style={titleStyle}>选择视频画面与封面</h2>
              <p style={localOnlyHintStyle}>
                视频选图保存在当前设备；经验卡封面随“保存修改”保存，并自动作为视频片头。
              </p>
            </div>
            <span style={durationStyle}>
              {formatExperienceCardVideoDuration(duration)}
            </span>
          </div>

          <div style={imageSelectorStyle}>
            <div style={imageSelectorHeaderStyle}>
              <strong>
                视频选图 {selectedImageCount}/{totalImageCount} 张
              </strong>
              <span style={imageSelectorActionsStyle}>
                <button
                  type="button"
                  disabled={cacheLoading}
                  onClick={selectAllImages}
                  style={imageSelectorActionButtonStyle}
                >
                  全选
                </button>
                <button
                  type="button"
                  disabled={cacheLoading}
                  onClick={clearAllImages}
                  style={imageSelectorActionButtonStyle}
                >
                  清空
                </button>
              </span>
            </div>
            <div style={imageChoiceGridStyle}>
              {imageOptions.map((option, index) => {
                const active = (
                  selectedImageByRecordId[option.recordId] || []
                ).includes(option.sourceUrl);
                const isCover =
                  active &&
                  (coverMediaId === undefined
                    ? effectiveCoverImageUrl === option.sourceUrl
                    : coverMediaId === option.id);
                return (
                  <div key={option.id} style={imageChoiceItemStyle}>
                    <button
                      type="button"
                      disabled={cacheLoading}
                      onClick={() =>
                        toggleRecordImage(option.recordId, option.sourceUrl)
                      }
                      aria-pressed={active}
                      style={imageChoiceButtonStyle(active)}
                    >
                      <img
                        src={option.previewUrl}
                        alt={`经验卡可选图片${index + 1}`}
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
        </>
      ) : null}

      {!selectionOnly ? (
        <div style={readOnly ? publicPreviewWrapStyle : contentGridStyle}>
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
              <canvas
                ref={canvasRef}
                style={previewStyle}
                aria-label="循环视频预览"
              />
            )}
            {!readOnly ? (
              <div style={previewLabelStyle}>
                {videoUrl ? "MP4循环播放" : "循环预览"}
              </div>
            ) : null}
          </div>

          {!readOnly ? (
            <div style={controlStyle}>
              <div style={summaryStyle}>
                {selectedImageCount} 张图片 · 9:16 竖屏 · 静音 H.264 MP4
              </div>

              {imageLoading ? (
                <div style={noticeStyle}>正在准备记录照片...</div>
              ) : null}

              {cacheLoading ? (
                <div style={noticeStyle}>正在检查本机已生成的MP4...</div>
              ) : null}

              {!externalControls && generating ? (
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
                  <button
                    type="button"
                    onClick={handleStop}
                    style={stopButtonStyle}
                  >
                    停止生成
                  </button>
                </div>
              ) : null}

              {errorText ? <div style={errorStyle}>{errorText}</div> : null}

              {!externalControls && (!hideGenerateAction || videoBlob) ? (
                <div style={actionsStyle}>
                {!generating && !hideGenerateAction ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});

export default ExperienceCardVideoPanel;

const panelStyle: CSSProperties = {
  margin: "0 0 14px",
  padding: 16,
  border: "1px solid #dfe8db",
  borderRadius: 20,
  background: "#f8fbf6",
};

const integratedPanelStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  border: 0,
  background: "transparent",
};

const eyebrowStyle: CSSProperties = {
  marginBottom: 4,
  color: "#768471",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#2c3a2b",
  fontSize: 21,
  lineHeight: 1.3,
};

const localOnlyHintStyle: CSSProperties = {
  maxWidth: 560,
  margin: "5px 0 0",
  color: "#788575",
  fontSize: 12,
  lineHeight: 1.55,
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

const imageSelectorStyle: CSSProperties = {
  margin: "14px 0 16px",
  border: "1px solid #dfe8db",
  borderRadius: 14,
  background: "#fff",
  padding: 12,
};

const imageSelectorHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
  color: "#466043",
  fontSize: 13,
};

const imageSelectorActionsStyle: CSSProperties = {
  display: "inline-flex",
  gap: 6,
};

const imageSelectorActionButtonStyle: CSSProperties = {
  minHeight: 28,
  padding: "3px 9px",
  border: "1px solid #d7e2d3",
  borderRadius: 999,
  background: "#f8faf7",
  color: "#62715e",
  fontSize: 12,
  cursor: "pointer",
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

const publicPreviewWrapStyle: CSSProperties = {
  maxWidth: 360,
  margin: "0 auto",
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
