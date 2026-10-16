"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatStorageBytes } from "@/lib/membership";

const AGE_BANDS = [
  { id: "lt_6m", zh: "处理期结束后未满6个月", en: "Under 6 months" },
  { id: "m6_12", zh: "6个月至未满1年", en: "6–12 months" },
  { id: "y1_3", zh: "1年至未满3年", en: "1–3 years" },
  { id: "y3_6", zh: "3年至未满6年", en: "3–6 years" },
  { id: "gte_6y", zh: "6年以上", en: "6 years or more" },
] as const;

type Preview = {
  accounts: number | string;
  projects: number | string;
  photos: number | string;
  registered_photo_bytes: number | string;
  measurement: string;
};

export default function AdminTrialCleanupPreview({ language }: { language: "zh" | "en" }) {
  const [bands, setBands] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRevision = useRef(0);
  const zh = language === "zh";

  function toggleBand(id: string, enabled: boolean) {
    requestRevision.current += 1;
    setPreview(null);
    setError("");
    setBands((current) => enabled
      ? [...current, id]
      : current.filter((item) => item !== id));
  }

  async function loadPreview() {
    if (!bands.length || busy) return;
    const revision = ++requestRevision.current;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const { data, error: failure } = await supabase.rpc("admin_preview_trial_cloud_cleanup", {
        p_bands: bands,
      });
      if (revision !== requestRevision.current) return;
      if (failure || !data || typeof data !== "object") {
        throw new Error("preview_unavailable");
      }
      setPreview(data as Preview);
    } catch {
      if (revision === requestRevision.current) {
        setError(zh
          ? "暂时无法读取预览。数据库预览权限或隔离迁移尚未启用，请勿发起清理。"
          : "Preview unavailable. The admin-only database preview has not been validated.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, opacity: 0.8 }}>
        {zh
          ? "按30天处理期结束至今的时间选择区间，可以多选。仅预览符合条件且没有未撤销付费记录的账号。"
          : "Select one or more ranges measured after the 30-day handling period. Paid accounts are excluded."}
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {AGE_BANDS.map((band) => (
          <label key={band.id} style={{ display: "flex", alignItems: "center", gap: 10,
            minHeight: 40, fontSize: 14 }}>
            <input type="checkbox" checked={bands.includes(band.id)}
              onChange={(event) => toggleBand(band.id, event.target.checked)} />
            {zh ? band.zh : band.en}
          </label>
        ))}
      </div>
      <button type="button" disabled={!bands.length || busy} onClick={() => void loadPreview()}
        style={{ minHeight: 42, maxWidth: 220, border: "1px solid #8aab84",
          background: "#edf4e9", borderRadius: 10, fontWeight: 700 }}>
        {busy ? (zh ? "正在读取…" : "Loading…") : (zh ? "预览待清理资料" : "Preview eligible data")}
      </button>
      {error ? <p role="alert" style={{ fontSize: 13, color: "#a33827", margin: 0 }}>{error}</p> : null}
      {preview ? (
        <div role="status" style={{ fontSize: 14, lineHeight: 1.9 }}>
          <div>{zh ? "账号" : "Accounts"}：{Number(preview.accounts).toLocaleString()}</div>
          <div>{zh ? "项目" : "Projects"}：{Number(preview.projects).toLocaleString()}</div>
          <div>{zh ? "照片" : "Photos"}：{Number(preview.photos).toLocaleString()}</div>
          <div>{zh ? "已登记图片容量（非实际R2用量）" : "Indexed image bytes (not actual R2 usage)"}：
            {formatStorageBytes(Number(preview.registered_photo_bytes))}
          </div>
        </div>
      ) : null}
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "#8c4d36" }}>
        {zh
          ? "安全锁定：当前仅可查看预览。管理员清理任务、真实容量核对及付款并发安全尚未通过隔离验收，因此不开放执行删除。"
          : "Safety lock: preview only. Execution remains disabled until actual storage usage, payment coordination and isolated QA pass."}
      </p>
    </div>
  );
}
