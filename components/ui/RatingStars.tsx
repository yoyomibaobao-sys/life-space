import type { CSSProperties } from "react";
import AppIcon from "@/components/ui/AppIcon";

type Props = {
  value: number;
  total?: number;
  size?: number;
  label?: string;
  style?: CSSProperties;
};

export default function RatingStars({
  value,
  total = 5,
  size = 14,
  label,
  style,
}: Props) {
  const filled = Math.max(0, Math.min(total, Math.round(value)));

  return (
    <span
      aria-label={label || `${filled}/${total}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, ...style }}
    >
      {Array.from({ length: total }, (_, index) => (
        <AppIcon
          key={index}
          name="star"
          size={size}
          strokeWidth={1.7}
          style={{
            fill: index < filled ? "currentColor" : "none",
            opacity: index < filled ? 1 : 0.35,
          }}
        />
      ))}
    </span>
  );
}
