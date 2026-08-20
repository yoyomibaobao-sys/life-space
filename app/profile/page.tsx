"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { buildLoginHref } from "@/lib/auth-return";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";
import { formatProfileDateTime, formatStorage, loadUserProfileData } from "@/lib/user-profile-shared";
import {
  formatMembershipDate,
  getDaysRemaining,
  getMembershipEndDate,
  getMembershipPlanLabel,
  getMembershipStatusLabel,
  getMembershipSummary,
  normalizeMembershipRpcResult,
  type MyMembership,
} from "@/lib/membership";
import {
  buildLocationTextFromFields,
  buildRegionDisplay,
  getCountryName,
  getLocalizedCountryOptions,
  getRegionOptions,
  hasPresetRegions,
  parseLegacyLocation,
  type RegionOption,
} from "@/lib/region-shared";
import { getAccountRegistrationSummary } from "@/lib/account-number";
import UiIcon from "@/components/ui/UiIcon";
import { useLanguage } from "@/lib/i18n/useLanguage";


type MembershipPaymentRow = {
  id: string;
  order_number: string | null;
  plan: string | null;
  status: string | null;
  amount: number | string | null;
  currency: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  note: string | null;
  paid_at: string | null;
  submitted_at: string | null;
  service_started_at: string | null;
  service_ends_at: string | null;
  review_note: string | null;
  created_at: string | null;
};

type MobileProfileModule = "membership" | "payment" | "account";
type MobileProfileNavItem = {
  label: string;
  value?: MobileProfileModule;
  href?: string;
};

function formatPaymentAmount(amount?: number | string | null, currency?: string | null) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return `${currency || ""} ${amount || ""}`.trim();
  if (currency === "CNY") return `¥${value.toFixed(2)}`;
  if (currency === "USD") return `US$${value.toFixed(2)}`;
  return `${value.toFixed(2)} ${currency || ""}`.trim();
}

function getPaymentMethodLabel(method: string | null | undefined, language: "zh" | "en") {
  if (method === "wechat") return language === "en" ? "WeChat Pay" : "微信";
  if (method === "alipay") return language === "en" ? "Alipay" : "支付宝";
  if (method === "paypal") return "PayPal";
  if (method === "manual") return language === "en" ? "Manual confirmation" : "人工确认";
  if (method === "other") return language === "en" ? "Other" : "其他";
  return method || (language === "en" ? "Not recorded" : "未记录");
}

function getProfilePaymentStatusLabel(status: string | null | undefined, language: "zh" | "en") {
  if (status === "pending_payment") return language === "en" ? "Payment pending" : "待付款";
  if (status === "submitted") return language === "en" ? "Confirmation pending" : "待管理员确认";
  if (status === "needs_update") return language === "en" ? "More proof needed" : "需补充凭证";
  if (status === "confirmed") return language === "en" ? "Confirmed" : "已确认";
  if (status === "refunded") return language === "en" ? "Refunded" : "已退款";
  if (status === "canceled") return language === "en" ? "Canceled" : "已取消";
  return language === "en" ? "Not recorded" : "未记录";
}

export default function ProfilePage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const baseMobileProfileModules: MobileProfileNavItem[] = [
    { value: "membership", label: t.profile.modules.membership },
    { value: "payment", label: t.profile.modules.payment },
    { href: "/profile/trash", label: t.profile.modules.trash },
    { value: "account", label: t.profile.modules.account },
  ];
  const adminMembershipProfileModule: MobileProfileNavItem = {
    href: "/admin/memberships",
    label: t.profile.modules.admin_membership,
  };
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipError, setMembershipError] = useState("");
  const [paymentRows, setPaymentRows] = useState<MembershipPaymentRow[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);
  const [username, setUsername] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [customCountryName, setCustomCountryName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [cityName, setCityName] = useState("");
  const [initLoading, setInitLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [mobileProfileModule, setMobileProfileModule] =
    useState<MobileProfileModule>("membership");

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    async function init() {
      setInitLoading(true);
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push(buildLoginHref("/profile"));
        return;
      }

      setUser(user);
      const data = await loadUserProfileData(supabase, user.id);
      setProfile(data.profile);
      const [
        membershipResult,
        adminResult,
        paymentsResult,
      ] = await Promise.all([
        supabase.rpc("get_my_membership"),
        supabase.rpc("is_app_admin", { p_user_id: user.id }),
        supabase
          .from("membership_payments")
          .select("id, order_number, plan, status, amount, currency, payment_method, payment_reference, note, paid_at, submitted_at, service_started_at, service_ends_at, review_note, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (membershipResult.error) {
        console.error("load membership error:", membershipResult.error);
        setMembership(null);
        setMembershipError("load_failed");
      } else {
        setMembership(normalizeMembershipRpcResult(membershipResult.data));
        setMembershipError("");
      }

      if (adminResult.error) {
        console.error("load admin status error:", adminResult.error);
        setIsAdmin(false);
      } else {
        const allowed = Boolean(adminResult.data);
        setIsAdmin(allowed);
        if (allowed) {
          const { data: queueCount, error: queueError } = await supabase.rpc(
            "admin_get_membership_payment_queue_count"
          );
          if (queueError) {
            console.error("load pending membership payment count error:", queueError);
            setPendingPaymentCount(0);
          } else {
            setPendingPaymentCount(Number(queueCount || 0));
          }
        }
      }

      if (paymentsResult.error) {
        console.error("load membership payments error:", paymentsResult.error);
        setPaymentRows([]);
      } else {
        setPaymentRows(Array.isArray(paymentsResult.data) ? (paymentsResult.data as MembershipPaymentRow[]) : []);
      }

      setUsername(String(data.profile?.username || ""));

      const legacy = parseLegacyLocation(data.profile?.location);
      setCountryCode(String(data.profile?.country_code || legacy.countryCode || ""));
      setCustomCountryName(String(data.profile?.country_name || legacy.countryName || ""));
      setRegionName(String(data.profile?.region_name || legacy.regionName || ""));
      setCityName(String(data.profile?.city_name || legacy.cityName || ""));
      setInitLoading(false);
    }

    void init();
  }, [router]);

  const regionOptions = useMemo<RegionOption[]>(() => getRegionOptions(countryCode), [countryCode]);
  const useRegionSelect = hasPresetRegions(countryCode);
  const showCustomCountryInput = countryCode === "OTHER";

  const locationPreview = useMemo(() => {
    return buildRegionDisplay({
      countryCode,
      countryName: customCountryName,
      regionName,
      cityName,
      location: profile?.location,
    }, language);
  }, [countryCode, customCountryName, regionName, cityName, profile, language]);

  const storageText = useMemo(() => {
    const used = formatStorage(Number(profile?.storage_used || 0));
    const limit = formatStorage(Number(membership?.storage_limit_bytes || profile?.storage_limit || 0));
    return `${used} / ${limit}`;
  }, [profile, membership]);
  const accountRegistrationSummary = getAccountRegistrationSummary(
    profile?.account_number,
    language
  );

  const membershipEndDate = getMembershipEndDate(membership);
  const membershipDaysRemaining = getDaysRemaining(membershipEndDate);
  const showMembershipNotice = Boolean(
    membership &&
      (membership.can_create_content === false ||
        (typeof membershipDaysRemaining === "number" && membershipDaysRemaining <= 14))
  );
  const membershipNoticeText = membership?.can_create_content === false
    ? t.profile.expired
    : typeof membershipDaysRemaining === "number" && membershipDaysRemaining <= 14
      ? `${t.profile.expires_prefix} ${membershipDaysRemaining} ${t.profile.expires_suffix}`
      : "";
  const membershipStatusText = membershipError
    ? t.profile.membership_load_failed
    : getMembershipSummary(membership, language);
  const isMobileViewport = viewportWidth < 760;
  const visibleMobileProfileModules = isAdmin
    ? [...baseMobileProfileModules, adminMembershipProfileModule]
    : baseMobileProfileModules;
  const topGridColumns = isMobileViewport ? "minmax(0, 1fr)" : viewportWidth < 820 ? "1fr" : "minmax(280px, 0.95fr) minmax(420px, 1.05fr)";
  const formGridColumns = viewportWidth < 560 ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))";
  const statsGridColumns = isMobileViewport
    ? "1fr"
    : viewportWidth < 900
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(3, minmax(0, 1fr))";
  const pageStyle = isMobileViewport ? mobileProfileMainStyle : profileMainStyle;
  const shellStyle = isMobileViewport ? mobileProfileShellStyle : profileShellStyle;
  const compactPanelStyle = isMobileViewport ? { ...panelStyle, ...mobilePanelStyle } : panelStyle;
  const fieldInputStyle = isMobileViewport ? mobileInputStyle : inputStyle;
  const primaryActionStyle = isMobileViewport ? mobilePrimaryButtonStyle : primaryButtonStyle;
  const secondaryActionStyle = isMobileViewport ? mobileSecondaryLinkStyle : secondaryLinkStyle;
  const sectionCompactStyle = isMobileViewport ? mobileProfileSectionStyle : {};
  const showMembershipModule = mobileProfileModule === "membership";
  const showInfoModule = showMembershipModule;
  const showPaymentModule = mobileProfileModule === "payment";
  const showAccountModule = mobileProfileModule === "account";

  async function refreshProfile(targetUserId: string) {
    const data = await loadUserProfileData(supabase, targetUserId);
    setProfile(data.profile);
  }

  async function refreshPaymentRows(targetUserId: string) {
    setPaymentLoading(true);
    const { data, error } = await supabase
      .from("membership_payments")
      .select("id, order_number, plan, status, amount, currency, payment_method, payment_reference, note, paid_at, submitted_at, service_started_at, service_ends_at, review_note, created_at")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.error("refresh membership payments error:", error);
      showToast(t.profile.payment_load_failed);
    } else {
      setPaymentRows(Array.isArray(data) ? (data as MembershipPaymentRow[]) : []);
    }

    setPaymentLoading(false);
  }

  async function handleSave() {
    if (!user) return;

    const safeUsername = username.trim();
    const safeCountryCode = countryCode || null;
    const safeCountryName = countryCode === "OTHER"
      ? customCountryName.trim()
      : getCountryName(countryCode, customCountryName, language);
    const safeRegionName = regionName.trim();
    const safeCityName = cityName.trim();

    if (safeUsername.length < 2) {
      setErrorMsg(t.profile.username_too_short);
      showToast(t.profile.username_too_short);
      return;
    }

    if (countryCode === "OTHER" && !safeCountryName) {
      setErrorMsg(t.profile.custom_country_required);
      showToast(t.profile.custom_country_required);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const locationText = buildLocationTextFromFields({
      countryCode,
      countryName: safeCountryName,
      regionName: safeRegionName,
      cityName: safeCityName,
    }, language);

    const { error } = await supabase
      .from("profiles")
      .update({
        username: safeUsername,
        country_code: safeCountryCode,
        country_name: safeCountryName || null,
        region_name: safeRegionName || null,
        city_name: safeCityName || null,
        location: locationText || null,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      setErrorMsg(error.message || t.profile.save_failed);
      showToast(t.profile.save_failed);
      return;
    }

    showToast(t.profile.saved);
    void refreshProfile(user.id);
  }


  async function handleExport() {
    if (!user || exporting) return;

    setExporting(true);
    setErrorMsg("");

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        setErrorMsg(t.profile.relogin_export);
        showToast(t.profile.relogin_export);
        router.push(buildLoginHref("/profile"));
        return;
      }

      const response = await fetch("/api/export/my-records", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        const message = text || t.profile.export_failed;
        setErrorMsg(message);
        showToast(message);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1]
        ? decodeURIComponent(fileNameMatch[1])
        : fileNameMatch?.[2] || `${t.profile.export_filename}-${new Date().toISOString().slice(0, 10)}.zip`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(t.profile.export_done);
    } catch {
      setErrorMsg(t.profile.export_failed);
      showToast(t.profile.export_failed);
    } finally {
      setExporting(false);
    }
  }

  function openDeleteDialog() {
    setDeleteConfirmed(false);
    setDeleteAccountError("");
    setDeleteDialogOpen(true);
  }

  function closeDeleteDialog() {
    if (deleteLoading) return;
    setDeleteDialogOpen(false);
    setDeleteConfirmed(false);
    setDeleteAccountError("");
  }

  async function handleDeleteAccount() {
    if (!user || deleteLoading) return;

    if (!deleteConfirmed) {
      setDeleteAccountError(t.profile.confirm_checkbox);
      return;
    }

    setDeleteLoading(true);
    setDeleteAccountError("");

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        setDeleteAccountError(t.profile.relogin_delete);
        showToast(t.profile.relogin_delete);
        router.push(buildLoginHref("/profile"));
        return;
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        const message = payload?.error || t.profile.delete_failed;
        setDeleteAccountError(message);
        showToast(message);
        return;
      }

      await supabase.auth.signOut();
      showToast(t.profile.deleted);
      router.replace("/");
    } catch {
      const message = t.profile.delete_failed;
      setDeleteAccountError(message);
      showToast(message);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg(t.profile.image_required);
      showToast(t.profile.image_required);
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg(t.profile.avatar_size_limit);
      showToast(t.profile.avatar_size_limit);
      return;
    }

    setUploading(true);
    setErrorMsg("");

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      setUploading(false);
      setErrorMsg(t.profile.upload_failed);
      showToast(t.profile.avatar_upload_failed);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const url = data.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);

    setUploading(false);

    if (updateError) {
      setErrorMsg(t.profile.avatar_save_failed);
      showToast(t.profile.avatar_save_failed);
      return;
    }

    showToast(t.profile.avatar_updated);
    void refreshProfile(user.id);
  }

  if (initLoading || !user || !profile) {
    return <div style={{ padding: 40 }}>{t.profile.loading}</div>;
  }

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        {!isMobileViewport ? (
          <h1 style={{ margin: 0, fontSize: 24, color: "#1f2a1f" }}>{t.profile.title}</h1>
        ) : null}

        {errorMsg ? (
          <div style={{ marginTop: 16, background: "#fff2f0", border: "1px solid #ffd6cf", color: "#c23a2b", padding: "10px 12px", borderRadius: 12, fontSize: 14 }}>
            {errorMsg}
          </div>
        ) : null}

        {isAdmin && pendingPaymentCount > 0 ? (
          <Link href="/admin/memberships#payment-review" style={adminPaymentAlertStyle}>
            <span style={adminPaymentAlertCountStyle}>{pendingPaymentCount}</span>
            <span>
              <strong style={{ display: "block" }}>{t.profile.admin_payment_alert}</strong>
              <span style={adminPaymentAlertHintStyle}>{t.profile.admin_payment_alert_hint}</span>
            </span>
            <UiIcon name="arrow-right" size={18} />
          </Link>
        ) : null}

        <MobileProfileModuleTabs
          active={mobileProfileModule}
          modules={visibleMobileProfileModules}
          onChange={setMobileProfileModule}
          compact={isMobileViewport}
        />

        {showInfoModule ? (
        <div style={{ display: "grid", gridTemplateColumns: topGridColumns, gap: isMobileViewport ? 10 : 14, marginTop: isMobileViewport ? 10 : 14, alignItems: "start" }}>
          <section style={compactPanelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobileViewport ? 10 : 12, minWidth: 0 }}>
              {profile.avatar_url ? (
                <img src={String(profile.avatar_url)} alt="" style={isMobileViewport ? mobileAvatarStyle : { width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "1px solid #e4ebe0" }} />
              ) : (
                <div style={isMobileViewport ? mobileAvatarFallbackStyle : { width: 72, height: 72, borderRadius: "50%", background: "#eef5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}><UiIcon name="sprout" size={26} /></div>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: isMobileViewport ? 17 : 19, fontWeight: 700, color: "#1f2a1f" }}>{profile.username || t.profile.unset_username}</div>
                <div style={{ marginTop: 3, fontSize: 13, color: "#6f7b69", wordBreak: "break-all" }}>{user.email}</div>
                <div style={{ marginTop: 5, fontSize: 13, color: "#6f7b69" }}>
                  {t.profile.region_prefix}{locationPreview}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={fieldLabelStyle}>{t.profile.change_avatar}</label>
              <input type="file" accept="image/*" onChange={handleUpload} style={isMobileViewport ? mobileFileInputStyle : undefined} />
              <div style={{ marginTop: 4, fontSize: 12, color: "#7b8676" }}>
                {t.profile.avatar_hint}{uploading ? t.profile.uploading : ""}
              </div>
            </div>

            <div style={metaListStyle}>
              <MetaItem
                label={t.profile.account_number}
                value={
                  profile.account_number ||
                  (profile.is_internal_test ? t.profile.internal_test : t.profile.not_assigned)
                }
              />
              {accountRegistrationSummary ? (
                <MetaItem label={t.profile.registration_order} value={accountRegistrationSummary} />
              ) : null}
              <MetaItem label={t.profile.account_level} value={`Lv.${Number(profile.level || 1)}`} />
              <MetaItem label={t.profile.received_helpful} value={<span><UiIcon name="helpful" size={13} /> {Number(profile.flower_count || 0)}</span>} />
              <MetaItem label={t.profile.joined} value={formatProfileDateTime(profile.created_at, language)} />
            </div>
          </section>

          <section style={compactPanelStyle}>
            <div style={sectionTitleStyle}>{t.profile.basic_info}</div>
            <div style={{ ...formGridStyle, gridTemplateColumns: formGridColumns }}>
              <div>
                <label style={fieldLabelStyle}>{t.profile.username}</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} style={fieldInputStyle} placeholder={t.profile.username_placeholder} />
              </div>
              <div>
                <label style={fieldLabelStyle}>{t.profile.country_region}</label>
                <select value={countryCode} onChange={(e) => { setCountryCode(e.target.value); setRegionName(""); }} style={fieldInputStyle}>
                  <option value="">{t.profile.select}</option>
                  {getLocalizedCountryOptions(language).map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>
              {showCustomCountryInput ? (
                <div>
                  <label style={fieldLabelStyle}>{t.profile.custom_country_region}</label>
                  <input value={customCountryName} onChange={(e) => setCustomCountryName(e.target.value)} style={fieldInputStyle} placeholder={t.profile.country_example} />
                </div>
              ) : null}
              <div>
                <label style={fieldLabelStyle}>{t.profile.region}</label>
                {useRegionSelect ? (
                  <select value={regionName} onChange={(e) => setRegionName(e.target.value)} style={fieldInputStyle}>
                    <option value="">{t.profile.select}</option>
                    {regionOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                ) : (
                  <input value={regionName} onChange={(e) => setRegionName(e.target.value)} style={fieldInputStyle} placeholder={t.profile.region_example} />
                )}
              </div>
              <div>
                <label style={fieldLabelStyle}>{t.profile.city}</label>
                <input value={cityName} onChange={(e) => setCityName(e.target.value)} style={fieldInputStyle} placeholder={t.profile.city_example} />
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 13, color: "#5e6959" }}>
              {t.profile.display_as}<span style={{ fontWeight: 700, color: "#243123" }}>{locationPreview}</span>
            </div>

            <div style={isMobileViewport ? mobileProfileActionRowStyle : { marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={handleSave} disabled={saving} style={primaryActionStyle}>{saving ? t.profile.saving : t.profile.save_profile}</button>
              <Link href={`/user/${user.id}/profile`} style={secondaryActionStyle}>{t.profile.view_public_profile}</Link>
            </div>
          </section>
        </div>
        ) : null}

        {showMembershipModule ? (
        <>
        <section style={isMobileViewport ? { ...membershipSectionStyle, ...sectionCompactStyle } : membershipSectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>{t.profile.account_plan}</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#1f2a1f" }}>{t.profile.membership_info}</h2>
              <p style={{ margin: "8px 0 0", color: "#6f7b69", fontSize: 13, lineHeight: 1.6 }}>
                {membershipStatusText}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/membership" style={secondaryLinkStyle}>
                {membership ? t.profile.open_renew_info : t.profile.learn_cloud_membership}
              </Link>
            </div>
          </div>

          {showMembershipNotice ? (
            <div style={membershipNoticeStyle}>
              <div>{membershipNoticeText}</div>
              <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
                {t.profile.view_open_renew}
              </Link>
            </div>
          ) : null}

          <div style={membershipRightsStyle}>
            <div style={membershipRightsTitleStyle}>{t.profile.membership_rights_summary}</div>
            <div style={membershipRightRowStyle}>
              <strong>{t.profile.registered_user}</strong>
              <span>{t.profile.registered_user_rights}</span>
            </div>
            <div style={membershipRightRowStyle}>
              <strong>{t.profile.cloud_member}</strong>
              <span>{t.profile.cloud_member_rights}</span>
            </div>
            <Link href="/membership/benefits" style={membershipRightsLinkStyle}>
              {t.profile.view_full_membership_rights}
              <UiIcon name="arrow-right" size={14} />
            </Link>
          </div>

          <div style={{ ...statsGridStyle, gridTemplateColumns: statsGridColumns, marginTop: 14 }}>
            <InfoCard
              label={t.profile.account_identity}
              value={membership ? getMembershipPlanLabel(membership.plan, language) : t.profile.local_free}
              hint={membership ? getMembershipStatusLabel(membership.status, language) : t.profile.local_free_hint}
            />
            <InfoCard
              label={t.profile.valid_until}
              value={membership ? formatMembershipDate(membershipEndDate, language) : t.profile.not_applicable}
              hint={
                membership
                  ? membership.can_create_content === false
                    ? t.profile.restricted_existing
                    : t.profile.active_until_expiry
                  : t.profile.local_no_expiry
              }
            />
            <InfoCard
              label={t.profile.storage_usage}
              value={storageText}
              hint={t.profile.storage_hint}
            />
          </div>
        </section>

        </>
        ) : null}

        {showPaymentModule ? (
        <section style={isMobileViewport ? { ...paymentHistorySectionStyle, ...sectionCompactStyle } : paymentHistorySectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>{t.profile.payment_records}</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#1f2a1f" }}>{t.profile.payment_info}</h2>
              <p style={{ margin: "8px 0 0", color: "#6f7b69", fontSize: 13, lineHeight: 1.6 }}>
                {t.profile.payment_records_hint}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/membership/payment" style={primaryButtonStyle}>{t.profile.open_or_renew}</Link>
              <button
                type="button"
                onClick={() => void refreshPaymentRows(user.id)}
                disabled={paymentLoading}
                style={{
                  ...secondaryLinkStyle,
                  cursor: paymentLoading ? "not-allowed" : "pointer",
                  opacity: paymentLoading ? 0.65 : 1,
                }}
              >
                {paymentLoading ? t.profile.refreshing : t.profile.refresh_payments}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {paymentRows.length === 0 ? (
              <div style={emptyPaymentStyle}>{t.profile.no_payment_orders}</div>
            ) : (
              paymentRows.map((payment) => (
                <div key={payment.id} style={paymentCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#243123" }}>
                        {formatPaymentAmount(payment.amount, payment.currency)}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 13, color: "#6f7b69" }}>
                        {getMembershipPlanLabel(payment.plan, language)} · {getPaymentMethodLabel(payment.payment_method, language)}
                      </div>
                    </div>
                    <span style={profilePaymentStatusStyle(payment.status)}>
                      {getProfilePaymentStatusLabel(payment.status, language)}
                    </span>
                  </div>

                  {payment.order_number ? (
                    <div style={paymentMetaTextStyle}>{t.profile.order_number}{payment.order_number}</div>
                  ) : null}
                  <div style={paymentMetaTextStyle}>
                    {payment.status === "confirmed" ? t.profile.payment_time : t.profile.order_time}
                    {formatMembershipDate(payment.paid_at || payment.submitted_at || payment.created_at, language)}
                  </div>
                  {payment.status === "confirmed" ? (
                    <div style={paymentMetaTextStyle}>
                      {t.profile.service_period}{formatMembershipDate(payment.service_started_at, language)} - {formatMembershipDate(payment.service_ends_at, language)}
                    </div>
                  ) : null}
                  {payment.payment_reference ? (
                    <div style={paymentMetaTextStyle}>
                      {t.profile.transaction_reference}{payment.payment_reference}
                    </div>
                  ) : null}
                  {payment.status === "needs_update" && payment.review_note ? (
                    <div style={paymentReviewNoteStyle}>{payment.review_note}</div>
                  ) : null}
                  {payment.note ? (
                    <div style={paymentMetaTextStyle}>
                      {t.profile.note}{payment.note}
                    </div>
                  ) : null}
                  {payment.status === "needs_update" ? (
                    <Link href="/membership/payment" style={paymentUpdateLinkStyle}>{t.profile.update_payment_proof}</Link>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
        ) : null}

        {showAccountModule ? (
        <>
        <section style={isMobileViewport ? { ...dataSectionStyle, ...sectionCompactStyle } : dataSectionStyle}>
          <div>
            <div style={{ fontSize: 13, color: "#6b7b66" }}>{t.profile.my_data}</div>
            <h2 style={dataTitleStyle}>{t.profile.export_backup}</h2>
            <p style={dataDescStyle}>
              {t.profile.export_intro}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            style={{
              ...secondaryLinkStyle,
              cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.65 : 1,
            }}
          >
            {exporting ? t.profile.packaging : t.profile.export_records}
          </button>
          {exporting ? (
            <p style={exportProgressStyle}>
              {t.profile.packaging_hint}
            </p>
          ) : null}
        </section>

        <section style={isMobileViewport ? { ...dangerSectionStyle, ...sectionCompactStyle, alignItems: "stretch" } : dangerSectionStyle}>
          <div>
            <div style={{ fontSize: 13, color: "#9a5b55" }}>{t.profile.danger}</div>
            <h2 style={dangerTitleStyle}>{t.profile.delete_account}</h2>
            <p style={dangerDescStyle}>
              {t.profile.delete_intro}
            </p>
          </div>
          <button
            type="button"
            onClick={openDeleteDialog}
            style={dangerButtonStyle}
          >
            {t.profile.delete_account}
          </button>
        </section>
        </>
        ) : null}
      </section>
      <ConfirmDialog
        open={deleteDialogOpen}
        title={t.profile.delete_confirm_title}
        message={t.profile.delete_confirm_message}
        confirmText={deleteLoading ? t.profile.deleting : t.profile.confirm_delete}
        cancelText={t.profile.cancel}
        danger
        confirmDisabled={deleteLoading || !deleteConfirmed}
        cancelDisabled={deleteLoading}
        onConfirm={handleDeleteAccount}
        onClose={closeDeleteDialog}
      >
        <label style={deleteConfirmCheckStyle}>
          <input
            type="checkbox"
            checked={deleteConfirmed}
            onChange={(event) => {
              setDeleteConfirmed(event.target.checked);
              setDeleteAccountError("");
            }}
            disabled={deleteLoading}
            style={deleteConfirmCheckboxStyle}
          />
          <span>{t.profile.acknowledge_delete}</span>
        </label>
        {deleteAccountError ? (
          <div style={deleteErrorStyle}>{deleteAccountError}</div>
        ) : null}
      </ConfirmDialog>
    </main>
  );
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "#5f6a5b" }}>
      <span>{label}</span>
      <span style={{ color: "#1f2a1f", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function MobileProfileModuleTabs({
  active,
  modules,
  onChange,
  compact,
}: {
  active: MobileProfileModule;
  modules: MobileProfileNavItem[];
  onChange: (value: MobileProfileModule) => void;
  compact: boolean;
}) {
  const { t } = useLanguage();
  return (
    <nav
      style={{
        ...mobileProfileTabsStyle,
        gridTemplateColumns: compact
          ? "repeat(2, minmax(0, 1fr))"
          : `repeat(${modules.length}, minmax(0, 1fr))`,
      }}
      aria-label={t.profile.module_aria}
    >
      {modules.map((item) =>
        item.href ? (
          <Link
            key={item.href}
            href={item.href}
            style={
              item.href === "/admin/memberships"
                ? {
                    ...mobileAdminMembershipEntryStyle,
                    gridColumn: compact ? "1 / -1" : undefined,
                  }
                : mobileProfileLinkTabStyle
            }
          >
            {item.label}
          </Link>
        ) : item.value ? (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value as MobileProfileModule)}
            style={mobileProfileTabButtonStyle(active === item.value)}
          >
            {item.label}
          </button>
        ) : null,
      )}
    </nav>
  );
}

function InfoCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={statCardBaseStyle}>
      <div style={{ fontSize: 14, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#7b8676", lineHeight: 1.35 }}>{hint}</div>
    </div>
  );
}

const profileMainStyle: CSSProperties = {
  maxWidth: 1040,
  margin: "0 auto",
  padding: "16px 14px 32px",
};

const mobileProfileMainStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  margin: "0 auto",
  padding: "8px 8px 84px",
  boxSizing: "border-box",
  overflowX: "hidden",
};

const profileShellStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e7efe3",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 24px rgba(32,56,24,0.05)",
};

const mobileProfileShellStyle: CSSProperties = {
  ...profileShellStyle,
  width: "100%",
  maxWidth: "100%",
  borderRadius: 14,
  padding: 10,
  boxSizing: "border-box",
  boxShadow: "0 6px 16px rgba(32,56,24,0.04)",
};

const mobileProfileTabsStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  overflowX: "visible",
  margin: "0 0 10px",
  padding: "2px 0 3px",
};

function mobileProfileTabButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: 40,
    border: active ? "1px solid #9bc98f" : "1px solid #dfe8da",
    borderRadius: 999,
    background: active ? "#edf8e9" : "#fff",
    color: active ? "#2f6a31" : "#52634e",
    padding: "0 6px",
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: "normal",
    lineHeight: 1.15,
    cursor: "pointer",
  };
}

const mobileProfileLinkTabStyle: CSSProperties = {
  ...mobileProfileTabButtonStyle(false),
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  textDecoration: "none",
  boxSizing: "border-box",
};

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e8efe4",
  borderRadius: 16,
  padding: 14,
};

const mobilePanelStyle: CSSProperties = {
  borderRadius: 13,
  padding: 10,
  minWidth: 0,
  boxSizing: "border-box",
};

const adminPaymentAlertStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  marginTop: 10,
  padding: "11px 12px",
  border: "1px solid #e7b886",
  borderRadius: 14,
  background: "#fff3e4",
  color: "#7c3f20",
  textDecoration: "none",
  fontSize: 14,
};

const adminPaymentAlertCountStyle: CSSProperties = {
  minWidth: 34,
  height: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  background: "#c95c2f",
  color: "#fff",
  fontSize: 16,
  fontWeight: 900,
};

const adminPaymentAlertHintStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "#965b3c",
  fontSize: 12,
  lineHeight: 1.4,
};


const membershipNoticeStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #ead9b8",
  borderRadius: 14,
  background: "#fff8ea",
  color: "#72541f",
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.7,
  display: "flex",
  gap: 10,
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
};

const membershipRightsStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 12,
  padding: "11px 12px",
  border: "1px solid #dce9d5",
  borderRadius: 14,
  background: "#fff",
};

const membershipRightsTitleStyle: CSSProperties = {
  color: "#274126",
  fontSize: 14,
  fontWeight: 900,
};

const membershipRightRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "90px minmax(0, 1fr)",
  gap: 8,
  color: "#667361",
  fontSize: 13,
  lineHeight: 1.5,
};

const membershipRightsLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  justifySelf: "start",
  color: "#3e703c",
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "none",
};

const membershipSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#f8fbf3",
  border: "1px solid #e1ecd9",
  borderRadius: 18,
  padding: 14,
};

const mobileProfileSectionStyle: CSSProperties = {
  marginTop: 10,
  borderRadius: 13,
  padding: 10,
  minWidth: 0,
  boxSizing: "border-box",
};

const paymentHistorySectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#fffdf7",
  border: "1px solid #eadfca",
  borderRadius: 18,
  padding: 14,
};

const paymentCardStyle: CSSProperties = {
  background: "#fffaf0",
  border: "1px solid #eadfca",
  borderRadius: 14,
  padding: "12px 13px",
};

const paymentMetaTextStyle: CSSProperties = {
  marginTop: 5,
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.55,
  overflowWrap: "anywhere",
};

function profilePaymentStatusStyle(status: string | null | undefined): CSSProperties {
  const needsUpdate = status === "needs_update";
  const submitted = status === "submitted";
  return {
    alignSelf: "flex-start",
    padding: "4px 8px",
    borderRadius: 999,
    color: needsUpdate ? "#994625" : submitted ? "#786018" : "#3d6c3b",
    background: needsUpdate ? "#fff0e7" : submitted ? "#fff6d9" : "#eaf4e6",
    fontSize: 12,
    fontWeight: 800,
  };
}

const paymentReviewNoteStyle: CSSProperties = {
  marginTop: 8,
  padding: "8px 9px",
  borderRadius: 10,
  background: "#fff0e7",
  color: "#914628",
  fontSize: 13,
  lineHeight: 1.5,
};

const paymentUpdateLinkStyle: CSSProperties = {
  display: "inline-flex",
  marginTop: 8,
  color: "#3f703d",
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "none",
};

const emptyPaymentStyle: CSSProperties = {
  border: "1px dashed #d9ceb8",
  borderRadius: 14,
  padding: "14px 13px",
  color: "#7b6d55",
  background: "#fffaf2",
  fontSize: 13,
};

const dataSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#f8fbf6",
  border: "1px solid #dce8d7",
  borderRadius: 18,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
};

const dataTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#263326",
  fontSize: 20,
};

const dataDescStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#687565",
  fontSize: 13,
  lineHeight: 1.6,
  maxWidth: 640,
};

const exportProgressStyle: CSSProperties = {
  flexBasis: "100%",
  margin: 0,
  color: "#7b8676",
  fontSize: 13,
  lineHeight: 1.55,
};

const dangerSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#fffafa",
  border: "1px solid #ead6d3",
  borderRadius: 18,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
};

const dangerTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#442b28",
  fontSize: 20,
};

const dangerDescStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#705b57",
  fontSize: 13,
  lineHeight: 1.6,
  maxWidth: 640,
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid #d88f8f",
  background: "#fff7f7",
  color: "#a44444",
  borderRadius: 12,
  padding: "9px 13px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const deleteConfirmCheckStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "#442b28",
  fontSize: 14,
  lineHeight: 1.5,
  cursor: "pointer",
};

const deleteConfirmCheckboxStyle: CSSProperties = {
  width: 16,
  height: 16,
  accentColor: "#a44444",
  flexShrink: 0,
  cursor: "pointer",
};

const deleteErrorStyle: CSSProperties = {
  marginTop: 8,
  color: "#a44444",
  fontSize: 13,
  lineHeight: 1.5,
};

const fieldLabelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontSize: 13,
  color: "#5e6959",
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid #d8e3d3",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const mobileInputStyle: CSSProperties = {
  ...inputStyle,
  minWidth: 0,
  padding: "8px 10px",
  borderRadius: 9,
  fontSize: 13,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: "#1f2a1f",
  marginBottom: 10,
};

const metaListStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 12,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  background: "#4f7b45",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 14px",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const mobilePrimaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  minHeight: 36,
  padding: "0 12px",
  borderRadius: 10,
  fontSize: 13,
};

const secondaryLinkStyle: CSSProperties = {
  textDecoration: "none",
  border: "1px solid #d7e2d2",
  background: "#fff",
  color: "#40583a",
  borderRadius: 12,
  padding: "9px 13px",
  fontSize: 14,
  fontWeight: 600,
};

const mobileSecondaryLinkStyle: CSSProperties = {
  ...secondaryLinkStyle,
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 10px",
  borderRadius: 10,
  fontSize: 13,
  boxSizing: "border-box",
};

const mobileAdminMembershipEntryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 40,
  border: "1px solid #c9d8be",
  borderRadius: 11,
  background: "#f3faef",
  color: "#2f5a27",
  padding: "0 12px",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.2,
  boxSizing: "border-box",
};

const mobileProfileActionRowStyle: CSSProperties = {
  marginTop: 12,
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
};

const mobileAvatarStyle: CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: "50%",
  objectFit: "cover",
  border: "1px solid #e4ebe0",
  flexShrink: 0,
};

const mobileAvatarFallbackStyle: CSSProperties = {
  ...mobileAvatarStyle,
  background: "#eef5e9",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 23,
};

const mobileFileInputStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  fontSize: 12,
  color: "#5e6959",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const statCardBaseStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e4ece0",
  borderRadius: 16,
  padding: 14,
  display: "block",
  color: "inherit",
  minHeight: 104,
  boxSizing: "border-box",
};
