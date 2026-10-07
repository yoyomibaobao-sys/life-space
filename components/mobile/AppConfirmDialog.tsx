"use client";

import type { CSSProperties } from "react";

export default function AppConfirmDialog({
  open,
  title,
  message,
  cancelLabel,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message?: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div style={overlayStyle} role="presentation" onClick={onCancel}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        style={dialogStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="app-confirm-title" style={titleStyle}>{title}</h2>
        {message ? <p style={messageStyle}>{message}</p> : null}
        <div style={actionsStyle}>
          <button type="button" style={cancelStyle} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            style={destructive ? destructiveStyle : confirmStyle}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 5000,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(19, 28, 18, .5)",
};

const dialogStyle: CSSProperties = {
  width: "min(360px, calc(100vw - 40px))",
  boxSizing: "border-box",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 18px 50px rgba(20, 34, 19, .22)",
  padding: "18px 18px 14px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#283a27",
  fontSize: 18,
  lineHeight: 1.4,
  fontWeight: 850,
};

const messageStyle: CSSProperties = {
  margin: "9px 0 0",
  color: "#667163",
  fontSize: 14,
  lineHeight: 1.6,
};

const actionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 9,
  marginTop: 18,
};

const baseButtonStyle: CSSProperties = {
  minHeight: 42,
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

const cancelStyle: CSSProperties = {
  ...baseButtonStyle,
  border: "1px solid #d9e2d5",
  background: "#fff",
  color: "#50624d",
};

const confirmStyle: CSSProperties = {
  ...baseButtonStyle,
  border: 0,
  background: "#4f7b45",
  color: "#fff",
};

const destructiveStyle: CSSProperties = {
  ...baseButtonStyle,
  border: 0,
  background: "#a34f48",
  color: "#fff",
};
