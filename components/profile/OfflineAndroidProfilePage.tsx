"use client";

import MobileProfileView from "@/components/profile/MobileProfileView";
import { formatStorage } from "@/lib/user-profile-shared";
import { getUserTypeLabel } from "@/lib/membership";
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

  const modules: MobileProfileNavItem[] = [
    { href: "/membership/payment", label: language === "en" ? "Cloud Membership" : "开通云会员" },
    { value: "payment", label: language === "en" ? "Order progress" : "订单进度查询" },
    { href: "/membership/refund", label: t.profile.refund_request_nav },
    { href: "/membership/benefits", label: language === "en" ? "Membership types" : "会员类别说明" },
    { href: "/profile/recent", label: language === "en" ? "Browsing history" : "浏览历史" },
    { value: "backup", label: language === "en" ? "Backup & export" : "备份与导出" },
    { href: "/legal", label: t.profile.legal_rules_nav },
    { href: "/feedback", label: t.feedback_and_contact },
    { href: "/profile/trash", label: t.profile.modules.trash },
    { value: "account", label: language === "en" ? "Account management" : "账号管理" },
    { href: "/admin/memberships", label: language === "en" ? "User management" : "用户管理" },
  ];

  const networkHint = language === "zh" ? "需要联网。" : "A network connection is required.";

  return (
    <div data-android-offline-profile="true">
      <MobileProfileView
        email={snapshot.email}
        avatarUrl={snapshot.avatarUrl}
        username={displayName}
        accountNumber="—"
        helpfulCount={language === "en" ? "0" : "0次"}
        userType={userType}
        storageText={storageText}
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
