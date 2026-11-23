export const photoQualities = ["standard", "high", "original"] as const;
export type PhotoQuality = typeof photoQualities[number];

export function photoQualityLabel(quality: PhotoQuality, language: string) {
  const labels = language === "zh"
    ? { standard: "标准 · 1800px", high: "高清 · 2400px", original: "超清 · 原始尺寸" }
    : { standard: "Standard · 1800px", high: "High · 2400px", original: "Ultra · Original size" };
  return labels[quality];
}

export function defaultPhotoQuality(ownerId: string): PhotoQuality {
  try {
    const value = localStorage.getItem("record-photo-quality:" + ownerId);
    return photoQualities.find(quality => quality === value) ?? "standard";
  } catch {
    return "standard";
  }
}

export function saveDefaultPhotoQuality(ownerId: string, quality: PhotoQuality) {
  localStorage.setItem("record-photo-quality:" + ownerId, quality);
}
