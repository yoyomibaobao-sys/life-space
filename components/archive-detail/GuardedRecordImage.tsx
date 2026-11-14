"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useGuardedRecordImage } from "@/lib/use-guarded-record-image";

export default function GuardedRecordImage({ src, ...props }: ComponentPropsWithoutRef<"img">) {
  const imageUrl = useGuardedRecordImage(typeof src === "string" ? src : undefined);
  return <img {...props} src={typeof src === "string" ? imageUrl : src} />;
}
