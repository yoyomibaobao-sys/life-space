"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { useGuardedRecordImage } from "@/lib/use-guarded-record-image";

export default function GuardedRecordImage({ src, fallbackSrc, ...props }: ComponentPropsWithoutRef<"img"> & { fallbackSrc?: string }) {
  const [failed, setFailed] = useState<string>();
  const source = typeof src === "string" && src === failed ? fallbackSrc : src;
  const imageUrl = useGuardedRecordImage(typeof source === "string" ? source : undefined, fallbackSrc);
  return <img {...props} src={typeof source === "string" ? imageUrl : source} onError={(event) => {
    if (typeof src === "string" && fallbackSrc && fallbackSrc !== src) setFailed(src);
    props.onError?.(event);
  }} />;
}
