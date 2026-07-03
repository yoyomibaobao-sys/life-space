"use client";

import { useEffect, useState, type CSSProperties } from "react";

export default function LocalBlobImage({
  blob,
  alt = "",
  style,
}: {
  blob?: Blob | null;
  alt?: string;
  style?: CSSProperties;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!blob) {
      setSrc("");
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setSrc(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!src) return null;

  return <img src={src} alt={alt} style={style} />;
}

