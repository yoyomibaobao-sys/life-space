"use client";

import type { CSSProperties, ReactNode } from "react";

export type ArchiveProjectDetailLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "not-found"
  | "forbidden"
  | "error";

export default function ArchiveProjectDetailStatus({
  status,
  title,
  message,
  backLabel,
  retryLabel,
  onBack,
  onRetry,
}: {
  status: Exclude<ArchiveProjectDetailLoadStatus, "ready" | "idle">;
  title: string;
  message: string;
  backLabel: string;
  retryLabel?: string;
  onBack: () => void;
  onRetry?: () => void;
}) {
  return (
    <main
      data-archive-project-detail-status={status}
      style={pageStyle}
    >
      <section style={panelStyle}>
        <h1 style={titleStyle}>{title}</h1>
        <p style={messageStyle}>{message}</p>
        <div style={actionsStyle}>
          <button type="button" onClick={onBack} style={buttonStyle}>
            {backLabel}
          </button>
          {status === "error" && onRetry ? (
            <button type="button" onClick={onRetry} style={buttonStyle}>
              {retryLabel || "Retry"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "60vh",
  padding: "28px 16px 80px",
  background: "#f4f7f2",
  color: "#263626",
};

const panelStyle: CSSProperties = {
  width: "min(560px, 100%)",
  margin: "0 auto",
  padding: 18,
  border: "1px solid #dfe8da",
  borderRadius: 16,
  background: "#fff",
};

const titleStyle: CSSProperties = { margin: "0 0 8px", fontSize: 20 };
const messageStyle: CSSProperties = { margin: "0 0 16px", color: "#6d7b69", fontSize: 14, lineHeight: 1.6 };
const actionsStyle: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const buttonStyle: CSSProperties = {
  minHeight: 42,
  border: "1px solid #c9d6c4",
  borderRadius: 12,
  background: "#edf5ea",
  color: "#355433",
  padding: "0 14px",
  fontWeight: 750,
  cursor: "pointer",
};

export function ArchiveProjectDetailLoading({ children }: { children: ReactNode }) {
  return (
    <main data-archive-project-detail-status="loading" style={pageStyle}>
      {children}
    </main>
  );
}
