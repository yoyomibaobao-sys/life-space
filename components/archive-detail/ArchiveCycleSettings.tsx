"use client";

import type { CSSProperties } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

type CycleSettingsValue = {
  enabled: boolean;
};

export default function ArchiveCycleSettings({
  enabled,
  busy = false,
  onSave,
}: {
  enabled: boolean;
  busy?: boolean;
  onSave: (value: CycleSettingsValue) => void | Promise<void>;
}) {
  const { t } = useLanguage();
  const copy = t.archive;

  return (
    <section style={panelStyle} aria-label={copy.cycle_setting}>
      <div style={headingStyle}>{copy.cycle_setting}</div>
      <div style={toggleRowStyle}>
        <span>
          <strong style={labelStyle}>{copy.cycle_enabled_label}</strong>
          <span style={statusTextStyle}>
            {enabled ? copy.cycle_enabled : copy.cycle_disabled}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={copy.cycle_enabled_label}
          disabled={busy}
          onClick={() =>
            void onSave({
              enabled: !enabled,
            })
          }
          style={switchStyle(enabled)}
        >
          <span style={switchThumbStyle(enabled)} />
        </button>
      </div>

    </section>
  );
}

const panelStyle: CSSProperties = {
  marginTop: 10,
  padding: 13,
  border: "1px solid #e1e9dd",
  borderRadius: 15,
  background: "#fbfdf9",
};

const headingStyle: CSSProperties = {
  marginBottom: 10,
  color: "#293c29",
  fontSize: 15,
  fontWeight: 850,
};

const toggleRowStyle: CSSProperties = {
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
};

const labelStyle: CSSProperties = {
  display: "block",
  color: "#344734",
  fontSize: 14,
  lineHeight: 1.4,
};

const statusTextStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#7a8776",
  fontSize: 12,
};

function switchStyle(enabled: boolean): CSSProperties {
  return {
    width: 52,
    height: 30,
    flex: "0 0 52px",
    position: "relative",
    border: enabled ? "1px solid #3f7d3d" : "1px solid #ccd7c8",
    borderRadius: 999,
    background: enabled ? "#4f8a49" : "#e8ede5",
    padding: 2,
    cursor: "pointer",
  };
}

function switchThumbStyle(enabled: boolean): CSSProperties {
  return {
    width: 24,
    height: 24,
    display: "block",
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 2px 7px rgba(37, 54, 35, 0.2)",
    transform: enabled ? "translateX(22px)" : "translateX(0)",
    transition: "transform 160ms ease",
  };
}
