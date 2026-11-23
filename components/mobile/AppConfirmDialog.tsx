"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

export default function AppConfirmDialog({
  open,
  title,
  message,
  cancelLabel,
  confirmLabel,
  destructive = false,
  children,
  confirmDisabled = false,
  cancelDisabled = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message?: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  children?: ReactNode;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const titleId = useId();
  const messageId = useId();
  if (!open) return null;
  return (
    <div style={overlayStyle} role="presentation" onClick={() => { if (!cancelDisabled) onCancel(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        style={dialogStyle}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !cancelDisabled) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        <h2 id={titleId} style={titleStyle}>{title}</h2>
        {message ? <p id={messageId} style={messageStyle}>{message}</p> : null}
        {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
        <div style={actionsStyle}>
          <button type="button" disabled={cancelDisabled} style={{ ...cancelStyle, opacity: cancelDisabled ? 0.5 : 1, cursor: cancelDisabled ? "not-allowed" : "pointer" }} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            disabled={confirmDisabled}
            style={{ ...(destructive ? destructiveStyle : confirmStyle), opacity: confirmDisabled ? 0.5 : 1, cursor: confirmDisabled ? "not-allowed" : "pointer" }}
            onClick={() => void onConfirm()}
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
  maxHeight: "calc(100vh - 40px)",
  overflowY: "auto",
  overflowWrap: "anywhere",
  borderRadius: 16,
  background: "#fff",
  boxShadow: "0 18px 50px rgba(20, 34, 19, .22)",
  padding: "18px 18px 14px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#283a27",
  fontSize: 18,
  lineHeight: 1.4,
  fontWeight: 700,
};

const messageStyle: CSSProperties = {
  margin: "9px 0 0",
  color: "#667163",
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: "pre-line",
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
  fontWeight: 600,
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
