import Image from "next/image";
import type { CSSProperties } from "react";

type BrandMarkProps = {
  size?: number;
  tone?: "standard" | "quiet";
  style?: CSSProperties;
};

export default function BrandMark({
  size = 32,
  tone = "standard",
  style,
}: BrandMarkProps) {
  return (
    <Image
      src="/brand/youshi-space-mark.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority
      style={{
        display: "block",
        flex: "0 0 auto",
        opacity: tone === "quiet" ? 0.78 : 1,
        filter:
          tone === "quiet"
            ? "saturate(0.68) brightness(1.08)"
            : undefined,
        ...style,
      }}
    />
  );
}
