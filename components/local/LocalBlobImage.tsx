"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { normalizeLocalImageBlob } from "@/lib/local-image-blob";

export default function LocalBlobImage({
  blob,
  alt = "",
  style,
}: {
  blob?: Blob | null;
  alt?: string;
  style?: CSSProperties;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const validBlob = normalizeLocalImageBlob(blob, blob?.type);
    if (!validBlob) return;

    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(validBlob);
    } catch {
      return;
    }
    image.src = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
      image.removeAttribute("src");
    };
  }, [blob]);

  if (!blob) return null;

  return <img ref={imageRef} alt={alt} style={style} />;
}
