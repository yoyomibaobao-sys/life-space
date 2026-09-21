"use client";

import type { CSSProperties, ReactNode } from "react";

type Props = {
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "compact" | "page";
};

export default function ConnectivityNotice({
  message,
  actionLabel,
  onAction,
  variant = "compact",
}: Props) {
  const page = variant === "page";

  return (
    <div
      role="status"
      aria-live="polite"
      data-connectivity-notice={variant}
      style={page ? pageStyle : compactStyle}
    >
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} style={actionStyle}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

const compactStyle: CSSProperties = {
  minHeight: 38,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  margin: "0 0 14px",
  padding: "7px 10px",
  border: "1px solid #e3e9df",
  borderRadius: 12,
  background: "#f9fbf7",
  color: "#687465",
  fontSize: 12.5,
  lineHeight: 1.4,
};

const pageStyle: CSSProperties = {
  minHeight: "46vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  color: "#788276",
  fontSize: 15,
  fontWeight: 650,
  textAlign: "center",
};

const actionStyle: CSSProperties = {
  minHeight: 32,
  flexShrink: 0,
  border: 0,
  background: "transparent",
  color: "#315a2d",
  font: "inherit",
  fontWeight: 750,
  cursor: "pointer",
  padding: "0 3px",
};
