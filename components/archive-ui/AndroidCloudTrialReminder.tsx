"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { normalizeCloudTrialOfferRpcResult, type CloudTrialOffer } from "@/lib/membership";
import { supabase } from "@/lib/supabase";

/** One server-timed notice directly below the Android My Space title. */
export default function AndroidCloudTrialReminder({
  userId, online, onOpenBackup,
}: {
  userId: string | null;
  online: boolean;
  onOpenBackup: () => void;
}) {
  const { language } = useLanguage();
  const [status, setStatus] = useState<{ offer: CloudTrialOffer; serverNow: string } | null>(null);

  useEffect(() => {
    if (!online || !userId) { setStatus(null); return; }
    let active = true;
    setStatus(null);
    void (async () => {
      try {
        const auth = await supabase.auth.getUser();
        if (auth.error || auth.data.user?.id !== userId) return;
        const [offerResult, clockResult] = await Promise.all([
          supabase.rpc("get_my_cloud_trial_offer"),
          supabase.rpc("get_my_cloud_trial_server_time"),
        ]);
        if (offerResult.error || clockResult.error || typeof clockResult.data !== "string") return;
        const offer = normalizeCloudTrialOfferRpcResult(offerResult.data);
        if (!offer?.claimed || !Number.isFinite(Date.parse(clockResult.data))) return;
        if (active) setStatus({ offer, serverNow: clockResult.data });
      } catch { /* A failed entitlement read must not invent a trial notice. */ }
    })();
    return () => { active = false; };
  }, [userId, online]);

  if (!status) return null;
  const { offer, serverNow } = status;
  const handling = offer.lifecycle_status === "handling_period";
  const active = offer.lifecycle_status === "active";
  const deadline = handling ? offer.cleanup_due_at : offer.trial_ends_at;
  if ((!handling && !active) || !deadline) return null;
  const days = Math.max(0, Math.ceil((Date.parse(deadline) - Date.parse(serverNow)) / 86400000));
  if (!Number.isFinite(days) || (active && days > 7)) return null;
  const zh = language === "zh";
  const message = handling
    ? (zh
      ? `云端体验已结束，处理期剩余 ${days} 天。云端现为只读，请及时逐个保存到本机或备份。`
      : `Cloud trial ended. ${days} days remain in the read-only period. Save projects locally or export a backup.`)
    : (zh
      ? `云端体验即将结束，剩余 ${days} 天。请及时备份；结束后可逐个保存云端项目到本机。`
      : `Cloud trial ends in ${days} days. Back up your data; afterward, projects can be saved locally one by one.`);
  return (
    <section data-android-cloud-trial-reminder={handling ? "handling" : "active"} style={noticeStyle}>
      <span>{message}</span>
      <button type="button" style={linkStyle} onClick={onOpenBackup}>
        {zh ? "备份与导出" : "Backup & export"}
      </button>
    </section>
  );
}

const noticeStyle: CSSProperties = {
  margin: "4px 16px 10px", padding: "9px 11px", borderRadius: 11,
  background: "#f4f7ed", color: "#456342", fontSize: 13, lineHeight: 1.5,
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
};
const linkStyle: CSSProperties = {
  border: 0, background: "transparent", color: "#35623b",
  textDecoration: "underline", fontSize: 13, fontWeight: 700, padding: 0,
};
