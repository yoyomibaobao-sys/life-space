"use client";

import { useState } from "react";
import type { Language } from "@/lib/i18n";
import { formatPlantingRegion, normalizePlantingRegion, type PlantingRegion } from "@/lib/planting-region";
import PlantingRegionField from "./PlantingRegionField";

export default function PlantingRegionEditor({ value, onSave, canEdit, language }: {
  value?: PlantingRegion | null;
  onSave?: (region: PlantingRegion) => Promise<void>;
  canEdit: boolean;
  language: Language;
}) {
  const en = language === "en";
  const [draft, setDraft] = useState<PlantingRegion | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const normalized = normalizePlantingRegion(draft);
    if (!normalized) { setError(en ? "Enter a country and city / district." : "请填写国家及城市／区县。"); return; }
    if (!onSave || busy) return;
    setBusy(true);
    setError("");
    try { await onSave(normalized); setEditing(false); }
    catch { setError(en ? "Could not save. Your changes are still here." : "保存失败，填写内容已保留，请重试。"); }
    finally { setBusy(false); }
  }
  return (
    <section style={{ background: "#fff", border: "1px solid #dfe6d9", borderRadius: 18, padding: "16px", margin: "12px 0", minWidth: 0 }}>
      {editing && canEdit ? <>
        <PlantingRegionField value={draft} onChange={setDraft} language={language} disabled={busy} required />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }} style={buttonStyle}>{en ? "Cancel" : "取消"}</button>
          <button type="button" disabled={busy} onClick={() => void save()} style={{ ...buttonStyle, background: "#527c46", color: "#fff" }}>{busy ? (en ? "Saving…" : "保存中…") : (en ? "Save" : "保存")}</button>
        </div>
        {error ? <p role="alert" style={{ color: "#9a492f", fontSize: 13 }}>{error}</p> : null}
      </> : <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, fontSize: 14, lineHeight: 1.6 }}>
        <span style={{ color: "#73816d" }}>{en ? "Planting region" : "种植地区"}</span>
        <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{formatPlantingRegion(value, language) || (en ? "Not filled in" : "未填写")}</span>
        {canEdit && onSave ? <button type="button" style={buttonStyle} onClick={() => { setDraft(value || null); setError(""); setEditing(true); }}>{en ? "Edit" : "修改"}</button> : null}
      </div>}
    </section>
  );
}

const buttonStyle = { padding: "8px 14px", border: "1px solid #dce4d6", borderRadius: 20, background: "#f8faf5", color: "#42663b", fontSize: 14, cursor: "pointer" };
