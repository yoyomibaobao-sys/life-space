"use client";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
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
          }}
        >
          {message}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              minWidth: 88,
              height: 40,
              borderRadius: 999,
              border: "1px solid #d6dfd1",
              background: "#fff",
              color: "#314131",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            style={{
              minWidth: 88,
              height: 40,
              borderRadius: 999,
              border: danger ? "1px solid #d88f8f" : "1px solid #b8d4b3",
              background: danger ? "#fff7f7" : "#f4fbf1",
              color: danger ? "#a44444" : "#2f5d2b",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
