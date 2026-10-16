"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import AppConfirmDialog from "@/components/mobile/AppConfirmDialog";
import { useLanguage } from "@/lib/i18n/useLanguage";
import {
  formatMembershipDate,
  normalizeCloudTrialClaimRpcResult,
  normalizeCloudTrialOfferRpcResult,
  type CloudTrialOffer,
  type MyMembership,
} from "@/lib/membership";
import { supabase } from "@/lib/supabase";

/** The Android shell keeps this entry inside its authenticated profile page. */
export default function AndroidCloudTrialEntry({
  userId, online, membership, onChanged,
}: {
  userId: string | null;
  online: boolean;
  membership: MyMembership | null;
  onChanged: () => void;
}) {
  const { language } = useLanguage();
  const [offer, setOffer] = useState<CloudTrialOffer | null>(null);
  const [serverNow, setServerNow] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmKind, setConfirmKind] = useState<"claim" | "end" | null>(null);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!userId || !online) {
      setOffer(null);
      setServerNow(null);
      setLoading(false);
      return;
    }
    let active = true;
    setOffer(null);
    setFailed(false);
    setLoading(true);
    void (async () => {
      try {
        const auth = await supabase.auth.getUser();
        if (auth.error || auth.data.user?.id !== userId) throw new Error("not_authenticated");
        const [result, clock] = await Promise.all([
          supabase.rpc("get_my_cloud_trial_offer"),
          supabase.rpc("get_my_cloud_trial_server_time"),
        ]);
        if (result.error || clock.error) throw result.error || clock.error;
        const value = normalizeCloudTrialOfferRpcResult(result.data);
        if (!value || typeof clock.data !== "string" || !Number.isFinite(Date.parse(clock.data))) {
          throw new Error("trial_offer_unavailable");
        }
        if (active) { setOffer(value); setServerNow(clock.data); }
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId, online, reload]);

  if (!userId) return null;
  // Paid membership information already has its established identity-card row.
  if (membership?.plan && membership.plan !== "trial" && membership.can_create_content === true) return null;
  if (offer?.reason === "paid_membership_history" ||
      offer?.reason === "converted_to_paid" ||
      offer?.reason === "internal_test_account" ||
      offer?.reason === "membership_active" ||
      offer?.lifecycle_status === "converted_to_paid") return null;

  async function claim() {
    if (!userId || !online || !offer?.can_claim || offer.claimed || busy.current) return;
    busy.current = true;
    setConfirmKind(null);
    setMessage("");
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || auth.data.user?.id !== userId) throw new Error("not_authenticated");
      const result = await supabase.rpc("claim_my_cloud_trial");
      if (result.error) throw result.error;
      const claimResult = normalizeCloudTrialClaimRpcResult(result.data);
      if (!claimResult?.ok || claimResult.already_claimed) throw new Error(claimResult?.reason || "claim_failed");
      onChanged();
      setReload((value) => value + 1);
      setMessage(language === "zh" ? "云体验已领取。" : "Cloud trial claimed.");
    } catch {
      setMessage(language === "zh" ? "领取未完成，请重新读取资格。" : "Claim did not complete. Check eligibility again.");
      setReload((value) => value + 1);
    } finally {
      busy.current = false;
    }
  }

  async function endEarly() {
    if (!userId || !online || !offer?.claimed || offer.lifecycle_status !== "active" || busy.current) return;
    busy.current = true;
    setConfirmKind(null);
    setMessage("");
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || auth.data.user?.id !== userId) throw new Error("not_authenticated");
      const result = await supabase.rpc("end_my_cloud_trial_early");
      if (result.error) throw result.error;
      const value = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!value?.ok) throw new Error(value?.reason || "early_end_failed");
      onChanged();
      setReload((current) => current + 1);
      setMessage(language === "zh" ? "云体验已结束，云端进入只读处理期。" : "Trial ended. Cloud content is read-only.");
    } catch {
      setMessage(language === "zh" ? "暂时无法结束体验，请重试。" : "Could not end the trial. Please try again.");
      setReload((current) => current + 1);
    } finally {
      busy.current = false;
    }
  }

  const zh = language === "zh";
  const active = offer?.claimed && offer.lifecycle_status === "active";
  const handling = offer?.claimed && offer.lifecycle_status === "handling_period";
  const deadline = handling ? offer?.cleanup_due_at : offer?.trial_ends_at;
  const remainingDays = deadline && serverNow
    ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.parse(serverNow)) / 86400000)) : null;
  const title = active || handling
    ? (zh ? "云体验状态" : "Cloud trial status")
    : (zh ? "云端试用" : "Cloud trial");
  const status = handling
    ? (zh ? "已结束 · 云端只读" : "Ended · cloud read-only")
    : active
      ? (zh ? "使用中" : "Active")
      : offer?.reason === "email_not_confirmed"
        ? (zh ? "请先验证邮箱。" : "Please confirm your email first.")
        : offer?.reason === "storage_safety_threshold" || offer?.reason === "claims_disabled"
          ? (zh ? "领取暂不可用。" : "Claims are temporarily unavailable.")
          : offer?.can_claim
            ? (zh ? "30MB · 90天；结束后有30天只读处理期。" : "30 MB · 90 days, then 30 days of read-only access.")
            : (zh ? "当前账号暂不符合领取条件。" : "This account is not eligible right now.");

  return (
    <section data-android-cloud-trial-entry="true" style={entryStyle}>
      <strong style={titleStyle}>{title}</strong>
      {loading ? <span>{zh ? "正在读取资格…" : "Checking eligibility…"}</span>
        : !online ? <span>{zh ? "联网后查看或领取；离线不会变更权益。" : "Connect to check or claim; offline access remains unchanged."}</span>
          : failed ? <span role="alert">{zh ? "资格读取失败。" : "Could not check eligibility."}</span>
            : <span>{status}</span>}
      {(active || handling) && offer ? (
        <span>{zh ? "截至" : "Until"} {formatMembershipDate(deadline, language)}{remainingDays !== null ? (zh ? ` · 剩余 ${remainingDays} 天` : ` · ${remainingDays} days left`) : ""}</span>
      ) : null}
      {offer?.can_claim && !offer.claimed && online && !loading && !failed ? (
        <button type="button" style={actionStyle} onClick={() => setConfirmKind("claim")}>
          {zh ? "开通90天云端试用" : "Start 90-day cloud trial"}
        </button>
      ) : null}
      {active && online && !failed ? (
        <button type="button" style={secondaryActionStyle} onClick={() => setConfirmKind("end")}>
          {zh ? "提前结束云体验" : "End trial early"}
        </button>
      ) : null}
      {offer?.reason === "email_not_confirmed" ? (
        <button type="button" style={actionStyle} onClick={() => setMessage(zh ? "请先通过邮件确认账号。" : "Confirm your account using the email message first.")}>
          {zh ? "查看提示" : "View reminder"}
        </button>
      ) : null}
      {failed ? <button type="button" style={actionStyle} onClick={() => setReload((value) => value + 1)}>{zh ? "重试" : "Retry"}</button> : null}
      {message ? <span role="status">{message}</span> : null}
      <AppConfirmDialog
        open={confirmKind !== null}
        title={confirmKind === "end" ? (zh ? "提前结束云体验" : "End trial early") : title}
        message={confirmKind === "end"
          ? (zh ? "结束后剩余免费体验不能恢复。云端立即只读，从现在起有30天可逐项保存到本机、备份或开通 Plus。" : "Remaining trial time cannot be restored. Cloud content becomes read-only now, with 30 days to save projects locally, export, or subscribe to Plus.")
          : (zh ? "确认领取一次性 30MB、90天云体验？领取不会上传或公开本地资料。" : "Claim the one-time 30 MB, 90-day cloud trial? Local data will not be uploaded or published.")}
        cancelLabel={zh ? "取消" : "Cancel"}
        confirmLabel={confirmKind === "end" ? (zh ? "确认结束" : "End trial") : (zh ? "确认领取" : "Claim")}
        destructive={confirmKind === "end"}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => void (confirmKind === "end" ? endEarly() : claim())}
      />
    </section>
  );
}

const entryStyle: CSSProperties = {
  display: "grid", gap: 5, padding: "11px 14px", border: "1px solid #dce6d8",
  borderRadius: 13, color: "#425940", background: "#f7faf5", fontSize: 13,
};
const titleStyle: CSSProperties = { fontSize: 15, color: "#315534" };
const actionStyle: CSSProperties = {
  justifySelf: "start", border: 0, borderRadius: 9, background: "#547c4b",
  color: "#fff", padding: "8px 12px", fontWeight: 700,
};
const secondaryActionStyle: CSSProperties = {
  ...actionStyle, color: "#315534", background: "transparent", border: "1px solid #c8d8c3",
};
