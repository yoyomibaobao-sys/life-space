"use client";

import AddRecord from "@/app/archive/[id]/AddRecord";
import type { CSSProperties } from "react";

export default function ArchiveAddRecordSection({
  archiveId,
  archiveIsPublic,
  onRecordCreated,
  mobileMode = false,
  open = true,
  onClose,
}: {
  archiveId: string;
  archiveIsPublic: boolean;
  onRecordCreated?: () => void | Promise<void>;
  mobileMode?: boolean;
  open?: boolean;
  onClose?: () => void;
}) {
  if (mobileMode && !open) return null;

  if (mobileMode) {
    return (
      <div style={mobilePanelOverlayStyle}>
        <section id="add-record" style={mobilePanelStyle} aria-label="添加记录">
          <div style={mobilePanelHeaderStyle}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#233223" }}>
              添加记录
            </div>
            <button type="button" onClick={onClose} style={mobilePanelCloseStyle}>
              取消
            </button>
          </div>

          <AddRecord
            archiveId={archiveId}
            archiveIsPublic={archiveIsPublic}
            placeholder="记录今天的变化"
            onRecordCreated={onRecordCreated}
          />
        </section>
      </div>
    );
  }

  return (
    <section
      id="add-record"
      style={{
        border: "1px solid #e9ede5",
        borderRadius: 22,
        background: "#fff",
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 650, color: "#233223", marginBottom: 10 }}>
        添加记录
      </div>
      <AddRecord
        archiveId={archiveId}
        archiveIsPublic={archiveIsPublic}
        placeholder="记录今天的变化"
        onRecordCreated={onRecordCreated}
      />
    </section>
  );
}

const mobilePanelOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 220,
  background: "rgba(30, 45, 30, 0.24)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: "64px 10px calc(68px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const mobilePanelStyle: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "78vh",
  overflowY: "auto",
  border: "1px solid #dfe9d7",
  borderRadius: "22px 22px 18px 18px",
  background: "#fff",
  padding: 14,
  boxShadow: "0 -12px 36px rgba(41, 65, 35, 0.18)",
};

const mobilePanelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const mobilePanelCloseStyle: CSSProperties = {
  border: "1px solid #dfe7d9",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 12px",
  cursor: "pointer",
};
