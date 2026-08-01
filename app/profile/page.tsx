"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/components/Toast";
import type { AppProfile, SupabaseUser } from "@/lib/domain-types";
import { formatProfileDateTime, formatStorage, loadUserProfileData, type UserProfileStats } from "@/lib/user-profile-shared";
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
  countryOptions,
  getCountryName,
  getRegionOptions,
  hasPresetRegions,
  parseLegacyLocation,
  type RegionOption,
} from "@/lib/region-shared";
import { getAccountRegistrationSummary } from "@/lib/account-number";


type MembershipPaymentRow = {
  id: string;
  plan: string | null;
  status: string | null;
  amount: number | string | null;
  currency: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  note: string | null;
  paid_at: string | null;
  service_started_at: string | null;
  service_ends_at: string | null;
};

type MobileProfileModule = "info" | "membership" | "adminMembership" | "space" | "account";
type MobileProfileNavItem = {
  label: string;
  value?: MobileProfileModule;
  href?: string;
};

const baseMobileProfileModules: MobileProfileNavItem[] = [
  { value: "info", label: "用户信息" },
  { value: "membership", label: "云空间与付款" },
  { value: "space", label: "个人空间" },
  { href: "/profile/trash", label: "回收站" },
  { value: "account", label: "帐号操作" },
];

const adminMembershipProfileModule: { value: MobileProfileModule; label: string } = {
  value: "adminMembership",
  label: "会员管理",
};

function formatPaymentAmount(amount?: number | string | null, currency?: string | null) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return `${currency || ""} ${amount || ""}`.trim();
  if (currency === "CNY") return `¥${value.toFixed(2)}`;
  if (currency === "USD") return `US$${value.toFixed(2)}`;
  return `${value.toFixed(2)} ${currency || ""}`.trim();
}

function getPaymentMethodLabel(method?: string | null) {
  if (method === "wechat") return "微信";
  if (method === "alipay") return "支付宝";
  if (method === "paypal") return "PayPal";
  if (method === "manual") return "人工确认";
  if (method === "other") return "其他";
  return method || "未记录";
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [stats, setStats] = useState<UserProfileStats | null>(null);
  const [marketPostCount, setMarketPostCount] = useState(0);
  const [experienceCardCount, setExperienceCardCount] = useState(0);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [membershipError, setMembershipError] = useState("");
  const [paymentRows, setPaymentRows] = useState<MembershipPaymentRow[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
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
    useState<MobileProfileModule>("info");

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
        router.push("/login");
        return;
      }

      setUser(user);
      const data = await loadUserProfileData(supabase, user.id);
      setProfile(data.profile);
      setStats(data.stats);
      const [
        marketCountResult,
        experienceCardCountResult,
        membershipResult,
        adminResult,
        paymentsResult,
      ] = await Promise.all([
        supabase
          .from("market_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("experience_cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase.rpc("get_my_membership"),
        supabase.rpc("is_app_admin", { p_user_id: user.id }),
        supabase
          .from("membership_payments")
          .select("id, plan, status, amount, currency, payment_method, payment_reference, note, paid_at, service_started_at, service_ends_at")
          .eq("user_id", user.id)
          .eq("status", "confirmed")
          .order("paid_at", { ascending: false })
          .limit(5),
      ]);

      if (marketCountResult.error) {
        console.error("load my market post count error:", marketCountResult.error);
        setMarketPostCount(0);
      } else {
        setMarketPostCount(Number(marketCountResult.count || 0));
      }

      if (experienceCardCountResult.error) {
        console.error(
          "load my experience card count error:",
          experienceCardCountResult.error
        );
        setExperienceCardCount(0);
      } else {
        setExperienceCardCount(Number(experienceCardCountResult.count || 0));
      }

      if (membershipResult.error) {
        console.error("load membership error:", membershipResult.error);
        setMembership(null);
        setMembershipError("暂时无法读取云空间与额度信息");
      } else {
        setMembership(normalizeMembershipRpcResult(membershipResult.data));
        setMembershipError("");
      }

      if (adminResult.error) {
        console.error("load admin status error:", adminResult.error);
        setIsAdmin(false);
      } else {
        setIsAdmin(Boolean(adminResult.data));
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
    });
  }, [countryCode, customCountryName, regionName, cityName, profile]);

  const storageText = useMemo(() => {
    const used = formatStorage(Number(profile?.storage_used || 0));
    const limit = formatStorage(Number(membership?.storage_limit_bytes || profile?.storage_limit || 0));
    return `${used} / ${limit}`;
  }, [profile, membership]);
  const accountRegistrationSummary = getAccountRegistrationSummary(
    profile?.account_number
  );

  const membershipEndDate = getMembershipEndDate(membership);
  const membershipDaysRemaining = getDaysRemaining(membershipEndDate);
  const showMembershipNotice = Boolean(
    membership &&
      (membership.can_create_content === false ||
        (typeof membershipDaysRemaining === "number" && membershipDaysRemaining <= 14))
  );
  const membershipNoticeText = membership?.can_create_content === false
    ? "使用权已到期"
    : typeof membershipDaysRemaining === "number" && membershipDaysRemaining <= 14
      ? `当前使用权还有 ${membershipDaysRemaining} 天到期。你可以提前查看付款方式，管理员确认后会延长使用期限。`
      : "";
  const membershipStatusText = membershipError || getMembershipSummary(membership);
  const marketQuotaText = membership
    ? `${Number(membership.active_market_post_count || 0)} / ${Number(membership.market_post_limit || 0)} 条`
    : "0 / 0 条";

  const privateArchiveCount = Math.max(0, Number(stats?.archiveCount || 0) - Number(stats?.publicArchiveCount || 0));
  const endedArchiveCount = Number(stats?.endedArchiveCount || 0);
  const planHint = getPlanHint(stats?.planNames || [], Number(stats?.planCount || 0));
  const isMobileViewport = viewportWidth < 760;
  const visibleMobileProfileModules = useMemo(
    () => (isAdmin ? [...baseMobileProfileModules, adminMembershipProfileModule] : baseMobileProfileModules),
    [isAdmin]
  );
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
  const showInfoModule = !isMobileViewport || mobileProfileModule === "info";
  const showMembershipModule = !isMobileViewport || mobileProfileModule === "membership";
  const showAdminMembershipModule = isMobileViewport && isAdmin && mobileProfileModule === "adminMembership";
  const showSpaceModule = !isMobileViewport || mobileProfileModule === "space";
  const showAccountModule = !isMobileViewport || mobileProfileModule === "account";

  useEffect(() => {
    if (!isAdmin && mobileProfileModule === "adminMembership") {
      setMobileProfileModule("info");
    }
  }, [isAdmin, mobileProfileModule]);

  async function refreshStats(targetUserId: string) {
    const data = await loadUserProfileData(supabase, targetUserId);
    setProfile(data.profile);
    setStats(data.stats);
  }

  async function refreshPaymentRows(targetUserId: string) {
    setPaymentLoading(true);
    const { data, error } = await supabase
      .from("membership_payments")
      .select("id, plan, status, amount, currency, payment_method, payment_reference, note, paid_at, service_started_at, service_ends_at")
      .eq("user_id", targetUserId)
      .eq("status", "confirmed")
      .order("paid_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("refresh membership payments error:", error);
      showToast("付款记录读取失败");
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
      : getCountryName(countryCode, customCountryName);
    const safeRegionName = regionName.trim();
    const safeCityName = cityName.trim();

    if (safeUsername.length < 2) {
      setErrorMsg("用户名至少2个字符");
      showToast("用户名至少2个字符");
      return;
    }

    if (countryCode === "OTHER" && !safeCountryName) {
      setErrorMsg("请填写自定义国家 / 地区");
      showToast("请填写自定义国家 / 地区");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const locationText = buildLocationTextFromFields({
      countryCode,
      countryName: safeCountryName,
      regionName: safeRegionName,
      cityName: safeCityName,
    });

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
      setErrorMsg(error.message || "保存失败");
      showToast("保存失败");
      return;
    }

    showToast("资料已保存");
    void refreshStats(user.id);
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
        setErrorMsg("请先重新登录后再导出");
        showToast("请先重新登录后再导出");
        router.push("/login");
        return;
      }

      const response = await fetch("/api/export/my-records", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        const message = text || "导出失败，请稍后再试";
        setErrorMsg(message);
        showToast(message);
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1]
        ? decodeURIComponent(fileNameMatch[1])
        : fileNameMatch?.[2] || `有时耕作-我的记录-${new Date().toISOString().slice(0, 10)}.zip`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("导出完成，文件已交给浏览器下载；请查看浏览器下载栏或“下载”文件夹。");
    } catch {
      setErrorMsg("导出失败，请稍后再试");
      showToast("导出失败，请稍后再试");
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
      setDeleteAccountError("请先勾选确认");
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
        setDeleteAccountError("请先重新登录后再注销账号");
        showToast("请先重新登录后再注销账号");
        router.push("/login");
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
        const message = payload?.error || "注销账号失败，请稍后再试";
        setDeleteAccountError(message);
        showToast(message);
        return;
      }

      await supabase.auth.signOut();
      showToast("账号已注销");
      router.replace("/");
    } catch {
      const message = "注销账号失败，请稍后再试";
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
      setErrorMsg("请上传图片文件");
      showToast("请上传图片文件");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg("头像请控制在 3MB 以内");
      showToast("头像请控制在 3MB 以内");
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
      setErrorMsg("上传失败");
      showToast("头像上传失败");
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
      setErrorMsg("头像保存失败");
      showToast("头像保存失败");
      return;
    }

    showToast("头像已更新");
    void refreshStats(user.id);
  }

  if (initLoading || !user || !profile || !stats) {
    return <div style={{ padding: 40 }}>加载中...</div>;
  }

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        {!isMobileViewport ? (
          <div>
            <div style={{ fontSize: 13, color: "#6b7b66" }}>我的资料</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 24, color: "#1f2a1f" }}>用户信息页</h1>
          </div>
        ) : null}

        {errorMsg ? (
          <div style={{ marginTop: 16, background: "#fff2f0", border: "1px solid #ffd6cf", color: "#c23a2b", padding: "10px 12px", borderRadius: 12, fontSize: 14 }}>
            {errorMsg}
          </div>
        ) : null}

        {isMobileViewport ? (
          <MobileProfileModuleTabs
            active={mobileProfileModule}
            modules={visibleMobileProfileModules}
            onChange={setMobileProfileModule}
          />
        ) : null}

        {showInfoModule ? (
        <div style={{ display: "grid", gridTemplateColumns: topGridColumns, gap: isMobileViewport ? 10 : 14, marginTop: isMobileViewport ? 10 : 14, alignItems: "start" }}>
          <section style={compactPanelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobileViewport ? 10 : 12, minWidth: 0 }}>
              {profile.avatar_url ? (
                <img src={String(profile.avatar_url)} alt="" style={isMobileViewport ? mobileAvatarStyle : { width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "1px solid #e4ebe0" }} />
              ) : (
                <div style={isMobileViewport ? mobileAvatarFallbackStyle : { width: 72, height: 72, borderRadius: "50%", background: "#eef5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🌱</div>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: isMobileViewport ? 17 : 19, fontWeight: 700, color: "#1f2a1f" }}>{profile.username || "未设置用户名"}</div>
                <div style={{ marginTop: 3, fontSize: 13, color: "#6f7b69", wordBreak: "break-all" }}>{user.email}</div>
                <div style={{ marginTop: 5, fontSize: 13, color: "#6f7b69" }}>
                  所在地区：{locationPreview}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={fieldLabelStyle}>更换头像</label>
              <input type="file" accept="image/*" onChange={handleUpload} style={isMobileViewport ? mobileFileInputStyle : undefined} />
              <div style={{ marginTop: 4, fontSize: 12, color: "#7b8676" }}>
                建议上传正方形图片，3MB 以内。{uploading ? "上传中..." : ""}
              </div>
            </div>

            <div style={metaListStyle}>
              <MetaItem
                label="账号编号"
                value={
                  profile.account_number ||
                  (profile.is_internal_test ? "内部测试账号" : "暂未分配")
                }
              />
              {accountRegistrationSummary ? (
                <MetaItem label="注册顺序" value={accountRegistrationSummary} />
              ) : null}
              <MetaItem label="账号等级" value={`Lv.${Number(profile.level || 1)}`} />
              <MetaItem label="花朵" value={`🌸 ${Number(profile.flower_count || 0)}`} />
              <MetaItem label="存储" value={storageText} />
              <MetaItem label="加入时间" value={formatProfileDateTime(profile.created_at)} />
            </div>
          </section>

          <section style={compactPanelStyle}>
            <div style={sectionTitleStyle}>基础信息</div>
            <div style={{ ...formGridStyle, gridTemplateColumns: formGridColumns }}>
              <div>
                <label style={fieldLabelStyle}>用户名</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} style={fieldInputStyle} placeholder="输入你的用户名" />
              </div>
              <div>
                <label style={fieldLabelStyle}>国家 / 地区</label>
                <select value={countryCode} onChange={(e) => { setCountryCode(e.target.value); setRegionName(""); }} style={fieldInputStyle}>
                  <option value="">请选择</option>
                  {countryOptions.map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>
              {showCustomCountryInput ? (
                <div>
                  <label style={fieldLabelStyle}>自定义国家 / 地区</label>
                  <input value={customCountryName} onChange={(e) => setCustomCountryName(e.target.value)} style={fieldInputStyle} placeholder="例如：巴西" />
                </div>
              ) : null}
              <div>
                <label style={fieldLabelStyle}>省 / 州 / 地域</label>
                {useRegionSelect ? (
                  <select value={regionName} onChange={(e) => setRegionName(e.target.value)} style={fieldInputStyle}>
                    <option value="">请选择</option>
                    {regionOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                ) : (
                  <input value={regionName} onChange={(e) => setRegionName(e.target.value)} style={fieldInputStyle} placeholder="例如：浙江 / California" />
                )}
              </div>
              <div>
                <label style={fieldLabelStyle}>城市</label>
                <input value={cityName} onChange={(e) => setCityName(e.target.value)} style={fieldInputStyle} placeholder="例如：宁波 / Tokyo" />
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 13, color: "#5e6959" }}>
              显示为：<span style={{ fontWeight: 700, color: "#243123" }}>{locationPreview}</span>
            </div>

            <div style={isMobileViewport ? mobileProfileActionRowStyle : { marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={handleSave} disabled={saving} style={primaryActionStyle}>{saving ? "保存中..." : "保存资料"}</button>
              <Link href={`/user/${user.id}/profile`} style={secondaryActionStyle}>查看公开资料页</Link>
              <Link href="/archive" style={secondaryActionStyle}>进入个人空间</Link>
              <Link href="/membership" style={secondaryActionStyle}>云空间</Link>
              {isAdmin && !isMobileViewport ? (
                <Link href="/admin/memberships" style={isMobileViewport ? { ...mobileSecondaryLinkStyle, border: "1px solid #c9d8be", background: "#edf6e8", color: "#2f5a27" } : adminLinkStyle}>会员管理</Link>
              ) : null}
            </div>
          </section>
        </div>
        ) : null}

        {showMembershipModule ? (
        <>
        <section style={isMobileViewport ? { ...membershipSectionStyle, ...sectionCompactStyle } : membershipSectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>我的云空间</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#1f2a1f" }}>当前云空间与额度</h2>
              <p style={{ margin: "8px 0 0", color: "#6f7b69", fontSize: 13, lineHeight: 1.6 }}>
                {membershipStatusText}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                {exporting ? "正在打包记录和图片..." : "导出我的记录"}
              </button>
              <Link href="/membership" style={secondaryLinkStyle}>
                查看云空间
              </Link>
            </div>
            {exporting ? (
              <p style={{ margin: "8px 0 0", color: "#7b8676", fontSize: 13, lineHeight: 1.5 }}>
                正在打包你的记录和图片，图片较多时可能需要 1～3 分钟，请不要关闭页面。导出完成后，文件会保存到浏览器默认下载位置；如果浏览器设置了下载前询问，会弹出保存位置选择。
              </p>
            ) : null}
          </div>

          {showMembershipNotice ? (
            <div style={membershipNoticeStyle}>
              <div>{membershipNoticeText}</div>
              <Link href="/membership" style={{ color: "#5d7c2f", fontWeight: 700 }}>
                查看云空间
              </Link>
            </div>
          ) : null}

          <div style={{ ...statsGridStyle, gridTemplateColumns: statsGridColumns, marginTop: 14 }}>
            <InfoCard
              label="当前方案"
              value={membership ? getMembershipPlanLabel(membership.plan) : "本地免费"}
              hint={membership ? getMembershipStatusLabel(membership.status) : "未开通云空间"}
            />
            <InfoCard
              label="有效期至"
              value={membership ? formatMembershipDate(membershipEndDate) : "不适用"}
              hint={
                membership
                  ? membership.can_create_content === false
                    ? "已限制新增，仍可查看和导出"
                    : "到期前可继续新增云端内容"
                  : "本地记录没有到期日"
              }
            />
            <InfoCard
              label="云端容量"
              value={storageText}
              hint="容量主要用于照片与媒体文件"
            />
            <InfoCard
              label="集市发布"
              value={marketQuotaText}
              hint={
                !membership
                  ? "本地免费用户不能发布"
                  : membership.can_create_market_post === false
                    ? "当前不可继续发布"
                    : "同时在线发布数量"
              }
            />
          </div>
        </section>

        <section style={isMobileViewport ? { ...paymentHistorySectionStyle, ...sectionCompactStyle } : paymentHistorySectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>付款记录</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#1f2a1f" }}>我的云空间付款</h2>
              <p style={{ margin: "8px 0 0", color: "#6f7b69", fontSize: 13, lineHeight: 1.6 }}>
                这里只显示管理员已确认的最近付款记录；已取消或退款的记录不会显示。若已付款但未显示，请联系管理员邮箱：yoyomibaobao@gmail.com。
              </p>
            </div>
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
              {paymentLoading ? "刷新中..." : "刷新付款记录"}
            </button>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {paymentRows.length === 0 ? (
              <div style={emptyPaymentStyle}>暂无已确认的付款记录。</div>
            ) : (
              paymentRows.map((payment) => (
                <div key={payment.id} style={paymentCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#243123" }}>
                        {formatPaymentAmount(payment.amount, payment.currency)}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 13, color: "#6f7b69" }}>
                        {getMembershipPlanLabel(payment.plan)} · {getPaymentMethodLabel(payment.payment_method)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#6f7b69", textAlign: "right" }}>
                      付款时间：{formatMembershipDate(payment.paid_at)}
                    </div>
                  </div>

                  <div style={{ marginTop: 8, fontSize: 13, color: "#6f7b69", lineHeight: 1.55 }}>
                    服务期：{formatMembershipDate(payment.service_started_at)} - {formatMembershipDate(payment.service_ends_at)}
                  </div>
                  {payment.payment_reference ? (
                    <div style={{ marginTop: 4, fontSize: 13, color: "#6f7b69", lineHeight: 1.55 }}>
                      流水号 / 交易号：{payment.payment_reference}
                    </div>
                  ) : null}
                  {payment.note ? (
                    <div style={{ marginTop: 4, fontSize: 13, color: "#6f7b69", lineHeight: 1.55 }}>
                      备注：{payment.note}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
        </>
        ) : null}

        {showAdminMembershipModule ? (
        <section style={{ ...statsSectionStyle, ...sectionCompactStyle }}>
          <Link href="/admin/memberships" style={mobileAdminMembershipEntryStyle}>
            <span>会员管理</span>
            <small style={mobileAdminMembershipHintStyle}>查看会员状态、付款记录和管理员操作</small>
          </Link>
        </section>
        ) : null}

        {showSpaceModule ? (
        <section style={isMobileViewport ? { ...statsSectionStyle, ...sectionCompactStyle } : statsSectionStyle}>
          {!isMobileViewport ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>个人空间</div>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, color: "#1f2a1f" }}>项目、经验卡与互动</h2>
            </div>
          </div>
          ) : null}

          <div style={{ ...statsGridStyle, gridTemplateColumns: statsGridColumns, marginTop: isMobileViewport ? 0 : 14 }}>
            {isMobileViewport ? (
              <>
                <ProjectStatsCard
                  archiveCount={stats.archiveCount}
                  publicArchiveCount={stats.publicArchiveCount}
                  privateArchiveCount={privateArchiveCount}
                  endedArchiveCount={endedArchiveCount}
                />
                <StatLinkCard
                  href="/experience-cards"
                  label="我的经验卡"
                  value={String(experienceCardCount)}
                  hint=""
                  compact
                />
                <StatLinkCard
                  href="/profile/recent"
                  label="最近看过的项目"
                  value="进入"
                  hint=""
                  compact
                />
                <StatLinkCard
                  href="/profile/followers"
                  label="谁在关注我"
                  value={String(stats.followerCount)}
                  hint=""
                  compact
                />
                <StatLinkCard
                  href="/profile/flowers"
                  label="收到的花朵"
                  value={String(stats.receivedFlowerCount)}
                  hint=""
                  compact
                />
                <StatLinkCard
                  href="/profile/flowers?tab=sent"
                  label="我送出的花"
                  value={String(stats.sentFlowerCount || 0)}
                  hint=""
                  compact
                />
              </>
            ) : (
              <>
                <StatLinkCard
                  href="/archive"
                  label="我的项目"
                  value={String(stats.archiveCount)}
                  hint={`公开 ${stats.publicArchiveCount} · 仅自己可见 ${privateArchiveCount}`}
                />
                <StatLinkCard
                  href="/experience-cards"
                  label="我的经验卡"
                  value={String(experienceCardCount)}
                  hint="管理草稿和已公开的经验时间线"
                />
                <StatLinkCard
                  href="/profile/recent"
                  label="最近浏览"
                  value="进入"
                  hint="最近看过的项目"
                />
                <StatLinkCard
                  href="/follow?tab=projects"
                  label="我关注的项目"
                  value={String(stats.projectFollowCount)}
                  hint="我关注的项目"
                />
                <StatLinkCard
                  href="/follow?tab=users"
                  label="我关注的用户"
                  value={String(stats.followingCount)}
                  hint="我在关注谁"
                />
                <StatLinkCard
                  href="/profile/followers"
                  label="粉丝"
                  value={String(stats.followerCount)}
                  hint="谁在关注我"
                />
                <StatLinkCard
                  href="/profile/flowers"
                  label="花朵来源"
                  value={String(stats.receivedFlowerCount)}
                  hint="查看谁给我送花"
                />
                <StatLinkCard
                  href="/profile/flowers?tab=sent"
                  label="花朵送给谁"
                  value={String(stats.sentFlowerCount || 0)}
                  hint="查看我送出的花"
                />
                <StatLinkCard
                  href="/notifications"
                  label="通知"
                  value="进入"
                  hint="关注、送花和互动提醒"
                />
              </>
            )}
          </div>
        </section>
        ) : null}

        {!isMobileViewport ? (
        <section style={plantInfoSectionStyle}>
          <div style={plantInfoHeaderStyle}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>植物资料</div>
              <h2 style={plantInfoTitleStyle}>我的植物计划与收藏</h2>
              <p style={plantInfoDescStyle}>
                管理还没有正式建档的种植准备和感兴趣植物。开始记录后，可以再转入项目档案。
              </p>
            </div>
          </div>

          <div style={plantInfoGridStyle}>
            <Link href="/archive/plans" style={plantInfoCardStyle}>
              <div style={plantInfoCardLabelStyle}>种植计划</div>
              <div style={plantInfoCardValueStyle}>{stats.planCount}</div>
              <div style={plantInfoCardHintStyle}>{planHint}</div>
            </Link>

            <Link href="/archive/interests" style={plantInfoCardStyle}>
              <div style={plantInfoCardLabelStyle}>植物收藏</div>
              <div style={plantInfoCardValueStyle}>{stats.interestCount}</div>
              <div style={plantInfoCardHintStyle}>{getInterestHint(Number(stats.interestCount || 0))}</div>
            </Link>
          </div>
        </section>
        ) : null}

        {!isMobileViewport ? (
        <section style={marketInfoSectionStyle}>
          <div style={marketInfoHeaderStyle}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7b66" }}>集市信息</div>
              <h2 style={marketInfoTitleStyle}>我的集市</h2>
              <p style={marketInfoDescStyle}>
                管理你的交换、赠送、转让和求购信息。
              </p>
            </div>
          </div>

          <div style={marketInfoGridStyle}>
            <Link href="/market/mine" style={marketInfoCardStyle}>
              <div style={marketInfoCardLabelStyle}>我的集市发布</div>
              <div style={marketInfoCardValueStyle}>{marketPostCount}</div>
              <div style={marketInfoCardHintStyle}>
                查看和管理我发布的集市信息
              </div>
            </Link>

            <Link href="/market/new" style={marketInfoCardStyle}>
              <div style={marketInfoCardLabelStyle}>发布新信息</div>
              <div style={marketInfoCardValueStyle}>＋</div>
              <div style={marketInfoCardHintStyle}>
                发布交换、赠送、转让或求购
              </div>
            </Link>
          </div>
        </section>
        ) : null}

        {!isMobileViewport ? (
        <section style={trashEntrySectionStyle}>
          <div>
            <div style={{ fontSize: 13, color: "#6b7b66" }}>云端内容</div>
            <h2 style={trashEntryTitleStyle}>回收站</h2>
            <p style={trashEntryDescStyle}>
              查看并恢复已移入回收站的项目、记录和照片。
            </p>
          </div>
          <Link href="/profile/trash" style={trashEntryLinkStyle}>
            查看回收站
          </Link>
        </section>
        ) : null}

        {showAccountModule ? (
        <section style={isMobileViewport ? { ...dangerSectionStyle, ...sectionCompactStyle, alignItems: "stretch" } : dangerSectionStyle}>
          <div>
            <div style={{ fontSize: 13, color: "#9a5b55" }}>危险操作</div>
            <h2 style={dangerTitleStyle}>注销账号</h2>
            <p style={dangerDescStyle}>
              注销后，你的项目、记录、图片、个人资料和公开内容将被删除。此操作无法恢复。建议先导出数据。
            </p>
          </div>
          <button
            type="button"
            onClick={openDeleteDialog}
            style={dangerButtonStyle}
          >
            注销账号
          </button>
        </section>
        ) : null}
      </section>
      <ConfirmDialog
        open={deleteDialogOpen}
        title="确认注销账号？"
        message={"注销后，你的项目、记录、图片、个人资料和公开内容将被删除。\n此操作无法恢复。"}
        confirmText={deleteLoading ? "注销中..." : "确认注销"}
        cancelText="取消"
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
          <span>我已了解，仍要注销账号</span>
        </label>
        {deleteAccountError ? (
          <div style={deleteErrorStyle}>{deleteAccountError}</div>
        ) : null}
      </ConfirmDialog>
    </main>
  );
}

function getPlanHint(planNames: string[], planCount: number) {
  if (!planCount) return "还没有种植计划";
  if (!planNames.length) return "查看我的种植计划";
  const suffix = planCount > planNames.length ? "等" : "";
  return `${planNames.join("、")}${suffix}`;
}

function getInterestHint(interestCount: number) {
  if (!interestCount) return "还没有植物收藏";
  return "查看我感兴趣的植物";
}

function MetaItem({ label, value }: { label: string; value: string }) {
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
}: {
  active: MobileProfileModule;
  modules: MobileProfileNavItem[];
  onChange: (value: MobileProfileModule) => void;
}) {
  return (
    <nav
      style={{
        ...mobileProfileTabsStyle,
        gridTemplateColumns: `repeat(${modules.length}, minmax(0, 1fr))`,
      }}
      aria-label="我的页面模块"
    >
      {modules.map((item) =>
        item.href ? (
          <Link key={item.href} href={item.href} style={mobileProfileLinkTabStyle}>
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

function ProjectStatsCard({
  archiveCount,
  publicArchiveCount,
  privateArchiveCount,
  endedArchiveCount,
}: {
  archiveCount: number;
  publicArchiveCount: number;
  privateArchiveCount: number;
  endedArchiveCount: number;
}) {
  return (
    <Link href="/archive" style={mobileProjectStatsCardStyle}>
      <span style={mobileProjectStatsTitleRowStyle}>
        <strong>项目档案</strong>
        <strong>{archiveCount} 个 →</strong>
      </span>
      <span style={mobileProjectStatsDetailStyle}>
        公开 {publicArchiveCount} · 仅自己可见 {privateArchiveCount} · 已结束 {endedArchiveCount}
      </span>
    </Link>
  );
}

function StatLinkCard({
  href,
  label,
  value,
  hint,
  compact = false,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Link href={href} style={{ ...compactStatCardStyle, textDecoration: "none" }}>
        <div style={compactStatLineStyle}>
          <span>{label}</span>
          <strong style={compactStatValueStyle}>{value}</strong>
        </div>
        {hint ? <div style={compactStatHintStyle}>{hint}</div> : null}
      </Link>
    );
  }

  return (
    <Link href={href} style={{ ...statCardBaseStyle, textDecoration: "none" }}>
      <div style={{ fontSize: 14, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#7b8676", lineHeight: 1.35 }}>{hint}</div>
    </Link>
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

function StatActionCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={statActionCardStyle}>
      <div style={{ fontSize: 14, color: "#6d7968" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 700, color: "#22301f" }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#7b8676", lineHeight: 1.35 }}>{hint}</div>
    </button>
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
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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

const emptyPaymentStyle: CSSProperties = {
  border: "1px dashed #d9ceb8",
  borderRadius: 14,
  padding: "14px 13px",
  color: "#7b6d55",
  background: "#fffaf2",
  fontSize: 13,
};

const statsSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#fbfdf9",
  border: "1px solid #e6eee2",
  borderRadius: 18,
  padding: 14,
};
const plantInfoSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#f8fff8",
  border: "1px solid #dcebd6",
  borderRadius: 18,
  padding: 14,
};

const plantInfoHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const plantInfoTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#1f2a1f",
  fontSize: 20,
};

const plantInfoDescStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.6,
};

const plantInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const plantInfoCardStyle: CSSProperties = {
  display: "block",
  textDecoration: "none",
  background: "#fff",
  border: "1px solid #e2ecdc",
  borderRadius: 16,
  padding: 14,
  color: "#1f2a1f",
};

const plantInfoCardLabelStyle: CSSProperties = {
  fontSize: 14,
  color: "#6d7968",
};

const plantInfoCardValueStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 24,
  fontWeight: 700,
  color: "#22301f",
};

const plantInfoCardHintStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  color: "#7b8676",
  lineHeight: 1.35,
};

const marketInfoSectionStyle: CSSProperties = {
  marginTop: 14,
  background: "#fffaf3",
  border: "1px solid #efe1c9",
  borderRadius: 18,
  padding: 14,
};

const marketInfoHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 14,
};

const marketInfoTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#1f2a1f",
  fontSize: 20,
};

const marketInfoDescStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.6,
};

const marketInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const marketInfoCardStyle: CSSProperties = {
  textDecoration: "none",
  color: "inherit",
  background: "#fff",
  border: "1px solid #eadfcf",
  borderRadius: 16,
  padding: 14,
  display: "block",
  minHeight: 104,
  boxSizing: "border-box",
};

const marketInfoCardLabelStyle: CSSProperties = {
  color: "#6d5f45",
  fontSize: 14,
};

const marketInfoCardValueStyle: CSSProperties = {
  marginTop: 6,
  color: "#22301f",
  fontSize: 24,
  fontWeight: 700,
};

const marketInfoCardHintStyle: CSSProperties = {
  marginTop: 6,
  color: "#7b8676",
  fontSize: 13,
  lineHeight: 1.35,
};

const trashEntrySectionStyle: CSSProperties = {
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

const trashEntryTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#263326",
  fontSize: 20,
};

const trashEntryDescStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#687565",
  fontSize: 13,
  lineHeight: 1.6,
};

const trashEntryLinkStyle: CSSProperties = {
  border: "1px solid #bfd5b9",
  background: "#f2f9ef",
  color: "#356231",
  borderRadius: 12,
  padding: "9px 13px",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
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
  flexDirection: "column",
  gap: 4,
  border: "1px solid #c9d8be",
  borderRadius: 13,
  background: "#f3faef",
  color: "#2f5a27",
  padding: "12px 13px",
  textDecoration: "none",
  fontSize: 15,
  fontWeight: 800,
};

const mobileAdminMembershipHintStyle: CSSProperties = {
  color: "#62765b",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.45,
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

const adminLinkStyle: CSSProperties = {
  ...secondaryLinkStyle,
  border: "1px solid #c9d8be",
  background: "#edf6e8",
  color: "#2f5a27",
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

const compactStatCardStyle: CSSProperties = {
  ...statCardBaseStyle,
  minHeight: 44,
  borderRadius: 12,
  padding: "9px 10px",
};

const compactStatLineStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
  color: "#40513d",
  fontSize: 13,
  lineHeight: 1.25,
};

const compactStatValueStyle: CSSProperties = {
  color: "#22301f",
  fontSize: 15,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const compactStatHintStyle: CSSProperties = {
  marginTop: 4,
  color: "#7b8676",
  fontSize: 12,
  lineHeight: 1.25,
};

const mobileProjectStatsCardStyle: CSSProperties = {
  ...compactStatCardStyle,
  minHeight: 0,
  display: "grid",
  gap: 4,
  color: "#22301f",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1.45,
  textDecoration: "none",
};

const mobileProjectStatsTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const mobileProjectStatsDetailStyle: CSSProperties = {
  color: "#74806f",
  fontSize: 12,
  fontWeight: 600,
};

const statActionCardStyle: CSSProperties = {
  ...statCardBaseStyle,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
};
