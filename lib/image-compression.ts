export type CompressImageOptions = {
  maxWidthOrHeight?: number;
  quality?: number;
  minCompressBytes?: number;
};

export type CompressImageResult = {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  width?: number;
  height?: number;
};

export type ImageVariantOptions = {
  maxWidthOrHeight: number;
  quality: number;
  fileNamePrefix?: string;
};

export type ImageVariantResult = {
  file: File;
  size: number;
  width?: number;
  height?: number;
  wasGenerated: boolean;
};

const DEFAULT_MAX_WIDTH_OR_HEIGHT = 1800;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MIN_COMPRESS_BYTES = 500 * 1024;

const THUMB_MAX_WIDTH_OR_HEIGHT = 600;
const THUMB_QUALITY = 0.75;

function isCompressibleImage(file: File) {
  if (!file.type.startsWith("image/")) return false;

  // 动图、矢量图不压缩，避免丢动画或格式异常。
  if (file.type === "image/gif" || file.type === "image/svg+xml") return false;

  return true;
}

function replaceExtensionWithJpg(fileName: string) {
  const normalizedName = fileName.trim() || "image";
  const withoutExtension = normalizedName.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "image"}.jpg`;
}

function addFileNamePrefix(fileName: string, prefix?: string) {
  const jpgName = replaceExtensionWithJpg(fileName);
  if (!prefix) return jpgName;
  return `${prefix}-${jpgName}`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image_load_failed"));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function getScaledDimensions(width: number, height: number, maxWidthOrHeight: number) {
  const longestSide = Math.max(width, height);

  if (!longestSide || longestSide <= maxWidthOrHeight) {
    return { width, height, scale: 1 };
  }

  const scale = maxWidthOrHeight / longestSide;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

async function renderImageVariant(
  file: File,
  options: ImageVariantOptions
): Promise<ImageVariantResult> {
  const fallback = {
    file,
    size: file.size,
    wasGenerated: false,
  } satisfies ImageVariantResult;

  if (typeof window === "undefined") return fallback;
  if (!isCompressibleImage(file)) return fallback;

  try {
    const image = await loadImage(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (!sourceWidth || !sourceHeight) return fallback;

    const target = getScaledDimensions(
      sourceWidth,
      sourceHeight,
      options.maxWidthOrHeight
    );

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return {
        ...fallback,
        width: sourceWidth,
        height: sourceHeight,
      };
    }

    ctx.drawImage(image, 0, 0, target.width, target.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", options.quality);
    if (!blob) {
      return {
        ...fallback,
        width: sourceWidth,
        height: sourceHeight,
      };
    }

    const variantFile = new File(
      [blob],
      addFileNamePrefix(file.name, options.fileNamePrefix),
      {
        type: "image/jpeg",
        lastModified: file.lastModified,
      }
    );

    return {
      file: variantFile,
      size: variantFile.size,
      width: target.width,
      height: target.height,
      wasGenerated: true,
    } satisfies ImageVariantResult;
  } catch (error) {
    console.error("render image variant failed:", error);
    return fallback;
  }
}

export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<CompressImageResult> {
  const originalSize = file.size;
  const maxWidthOrHeight =
    options.maxWidthOrHeight || DEFAULT_MAX_WIDTH_OR_HEIGHT;
  const quality = options.quality || DEFAULT_QUALITY;
  const minCompressBytes =
    options.minCompressBytes || DEFAULT_MIN_COMPRESS_BYTES;

  const fallback = {
    file,
    originalSize,
    compressedSize: originalSize,
    wasCompressed: false,
  } satisfies CompressImageResult;

  if (typeof window === "undefined") return fallback;
  if (!isCompressibleImage(file)) return fallback;

  try {
    const image = await loadImage(file);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) return fallback;

    const fallbackWithDimensions = {
      ...fallback,
      width,
      height,
    } satisfies CompressImageResult;

    const longestSide = Math.max(width, height);
    const shouldResize = longestSide > maxWidthOrHeight;
    const shouldReencode = originalSize > minCompressBytes;

    if (!shouldResize && !shouldReencode) return fallbackWithDimensions;

    const target = getScaledDimensions(width, height, maxWidthOrHeight);

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return fallbackWithDimensions;

    ctx.drawImage(image, 0, 0, target.width, target.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) return fallbackWithDimensions;

    // 如果压缩后反而更大，就保留原图，避免浪费空间。
    if (blob.size >= originalSize) return fallbackWithDimensions;

    const compressedFile = new File([blob], replaceExtensionWithJpg(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      wasCompressed: true,
      width: target.width,
      height: target.height,
    } satisfies CompressImageResult;
  } catch (error) {
    console.error("compress image failed:", error);
    return fallback;
  }
}

export async function createImageThumbnailFile(file: File) {
  return renderImageVariant(file, {
    maxWidthOrHeight: THUMB_MAX_WIDTH_OR_HEIGHT,
    quality: THUMB_QUALITY,
    fileNamePrefix: "thumb",
  });
}
