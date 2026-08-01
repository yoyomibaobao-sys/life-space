import {
  formatExperienceCardDate,
  getExperienceCardStageLabel,
} from "@/lib/experience-cards";
import type {
  ExperienceCardDetail,
  ExperienceCardMedia,
  ExperienceCardSourceRecord,
} from "@/lib/experience-card-types";

export const EXPERIENCE_CARD_VIDEO_WIDTH = 720;
export const EXPERIENCE_CARD_VIDEO_HEIGHT = 1280;
export const EXPERIENCE_CARD_VIDEO_FPS = 6;
export const EXPERIENCE_CARD_VIDEO_BITRATE = 2_200_000;

const INTRO_DURATION_SECONDS = 4.8;
const OUTRO_DURATION_SECONDS = 2.4;
const TEXT_CHUNK_LENGTH = 60;

type VideoSceneKind = "intro" | "record" | "outro";

export type ExperienceCardVideoScene = {
  id: string;
  kind: VideoSceneKind;
  duration: number;
  title: string;
  subtitle: string;
  text: string;
  tags: string[];
  imageUrl: string | null;
  recordIndex: number | null;
  recordCount: number;
  stage: string;
  date: string;
  partIndex: number;
  partCount: number;
};

export type ExperienceCardVideoImage = ImageBitmap | HTMLImageElement;
export type ExperienceCardVideoImages = Map<string, ExperienceCardVideoImage>;
export type ExperienceCardVideoImageSelection = Record<string, string | null>;

export type GenerateExperienceCardVideoOptions = {
  detail: ExperienceCardDetail;
  scenes?: ExperienceCardVideoScene[];
  images?: ExperienceCardVideoImages;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type GeneratedExperienceCardVideo = {
  blob: Blob;
  duration: number;
  width: number;
  height: number;
  frameRate: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRecordText(value?: string | null) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findPreferredBreak(chars: string[], start: number, end: number) {
  const minimum = Math.max(start + Math.floor((end - start) * 0.58), start + 1);
  const preferred = new Set(["。", "！", "？", "；", "，", "、", ".", "!", "?", ";", ",", "\n"]);

  for (let index = end - 1; index >= minimum; index -= 1) {
    if (preferred.has(chars[index])) return index + 1;
  }

  return end;
}

export function splitExperienceCardVideoText(value?: string | null) {
  const normalized = normalizeRecordText(value);
  if (!normalized) return ["这条记录没有文字。"];

  const chars = Array.from(normalized);
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < chars.length) {
    const proposedEnd = Math.min(chars.length, cursor + TEXT_CHUNK_LENGTH);
    const end =
      proposedEnd === chars.length
        ? proposedEnd
        : findPreferredBreak(chars, cursor, proposedEnd);
    const chunk = chars.slice(cursor, end).join("").trim();
    if (chunk) chunks.push(chunk);
    cursor = end;
  }

  return chunks.length > 0 ? chunks : ["这条记录没有文字。"];
}

function getTextDuration(text: string) {
  const length = Array.from(text).length;
  return clamp(3.2 + length / 9, 4.8, 12);
}

function getSystemName(detail: ExperienceCardDetail) {
  return (
    detail.archive.system_name ||
    detail.archive.species_name_snapshot ||
    "未填写系统名"
  );
}

function isImageMedia(media: ExperienceCardMedia) {
  const mimeType = String(media.mime_type || "").toLowerCase();
  const type = String(media.type || "").toLowerCase();
  if (mimeType) return mimeType.startsWith("image/");
  if (type) return type === "image" || type === "photo";
  return true;
}

export function getExperienceCardRecordVideoImageUrl(
  record: ExperienceCardSourceRecord
) {
  const media = record.media.find(
    (item) =>
      isImageMedia(item) && Boolean(item.display_url || item.display_thumb_url)
  );
  return media?.display_url || media?.display_thumb_url || null;
}

function getRecordTags(record: ExperienceCardSourceRecord) {
  return Array.from(
    new Set(
      (record.record_tags || [])
        .filter(
          (tag) =>
            tag.tag_type === "behavior" &&
            tag.is_active !== false &&
            Boolean(tag.tag)
        )
        .map((tag) => String(tag.tag))
    )
  ).slice(0, 4);
}

export function buildExperienceCardVideoScenes(
  detail: ExperienceCardDetail,
  imageSelection?: ExperienceCardVideoImageSelection
): ExperienceCardVideoScene[] {
  const systemName = getSystemName(detail);
  const authorName = detail.author?.username?.trim() || "用户";
  const recordCount = detail.records.length;
  const scenes: ExperienceCardVideoScene[] = [
    {
      id: "intro",
      kind: "intro",
      duration: INTRO_DURATION_SECONDS,
      title: detail.card.title,
      subtitle: `${detail.archive.title} · ${systemName}`,
      text: `发布者 · ${authorName}`,
      tags: [],
      imageUrl:
        detail.cover?.display_url || detail.cover?.display_thumb_url || null,
      recordIndex: null,
      recordCount,
      stage: "",
      date: "",
      partIndex: 1,
      partCount: 1,
    },
  ];

  detail.records.forEach((record, recordIndex) => {
    const chunks = splitExperienceCardVideoText(record.note);
    const hasExplicitImageSelection = Boolean(
      imageSelection &&
        Object.prototype.hasOwnProperty.call(imageSelection, record.id)
    );
    const imageUrl = hasExplicitImageSelection
      ? imageSelection?.[record.id] || null
      : getExperienceCardRecordVideoImageUrl(record);
    const tags = getRecordTags(record);

    chunks.forEach((text, partIndex) => {
      scenes.push({
        id: `record:${record.id}:${partIndex}`,
        kind: "record",
        duration: getTextDuration(text),
        title: detail.card.title,
        subtitle: detail.archive.title,
        text,
        tags,
        imageUrl,
        recordIndex,
        recordCount,
        stage: getExperienceCardStageLabel(recordIndex, recordCount),
        date: formatExperienceCardDate(record.record_time) || "日期未记录",
        partIndex: partIndex + 1,
        partCount: chunks.length,
      });
    });
  });

  scenes.push({
    id: "outro",
    kind: "outro",
    duration: OUTRO_DURATION_SECONDS,
    title: "让生活有迹可循",
    subtitle: detail.card.title,
    text: "有时·耕作 LifeSpace",
    tags: [],
    imageUrl: null,
    recordIndex: null,
    recordCount,
    stage: "",
    date: "",
    partIndex: 1,
    partCount: 1,
  });

  return scenes;
}

export function getExperienceCardVideoDuration(
  scenes: ExperienceCardVideoScene[]
) {
  return scenes.reduce((total, scene) => total + scene.duration, 0);
}

export function formatExperienceCardVideoDuration(seconds: number) {
  const rounded = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (minutes === 0) return `约 ${remaining} 秒`;
  if (remaining === 0) return `约 ${minutes} 分钟`;
  return `约 ${minutes} 分 ${remaining} 秒`;
}

export function getExperienceCardVideoFilename(detail: ExperienceCardDetail) {
  const safeTitle = detail.card.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 70) || "经验卡";
  return `${safeTitle}-有时耕作.mp4`;
}

async function loadCanvasImage(url: string): Promise<ExperienceCardVideoImage> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`experience_card_video_image_${response.status}`);
  const blob = await response.blob();

  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("experience_card_video_image_decode_failed"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadExperienceCardVideoImages(
  detail: ExperienceCardDetail,
  scenes: ExperienceCardVideoScene[] = buildExperienceCardVideoScenes(detail)
): Promise<ExperienceCardVideoImages> {
  const urls = Array.from(
    new Set(
      scenes
        .map((scene) => scene.imageUrl)
        .filter((url): url is string => Boolean(url))
    )
  );

  const settled = await Promise.allSettled(
    urls.map(async (url) => [url, await loadCanvasImage(url)] as const)
  );
  const images: ExperienceCardVideoImages = new Map();

  settled.forEach((result) => {
    if (result.status === "fulfilled") {
      images.set(result.value[0], result.value[1]);
    }
  });

  return images;
}

export function releaseExperienceCardVideoImages(
  images: ExperienceCardVideoImages
) {
  images.forEach((image) => {
    if ("close" in image && typeof image.close === "function") {
      image.close();
    }
  });
  images.clear();
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient
) {
  roundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = fillStyle;
  context.fill();
}

function setFont(
  context: CanvasRenderingContext2D,
  size: number,
  weight: number | string = 500
) {
  context.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const lines: string[] = [];
  let current = "";

  for (const char of Array.from(text)) {
    if (char === "\n") {
      if (current) lines.push(current);
      current = "";
      continue;
    }

    const next = current + char;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function fitWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  initialSize: number,
  minimumSize: number
) {
  for (let size = initialSize; size >= minimumSize; size -= 2) {
    setFont(context, size, 600);
    const lines = wrapText(context, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }

  setFont(context, minimumSize, 600);
  return { lines: wrapText(context, text, maxWidth), size: minimumSize };
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: ExperienceCardVideoImage,
  width: number,
  height: number,
  progress: number
) {
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  if (!sourceWidth || !sourceHeight) return;

  const zoom = 1 + progress * 0.035;
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const driftX = (progress - 0.5) * width * 0.025;
  const x = (width - drawWidth) / 2 - driftX;
  const y = (height - drawHeight) / 2;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawSoftBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  variant: "green" | "warm"
) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  if (variant === "green") {
    gradient.addColorStop(0, "#263d2a");
    gradient.addColorStop(0.55, "#66805a");
    gradient.addColorStop(1, "#d8e4c9");
  } else {
    gradient.addColorStop(0, "#e8ddc8");
    gradient.addColorStop(0.55, "#bccdae");
    gradient.addColorStop(1, "#476244");
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.12;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(width * 0.15, height * 0.2, width * 0.28, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(width * 0.88, height * 0.72, width * 0.34, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawBrandPill(
  context: CanvasRenderingContext2D,
  width: number,
  scale: number
) {
  const x = 42 * scale;
  const y = 42 * scale;
  const pillWidth = 245 * scale;
  const pillHeight = 52 * scale;
  fillRoundedRect(
    context,
    x,
    y,
    pillWidth,
    pillHeight,
    26 * scale,
    "rgba(20, 37, 23, 0.58)"
  );
  setFont(context, 19 * scale, 800);
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText("有时·耕作  LifeSpace", x + 18 * scale, y + pillHeight / 2 + scale);
  context.textBaseline = "alphabetic";

  context.fillStyle = "rgba(255,255,255,0.62)";
  context.fillRect(width - 94 * scale, y + 24 * scale, 48 * scale, 2 * scale);
}

function drawIntroScene(
  context: CanvasRenderingContext2D,
  scene: ExperienceCardVideoScene,
  image: ExperienceCardVideoImage | undefined,
  width: number,
  height: number,
  progress: number
) {
  if (image) {
    drawCoverImage(context, image, width, height, progress * 0.45);
    const overlay = context.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, "rgba(20,36,22,0.30)");
    overlay.addColorStop(0.52, "rgba(20,36,22,0.50)");
    overlay.addColorStop(1, "rgba(20,36,22,0.92)");
    context.fillStyle = overlay;
    context.fillRect(0, 0, width, height);
  } else {
    drawSoftBackground(context, width, height, "green");
  }

  const scale = width / EXPERIENCE_CARD_VIDEO_WIDTH;
  drawBrandPill(context, width, scale);

  const x = 58 * scale;
  const maxWidth = width - x * 2;
  setFont(context, 30 * scale, 700);
  context.fillStyle = "rgba(255,255,255,0.78)";
  context.fillText(scene.text, x, height * 0.49);

  const fitted = fitWrappedText(
    context,
    scene.title,
    maxWidth,
    4,
    62 * scale,
    44 * scale
  );
  context.fillStyle = "#ffffff";
  fitted.lines.forEach((line, index) => {
    context.fillText(line, x, height * 0.56 + index * fitted.size * 1.28);
  });

  setFont(context, 24 * scale, 600);
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.fillText(scene.subtitle, x, height - 92 * scale);
}

function drawOutroScene(
  context: CanvasRenderingContext2D,
  scene: ExperienceCardVideoScene,
  width: number,
  height: number
) {
  drawSoftBackground(context, width, height, "warm");
  const scale = width / EXPERIENCE_CARD_VIDEO_WIDTH;
  const x = 58 * scale;
  const maxWidth = width - x * 2;

  setFont(context, 22 * scale, 800);
  context.fillStyle = "rgba(31,54,33,0.76)";
  context.fillText(scene.text, x, height * 0.42);

  const fitted = fitWrappedText(
    context,
    scene.title,
    maxWidth,
    3,
    64 * scale,
    46 * scale
  );
  context.fillStyle = "#213724";
  fitted.lines.forEach((line, index) => {
    context.fillText(line, x, height * 0.5 + index * fitted.size * 1.3);
  });

  setFont(context, 25 * scale, 600);
  context.fillStyle = "rgba(33,55,36,0.74)";
  context.fillText(scene.subtitle, x, height - 98 * scale);
}

function drawRecordScene(
  context: CanvasRenderingContext2D,
  scene: ExperienceCardVideoScene,
  image: ExperienceCardVideoImage | undefined,
  width: number,
  height: number,
  progress: number,
  overallProgress: number
) {
  if (image) {
    drawCoverImage(context, image, width, height, progress);
  } else {
    drawSoftBackground(context, width, height, "green");
  }

  const topOverlay = context.createLinearGradient(0, 0, 0, height * 0.28);
  topOverlay.addColorStop(0, "rgba(12,27,15,0.72)");
  topOverlay.addColorStop(1, "rgba(12,27,15,0)");
  context.fillStyle = topOverlay;
  context.fillRect(0, 0, width, height * 0.3);

  const bottomOverlayStart = image ? height * 0.58 : height * 0.42;
  const bottomOverlay = context.createLinearGradient(0, bottomOverlayStart, 0, height);
  bottomOverlay.addColorStop(0, "rgba(15,27,17,0)");
  bottomOverlay.addColorStop(0.52, "rgba(15,27,17,0.42)");
  bottomOverlay.addColorStop(1, "rgba(15,27,17,0.90)");
  context.fillStyle = bottomOverlay;
  context.fillRect(0, bottomOverlayStart, width, height - bottomOverlayStart);

  const scale = width / EXPERIENCE_CARD_VIDEO_WIDTH;
  drawBrandPill(context, width, scale);

  const metaY = 122 * scale;
  const stageText = `${scene.recordIndex! + 1}/${scene.recordCount} · ${scene.stage}`;
  setFont(context, 22 * scale, 800);
  const stageWidth = context.measureText(stageText).width + 32 * scale;
  fillRoundedRect(
    context,
    44 * scale,
    metaY,
    stageWidth,
    48 * scale,
    24 * scale,
    "rgba(255,255,255,0.86)"
  );
  context.fillStyle = "#36523a";
  context.textBaseline = "middle";
  context.fillText(stageText, 60 * scale, metaY + 25 * scale);

  context.textBaseline = "alphabetic";

  const panelX = 42 * scale;
  const panelWidth = width - panelX * 2;
  const panelY = image ? height * 0.74 : height * 0.56;
  const panelHeight = height - panelY - 46 * scale;
  fillRoundedRect(
    context,
    panelX,
    panelY,
    panelWidth,
    panelHeight,
    28 * scale,
    "rgba(18,31,20,0.72)"
  );

  const contentX = panelX + 28 * scale;
  const contentWidth = panelWidth - 56 * scale;
  let cursorY = panelY + 43 * scale;

  setFont(context, 20 * scale, 700);
  context.fillStyle = "rgba(255,255,255,0.66)";
  const partText =
    scene.partCount > 1
      ? `${scene.date} · ${scene.subtitle} · ${scene.partIndex}/${scene.partCount}`
      : `${scene.date} · ${scene.subtitle}`;
  context.fillText(partText, contentX, cursorY);
  cursorY += 42 * scale;

  const maxTextLines = image ? 4 : 7;
  const fitted = fitWrappedText(
    context,
    scene.text,
    contentWidth,
    maxTextLines,
    (image ? 28 : 34) * scale,
    (image ? 21 : 24) * scale
  );
  const lineHeight = fitted.size * (image ? 1.35 : 1.45);
  context.fillStyle = "#ffffff";
  fitted.lines.slice(0, maxTextLines).forEach((line, index) => {
    context.fillText(line, contentX, cursorY + index * lineHeight);
  });

  if (scene.tags.length > 0) {
    setFont(context, 18 * scale, 700);
    context.fillStyle = "rgba(230,240,225,0.82)";
    context.fillText(
      scene.tags.map((tag) => `#${tag}`).join("  "),
      contentX,
      panelY + panelHeight - 31 * scale
    );
  }

  context.fillStyle = "rgba(255,255,255,0.20)";
  context.fillRect(42 * scale, height - 25 * scale, width - 84 * scale, 6 * scale);
  context.fillStyle = "rgba(235,245,230,0.92)";
  context.fillRect(
    42 * scale,
    height - 25 * scale,
    (width - 84 * scale) * clamp(overallProgress, 0, 1),
    6 * scale
  );
}

function locateScene(
  scenes: ExperienceCardVideoScene[],
  elapsedSeconds: number
) {
  const duration = getExperienceCardVideoDuration(scenes);
  const normalized =
    duration > 0
      ? ((elapsedSeconds % duration) + duration) % duration
      : 0;
  let cursor = 0;

  for (const scene of scenes) {
    const end = cursor + scene.duration;
    if (normalized < end || scene === scenes[scenes.length - 1]) {
      return {
        scene,
        progress: clamp((normalized - cursor) / scene.duration, 0, 1),
        overallProgress: duration > 0 ? normalized / duration : 0,
      };
    }
    cursor = end;
  }

  return { scene: scenes[0], progress: 0, overallProgress: 0 };
}

export function renderExperienceCardVideoFrame(
  context: CanvasRenderingContext2D,
  scenes: ExperienceCardVideoScene[],
  images: ExperienceCardVideoImages,
  elapsedSeconds: number
) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  context.clearRect(0, 0, width, height);

  const { scene, progress, overallProgress } = locateScene(
    scenes,
    elapsedSeconds
  );
  const image = scene.imageUrl ? images.get(scene.imageUrl) : undefined;

  if (scene.kind === "intro") {
    drawIntroScene(context, scene, image, width, height, progress);
  } else if (scene.kind === "outro") {
    drawOutroScene(context, scene, width, height);
  } else {
    drawRecordScene(
      context,
      scene,
      image,
      width,
      height,
      progress,
      overallProgress
    );
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Generation aborted", "AbortError");
  }
}

export async function generateExperienceCardMp4(
  options: GenerateExperienceCardVideoOptions
): Promise<GeneratedExperienceCardVideo> {
  if (typeof document === "undefined") {
    throw new Error("experience_card_video_browser_required");
  }

  const scenes = options.scenes || buildExperienceCardVideoScenes(options.detail);
  const duration = getExperienceCardVideoDuration(scenes);
  const images = options.images || new Map<string, ExperienceCardVideoImage>();
  const {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    getFirstEncodableVideoCodec,
  } = await import("mediabunny");

  throwIfAborted(options.signal);
  const codec = await getFirstEncodableVideoCodec(
    ["avc"],
    {
      width: EXPERIENCE_CARD_VIDEO_WIDTH,
      height: EXPERIENCE_CARD_VIDEO_HEIGHT,
      bitrate: EXPERIENCE_CARD_VIDEO_BITRATE,
    }
  );
  if (codec !== "avc") {
    throw new Error("experience_card_video_avc_unsupported");
  }

  const canvas = document.createElement("canvas");
  canvas.width = EXPERIENCE_CARD_VIDEO_WIDTH;
  canvas.height = EXPERIENCE_CARD_VIDEO_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("experience_card_video_canvas_unavailable");

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: EXPERIENCE_CARD_VIDEO_BITRATE,
  });
  output.addVideoTrack(source, { frameRate: EXPERIENCE_CARD_VIDEO_FPS });

  const sceneFrames = scenes.map((scene) =>
    Math.max(1, Math.ceil(scene.duration * EXPERIENCE_CARD_VIDEO_FPS))
  );
  const totalFrames = sceneFrames.reduce((total, count) => total + count, 0);
  let globalFrame = 0;
  let elapsed = 0;

  try {
    await output.start();

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
      const frameCount = sceneFrames[sceneIndex];
      const sceneStart = elapsed;

      for (let localFrame = 0; localFrame < frameCount; localFrame += 1) {
        throwIfAborted(options.signal);
        const timestamp = globalFrame / EXPERIENCE_CARD_VIDEO_FPS;
        renderExperienceCardVideoFrame(
          context,
          scenes,
          images,
          sceneStart + localFrame / EXPERIENCE_CARD_VIDEO_FPS
        );
        await source.add(timestamp, 1 / EXPERIENCE_CARD_VIDEO_FPS, {
          keyFrame:
            localFrame === 0 ||
            globalFrame % (EXPERIENCE_CARD_VIDEO_FPS * 2) === 0,
        });

        globalFrame += 1;
        options.onProgress?.(globalFrame / totalFrames);
        if (globalFrame % EXPERIENCE_CARD_VIDEO_FPS === 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      elapsed += frameCount / EXPERIENCE_CARD_VIDEO_FPS;
    }

    source.close();
    await output.finalize();
    if (!target.buffer) throw new Error("experience_card_video_empty_output");

    return {
      blob: new Blob([target.buffer], { type: "video/mp4" }),
      duration,
      width: EXPERIENCE_CARD_VIDEO_WIDTH,
      height: EXPERIENCE_CARD_VIDEO_HEIGHT,
      frameRate: EXPERIENCE_CARD_VIDEO_FPS,
    };
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  }
}

export function getExperienceCardVideoErrorText(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "视频生成已停止。";
  }

  const message =
    error instanceof Error ? error.message : String(error || "");
  if (message.includes("experience_card_video_avc_unsupported")) {
    return "当前浏览器不能生成H.264 MP4，请改用最新版 Chrome、Edge 或安卓应用后重试。";
  }
  if (
    message.includes("experience_card_video_browser_required") ||
    message.includes("experience_card_video_canvas_unavailable")
  ) {
    return "当前设备暂时不能生成视频。";
  }
  if (message.includes("experience_card_video_image")) {
    return "部分照片读取失败，请检查网络后重试。";
  }
  return "视频生成失败，请稍后重试。";
}
