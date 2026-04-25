import type { CSSProperties } from "react";

type Props = {
  avatarUrl?: string | null;
  size?: number;
  iconSize?: number;
  radius?: number | string;
  fallback?: string;
  style?: CSSProperties;
};

export default function UserAvatar({
  avatarUrl,
  size = 48,
  iconSize = 22,
  radius = "50%",
  fallback = "🌱",
  style,
}: Props) {
  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    objectFit: "cover",
    ...style,
  };

  if (avatarUrl) {
    return <img src={avatarUrl} alt="" style={baseStyle} />;
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "#edf5e8",
        color: "#6f8f62",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: iconSize,
        ...style,
      }}
    >
      {fallback}
    </div>
  );
}
