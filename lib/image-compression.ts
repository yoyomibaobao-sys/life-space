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

const DEFAULT_MAX_WIDTH_OR_HEIGHT = 1800;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MIN_COMPRESS_BYTES = 500 * 1024;

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

    const scale = shouldResize ? maxWidthOrHeight / longestSide : 1;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return fallbackWithDimensions;

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

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
      width: targetWidth,
      height: targetHeight,
    } satisfies CompressImageResult;
  } catch (error) {
    console.error("compress image failed:", error);
    return fallback;
  }
}
