"use client";

import { useEffect, useRef, type CSSProperties } from "react";

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
    if (!blob || !image) return;

    const objectUrl = URL.createObjectURL(blob);
    image.src = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
      image.removeAttribute("src");
    };
  }, [blob]);

  if (!blob) return null;

  return <img ref={imageRef} alt={alt} style={style} />;
}
