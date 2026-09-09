"use client";
import { useEffect, useState } from "react";
import { readImageLocation } from "@/lib/photo-metadata";
import type { RecordLocation } from "@/lib/record-location";
const NO_FILES: File[] = [];
export default function RecordLocationField({ value, onChange, files = NO_FILES, language, disabled = false }: {
  value: RecordLocation | null; onChange: (value: RecordLocation | null) => void; files?: File[]; language: "zh" | "en"; disabled?: boolean;
}) {
  const [photoLocation, setPhotoLocation] = useState<RecordLocation | null>(null);
  useEffect(() => {
    let canceled = false;
    setPhotoLocation(null);
    void (async () => { for (const file of files) { const location = await readImageLocation(file); if (canceled) return; if (location) { setPhotoLocation(location); return; } } })();
    return () => { canceled = true; };
  }, [files]);
  const en = language === "en";
  return <div style={{ display: "grid", gap: 6, marginBlock: 12 }}>
    <label style={{ display: "grid", gap: 7, color: "#53654e", fontSize: 14 }}>{en ? "Record location" : "记录地点"}
      <input value={value?.label || ""} maxLength={240} disabled={disabled} placeholder={en ? "Optional · visible only to you" : "选填，仅自己可见"}
        onChange={(e) => onChange(e.target.value ? { label: e.target.value, source: "manual" } : null)}
        style={{ width: "100%", minWidth: 0, minHeight: 44, border: "1px solid #dce5d8", borderRadius: 12, padding: "11px 12px", font: "inherit", color: "#263626", background: "#fff" }} />
    </label>
    {value?.latitude !== undefined ? <small style={{ color: "#6c7b67" }}>{en ? "Private photo coordinates" : "照片坐标，仅本人可见"} · {value.latitude.toFixed(4)}, {value.longitude?.toFixed(4)}
      <button type="button" disabled={disabled} onClick={() => onChange(value.label ? { label: value.label, source: "manual" } : null)} style={{ marginLeft: 8, minHeight: 36, color: "#4f7b45", border: 0, background: "transparent" }}>{en ? "Remove" : "移除"}</button></small> : null}
    {photoLocation && value?.source !== "photo" ? <button type="button" disabled={disabled} onClick={() => onChange(photoLocation)} style={{ justifySelf: "start", minHeight: 36, border: "1px solid #dce5d8", borderRadius: 10, padding: "6px 10px", color: "#4f7b45", background: "#f6faf3" }}>{en ? "Use this photo’s location" : "使用照片拍摄地点"}</button> : null}
  </div>;
}
