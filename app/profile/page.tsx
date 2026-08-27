"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { buildLoginHref } from "@/lib/auth-return";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";
import { formatStorage, loadUserProfileData, type UserProfileStats } from "@/lib/user-profile-shared";
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
  expires_at: string | null;
  payment_destination_label: string | null;
  payment_destination_version: string | null;
  close_reason: string | null;
};

type MobileProfileModule = "membership" | "payment" | "backup" | "account";
type MobileProfileNavItem = {
  label: string;
  value?: MobileProfileModule;
  href?: string;
};

const PROFILE_RETURN_STATE_KEY = "lifespace:profile-return-state:v1";

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
  if (status === "expired") return language === "en" ? "Expired" : "已失效";
  return language === "en" ? "Not recorded" : "未记录";
}

export default function ProfilePage() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const baseMobileProfileModules: MobileProfileNavItem[] = [
    { href: "/membership/payment", label: language === "en" ? "Open / renew" : "开通／续费" },
    { value: "payment", label: language === "en" ? "Order history" : "订单查询" },
    { href: "/membership/refund", label: t.profile.refund_request_nav },
    { href: "/membership/benefits", label: language === "en" ? "Membership types" : "会员类别说明" },
    { href: "/profile/recent", label: language === "en" ? "Browsing history" : "浏览历史" },
    { value: "backup", label: language === "en" ? "Backup & export" : "备份与导出" },
    { href: "/legal", label: t.profile.legal_rules_nav },
    { href: "/feedback", label: t.feedback_and_contact },
    { href: "/profile/trash", label: t.profile.modules.trash },
    { value: "account", label: language === "en" ? "Account management" : "账号管理" },
  ];
  const adminMembershipProfileModule: MobileProfileNavItem = {
    href: "/admin/memberships",
    label: language === "en" ? "User management" : "用户管理",
  };
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [profileStats, setProfileStats] = useState<UserProfileStats | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipError, setMembershipError] = useState("");
  const [paymentRows, setPaymentRows] = useState<MembershipPaymentRow[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);
  const [pendingRefundCount, setPendingRefundCount] = useState(0);
  const [username, setUsername] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [customCountryName, setCustomCountryName] = useState("");
  const [regionName, setRegionName] = useState("");
  const [cityName, setCityName] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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
    useState<MobileProfileModule | null>(null);
  const restoringProfilePositionRef = useRef(false);
  const isMobileViewport = viewportWidth < 760;

  useEffect(() => {
    const updateViewportWidth = () => {
      const width = window.innerWidth;
      setViewportWidth(width);
      if (width >= 760) {
        setMobileProfileModule((current) => current || "membership");
      }
    };
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    if (initLoading) return;

    let stored: { scrollY?: number; module?: MobileProfileModule | null } | null = null;
    try {
      stored = JSON.parse(
        sessionStorage.getItem(PROFILE_RETURN_STATE_KEY) || "null"
      ) as { scrollY?: number; module?: MobileProfileModule | null } | null;
      sessionStorage.removeItem(PROFILE_RETURN_STATE_KEY);
    } catch {
      stored = null;
    }

    if (!stored) return;
    if (stored.module) {
      if (isMobileViewport) restoringProfilePositionRef.current = true;
      setMobileProfileModule(stored.module);
    }
    const targetY = Math.max(0, Number(stored.scrollY || 0));
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: "auto" });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [initLoading, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || !mobileProfileModule) return;
    if (restoringProfilePositionRef.current) {
      restoringProfilePositionRef.current = false;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`profile-module-${mobileProfileModule}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileViewport, mobileProfileModule]);

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
      setProfileStats(data.stats);

      const openOrderRefresh = await supabase.rpc(
        "get_my_open_membership_payment_order_json"
      );
      if (openOrderRefresh.error) {
        console.error("refresh open membership order error:", openOrderRefresh.error);
      }

      const [
        membershipResult,
        adminResult,
        paymentsResult,
      ] = await Promise.all([
        supabase.rpc("get_my_membership"),
        supabase.rpc("is_app_admin", { p_user_id: user.id }),
        supabase
          .from("membership_payments")
          .select("id, order_number, plan, status, amount, currency, payment_method, payment_reference, note, paid_at, submitted_at, service_started_at, service_ends_at, review_note, created_at, expires_at, payment_destination_label, payment_destination_version, close_reason")
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
          const [paymentQueueResult, refundQueueResult] = await Promise.all([
            supabase.rpc("admin_get_membership_payment_queue_count"),
            supabase.rpc("admin_get_membership_refund_queue_count"),
          ]);
          if (paymentQueueResult.error) {
            console.error("load pending membership payment count error:", paymentQueueResult.error);
            setPendingPaymentCount(0);
          } else {
            setPendingPaymentCount(Number(paymentQueueResult.data || 0));
          }
          if (refundQueueResult.error) {
            console.error("load pending membership refund count error:", refundQueueResult.error);
            setPendingRefundCount(0);
          } else {
            setPendingRefundCount(Number(refundQueueResult.data || 0));
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
  const visibleMobileProfileModules = isAdmin
    ? [...baseMobileProfileModules, adminMembershipProfileModule]
    : baseMobileProfileModules;
  const statsGridColumns = isMobileViewport
    ? "1fr"
    : viewportWidth < 900
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(3, minmax(0, 1fr))";
  const pageStyle = isMobileViewport ? mobileProfileMainStyle : profileMainStyle;
  const shellStyle = isMobileViewport ? mobileProfileShellStyle : profileShellStyle;
  const fieldInputStyle = isMobileViewport ? mobileInputStyle : inputStyle;
  const primaryActionStyle = isMobileViewport ? mobilePrimaryButtonStyle : primaryButtonStyle;
  const sectionCompactStyle = isMobileViewport ? mobileProfileSectionStyle : {};
  const showMembershipModule = mobileProfileModule === "membership";
  const showPaymentModule = mobileProfileModule === "payment";
  const showAccountModule = mobileProfileModule === "account";
  const showBackupModule = mobileProfileModule === "backup";

  async function refreshProfile(targetUserId: string) {
    const data = await loadUserProfileData(supabase, targetUserId);
    setProfile(data.profile);
    setProfileStats(data.stats);
  }

  async function refreshPaymentRows(targetUserId: string) {
    setPaymentLoading(true);
    const { data, error } = await supabase
      .from("membership_payments")
      .select("id, order_number, plan, status, amount, currency, payment_method, payment_reference, note, paid_at, submitted_at, service_started_at, service_ends_at, review_note, created_at, expires_at, payment_destination_label, payment_destination_version, close_reason")
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
    setIsEditingProfile(false);
    void refreshProfile(user.id);
  }

  function beginProfileEdit() {
    setUsername(String(profile?.username || ""));
    const legacy = parseLegacyLocation(profile?.location);
    setCountryCode(String(profile?.country_code || legacy.countryCode || ""));
    setCustomCountryName(String(profile?.country_name || legacy.countryName || ""));
    setRegionName(String(profile?.region_name || legacy.regionName || ""));
    setCityName(String(profile?.city_name || legacy.cityName || ""));
    setErrorMsg("");
    setIsEditingProfile(true);
  }

  function cancelProfileEdit() {
    beginProfileEdit();
    setIsEditingProfile(false);
    setErrorMsg("");
  }

  function rememberProfileReturnPosition(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as Element | null;
    const link = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (!link || link.target === "_blank") return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === "/profile") return;
    try {
      sessionStorage.setItem(
        PROFILE_RETURN_STATE_KEY,
        JSON.stringify({ scrollY: window.scrollY, module: mobileProfileModule })
      );
    } catch {
      // Browser navigation still works if session storage is unavailable.
    }
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

  async function handleProfileLogout() {
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login");
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
      <section style={shellStyle} onClickCapture={rememberProfileReturnPosition}>
        {!isMobileViewport ? (
          <h1 style={{ margin: 0, fontSize: 24, color: "#1f2a1f" }}>{t.profile.title}</h1>
        ) : null}

        {errorMsg ? (
          <div style={{ marginTop: 16, background: "#fff2f0", border: "1px solid #ffd6cf", color: "#c23a2b", padding: "10px 12px", borderRadius: 12, fontSize: 14 }}>
            {errorMsg}
          </div>
        ) : null}

        {isAdmin && pendingPaymentCount + pendingRefundCount > 0 ? (
          <Link
            href={pendingRefundCount > 0 ? "/admin/memberships#refund-review" : "/admin/memberships#payment-review"}
            style={adminPaymentAlertStyle}
          >
            <span style={adminPaymentAlertCountStyle}>{pendingPaymentCount + pendingRefundCount}</span>
            <span>
              <strong style={{ display: "block" }}>{t.profile.admin_finance_alert}</strong>
              <span style={adminPaymentAlertHintStyle}>{t.profile.admin_finance_alert_hint}</span>
            </span>
            <UiIcon name="arrow-right" size={18} />
          </Link>
        ) : null}

        <section
          style={{
            ...profileIdentityCardStyle,
            ...(isEditingProfile ? profileIdentityEditingStyle : {}),
          }}
        >
          <div style={profileIdentityTopStyle}>
            <label style={profileAvatarEditorStyle}>
              {profile.avatar_url ? (
                <img src={String(profile.avatar_url)} alt="" style={profileIdentityAvatarStyle} />
              ) : (
                <span style={profileIdentityAvatarFallbackStyle}><UiIcon name="sprout" size={24} /></span>
              )}
              <input type="file" accept="image/*" onChange={handleUpload} hidden />
              <span style={profileAvatarChangeStyle}>
                {uploading ? t.profile.uploading : t.profile.change_avatar}
              </span>
            </label>
            <div style={{ minWidth: 0, flex: 1 }}>
              <label style={fieldLabelStyle}>{t.profile.username}</label>
              {isEditingProfile ? (
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  style={fieldInputStyle}
                  placeholder={t.profile.username_placeholder}
                  autoFocus
                />
              ) : (
                <div style={savedUsernameStyle}>
                  {username || t.profile.unset_username}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={isEditingProfile ? cancelProfileEdit : beginProfileEdit}
              style={profileEditButtonStyle}
            >
              {isEditingProfile ? t.profile.cancel_edit : t.profile.edit_profile}
            </button>
          </div>
          <div style={profileIdentityEmailStyle} title={user.email || ""}>{user.email}</div>
          <div
            style={{
              ...identityStatsStyle,
              gridTemplateColumns: isMobileViewport
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(4, minmax(0, 1fr))",
            }}
          >
            <IdentityStat label={language === "en" ? "Member no." : "会员编号"} value={String(profile.account_number || "—")} />
            <IdentityStat
              label={language === "en" ? "Helpful received" : "收到有用"}
              value={String(profileStats?.receivedFlowerCount || 0)}
              href="/profile/helpful"
            />
            <IdentityStat label={language === "en" ? "Membership" : "会员类别"} value={getMembershipPlanLabel(membership?.plan, language)} />
            <IdentityStat label={language === "en" ? "Storage" : "空间用量"} value={storageText} />
          </div>

          {isEditingProfile ? (
            <div style={profileEditPanelStyle}>
              <div style={profileEditHeadingStyle}>{t.profile.editing_profile}</div>
              <div style={locationEditGridStyle}>
                <div style={{ minWidth: 0 }}>
                  <label style={fieldLabelStyle}>{t.profile.country_region}</label>
                  <select
                    value={countryCode}
                    onChange={(event) => {
                      setCountryCode(event.target.value);
                      setRegionName("");
                    }}
                    style={fieldInputStyle}
                  >
                    <option value="">{t.profile.select}</option>
                    {getLocalizedCountryOptions(language).map((item) => (
                      <option key={item.code} value={item.code}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={fieldLabelStyle}>{t.profile.region}</label>
                  {useRegionSelect ? (
                    <select value={regionName} onChange={(event) => setRegionName(event.target.value)} style={fieldInputStyle}>
                      <option value="">{t.profile.select}</option>
                      {regionOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={regionName}
                      onChange={(event) => setRegionName(event.target.value)}
                      style={fieldInputStyle}
                      placeholder={t.profile.region_example}
                    />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={fieldLabelStyle}>{t.profile.city}</label>
                  <input
                    value={cityName}
                    onChange={(event) => setCityName(event.target.value)}
                    style={fieldInputStyle}
                    placeholder={t.profile.city_example}
                  />
                </div>
              </div>
              {showCustomCountryInput ? (
              <div>
                <label style={fieldLabelStyle}>{t.profile.custom_country_region}</label>
                <input
                  value={customCountryName}
                  onChange={(event) => setCustomCountryName(event.target.value)}
                  style={fieldInputStyle}
                  placeholder={t.profile.country_example}
                />
              </div>
              ) : null}
              <div style={profileEditActionsStyle}>
                <button type="button" onClick={handleSave} disabled={saving} style={primaryActionStyle}>
                  {saving ? t.profile.saving : t.profile.save_profile}
                </button>
                <button type="button" onClick={cancelProfileEdit} disabled={saving} style={secondaryEditButtonStyle}>
                  {t.profile.cancel_edit}
                </button>
              </div>
            </div>
          ) : (
            <div style={savedLocationStyle}>
              <span>{t.profile.location_summary}</span>
              <strong>{locationPreview || t.profile.not_assigned}</strong>
            </div>
          )}
        </section>

        <section id="language-settings" style={languageInlineStyle}>
          <span style={{ color: "#334c32", fontSize: 15, fontWeight: 800 }}>
            {t.profile.language_setting}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={language === "en"}
            aria-label={t.profile.language_setting}
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            style={languageSwitchStyle}
          >
            <span style={languageSwitchThumbStyle(language === "en")} />
            <span style={languageSwitchLabelStyle(language === "zh")}>{t.profile.language_chinese}</span>
            <span style={languageSwitchLabelStyle(language === "en")}>{t.profile.language_english}</span>
          </button>
        </section>

        <MobileProfileModuleTabs
          active={mobileProfileModule}
          modules={visibleMobileProfileModules}
          onChange={(value) => {
            setMobileProfileModule((current) =>
              isMobileViewport && current === value ? null : value
            );
          }}
          compact={isMobileViewport}
        >

        {showMembershipModule ? (
        <>
        <section id="profile-module-membership" style={isMobileViewport ? { ...membershipSectionStyle, ...sectionCompactStyle } : membershipSectionStyle}>
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
        <section id="profile-module-payment" style={isMobileViewport ? { ...paymentHistorySectionStyle, ...sectionCompactStyle } : paymentHistorySectionStyle}>
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
              <Link href="/membership/refund" style={secondaryLinkStyle}>{t.profile.request_refund}</Link>
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
                  {payment.payment_destination_label ? (
                    <div style={paymentMetaTextStyle}>
                      {t.profile.order_payment_destination}{payment.payment_destination_label}
                    </div>
                  ) : null}
                  <div style={paymentMetaTextStyle}>
                    {payment.status === "confirmed" ? t.profile.payment_time : t.profile.order_time}
                    {formatMembershipDate(payment.paid_at || payment.submitted_at || payment.created_at, language)}
                  </div>
                  {payment.status === "pending_payment" && payment.expires_at ? (
                    <div style={paymentMetaTextStyle}>
                      {t.profile.order_expires_at}{formatMembershipDate(payment.expires_at, language)}
                    </div>
                  ) : null}
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

        {showBackupModule ? (
        <section id="profile-module-backup" style={isMobileViewport ? { ...dataSectionStyle, ...sectionCompactStyle } : dataSectionStyle}>
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
        ) : null}

        {showAccountModule ? (
        <section id="profile-module-account" style={isMobileViewport ? { ...dangerSectionStyle, ...sectionCompactStyle, alignItems: "stretch" } : dangerSectionStyle}>
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
        ) : null}
        </MobileProfileModuleTabs>

        <button
          type="button"
          onClick={() => void handleProfileLogout()}
          style={accountLogoutButtonStyle}
        >
          {t.nav.logout_full}
        </button>
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

function MobileProfileModuleTabs({
  active,
  modules,
  onChange,
  compact,
  children,
}: {
  active: MobileProfileModule | null;
  modules: MobileProfileNavItem[];
  onChange: (value: MobileProfileModule) => void;
  compact: boolean;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const navigation = (
    <nav
      style={{
        ...mobileProfileTabsStyle,
        gridTemplateColumns: "1fr",
      }}
      aria-label={t.profile.module_aria}
    >
      {modules.map((item) => {
        const key = `${item.href || item.value}-${item.label}`;
        const isActive = Boolean(item.value && active === item.value);
        return (
          <Fragment key={key}>
            {item.href ? (
              <Link
                href={item.href}
                style={
                  item.href === "/admin/memberships"
                    ? {
                        ...mobileAdminMembershipEntryStyle,
                        ...(compact ? mobileProfileCompactTabStyle : {}),
                      }
                    : {
                        ...mobileProfileLinkTabStyle,
                        ...(compact ? mobileProfileCompactTabStyle : {}),
                      }
                }
              >
                <span>{item.label}</span>
                <UiIcon name="arrow-right" size={15} />
              </Link>
            ) : item.value ? (
              <button
                type="button"
                onClick={() => onChange(item.value as MobileProfileModule)}
                style={{
                  ...mobileProfileTabButtonStyle(isActive),
                  ...(compact ? mobileProfileCompactTabStyle : {}),
                }}
                aria-expanded={isActive}
              >
                <span>{item.label}</span>
                <UiIcon name={isActive ? "chevron-up" : "chevron-down"} size={15} />
              </button>
            ) : null}
            {compact && isActive ? (
              <div style={mobileInlineModuleStyle}>{children}</div>
            ) : null}
          </Fragment>
        );
      })}
    </nav>
  );

  if (compact) return navigation;

  return (
    <div style={desktopProfileModulesStyle}>
      {navigation}
      <div style={desktopProfileModuleContentStyle}>{children}</div>
    </div>
  );
}

function IdentityStat({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <div style={{ color: "#7a8676", fontSize: 11 }}>{label}</div>
      <div style={{ marginTop: 3, color: "#2e422d", fontSize: 12, fontWeight: 800, lineHeight: 1.4, overflowWrap: "anywhere" }}>{value}</div>
    </>
  );

  return href ? (
    <Link href={href} style={identityStatLinkStyle}>{content}</Link>
  ) : (
    <div style={{ minWidth: 0 }}>{content}</div>
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

const profileIdentityCardStyle: CSSProperties = {
  marginTop: 10,
  padding: 12,
  border: "1px solid #dfeadd",
  borderRadius: 16,
  background: "#f9fcf7",
};

const profileIdentityEditingStyle: CSSProperties = {
  borderColor: "#9fbe94",
  background: "#f5faf2",
  boxShadow: "0 0 0 2px rgba(91, 130, 79, 0.08)",
};

const profileIdentityTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  minWidth: 0,
};

const profileIdentityAvatarStyle: CSSProperties = {
  width: 54,
  height: 54,
  flex: "0 0 54px",
  borderRadius: "50%",
  objectFit: "cover",
};

const profileIdentityAvatarFallbackStyle: CSSProperties = {
  ...profileIdentityAvatarStyle,
  display: "grid",
  placeItems: "center",
  background: "#eaf3e6",
  color: "#5e8057",
};

const profileAvatarEditorStyle: CSSProperties = {
  width: 66,
  flex: "0 0 66px",
  display: "grid",
  justifyItems: "center",
  gap: 4,
  color: "#52714f",
  cursor: "pointer",
};
const profileAvatarChangeStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 750,
  lineHeight: 1.25,
  textAlign: "center",
};
const savedUsernameStyle: CSSProperties = { minHeight: 40, display: "flex", alignItems: "center", color: "#253523", fontSize: 19, fontWeight: 850, lineHeight: 1.3 };
const profileEditButtonStyle: CSSProperties = { minHeight: 34, flexShrink: 0, border: "1px solid #cad9c4", borderRadius: 999, background: "#fff", color: "#466842", padding: "0 11px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const profileIdentityEmailStyle: CSSProperties = { width: "100%", marginTop: 8, padding: "7px 9px", borderRadius: 10, background: "#fff", color: "#536250", fontSize: 14, lineHeight: 1.35, whiteSpace: "nowrap", overflowX: "auto", boxSizing: "border-box" };
const identityStatsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 11, paddingTop: 10, borderTop: "1px solid #e4ece0" };
const identityStatLinkStyle: CSSProperties = { minWidth: 0, padding: "2px 4px", margin: "-2px -4px", borderRadius: 8, color: "inherit", textDecoration: "none", background: "#f0f7ec" };
const savedLocationStyle: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 10, paddingTop: 9, borderTop: "1px solid #e4ece0", color: "#71806d", fontSize: 12, lineHeight: 1.4 };
const profileEditPanelStyle: CSSProperties = { display: "grid", gap: 9, marginTop: 11, padding: 10, border: "1px solid #d5e3cf", borderRadius: 13, background: "#fff" };
const profileEditHeadingStyle: CSSProperties = { color: "#365c34", fontSize: 13, fontWeight: 850 };
const locationEditGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, alignItems: "end" };
const profileEditActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" };
const secondaryEditButtonStyle: CSSProperties = { minHeight: 36, border: "1px solid #d5dfd1", borderRadius: 10, background: "#fff", color: "#536550", padding: "0 12px", fontSize: 13, fontWeight: 750, cursor: "pointer" };

const languageInlineStyle: CSSProperties = {
  minHeight: 58,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  margin: "10px 0",
  padding: "8px 12px",
  border: "1px solid #dfe8da",
  borderRadius: 14,
  background: "#f7f9f5",
  boxSizing: "border-box",
};

const languageSwitchStyle: CSSProperties = {
  position: "relative",
  width: 154,
  height: 40,
  flex: "0 0 154px",
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "center",
  padding: 3,
  border: "1px solid #cdddc8",
  borderRadius: 999,
  background: "#edf2ea",
  cursor: "pointer",
  overflow: "hidden",
};

function languageSwitchThumbStyle(english: boolean): CSSProperties {
  return {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: english ? "calc(50% + 1px)" : 3,
    width: "calc(50% - 4px)",
    borderRadius: 999,
    background: "#4f7b45",
    boxShadow: "0 2px 6px rgba(41, 72, 36, 0.22)",
    transition: "left 180ms ease",
  };
}

function languageSwitchLabelStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    color: active ? "#fff" : "#5f705b",
    fontSize: 13,
    fontWeight: active ? 850 : 700,
    textAlign: "center",
    transition: "color 180ms ease",
  };
}

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

const mobileProfileCompactTabStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  minHeight: 50,
  padding: "0 15px",
  justifyContent: "space-between",
  textAlign: "left",
};

function mobileProfileTabButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 0,
    minHeight: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    border: active ? "1px solid #9bc98f" : "1px solid #dfe8da",
    borderRadius: 13,
    background: active ? "#edf8e9" : "#f7f8f6",
    color: active ? "#2f6a31" : "#52634e",
    padding: "0 14px",
    fontSize: 15,
    fontWeight: 700,
    whiteSpace: "normal",
    lineHeight: 1.15,
    cursor: "pointer",
  };
}

const mobileProfileLinkTabStyle: CSSProperties = {
  ...mobileProfileTabButtonStyle(false),
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  textAlign: "left",
  textDecoration: "none",
  boxSizing: "border-box",
};

const mobileInlineModuleStyle: CSSProperties = {
  minWidth: 0,
  padding: "0 2px 4px",
};

const desktopProfileModulesStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
  marginTop: 10,
};

const desktopProfileModuleContentStyle: CSSProperties = {
  minWidth: 0,
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

const accountLogoutButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  marginBottom: 10,
  border: "1px solid #dfe7dc",
  borderRadius: 12,
  background: "#fff",
  color: "#52634e",
  fontSize: 14,
  fontWeight: 750,
  cursor: "pointer",
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
