"use client";

import type { CSSProperties, ReactNode } from "react";

export default function ArchiveStatusBadge({
  children,
  kind = "neutral",
}: {
  children: ReactNode;
  kind?: "neutral" | "help" | "resolved" | "public" | "ended";
}) {
  const palette: Record<"neutral" | "help" | "resolved" | "public" | "ended", CSSProperties> = {
    neutral: {
      color: "#667066",
      background: "#f6f7f4",
      border: "1px solid #e6e8e1",
    },
    help: {
      color: "#a65f45",
      background: "#fff5ee",
      border: "1px solid #efd8cc",
    },
    resolved: {
      color: "#4d7c5b",
      background: "#f1faf3",
      border: "1px solid #cfe4d4",
    },
    public: {
      color: "#2f6f3a",
      background: "#f1fff3",
      border: "1px solid #b7dfbb",
    },
    ended: {
      color: "#7f7668",
      background: "#f6f2ec",
      border: "1px solid #e4d8ca",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...palette[kind],
      }}
    >
      {children}
    </span>
  );
}
