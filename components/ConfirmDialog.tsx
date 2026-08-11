"use client";

import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmText,
  cancelText,
  danger = false,
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const resolvedConfirmText = confirmText || t.confirm;
  const resolvedCancelText = cancelText || t.cancel;

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1200,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(92vw, 420px)",
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 18px 48px rgba(0,0,0,0.12)",
          border: "1px solid #e8eee6",
          padding: 18,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: "#223222", marginBottom: 8 }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "#4f5e4f",
            marginBottom: 16,
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </div>
        {children ? <div style={{ marginBottom: 16 }}>{children}</div> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={cancelDisabled}
            style={{
              minWidth: 88,
              height: 40,
              borderRadius: 999,
              border: "1px solid #d6dfd1",
              background: "#fff",
              color: "#314131",
              fontSize: 14,
              cursor: cancelDisabled ? "not-allowed" : "pointer",
              opacity: cancelDisabled ? 0.55 : 1,
            }}
          >
            {resolvedCancelText}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={confirmDisabled}
            style={{
              minWidth: 88,
              height: 40,
              borderRadius: 999,
              border: danger ? "1px solid #d88f8f" : "1px solid #b8d4b3",
              background: danger ? "#fff7f7" : "#f4fbf1",
              color: danger ? "#a44444" : "#2f5d2b",
              fontSize: 14,
              fontWeight: 600,
              cursor: confirmDisabled ? "not-allowed" : "pointer",
              opacity: confirmDisabled ? 0.55 : 1,
            }}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
