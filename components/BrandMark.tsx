import Image from "next/image";
import type { CSSProperties } from "react";

type BrandMarkProps = {
  size?: number;
  style?: CSSProperties;
};

export default function BrandMark({ size = 32, style }: BrandMarkProps) {
  return (
    <Image
      src="/brand/youshi-space-mark.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority
      style={{ display: "block", flex: "0 0 auto", ...style }}
    />
  );
}
