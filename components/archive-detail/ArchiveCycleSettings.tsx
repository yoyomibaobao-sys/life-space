"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";

type CycleSettingsValue = {
  enabled: boolean;
  nextName: string;
};

export default function ArchiveCycleSettings({
  enabled,
  nextName,
  busy = false,
  onSave,
}: {
  enabled: boolean;
  nextName?: string | null;
  busy?: boolean;
  onSave: (value: CycleSettingsValue) => void | Promise<void>;
}) {
  const { t } = useLanguage();
  const copy = t.archive;
  const [draftName, setDraftName] = useState(nextName || "");

  async function saveName() {
    const cleanName = draftName.trim().slice(0, 80);
    setDraftName(cleanName);
    if (cleanName === (nextName || "")) return;
    await onSave({ enabled, nextName: cleanName });
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  }

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
              nextName: enabled ? "" : draftName.trim(),
            })
          }
          style={switchStyle(enabled)}
        >
          <span style={switchThumbStyle(enabled)} />
        </button>
      </div>

      {enabled ? (
        <label style={nameFieldStyle}>
          <span style={labelStyle}>{copy.next_cycle_name}</span>
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value.slice(0, 80))}
            onBlur={() => void saveName()}
            onKeyDown={handleNameKeyDown}
            placeholder={copy.next_cycle_name_placeholder}
            disabled={busy}
            maxLength={80}
            style={inputStyle}
          />
          <span style={hintStyle}>{copy.next_cycle_name_hint}</span>
        </label>
      ) : null}
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

const nameFieldStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 12,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 46,
  boxSizing: "border-box",
  border: "1px solid #ceddc9",
  borderRadius: 12,
  background: "#fff",
  color: "#283728",
  padding: "0 12px",
  fontSize: 16,
  outline: "none",
};

const hintStyle: CSSProperties = {
  color: "#7a8776",
  fontSize: 12,
  lineHeight: 1.5,
};
