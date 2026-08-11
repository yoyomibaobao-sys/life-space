"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

type Props = {
  title?: string;
  mobileMode?: boolean;
  open?: boolean;
  onClose?: () => void;
  children: ReactNode;
};

export default function ArchiveRecordComposer({
  title,
  mobileMode = false,
  open = true,
  onClose,
  children,
}: Props) {
  const { t } = useLanguage();
  const resolvedTitle = title || t.record.add_record;

  if (mobileMode && !open) return null;

  if (mobileMode) {
    return (
      <div style={mobileOverlayStyle}>
        <section id="add-record" style={mobilePanelStyle} aria-label={resolvedTitle}>
          <div style={headerStyle}>
            <div style={titleStyle}>{resolvedTitle}</div>
            {onClose ? (
              <button type="button" onClick={onClose} style={closeButtonStyle}>
                {t.record.cancel}
              </button>
            ) : null}
          </div>
          {children}
        </section>
      </div>
    );
  }

  return (
    <section id="add-record" style={desktopPanelStyle}>
      <div style={desktopTitleStyle}>{resolvedTitle}</div>
      {children}
    </section>
  );
}

const desktopPanelStyle: CSSProperties = {
  border: "1px solid #e9ede5",
  borderRadius: 22,
  background: "#fff",
  padding: 16,
  marginBottom: 16,
};

const desktopTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 650,
  color: "#233223",
  marginBottom: 10,
};

const mobileOverlayStyle: CSSProperties = {
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

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#233223",
};

const closeButtonStyle: CSSProperties = {
  border: "1px solid #dfe7d9",
  borderRadius: 999,
  background: "#fff",
  color: "#5f6f5b",
  fontSize: 13,
  fontWeight: 700,
  padding: "7px 12px",
  cursor: "pointer",
};
