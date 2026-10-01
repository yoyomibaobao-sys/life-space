"use client";

import MobileProfileView from "@/components/profile/MobileProfileView";
import { formatStorage } from "@/lib/user-profile-shared";
import { formatMembershipDate, getMembershipEndDate, getUserTypeLabel } from "@/lib/membership";
import { parseAccountNumber } from "@/lib/account-number";
import { buildRegionDisplay } from "@/lib/region-shared";
import type { OfflineProfileSnapshot } from "@/lib/android-offline-profile";
import { offlineProfileModuleHintStyle, type MobileProfileModule, type MobileProfileNavItem } from "@/components/profile/MobileProfilePresentation";
import { useLanguage } from "@/lib/i18n/useLanguage";
import { useState } from "react";

export default function OfflineAndroidProfilePage({
  snapshot,
  onBack,
  onLogout,
}: {
  snapshot: OfflineProfileSnapshot;
  onBack: () => void;
  onLogout: () => void;
}) {
  const { language, t } = useLanguage();
  const [mobileProfileModule, setMobileProfileModule] = useState<MobileProfileModule | null>(null);
  const displayName = snapshot.username || t.profile.unset_username;
  const storageText =
    snapshot.storageLimit != null
      ? `${formatStorage(snapshot.storageUsed || 0)} / ${formatStorage(snapshot.storageLimit)}`
      : language === "zh" ? "本机可用" : "Available on this device";
  const userType = getUserTypeLabel(
    {
      signedIn: Boolean(snapshot.userId),
      membership: snapshot.membership,
      loading: false,
      failed: false,
    },
    language,
  );
  const parsedAccountNumber = parseAccountNumber(snapshot.accountNumber);
  const accountNumber = parsedAccountNumber
    ? `No.${String(parsedAccountNumber.registrationSequence).padStart(5, "0")}`
    : "";
  const membershipEndDate = getMembershipEndDate(snapshot.membership);
  const hasMembershipTerm = Boolean(
    membershipEndDate && snapshot.membership && ["trial", "basic", "large"].includes(String(snapshot.membership.plan)),
  );
  const membershipLine = hasMembershipTerm
    ? `${userType} · ${snapshot.membership?.can_create_content === true
      ? (language === "en" ? "Valid until" : "有效至")
      : (language === "en" ? "Ended" : "已到期")} ${formatMembershipDate(membershipEndDate, language)}`
    : userType;
  const locationText = buildRegionDisplay({
    countryCode: snapshot.countryCode,
    countryName: snapshot.countryName,
    regionName: snapshot.regionName,
    cityName: snapshot.cityName,
    location: snapshot.location,
  }, language);

  const modules: MobileProfileNavItem[] = [
    { href: "/membership/payment", label: language === "en" ? "Cloud Membership" : "开通云会员", section: "membership" },
    { value: "payment", label: language === "en" ? "Order progress" : "订单进度查询", section: "membership" },
    { href: "/membership/refund", label: t.profile.refund_request_nav, section: "membership" },
    { href: "/membership/benefits", label: language === "en" ? "Membership types" : "会员类别说明", section: "membership" },
    { href: "/profile/recent", label: language === "en" ? "Browsing history" : "浏览历史", section: "data" },
    { value: "backup", label: language === "en" ? "Backup & export" : "备份与导出", section: "data" },
    { href: "/profile/data-security", label: language === "en" ? "Data rules" : "数据规则", section: "support" },
    { href: "/profile/trash", label: t.profile.modules.trash, section: "data" },
    { value: "account", label: language === "en" ? "Account management" : "账号管理", section: "account" },
    { href: "/legal", label: t.profile.legal_rules_nav, section: "support" },
    { href: "/feedback", label: t.feedback_and_contact, section: "support" },
  ];

  const networkHint = language === "zh" ? "需要联网。" : "A network connection is required.";

  return (
    <div data-android-offline-profile="true">
      <MobileProfileView
        email={snapshot.email}
        avatarUrl={snapshot.avatarUrl}
        username={displayName}
        accountNumber={accountNumber}
        helpfulCount="0"
        userType={userType}
        membershipLine={membershipLine}
        androidIdentityLayout
        storageText={storageText}
        locationText={locationText}
        modules={modules}
        activeModule={mobileProfileModule}
        onModuleChange={(value) => {
          setMobileProfileModule((current) => (current === value ? null : value));
        }}
        onBack={onBack}
        onLogout={snapshot.userId ? onLogout : undefined}
      >
        {mobileProfileModule === "payment" || mobileProfileModule === "membership" ? (
          <p style={offlineProfileModuleHintStyle}>{networkHint}</p>
        ) : null}
        {mobileProfileModule === "backup" ? (
          <p style={offlineProfileModuleHintStyle}>
            {language === "zh"
              ? "本机项目、记录和照片仍可在离线使用。云端导出需要联网。"
              : "Local projects, records, and photos stay available offline. Cloud export needs a network."}
          </p>
        ) : null}
        {mobileProfileModule === "account" ? (
          <p style={offlineProfileModuleHintStyle}>
            {language === "zh"
              ? "注销账号需要联网。退出登录不会删除未同步的本机创作。"
              : "Account deletion needs a network. Signing out does not remove unsynced local work."}
          </p>
        ) : null}
      </MobileProfileView>
    </div>
  );
}
