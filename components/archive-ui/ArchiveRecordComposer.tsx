"use client";

import type { CSSProperties, ReactNode } from "react";
import UiIcon from "@/components/ui/UiIcon";
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
      <div style={mobilePageStyle}>
        <header style={mobileHeaderStyle}>
          {onClose ? (
            <button type="button" onClick={onClose} style={mobileBackButtonStyle} aria-label={t.nav.back}>
              <UiIcon name="arrow-left" size={23} />
            </button>
          ) : <span />}
          <div style={mobileTitleStyle}>{resolvedTitle}</div>
          <span />
        </header>
        <section id="add-record" style={mobileContentStyle} aria-label={resolvedTitle}>
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

const mobilePageStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1220,
  background: "#f7f9f5",
  overflowY: "auto",
  paddingBottom: "calc(72px + var(--app-safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
};

const mobileHeaderStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  minHeight: "calc(62px + var(--app-safe-area-top, env(safe-area-inset-top, 0px)))",
  padding: "calc(8px + var(--app-safe-area-top, env(safe-area-inset-top, 0px))) 14px 8px",
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr) 48px",
  alignItems: "center",
  background: "rgba(255,255,255,.98)",
  borderBottom: "1px solid #e4e9e0",
};

const mobileBackButtonStyle: CSSProperties = {
  width: 44,
  height: 42,
  border: 0,
  background: "transparent",
  color: "#52664e",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const mobileTitleStyle: CSSProperties = {
  textAlign: "center",
  color: "#243523",
  fontSize: 21,
  fontWeight: 850,
};

const mobileContentStyle: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  margin: "0 auto",
  padding: "14px 14px 24px",
  boxSizing: "border-box",
  background: "#fff",
};
